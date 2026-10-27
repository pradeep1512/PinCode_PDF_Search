using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace SamplePdfGenerator;

class Program
{
    static void Main(string[] args)
    {
        var sampleDataDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        Console.WriteLine($"Writing PDFs to: {sampleDataDir}");

        var files = new[]
        {
            ("Address_List_1.pdf", new[]
            {
                "COMMERCIAL DIRECTORY - SECTION A\nCorporate Headquarters:\nReliance Tower, 4th Floor\nNariman Point, Mumbai\nMaharashtra - 400001\nPhone: +91 22 6600 1122\nBranch: Fort Area, Mumbai - 400001",
                "COMMERCIAL DIRECTORY - SECTION B\nNorthern Regional Office:\nBarakhamba Road, Connaught Place\nNew Delhi, Central Delhi\nDelhi - 110001\nPhone: +91 11 2345 6789",
                "COMMERCIAL DIRECTORY - APPENDIX\nSecondary Mumbai Branch & Logistics Depot:\nBallard Estate, Fort, Mumbai\nMaharashtra - 400001\nOperational Hours: 09:00 - 18:00 IST"
            }),
            ("Address_List_2.pdf", new[]
            {
                "SUPPLIER & VENDOR ROSTER 2026\nKarnataka Regional Office:\nPrestige Meridian, M.G. Road\nBengaluru, Urban Bangalore\nKarnataka - 560001\nContact: procurement@samplecorp.in",
                "SUPPLIER & VENDOR ROSTER 2026\nWestern Marine Logistics Division:\nMarine Drive Shipping Terminal\nChurchgate, Mumbai\nMaharashtra - 400001\nHandling Port: Mumbai Port Trust",
                "SUPPLIER & VENDOR ROSTER 2026\nEastern Distribution Center:\nPark Street Commercial Complex\nKolkata, Central Kolkata\nWest Bengal - 700001\nStatus: Active"
            }),
            ("Address_List_3.pdf", new[]
            {
                "FINANCIAL INSTITUTIONS DIRECTORY\nSouthern Corporate Center:\nAnna Salai, Mount Road\nChennai, Central Chennai\nTamil Nadu - 600001\nIFSC Code: CORP0001234",
                "FINANCIAL INSTITUTIONS DIRECTORY\nTreasury & Forex Operations:\nColaba Causeway Financial Hub\nColaba, Mumbai\nMaharashtra - 400001\nSwift: MUMB400001X"
            }),
            ("Regional_Branches_4.pdf", new[]
            {
                "WEST & SOUTH-CENTRAL NETWORK\nPune Division:\nShivajinagar Central Complex\nPune, Maharashtra - 411001",
                "WEST & SOUTH-CENTRAL NETWORK\nTelangana Division:\nAbids Main Commercial Road\nHyderabad, Telangana - 500001\nStatus: Operational",
                "WEST & SOUTH-CENTRAL NETWORK\nGujarat Division:\nAshram Road, Ellis Bridge\nAhmedabad, Gujarat - 380001"
            })
        };

        var regex = new Regex(@"\b[1-9][0-9]{5}\b");

        foreach (var (fileName, pages) in files)
        {
            var targetPath = Path.Combine(sampleDataDir, fileName);
            CreatePdf(targetPath, pages);

            // Read back using GetWords
            using var doc = PdfDocument.Open(targetPath);
            Console.WriteLine($"\n=== Verified: {fileName} ({doc.NumberOfPages} pages) ===");
            for (int i = 1; i <= doc.NumberOfPages; i++)
            {
                var page = doc.GetPage(i);
                var words = page.GetWords();
                var text = words.Any() ? string.Join(" ", words.Select(w => w.Text)) : page.Text;
                var matches = regex.Matches(text);
                Console.WriteLine($"Page {i}: matches=[{string.Join(", ", matches)}] from {words.Count()} words");
            }
        }
    }

    static void CreatePdf(string filePath, string[] pages)
    {
        var builder = new PdfDocumentBuilder();
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);

        foreach (var pageText in pages)
        {
            var page = builder.AddPage(PageSize.A4);
            var lines = pageText.Split('\n');
            double y = 780;

            foreach (var line in lines)
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    page.AddText(line + " ", 12, new PdfPoint(50, y), font);
                }
                y -= 24;
            }
        }

        var bytes = builder.Build();
        File.WriteAllBytes(filePath, bytes);
    }
}
