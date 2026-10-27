using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PinCodePdfSearch.Api.Data;
using PinCodePdfSearch.Api.DTOs;
using PinCodePdfSearch.Api.Entities;
using PinCodePdfSearch.Api.Exceptions;
using PinCodePdfSearch.Api.Services.Interfaces;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace PinCodePdfSearch.Api.Services.Implementations;

public partial class PinCodeIndexerService : IPinCodeIndexerService
{
    private readonly PdfDbContext _context;
    private readonly IPdfTextExtractor _textExtractor;
    private readonly IOcrService _ocrService;
    private readonly IFileStorageService _storageService;
    private readonly ILogger<PinCodeIndexerService> _logger;

    // Indian PIN codes: Exactly 6 digits, first digit between 1 and 9 (never 0)
    private static readonly Regex IndianPinCodeRegex = new(@"\b[1-9][0-9]{5}\b", RegexOptions.Compiled);
    private static readonly Regex StrictPinCodeValidationRegex = new(@"^[1-9][0-9]{5}$", RegexOptions.Compiled);

    public PinCodeIndexerService(
        PdfDbContext context,
        IPdfTextExtractor textExtractor,
        IOcrService ocrService,
        IFileStorageService storageService,
        ILogger<PinCodeIndexerService> logger)
    {
        _context = context;
        _textExtractor = textExtractor;
        _ocrService = ocrService;
        _storageService = storageService;
        _logger = logger;
    }

    public async Task IndexDocumentAsync(int documentId, CancellationToken ct = default)
    {
        var document = await _context.PdfDocuments
            .Include(d => d.PinCodes)
            .FirstOrDefaultAsync(d => d.Id == documentId, ct);

        if (document == null)
        {
            _logger.LogWarning("Document ID {DocumentId} not found for indexing.", documentId);
            return;
        }

        document.Status = ProcessingStatus.Processing;
        document.ErrorMessage = null;
        await _context.SaveChangesAsync(ct);

        try
        {
            var filePath = _storageService.GetFilePath(document.StoredFileName);

            // 1. Extract text using PdfPig
            var extractionResult = await _textExtractor.ExtractTextAsync(filePath, ct);

            // 2. Fallback to OCR if no text found in searchable layers
            if (!extractionResult.HasTextContent && _ocrService.IsOcrAvailable())
            {
                _logger.LogInformation("No searchable text found in {FileName}. Attempting OCR...", document.FileName);
                var ocrResult = await _ocrService.PerformOcrAsync(filePath, ct);
                if (ocrResult != null && ocrResult.HasTextContent)
                {
                    extractionResult = ocrResult;
                }
            }

            document.PageCount = extractionResult.PageCount;

            // 3. Clear existing index entries for idempotent indexing
            if (document.PinCodes.Any())
            {
                _context.PdfPinCodes.RemoveRange(document.PinCodes);
            }

            // 4. Scan each page for Indian PIN codes
            var pinCodeEntities = new List<PdfPinCode>();

            foreach (var page in extractionResult.Pages)
            {
                if (string.IsNullOrWhiteSpace(page.Text))
                {
                    continue;
                }

                var matches = IndianPinCodeRegex.Matches(page.Text);
                if (matches.Count == 0)
                {
                    continue;
                }

                // Group by PIN code on this page
                var groupedMatches = matches
                    .Cast<Match>()
                    .GroupBy(m => m.Value);

                foreach (var group in groupedMatches)
                {
                    var pinCode = group.Key;
                    var occurrenceCount = group.Count();
                    var firstMatch = group.First();

                    // Generate a preview context snippet around the first occurrence on this page
                    var snippet = ExtractSnippet(page.Text, firstMatch.Index, firstMatch.Length);

                    pinCodeEntities.Add(new PdfPinCode
                    {
                        PdfDocumentId = document.Id,
                        PinCode = pinCode,
                        PageNumber = page.PageNumber,
                        OccurrenceCount = occurrenceCount,
                        ContextSnippet = snippet
                    });
                }
            }

            if (pinCodeEntities.Count > 0)
            {
                await _context.PdfPinCodes.AddRangeAsync(pinCodeEntities, ct);
            }

            document.Status = ProcessingStatus.Completed;
            if (!extractionResult.HasTextContent)
            {
                document.ErrorMessage = "Indexed successfully, but document appears to be scanned or contains no extractable text. PIN code search is based on extracted text.";
            }

            await _context.SaveChangesAsync(ct);

            _logger.LogInformation("Successfully indexed document {FileName} (ID: {DocumentId}) with {PinCodeCount} PIN code entries across {PageCount} pages.",
                document.FileName, document.Id, pinCodeEntities.Count, document.PageCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Indexing failed for document ID {DocumentId}: {FileName}", documentId, document.FileName);
            document.Status = ProcessingStatus.Failed;
            document.ErrorMessage = $"Indexing failed: {ex.Message}";
            await _context.SaveChangesAsync(ct);
        }
    }

    public async Task ReindexDocumentAsync(int documentId, CancellationToken ct = default)
    {
        var document = await _context.PdfDocuments.FindAsync(new object[] { documentId }, ct);
        if (document == null)
        {
            throw new AppException($"Document with ID {documentId} not found.", HttpStatusCode.NotFound);
        }

        await IndexDocumentAsync(documentId, ct);
    }

    public async Task<List<PdfSearchResultDto>> SearchByPinCodeAsync(string pinCode, CancellationToken ct = default)
    {
        var trimmedPin = pinCode?.Trim() ?? string.Empty;

        // Validation: 6 digits starting with 1-9
        if (!StrictPinCodeValidationRegex.IsMatch(trimmedPin))
        {
            throw new AppException("Invalid Indian PIN code format. Must be a 6-digit number starting with 1-9 (e.g., 400001, 110001).", HttpStatusCode.BadRequest);
        }

        // Query database using index on PinCode
        var matches = await _context.PdfPinCodes
            .AsNoTracking()
            .Where(p => p.PinCode == trimmedPin)
            .Include(p => p.Document)
            .ToListAsync(ct);

        var results = matches
            .GroupBy(p => p.PdfDocumentId)
            .Select(g => 
            {
                var doc = g.First().Document;
                return new PdfSearchResultDto
                {
                    DocumentId = doc.Id,
                    FileName = doc.FileName,
                    FileSize = doc.FileSize,
                    PageCount = doc.PageCount,
                    UploadedAt = doc.UploadedAt,
                    SearchedPinCode = trimmedPin,
                    TotalOccurrencesInDoc = g.Sum(x => x.OccurrenceCount),
                    MatchingPages = g.OrderBy(x => x.PageNumber).Select(x => new PageMatchDto
                    {
                        PageNumber = x.PageNumber,
                        OccurrenceCount = x.OccurrenceCount,
                        Snippet = x.ContextSnippet
                    }).ToList()
                };
            })
            .OrderByDescending(r => r.TotalOccurrencesInDoc)
            .ThenByDescending(r => r.UploadedAt)
            .ToList();

        return results;
    }

    public async Task<PdfPagesResponseDto?> GetDocumentPagesForPinCodeAsync(int documentId, string pinCode, CancellationToken ct = default)
    {
        var trimmedPin = pinCode?.Trim() ?? string.Empty;

        var document = await _context.PdfDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == documentId, ct);

        if (document == null)
        {
            return null;
        }

        var matches = await _context.PdfPinCodes
            .AsNoTracking()
            .Where(p => p.PdfDocumentId == documentId && p.PinCode == trimmedPin)
            .OrderBy(p => p.PageNumber)
            .Select(p => new PageMatchDto
            {
                PageNumber = p.PageNumber,
                OccurrenceCount = p.OccurrenceCount,
                Snippet = p.ContextSnippet
            })
            .ToListAsync(ct);

        return new PdfPagesResponseDto
        {
            PdfDocumentId = document.Id,
            FileName = document.FileName,
            PinCode = trimmedPin,
            Pages = matches
        };
    }

    private static string ExtractSnippet(string text, int index, int length)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;

        // If the text contains newline boundaries, find the entire line/row containing this PIN occurrence
        int lineStart = text.LastIndexOf('\n', Math.Min(text.Length - 1, Math.Max(0, index)));
        lineStart = lineStart == -1 ? 0 : lineStart + 1;

        int lineEnd = text.IndexOf('\n', Math.Min(text.Length, index + length));
        lineEnd = lineEnd == -1 ? text.Length : lineEnd;

        var fullLine = text.Substring(lineStart, lineEnd - lineStart).Replace("\r", "").Trim();
        fullLine = Regex.Replace(fullLine, @"\s+", " ");

        if (!string.IsNullOrWhiteSpace(fullLine) && fullLine.Length >= length)
        {
            if (fullLine.Length > 350)
            {
                return fullLine.Substring(0, 350) + "...";
            }
            return fullLine;
        }

        // Fallback for continuous text without line breaks
        const int contextPadding = 75;
        var start = Math.Max(0, index - contextPadding);
        var end = Math.Min(text.Length, index + length + contextPadding);
        var snippet = text.Substring(start, end - start).Replace("\r", " ").Replace("\n", " ").Trim();
        snippet = Regex.Replace(snippet, @"\s+", " ");

        return snippet;
    }

    private string ExtractEntireRowFromPage(string filePath, int pageNumber, string pinCode, string? fallbackSnippet)
    {
        try
        {
            if (File.Exists(filePath))
            {
                using var pdfDoc = UglyToad.PdfPig.PdfDocument.Open(filePath);
                if (pageNumber >= 1 && pageNumber <= pdfDoc.NumberOfPages)
                {
                    var page = pdfDoc.GetPage(pageNumber);
                    var words = page.GetWords().ToList();
                    if (words.Any())
                    {
                        // 1. Locate word(s) matching the PIN code
                        var matchingWords = words.Where(w => w.Text.Contains(pinCode)).ToList();
                        if (matchingWords.Any())
                        {
                            // Expand vertical bounding box to capture entire table row / text line
                            // Words in the same row typically share the vertical band (tolerance ~5.0 pt)
                            double minY = matchingWords.Min(w => w.BoundingBox.Bottom) - 5.0;
                            double maxY = matchingWords.Max(w => w.BoundingBox.Top) + 5.0;

                            var rowWords = words
                                .Where(w => w.BoundingBox.Bottom <= maxY && w.BoundingBox.Top >= minY)
                                .OrderBy(w => w.BoundingBox.Left)
                                .Select(w => w.Text);

                            var candidate = string.Join(" ", rowWords).Trim();
                            if (!string.IsNullOrWhiteSpace(candidate) && candidate.Contains(pinCode))
                            {
                                return candidate;
                            }
                        }

                        // 2. Group words by vertical line position (tolerance: 5.0 points)
                        var lineGroups = words
                            .GroupBy(w => Math.Round(w.BoundingBox.Bottom / 5.0) * 5.0)
                            .OrderByDescending(g => g.Key);

                        foreach (var group in lineGroups)
                        {
                            var lineWords = group.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text);
                            var lineText = string.Join(" ", lineWords).Trim();
                            if (lineText.Contains(pinCode))
                            {
                                return lineText;
                            }
                        }
                    }

                    // 3. Inspect page.Text line by line
                    if (!string.IsNullOrWhiteSpace(page.Text))
                    {
                        var lines = page.Text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (var l in lines)
                        {
                            var trimmed = l.Trim();
                            if (trimmed.Contains(pinCode))
                            {
                                return trimmed;
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not extract raw line from PDF page {PageNumber}", pageNumber);
        }

        return !string.IsNullOrWhiteSpace(fallbackSnippet) ? fallbackSnippet : $"PIN Code: {pinCode}";
    }

    private class ExtractedRecordItem
    {
        public int DocumentId { get; set; }
        public string DocFileName { get; set; } = string.Empty;
        public int PageNumber { get; set; }
        public string EntireRowText { get; set; } = string.Empty;
    }

    public async Task<ExtractRowResponseDto> ExtractRowToNewPdfAsync(ExtractRowRequestDto request, CancellationToken ct = default)
    {
        var trimmedPin = request.PinCode?.Trim() ?? string.Empty;
        if (!StrictPinCodeValidationRegex.IsMatch(trimmedPin))
        {
            throw new AppException("Invalid Indian PIN code format.", HttpStatusCode.BadRequest);
        }

        // Determine all items to extract (either from SelectedRows or single request)
        var targetRows = (request.SelectedRows != null && request.SelectedRows.Count > 0)
            ? request.SelectedRows
            : new List<SelectedRowItemDto>
            {
                new SelectedRowItemDto
                {
                    DocumentId = request.DocumentId,
                    PageNumber = request.PageNumber,
                    Snippet = request.Snippet
                }
            };

        var extractedItems = new List<ExtractedRecordItem>();
        var docCache = new Dictionary<int, PdfDocument>();

        foreach (var item in targetRows)
        {
            if (!docCache.TryGetValue(item.DocumentId, out var sourceDoc))
            {
                sourceDoc = await _context.PdfDocuments.FirstOrDefaultAsync(d => d.Id == item.DocumentId, ct);
                if (sourceDoc != null)
                {
                    docCache[item.DocumentId] = sourceDoc;
                }
            }

            if (sourceDoc == null)
            {
                _logger.LogWarning("Source document ID {DocumentId} not found during batch extraction.", item.DocumentId);
                continue;
            }

            // Retrieve pin record for context snippet if needed
            var pinRecord = await _context.PdfPinCodes
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.PdfDocumentId == item.DocumentId 
                                       && p.PinCode == trimmedPin 
                                       && p.PageNumber == item.PageNumber, ct);

            // Extract the ENTIRE row containing the PIN code directly from the physical PDF page
            var sourceFilePath = _storageService.GetFilePath(sourceDoc.StoredFileName);
            var entireRow = ExtractEntireRowFromPage(sourceFilePath, item.PageNumber, trimmedPin, item.Snippet ?? pinRecord?.ContextSnippet);

            extractedItems.Add(new ExtractedRecordItem
            {
                DocumentId = sourceDoc.Id,
                DocFileName = sourceDoc.FileName,
                PageNumber = item.PageNumber,
                EntireRowText = SanitizeForPdf(entireRow)
            });
        }

        if (extractedItems.Count == 0)
        {
            throw new AppException("No valid document records found to extract.", HttpStatusCode.BadRequest);
        }

        await _context.SaveChangesAsync(ct);

        // Check if an existing single PDF was specified to append to
        PdfDocument? existingTargetDoc = null;
        if (request.TargetDocumentId.HasValue && request.TargetDocumentId.Value > 0)
        {
            existingTargetDoc = await _context.PdfDocuments
                .FirstOrDefaultAsync(d => d.Id == request.TargetDocumentId.Value, ct);
        }

        var builder = new PdfDocumentBuilder();
        var boldFont = builder.AddStandard14Font(Standard14Font.HelveticaBold);
        var regFont = builder.AddStandard14Font(Standard14Font.Helvetica);

        int startingRecordNumber = 0;
        int pageCount = 0;

        if (existingTargetDoc != null && File.Exists(existingTargetDoc.StoragePath))
        {
            // Copy existing pages from the target single PDF
            using (var existingPdf = UglyToad.PdfPig.PdfDocument.Open(existingTargetDoc.StoragePath))
            {
                pageCount = existingPdf.NumberOfPages;
                for (int i = 1; i <= existingPdf.NumberOfPages; i++)
                {
                    builder.AddPage(existingPdf, i);
                }
            }

            var existingPinsCount = await _context.PdfPinCodes
                .CountAsync(p => p.PdfDocumentId == existingTargetDoc.Id, ct);
            startingRecordNumber = Math.Max(1, existingPinsCount);

            // Add new page for appended records
            pageCount++;
            var page = builder.AddPage(PageSize.A4);
            double y = 780;

            page.AddText($"DOCPIN FINDER - EXTRACTED PIN CODE RECORDS (PIN {trimmedPin})", 14, new PdfPoint(50, y), boldFont);
            y -= 20;
            page.AddText($"Appended on: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC  |  Added {extractedItems.Count} record(s)", 10, new PdfPoint(50, y), regFont);
            y -= 25;
            page.AddText("------------------------------------------------------------------------------------------------------", 8, new PdfPoint(50, y), regFont);
            y -= 20;

            for (int i = 0; i < extractedItems.Count; i++)
            {
                var item = extractedItems[i];
                var snippetLines = WrapText(item.EntireRowText, 74);
                int neededHeight = 35 + (snippetLines.Count * 17);

                if (y - neededHeight < 55)
                {
                    page.AddText($"Page {pageCount}", 8, new PdfPoint(280, 25), regFont);
                    page = builder.AddPage(PageSize.A4);
                    pageCount++;
                    y = 790;

                    page.AddText($"DOCPIN FINDER - EXTRACTED RECORDS (PIN {trimmedPin}) - Page {pageCount}", 9, new PdfPoint(50, y), boldFont);
                    y -= 20;
                    page.AddText("------------------------------------------------------------------------------------------------------", 8, new PdfPoint(50, y), regFont);
                    y -= 22;
                }

                page.AddText($"RECORD #{startingRecordNumber + i + 1}  |  File: {item.DocFileName}  (Page {item.PageNumber})", 11, new PdfPoint(50, y), boldFont);
                y -= 20;

                foreach (var sLine in snippetLines)
                {
                    page.AddText(sLine, 10, new PdfPoint(60, y), regFont);
                    y -= 16;
                }

                y -= 12;
                page.AddText("------------------------------------------------------------------------------------------------------", 8, new PdfPoint(50, y), regFont);
                y -= 20;
            }

            page.AddText($"Page {pageCount}  |  DocPIN Finder Automated System", 8, new PdfPoint(220, 25), regFont);

            var pdfBytes = builder.Build();
            await File.WriteAllBytesAsync(existingTargetDoc.StoragePath, pdfBytes, ct);

            existingTargetDoc.FileSize = pdfBytes.Length;
            existingTargetDoc.PageCount = pageCount;
            existingTargetDoc.UploadedAt = DateTime.UtcNow;

            var newPin = new PdfPinCode
            {
                PdfDocumentId = existingTargetDoc.Id,
                PinCode = trimmedPin,
                PageNumber = pageCount,
                OccurrenceCount = extractedItems.Count,
                ContextSnippet = extractedItems[0].EntireRowText
            };
            _context.PdfPinCodes.Add(newPin);
            await _context.SaveChangesAsync(ct);

            _logger.LogInformation("Successfully appended {Count} record(s) into single PDF '{FileName}' (ID: {DocId})",
                extractedItems.Count, existingTargetDoc.FileName, existingTargetDoc.Id);

            return new ExtractRowResponseDto
            {
                Success = true,
                Message = $"Successfully added {extractedItems.Count} row(s) into single PDF '{existingTargetDoc.FileName}' (Total {pageCount} pages).",
                NewDocumentId = existingTargetDoc.Id,
                NewFileName = existingTargetDoc.FileName,
                RemovedDocumentId = targetRows[0].DocumentId,
                RemovedPageNumber = targetRows[0].PageNumber,
                PinCode = trimmedPin,
                ExtractedRowCount = extractedItems.Count,
                WasAppended = true,
                TotalRecordsInDocument = startingRecordNumber + extractedItems.Count,
                RemovedRows = targetRows
            };
        }

        // Otherwise create a fresh single consolidated PDF with all selected records
        pageCount = 1;
        var newPage = builder.AddPage(PageSize.A4);
        double newY = 780;

        // Header Title
        newPage.AddText("DOCPIN FINDER - CONSOLIDATED PIN CODE RECORDS", 15, new PdfPoint(50, newY), boldFont);
        newY -= 20;
        newPage.AddText("Consolidated report of selected records extracted across indexed documents.", 9, new PdfPoint(50, newY), regFont);
        newY -= 26;

        // Metadata summary block
        newPage.AddText($"Target PIN Code:      {trimmedPin}", 11, new PdfPoint(50, newY), boldFont);
        newY -= 18;
        newPage.AddText($"Selected Records:     {extractedItems.Count} Consolidated Record(s)", 10, new PdfPoint(50, newY), regFont);
        newY -= 16;
        newPage.AddText($"Generated On (UTC):   {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC", 10, new PdfPoint(50, newY), regFont);
        newY -= 26;

        newPage.AddText("SELECTED EXTRACTED RECORDS & COMPLETE ROW DETAILS:", 11, new PdfPoint(50, newY), boldFont);
        newY -= 14;
        newPage.AddText("------------------------------------------------------------------------------------------------------", 8, new PdfPoint(50, newY), regFont);
        newY -= 20;

        // Draw each extracted entire row
        for (int i = 0; i < extractedItems.Count; i++)
        {
            var item = extractedItems[i];
            var snippetLines = WrapText(item.EntireRowText, 74);
            int neededHeight = 35 + (snippetLines.Count * 17);

            // Check if we need to paginate
            if (newY - neededHeight < 55)
            {
                newPage.AddText($"Page {pageCount}  |  DocPIN Finder Automated System", 8, new PdfPoint(220, 25), regFont);
                newPage = builder.AddPage(PageSize.A4);
                pageCount++;
                newY = 790;

                newPage.AddText($"DOCPIN FINDER - CONSOLIDATED RECORDS (PIN {trimmedPin}) - Page {pageCount}", 9, new PdfPoint(50, newY), boldFont);
                newY -= 18;
                newPage.AddText("------------------------------------------------------------------------------------------------------", 8, new PdfPoint(50, newY), regFont);
                newY -= 20;
            }

            // Record Header
            newPage.AddText($"RECORD #{i + 1}  |  Source File: {item.DocFileName}  (Page {item.PageNumber})", 11, new PdfPoint(50, newY), boldFont);
            newY -= 20;

            // Entire Row Content
            foreach (var sLine in snippetLines)
            {
                newPage.AddText(sLine, 10, new PdfPoint(60, newY), regFont);
                newY -= 16;
            }

            newY -= 12;
            newPage.AddText("------------------------------------------------------------------------------------------------------", 8, new PdfPoint(50, newY), regFont);
            newY -= 20;
        }

        newPage.AddText($"Page {pageCount}  |  DocPIN Finder Automated System", 8, new PdfPoint(220, 25), regFont);

        var newPdfBytes = builder.Build();

        // Filename defaults to PIN_{pin}_Selected_Records.pdf
        var userFileName = !string.IsNullOrWhiteSpace(request.CustomTargetFileName)
            ? request.CustomTargetFileName.Trim()
            : $"PIN_{trimmedPin}_Selected_Records.pdf";

        if (!userFileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            userFileName += ".pdf";
        }

        var uniquePrefix = Guid.NewGuid().ToString("N");
        var storedFileName = $"{uniquePrefix}_{userFileName}";

        var firstDoc = docCache.Values.FirstOrDefault();
        var storageDir = (firstDoc != null) 
            ? Path.GetDirectoryName(_storageService.GetFilePath(firstDoc.StoredFileName)) 
            : null;
        storageDir ??= AppContext.BaseDirectory;

        var newFilePath = Path.Combine(storageDir, storedFileName);
        await File.WriteAllBytesAsync(newFilePath, newPdfBytes, ct);

        // Register in database
        var newDoc = new PdfDocument
        {
            FileName = userFileName,
            StoredFileName = storedFileName,
            StoragePath = newFilePath,
            FileSize = newPdfBytes.Length,
            ContentType = "application/pdf",
            PageCount = pageCount,
            UploadedAt = DateTime.UtcNow,
            Status = ProcessingStatus.Completed,
            ErrorMessage = null
        };

        _context.PdfDocuments.Add(newDoc);
        await _context.SaveChangesAsync(ct);

        // Index the searched PIN code in the newly created document
        for (int p = 1; p <= pageCount; p++)
        {
            var newPin = new PdfPinCode
            {
                PdfDocumentId = newDoc.Id,
                PinCode = trimmedPin,
                PageNumber = p,
                OccurrenceCount = extractedItems.Count,
                ContextSnippet = extractedItems[0].EntireRowText
            };
            _context.PdfPinCodes.Add(newPin);
        }
        await _context.SaveChangesAsync(ct);

        _logger.LogInformation("Successfully created single extracted PDF {NewFileName} (ID: {NewDocId}) containing {Count} row(s) for PIN {PinCode}", 
            newDoc.FileName, newDoc.Id, extractedItems.Count, trimmedPin);

        return new ExtractRowResponseDto
        {
            Success = true,
            Message = $"Successfully extracted {extractedItems.Count} row(s) for PIN {trimmedPin} into single PDF '{newDoc.FileName}'.",
            NewDocumentId = newDoc.Id,
            NewFileName = newDoc.FileName,
            RemovedDocumentId = targetRows[0].DocumentId,
            RemovedPageNumber = targetRows[0].PageNumber,
            PinCode = trimmedPin,
            ExtractedRowCount = extractedItems.Count,
            WasAppended = false,
            TotalRecordsInDocument = extractedItems.Count,
            RemovedRows = targetRows
        };
    }

    private static string SanitizeForPdf(string text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        var sanitized = text
            .Replace('\u2018', '\'')
            .Replace('\u2019', '\'')
            .Replace('\u201C', '"')
            .Replace('\u201D', '"')
            .Replace('\u2013', '-')
            .Replace('\u2014', '-')
            .Replace('\u2022', '*')
            .Replace('\u00A0', ' ')
            .Replace('\r', ' ');

        // Keep standard ASCII/Latin printable chars to ensure compatibility with Standard 14 Helvetica
        var chars = sanitized.Select(c => c > 255 ? ' ' : c).ToArray();
        return new string(chars);
    }

    private static List<string> WrapText(string text, int maxCharsPerLine)
    {
        var lines = new List<string>();
        if (string.IsNullOrWhiteSpace(text)) return lines;

        var words = text.Split(' ');
        var currentLine = "";

        foreach (var word in words)
        {
            if ((currentLine + " " + word).Trim().Length > maxCharsPerLine)
            {
                if (!string.IsNullOrEmpty(currentLine))
                {
                    lines.Add(currentLine);
                }
                currentLine = word;
            }
            else
            {
                currentLine = (currentLine + " " + word).Trim();
            }
        }

        if (!string.IsNullOrEmpty(currentLine))
        {
            lines.Add(currentLine);
        }

        return lines;
    }
}

