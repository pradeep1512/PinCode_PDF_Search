using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using PinCodePdfSearch.Api.Services.Interfaces;
using UglyToad.PdfPig;

namespace PinCodePdfSearch.Api.Services.Implementations;

public class PdfPigTextExtractor : IPdfTextExtractor
{
    private readonly ILogger<PdfPigTextExtractor> _logger;

    public PdfPigTextExtractor(ILogger<PdfPigTextExtractor> logger)
    {
        _logger = logger;
    }

    public Task<PdfExtractionResult> ExtractTextAsync(string filePath, CancellationToken ct = default)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException("PDF file not found for extraction.", filePath);
        }

        var result = new PdfExtractionResult();

        try
        {
            using (var document = PdfDocument.Open(filePath))
            {
                result.PageCount = document.NumberOfPages;
                bool anyPageHasText = false;

                for (int pageNum = 1; pageNum <= document.NumberOfPages; pageNum++)
                {
                    if (ct.IsCancellationRequested)
                    {
                        break;
                    }

                    var page = document.GetPage(pageNum);
                    
                    // Use GetWords() with spatial line grouping to preserve entire rows and line breaks
                    var words = page.GetWords();
                    string text;

                    if (words != null && words.Any())
                    {
                        var lineGroups = words
                            .GroupBy(w => Math.Round(w.BoundingBox.Bottom / 4.0) * 4.0)
                            .OrderByDescending(g => g.Key)
                            .Select(g => string.Join(" ", g.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text)));
                        text = string.Join("\n", lineGroups);
                    }
                    else
                    {
                        text = page.Text ?? string.Empty;
                    }

                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        anyPageHasText = true;
                    }

                    result.Pages.Add(new PageContent
                    {
                        PageNumber = pageNum,
                        Text = text
                    });
                }

                result.HasTextContent = anyPageHasText;
                _logger.LogInformation("Extracted text from {FilePath}: {PageCount} pages, HasTextContent={HasTextContent}", 
                    filePath, result.PageCount, result.HasTextContent);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PdfPig failed to extract text from {FilePath}", filePath);
            throw;
        }

        return Task.FromResult(result);
    }
}
