using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PinCodePdfSearch.Api.Exceptions;
using PinCodePdfSearch.Api.Services.Interfaces;

namespace PinCodePdfSearch.Api.Services.Implementations;

public class LocalFileStorageService : IFileStorageService
{
    private readonly string _storageDirectory;
    private readonly long _maxFileSizeBytes;
    private readonly ILogger<LocalFileStorageService> _logger;

    // PDF Magic Bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    private static readonly byte[] PdfMagicBytes = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D };

    public LocalFileStorageService(IConfiguration configuration, ILogger<LocalFileStorageService> logger)
    {
        _logger = logger;

        var configuredPath = configuration.GetValue<string>("FileStorage:StoragePath");
        _storageDirectory = !string.IsNullOrWhiteSpace(configuredPath)
            ? Path.GetFullPath(configuredPath)
            : Path.Combine(AppContext.BaseDirectory, "UploadedPdfs");

        _maxFileSizeBytes = configuration.GetValue<long?>("FileStorage:MaxFileSizeBytes") 
            ?? (50 * 1024 * 1024); // Default 50MB

        if (!Directory.Exists(_storageDirectory))
        {
            Directory.CreateDirectory(_storageDirectory);
        }
    }

    public async Task<(string StoredFileName, string FilePath, long FileSize)> SaveFileAsync(IFormFile file, CancellationToken ct = default)
    {
        if (file == null || file.Length == 0)
        {
            throw new AppException("No file provided or file is empty.", HttpStatusCode.BadRequest);
        }

        // 1. File size check
        if (file.Length > _maxFileSizeBytes)
        {
            var maxMb = _maxFileSizeBytes / (1024 * 1024);
            throw new AppException($"File exceeds maximum allowed size of {maxMb} MB.", HttpStatusCode.BadRequest);
        }

        // 2. Extension check
        var rawExtension = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(rawExtension) || !rawExtension.Equals(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            throw new AppException("Invalid file type. Only PDF documents (.pdf) are allowed.", HttpStatusCode.BadRequest);
        }

        // 3. MIME type check
        if (!string.Equals(file.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            // Some browsers report application/x-pdf or octet-stream, check magic bytes next
            _logger.LogWarning("Uploaded file {FileName} has ContentType {ContentType}", file.FileName, file.ContentType);
        }

        // 4. PDF Magic Byte Signature Validation
        using (var stream = file.OpenReadStream())
        {
            var header = new byte[PdfMagicBytes.Length];
            var bytesRead = await stream.ReadAsync(header.AsMemory(0, PdfMagicBytes.Length), ct);
            if (bytesRead < PdfMagicBytes.Length || !header.SequenceEqual(PdfMagicBytes))
            {
                throw new AppException("Security verification failed: File content does not match genuine PDF signature.", HttpStatusCode.BadRequest);
            }
        }

        // 5. Generate secure randomized filename to prevent collisions and directory traversal
        var sanitizedOriginal = Path.GetFileNameWithoutExtension(file.FileName);
        sanitizedOriginal = string.Concat(sanitizedOriginal.Split(Path.GetInvalidFileNameChars())).Trim();
        if (string.IsNullOrWhiteSpace(sanitizedOriginal))
        {
            sanitizedOriginal = "document";
        }

        var uniquePrefix = Guid.NewGuid().ToString("N");
        var storedFileName = $"{uniquePrefix}_{sanitizedOriginal}.pdf";
        var targetFilePath = Path.Combine(_storageDirectory, storedFileName);

        // 6. Write file to disk
        using (var fileStream = new FileStream(targetFilePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await file.CopyToAsync(fileStream, ct);
        }

        _logger.LogInformation("Saved file {FileName} as {StoredFileName} ({FileSize} bytes)", 
            file.FileName, storedFileName, file.Length);

        return (storedFileName, targetFilePath, file.Length);
    }

    public string GetFilePath(string storedFileName)
    {
        // Prevent path traversal
        var safeName = Path.GetFileName(storedFileName);
        var fullPath = Path.Combine(_storageDirectory, safeName);
        if (!File.Exists(fullPath))
        {
            throw new AppException("The requested PDF file was not found on the server storage.", HttpStatusCode.NotFound);
        }
        return fullPath;
    }

    public Task<Stream> OpenReadStreamAsync(string storedFileName, CancellationToken ct = default)
    {
        var filePath = GetFilePath(storedFileName);
        var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
        return Task.FromResult<Stream>(stream);
    }

    public Task DeleteFileAsync(string storedFileName, CancellationToken ct = default)
    {
        try
        {
            var safeName = Path.GetFileName(storedFileName);
            var fullPath = Path.Combine(_storageDirectory, safeName);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
                _logger.LogInformation("Deleted physical file {StoredFileName}", storedFileName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete file {StoredFileName}", storedFileName);
        }

        return Task.CompletedTask;
    }

    public bool FileExists(string storedFileName)
    {
        if (string.IsNullOrWhiteSpace(storedFileName)) return false;
        var safeName = Path.GetFileName(storedFileName);
        var fullPath = Path.Combine(_storageDirectory, safeName);
        return File.Exists(fullPath);
    }
}
