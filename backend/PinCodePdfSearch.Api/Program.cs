using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PinCodePdfSearch.Api.Data;
using PinCodePdfSearch.Api.Middleware;
using PinCodePdfSearch.Api.Services.Implementations;
using PinCodePdfSearch.Api.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);

// 1. Add database context
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Server=localhost;Database=PdfPinCodeSearchDb;Trusted_Connection=True;TrustServerCertificate=True;";

builder.Services.AddDbContext<PdfDbContext>(options =>
{
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(5),
            errorNumbersToAdd: null);
    });
});

// 2. Register application services
builder.Services.AddScoped<IFileStorageService, LocalFileStorageService>();
builder.Services.AddScoped<IPdfTextExtractor, PdfPigTextExtractor>();
builder.Services.AddScoped<IOcrService, TesseractOcrService>();
builder.Services.AddScoped<IPinCodeIndexerService, PinCodeIndexerService>();

// 3. Add Controllers and JSON serialization options
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

// 4. Configure CORS for Angular frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularDev", policy =>
    {
        policy.WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("Content-Disposition", "Content-Range", "Accept-Ranges");
    });
});

// 5. Add Swagger/OpenAPI documentation
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title = "PIN Code-Based PDF Search API",
        Version = "v1",
        Description = "API for uploading, indexing 6-digit Indian PIN codes, streaming, and switching between PDF documents."
    });
});

var app = builder.Build();

// 6. Automatic database migration and initialization on startup
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    var context = services.GetRequiredService<PdfDbContext>();
    var config = services.GetRequiredService<IConfiguration>();

    try
    {
        await DbInitializer.InitializeAsync(context, config, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to initialize the database on startup. Ensure SQL Server is running.");
    }
}

// 7. Configure HTTP request pipeline
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "PDF PIN Code Search API v1");
    });
}

app.UseCors("AllowAngularDev");

app.UseAuthorization();

app.MapControllers();

app.Run();
