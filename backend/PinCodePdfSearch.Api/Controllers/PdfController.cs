using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PinCodePdfSearch.Api.Data;
using PinCodePdfSearch.Api.DTOs;
using PinCodePdfSearch.Api.Entities;
using PinCodePdfSearch.Api.Exceptions;
using PinCodePdfSearch.Api.Services.Interfaces;

namespace PinCodePdfSearch.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PdfController : ControllerBase
{
    private readonly PdfDbContext _context;
    private readonly IFileStorageService _storageService;
    private readonly IPinCodeIndexerService _indexerService;
    private readonly ILogger<PdfController> _logger;

    public PdfController(
        PdfDbContext context,
        IFileStorageService storageService,
        IPinCodeIndexerService indexerService,
        ILogger<PdfController> logger)
    {
        _context = context;
        _storageService = storageService;
        _indexerService = indexerService;
        _logger = logger;
    }

    /// <summary>
    /// Upload one or more PDF files and trigger indexing.
    /// POST /api/pdf/upload
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(100 * 1024 * 1024)] // 100 MB max request size
    public async Task<ActionResult<UploadResponseDto>> Upload([FromForm] List<IFormFile> files, CancellationToken ct)
    {
        if (files == null || files.Count == 0)
        {
            return BadRequest(new { message = "No files were uploaded." });
        }

        var response = new UploadResponseDto
        {
            TotalReceived = files.Count
        };

        foreach (var file in files)
        {
            try
            {
                // 1. Secure file storage & validation
                var (storedFileName, filePath, fileSize) = await _storageService.SaveFileAsync(file, ct);

                // 2. Create document entity
                var document = new PdfDocument
                {
                    FileName = Path.GetFileName(file.FileName),
                    StoredFileName = storedFileName,
                    StoragePath = filePath,
                    FileSize = fileSize,
                    ContentType = "application/pdf",
                    UploadedAt = DateTime.UtcNow,
                    Status = ProcessingStatus.Pending
                };

                _context.PdfDocuments.Add(document);
                await _context.SaveChangesAsync(ct);

                // 3. Index document (synchronously or background queue)
                await _indexerService.IndexDocumentAsync(document.Id, ct);

                // Refresh document after indexing
                await _context.Entry(document).ReloadAsync(ct);

                var totalPins = await _context.PdfPinCodes
                    .Where(p => p.PdfDocumentId == document.Id)
                    .CountAsync(ct);

                response.UploadedDocuments.Add(new PdfDocumentDto
                {
                    Id = document.Id,
                    FileName = document.FileName,
                    FileSize = document.FileSize,
                    PageCount = document.PageCount,
                    UploadedAt = document.UploadedAt,
                    Status = document.Status,
                    ErrorMessage = document.ErrorMessage,
                    TotalPinCodesIndexed = totalPins
                });

                response.SuccessCount++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload and process file {FileName}", file.FileName);
                response.FailureCount++;
                response.Errors.Add($"File '{file.FileName}': {ex.Message}");
            }
        }

        return Ok(response);
    }

    /// <summary>
    /// Find all PDFs containing the requested 6-digit Indian PIN code.
    /// GET /api/pdf/search?pinCode=400001
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<PdfSearchResultDto>>> Search([FromQuery] string pinCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(pinCode))
        {
            return BadRequest(new { message = "pinCode query parameter is required." });
        }

        var results = await _indexerService.SearchByPinCodeAsync(pinCode, ct);
        return Ok(results);
    }

    /// <summary>
    /// Stream the selected PDF with HTTP Range Request (206) support for fast browser viewing.
    /// GET /api/pdf/{id}/open
    /// </summary>
    [HttpGet("{id:int}/open")]
    public async Task<IActionResult> Open(int id, CancellationToken ct)
    {
        var document = await _context.PdfDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (document == null)
        {
            return NotFound(new { message = $"Document with ID {id} not found." });
        }

        var filePath = _storageService.GetFilePath(document.StoredFileName);

        // PhysicalFile with enableRangeProcessing=true enables byte-range streaming for PDF.js
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{Uri.EscapeDataString(document.FileName)}\"");
        return PhysicalFile(filePath, "application/pdf", enableRangeProcessing: true);
    }

    /// <summary>
    /// Download the selected PDF file directly as an attachment.
    /// GET /api/pdf/{id}/download
    /// </summary>
    [HttpGet("{id:int}/download")]
    public async Task<IActionResult> Download(int id, CancellationToken ct)
    {
        var document = await _context.PdfDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (document == null)
        {
            return NotFound(new { message = $"Document with ID {id} not found." });
        }

        var filePath = _storageService.GetFilePath(document.StoredFileName);
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound(new { message = "PDF file not found on disk." });
        }

        return PhysicalFile(filePath, "application/pdf", fileDownloadName: document.FileName);
    }

    /// <summary>
    /// Return matching pages containing the specified PIN code for a specific PDF.
    /// GET /api/pdf/{id}/pages?pinCode=400001
    /// </summary>
    [HttpGet("{id:int}/pages")]
    public async Task<ActionResult<PdfPagesResponseDto>> GetPages(int id, [FromQuery] string pinCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(pinCode))
        {
            return BadRequest(new { message = "pinCode query parameter is required." });
        }

        var response = await _indexerService.GetDocumentPagesForPinCodeAsync(id, pinCode, ct);
        if (response == null)
        {
            return NotFound(new { message = $"Document with ID {id} not found." });
        }

        return Ok(response);
    }

    /// <summary>
    /// Retrieve PDF metadata.
    /// GET /api/pdf/{id}
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PdfDocumentDto>> GetById(int id, CancellationToken ct)
    {
        var document = await _context.PdfDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (document == null)
        {
            return NotFound(new { message = $"Document with ID {id} not found." });
        }

        var pinCount = await _context.PdfPinCodes
            .Where(p => p.PdfDocumentId == id)
            .CountAsync(ct);

        return Ok(new PdfDocumentDto
        {
            Id = document.Id,
            FileName = document.FileName,
            FileSize = document.FileSize,
            PageCount = document.PageCount,
            UploadedAt = document.UploadedAt,
            Status = document.Status,
            ErrorMessage = document.ErrorMessage,
            TotalPinCodesIndexed = pinCount
        });
    }

    /// <summary>
    /// Check indexing status of a document.
    /// GET /api/pdf/{id}/status
    /// </summary>
    [HttpGet("{id:int}/status")]
    public async Task<ActionResult<PdfStatusDto>> GetStatus(int id, CancellationToken ct)
    {
        var document = await _context.PdfDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (document == null)
        {
            return NotFound(new { message = $"Document with ID {id} not found." });
        }

        var pinCount = await _context.PdfPinCodes
            .Where(p => p.PdfDocumentId == id)
            .CountAsync(ct);

        return Ok(new PdfStatusDto
        {
            Id = document.Id,
            FileName = document.FileName,
            Status = document.Status,
            ErrorMessage = document.ErrorMessage,
            PageCount = document.PageCount,
            PinCodeCount = pinCount,
            UploadedAt = document.UploadedAt
        });
    }

    /// <summary>
    /// Retry indexing when necessary.
    /// POST /api/pdf/{id}/reindex
    /// </summary>
    [HttpPost("{id:int}/reindex")]
    public async Task<ActionResult<PdfStatusDto>> Reindex(int id, CancellationToken ct)
    {
        await _indexerService.ReindexDocumentAsync(id, ct);
        return await GetStatus(id, ct);
    }

    /// <summary>
    /// List all uploaded PDF documents.
    /// GET /api/pdf
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<PdfDocumentDto>>> GetAll(CancellationToken ct)
    {
        var docs = await _context.PdfDocuments
            .AsNoTracking()
            .OrderByDescending(d => d.UploadedAt)
            .Select(d => new PdfDocumentDto
            {
                Id = d.Id,
                FileName = d.FileName,
                FileSize = d.FileSize,
                PageCount = d.PageCount,
                UploadedAt = d.UploadedAt,
                Status = d.Status,
                ErrorMessage = d.ErrorMessage,
                TotalPinCodesIndexed = d.PinCodes.Count
            })
            .ToListAsync(ct);

        return Ok(docs);
    }

    /// <summary>
    /// Delete a PDF document from database and file system.
    /// DELETE /api/pdf/{id}
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var document = await _context.PdfDocuments.FindAsync(new object[] { id }, ct);
        if (document == null)
        {
            return NotFound(new { message = $"Document with ID {id} not found." });
        }

        // Delete disk file
        await _storageService.DeleteFileAsync(document.StoredFileName, ct);

        // Delete database record (cascades to PdfPinCodes)
        _context.PdfDocuments.Remove(document);
        await _context.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>
    /// Removes a particular PIN code row/occurrence from a document and creates a new PDF containing the extracted record.
    /// POST /api/pdf/extract-row
    /// </summary>
    [HttpPost("extract-row")]
    public async Task<ActionResult<ExtractRowResponseDto>> ExtractRow([FromBody] ExtractRowRequestDto request, CancellationToken ct)
    {
        if (request == null)
        {
            return BadRequest(new { message = "Extract row request body is required." });
        }

        var result = await _indexerService.ExtractRowToNewPdfAsync(request, ct);
        return Ok(result);
    }
}
