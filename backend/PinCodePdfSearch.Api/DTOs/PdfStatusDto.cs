using System;
using PinCodePdfSearch.Api.Entities;

namespace PinCodePdfSearch.Api.DTOs;

public class PdfStatusDto
{
    public int Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public ProcessingStatus Status { get; set; }
    public string StatusText => Status.ToString();
    public string? ErrorMessage { get; set; }
    public int PageCount { get; set; }
    public int PinCodeCount { get; set; }
    public DateTime UploadedAt { get; set; }
}
