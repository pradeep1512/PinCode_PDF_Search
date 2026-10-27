using System;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using PinCodePdfSearch.Api.Exceptions;

namespace PinCodePdfSearch.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (AppException appEx)
        {
            _logger.LogWarning(appEx, "Application exception: {Message}", appEx.Message);
            await HandleExceptionAsync(context, appEx.StatusCode, appEx.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled server error occurred.");
            await HandleExceptionAsync(context, HttpStatusCode.InternalServerError, "An unexpected server error occurred. Please try again later.");
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, HttpStatusCode statusCode, string message)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var response = new
        {
            success = false,
            statusCode = (int)statusCode,
            error = message,
            timestamp = DateTime.UtcNow
        };

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        await context.Response.WriteAsync(json);
    }
}
