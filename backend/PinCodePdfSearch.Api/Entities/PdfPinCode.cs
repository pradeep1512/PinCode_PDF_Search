namespace PinCodePdfSearch.Api.Entities;

public class PdfPinCode
{
    public int Id { get; set; }

    /// <summary>
    /// Foreign key to parent PDF document
    /// </summary>
    public int PdfDocumentId { get; set; }

    /// <summary>
    /// 6-digit Indian PIN code (e.g., "400001")
    /// </summary>
    public string PinCode { get; set; } = string.Empty;

    /// <summary>
    /// 1-based page number where this PIN code was detected
    /// </summary>
    public int PageNumber { get; set; }

    /// <summary>
    /// Number of occurrences of this PIN code on this page
    /// </summary>
    public int OccurrenceCount { get; set; } = 1;

    /// <summary>
    /// Text snippet surrounding the PIN code for quick user preview/verification
    /// </summary>
    public string? ContextSnippet { get; set; }

    /// <summary>
    /// Parent PDF document navigation reference
    /// </summary>
    public PdfDocument Document { get; set; } = null!;
}
