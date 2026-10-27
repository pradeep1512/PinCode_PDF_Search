using Microsoft.EntityFrameworkCore;
using PinCodePdfSearch.Api.Entities;

namespace PinCodePdfSearch.Api.Data;

public class PdfDbContext : DbContext
{
    public PdfDbContext(DbContextOptions<PdfDbContext> options) : base(options)
    {
    }

    public DbSet<PdfDocument> PdfDocuments => Set<PdfDocument>();
    public DbSet<PdfPinCode> PdfPinCodes => Set<PdfPinCode>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure PdfDocument
        modelBuilder.Entity<PdfDocument>(entity =>
        {
            entity.ToTable("PdfDocuments");

            entity.HasKey(e => e.Id);

            entity.Property(e => e.FileName)
                .IsRequired()
                .HasMaxLength(255);

            entity.Property(e => e.StoredFileName)
                .IsRequired()
                .HasMaxLength(255);

            entity.HasIndex(e => e.StoredFileName)
                .IsUnique();

            entity.Property(e => e.StoragePath)
                .IsRequired()
                .HasMaxLength(1000);

            entity.Property(e => e.ContentType)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(e => e.Status)
                .IsRequired()
                .HasConversion<int>();

            entity.Property(e => e.ErrorMessage)
                .HasMaxLength(2000);

            entity.HasIndex(e => e.UploadedAt);
            entity.HasIndex(e => e.Status);

            // One-to-many relationship with PdfPinCode
            entity.HasMany(e => e.PinCodes)
                .WithOne(p => p.Document)
                .HasForeignKey(p => p.PdfDocumentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Configure PdfPinCode
        modelBuilder.Entity<PdfPinCode>(entity =>
        {
            entity.ToTable("PdfPinCodes");

            entity.HasKey(e => e.Id);

            entity.Property(e => e.PinCode)
                .IsRequired()
                .HasMaxLength(10);

            entity.Property(e => e.ContextSnippet)
                .HasMaxLength(500);

            // High-performance search indexes
            entity.HasIndex(e => e.PinCode)
                .HasDatabaseName("IX_PdfPinCodes_PinCode");

            entity.HasIndex(e => new { e.PdfDocumentId, e.PinCode })
                .HasDatabaseName("IX_PdfPinCodes_Document_PinCode");

            entity.HasIndex(e => new { e.PinCode, e.PdfDocumentId, e.PageNumber })
                .HasDatabaseName("IX_PdfPinCodes_Pin_Doc_Page");
        });
    }
}
