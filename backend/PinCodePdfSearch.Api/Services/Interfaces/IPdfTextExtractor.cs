using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace PinCodePdfSearch.Api.Services.Interfaces;

public class PageContent
{
    public int PageNumber { get; set; }
    public string Text { get; set; } = string.Empty;
}

public class PdfExtractionResult
{
    public int PageCount { get; set; }
    public List<PageContent> Pages { get; set; } = new();
    public bool HasTextContent { get; set; }
}

public interface IPdfTextExtractor
{
    /// <summary>
    /// Extracts text page-by-page from a PDF document.
    /// </summary>
    Task<PdfExtractionResult> ExtractTextAsync(string filePath, CancellationToken ct = default);
}
