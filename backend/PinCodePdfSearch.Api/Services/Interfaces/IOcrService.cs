using System.Threading;
using System.Threading.Tasks;

namespace PinCodePdfSearch.Api.Services.Interfaces;

public interface IOcrService
{
    /// <summary>
    /// Checks whether OCR engine is installed/enabled on this server.
    /// </summary>
    bool IsOcrAvailable();

    /// <summary>
    /// Runs OCR on an image-based/scanned PDF document.
    /// </summary>
    Task<PdfExtractionResult?> PerformOcrAsync(string filePath, CancellationToken ct = default);
}
