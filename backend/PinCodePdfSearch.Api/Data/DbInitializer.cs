using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace PinCodePdfSearch.Api.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(
        PdfDbContext context, 
        IConfiguration configuration, 
        ILogger logger)
    {
        try
        {
            logger.LogInformation("Initializing database...");
            // EnsureCreated or Migrate based on configuration
            await context.Database.EnsureCreatedAsync();
            logger.LogInformation("Database initialized successfully.");

            // Ensure upload directory exists
            var storagePath = configuration.GetValue<string>("FileStorage:StoragePath") 
                ?? Path.Combine(AppContext.BaseDirectory, "UploadedPdfs");

            if (!Directory.Exists(storagePath))
            {
                Directory.CreateDirectory(storagePath);
                logger.LogInformation("Created PDF storage directory at: {StoragePath}", storagePath);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "An error occurred while initializing the database or file storage.");
            throw;
        }
    }
}
