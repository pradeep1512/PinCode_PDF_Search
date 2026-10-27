using System.Collections.Generic;

namespace PinCodePdfSearch.Api.DTOs;

public class PdfPagesResponseDto
{
    public int PdfDocumentId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string PinCode { get; set; } = string.Empty;
    public List<PageMatchDto> Pages { get; set; } = new();
}
