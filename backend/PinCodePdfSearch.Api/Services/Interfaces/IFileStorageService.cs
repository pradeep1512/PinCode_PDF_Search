using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace PinCodePdfSearch.Api.Services.Interfaces;

public interface IFileStorageService
{
    /// <summary>
    /// Validates and securely saves an uploaded PDF file to disk.
    /// Returns the unique stored filename.
    /// </summary>
    Task<(string StoredFileName, string FilePath, long FileSize)> SaveFileAsync(IFormFile file, CancellationToken ct = default);

    /// <summary>
    /// Returns the physical path to a stored file.
    /// </summary>
    string GetFilePath(string storedFileName);

    /// <summary>
    /// Opens a read stream for streaming to the browser.
    /// </summary>
    Task<Stream> OpenReadStreamAsync(string storedFileName, CancellationToken ct = default);

    /// <summary>
    /// Deletes the physical file from disk.
    /// </summary>
    Task DeleteFileAsync(string storedFileName, CancellationToken ct = default);

    /// <summary>
    /// Checks if a file exists on disk.
    /// </summary>
    bool FileExists(string storedFileName);
}
