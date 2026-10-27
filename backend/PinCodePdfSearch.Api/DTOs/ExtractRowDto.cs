using System.Collections.Generic;

namespace PinCodePdfSearch.Api.DTOs;

public class SelectedRowItemDto
{
    public int DocumentId { get; set; }
    public int PageNumber { get; set; }
    public string? Snippet { get; set; }
    public string? FileName { get; set; }
}

public class ExtractRowRequestDto
{
    public int DocumentId { get; set; }
    public string PinCode { get; set; } = string.Empty;
    public int PageNumber { get; set; }
    public string? Snippet { get; set; }
    public string? CustomTargetFileName { get; set; }

    /// <summary>
    /// Optional list of multiple selected rows to extract together into a single new PDF document.
    /// </summary>
    public List<SelectedRowItemDto>? SelectedRows { get; set; }

    /// <summary>
    /// Optional target document ID to append/add the extracted records to an existing single PDF file.
    /// </summary>
    public int? TargetDocumentId { get; set; }
}

public class ExtractRowResponseDto
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int NewDocumentId { get; set; }
    public string NewFileName { get; set; } = string.Empty;
    public int RemovedDocumentId { get; set; }
    public int RemovedPageNumber { get; set; }
    public string PinCode { get; set; } = string.Empty;
    public int ExtractedRowCount { get; set; } = 1;
    public bool WasAppended { get; set; }
    public int TotalRecordsInDocument { get; set; }
    public List<SelectedRowItemDto>? RemovedRows { get; set; }
}
