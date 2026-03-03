using System.Text.Json;

namespace JapanDict.Api.Middleware;

public class ApiKeyMiddleware(RequestDelegate next, IConfiguration configuration)
{
    private const string ApiKeyHeader = "X-Api-Key";
    private readonly HashSet<string> accessKeys = ParseAccessKeys(configuration["AccessKeys"]);

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

        if (!accessKeys.Contains(key))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Invalid API key." });
            return;
        }

        // Expose the key ID to downstream handlers via HttpContext.Items
        context.Items["ApiKeyId"] = key;

        await next(context);
    }

    private static HashSet<string> ParseAccessKeys(string? rawAccessKeys)
    {
        if (string.IsNullOrWhiteSpace(rawAccessKeys))
            return new HashSet<string>(StringComparer.Ordinal);

        var parsed = JsonSerializer.Deserialize<string[]>(rawAccessKeys);
        if (parsed is null)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

        return parsed
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .ToHashSet(StringComparer.Ordinal);
    }
}

public static class ApiKeyMiddlewareExtensions
{
    public static IApplicationBuilder UseApiKeyAuth(this IApplicationBuilder app)
        => app.UseMiddleware<ApiKeyMiddleware>();
}
