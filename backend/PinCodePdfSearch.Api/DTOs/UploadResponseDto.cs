using System.Collections.Generic;

namespace PinCodePdfSearch.Api.DTOs;

public class UploadResponseDto
{
    public int TotalReceived { get; set; }
    public int SuccessCount { get; set; }
    public int FailureCount { get; set; }
    public List<PdfDocumentDto> UploadedDocuments { get; set; } = new();
    public List<string> Errors { get; set; } = new();
}
