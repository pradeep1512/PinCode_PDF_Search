using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using PinCodePdfSearch.Api.DTOs;

namespace PinCodePdfSearch.Api.Services.Interfaces;

public interface IPinCodeIndexerService
{
    /// <summary>
    /// Processes and indexes PIN codes found across all pages of a PDF document.
    /// </summary>
    Task IndexDocumentAsync(int documentId, CancellationToken ct = default);

    /// <summary>
    /// Re-indexes a document (e.g., after initial failure or OCR retry).
    /// </summary>
    Task ReindexDocumentAsync(int documentId, CancellationToken ct = default);

    /// <summary>
    /// Searches indexed documents for a specific 6-digit Indian PIN code.
    /// </summary>
    Task<List<PdfSearchResultDto>> SearchByPinCodeAsync(string pinCode, CancellationToken ct = default);

    /// <summary>
    /// Retrieves page breakdown for a specific document and PIN code.
    /// </summary>
    Task<PdfPagesResponseDto?> GetDocumentPagesForPinCodeAsync(int documentId, string pinCode, CancellationToken ct = default);

    /// <summary>
    /// Removes a specific PIN code row from the source document index and generates a new PDF containing the extracted record.
    /// </summary>
    Task<ExtractRowResponseDto> ExtractRowToNewPdfAsync(ExtractRowRequestDto request, CancellationToken ct = default);
}
