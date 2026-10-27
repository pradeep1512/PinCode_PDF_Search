using System;
using System.Collections.Generic;

namespace PinCodePdfSearch.Api.DTOs;

public class PageMatchDto
{
    public int PageNumber { get; set; }
    public int OccurrenceCount { get; set; }
    public string? Snippet { get; set; }
}

public class PdfSearchResultDto
{
    public int DocumentId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public int PageCount { get; set; }
    public DateTime UploadedAt { get; set; }
    public string SearchedPinCode { get; set; } = string.Empty;
    public int TotalOccurrencesInDoc { get; set; }
    public List<PageMatchDto> MatchingPages { get; set; } = new();
}
