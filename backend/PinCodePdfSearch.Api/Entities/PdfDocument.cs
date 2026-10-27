using System;
using System.Collections.Generic;

namespace PinCodePdfSearch.Api.Entities;

public class PdfDocument
{
    public int Id { get; set; }

    /// <summary>
    /// Original file name uploaded by user (e.g. "Address_List_1.pdf")
    /// </summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>
    /// Unique randomized file name stored on server disk (prevents collisions & path traversal)
    /// </summary>
    public string StoredFileName { get; set; } = string.Empty;

    /// <summary>
    /// Physical or relative storage path
    /// </summary>
    public string StoragePath { get; set; } = string.Empty;

    /// <summary>
    /// Size of file in bytes
    /// </summary>
    public long FileSize { get; set; }

    /// <summary>
    /// MIME content type, validated as application/pdf
    /// </summary>
    public string ContentType { get; set; } = "application/pdf";

    /// <summary>
    /// Total pages extracted from the PDF
    /// </summary>
    public int PageCount { get; set; }

    /// <summary>
    /// Timestamp when document was uploaded
    /// </summary>
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Indexing lifecycle status
    /// </summary>
    public ProcessingStatus Status { get; set; } = ProcessingStatus.Pending;

    /// <summary>
    /// Indexing error details if Status is Failed
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Navigational collection of indexed PIN codes in this PDF
    /// </summary>
    public ICollection<PdfPinCode> PinCodes { get; set; } = new List<PdfPinCode>();
}
