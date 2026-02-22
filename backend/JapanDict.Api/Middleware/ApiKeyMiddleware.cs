using JapanDict.Api.Models;
using MongoDB.Driver;

namespace JapanDict.Api.Middleware;

public class ApiKeyMiddleware(RequestDelegate next, IMongoCollection<AccessKey> accessKeys)
{
    private const string ApiKeyHeader = "X-Api-Key";

    public async Task InvokeAsync(HttpContext context)
    {
        // Allow health-check endpoint without auth
        if (context.Request.Path.StartsWithSegments("/health"))
        {
            await next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue(ApiKeyHeader, out var rawKey) || string.IsNullOrWhiteSpace(rawKey))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Missing X-Api-Key header." });
            return;
        }

        var key = rawKey.ToString().Trim();
        var record = await accessKeys
            .Find(k => k.Id == key)
            .FirstOrDefaultAsync();

        if (record is null || !record.IsActive)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Invalid or inactive API key." });
            return;
        }

        // Expose the key ID to downstream handlers via HttpContext.Items
        context.Items["ApiKeyId"] = key;

        await next(context);
    }
}

public static class ApiKeyMiddlewareExtensions
{
    public static IApplicationBuilder UseApiKeyAuth(this IApplicationBuilder app)
        => app.UseMiddleware<ApiKeyMiddleware>();
}
