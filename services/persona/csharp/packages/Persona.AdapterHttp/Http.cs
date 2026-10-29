using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Persona.AdapterRuntime;

namespace Persona.AdapterHttp;

public static class Http
{
    public static bool SessionOriginAllowed(HttpContext context, Settings settings)
    {
        var origin = context.Request.Headers.Origin;
        // CORS alone only controls reading the response. Check before parsing or
        // mutating sessions, including simple form requests and opaque origins.
        if (origin.Count > 0)
            return origin.Count == 1 && settings.CorsOrigins.Contains(origin[0], StringComparer.Ordinal);
        // Cookie clients must identify an allowed browser origin. Non-browser
        // clients can supply a token in the body without ambient cookies.
        return context.Request.Cookies.Count == 0 && !context.Request.Headers.ContainsKey("Sec-Fetch-Site");
    }
    public static Task Json(HttpContext context, JsonObject value, int status = 200)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json; charset=utf-8";
        return context.Response.WriteAsync(value.ToJsonString(), context.RequestAborted);
    }
    public static Task Json<T>(HttpContext context, T value, JsonTypeInfo<T> type)
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        return context.Response.WriteAsync(JsonSerializer.Serialize(value, type), context.RequestAborted);
    }
    public static Task Error(HttpContext context, int status, string message) => Json(context, new JsonObject { ["error"] = message }, status);
    public static string? Text(JsonNode? body, string field) => body is JsonObject map && map[field] is JsonValue value
        && value.TryGetValue<string>(out var text) ? text : null;
    public static async Task<JsonNode?> Body(HttpContext context)
    {
        if (context.Items.TryGetValue("persona.body", out var parsed)) return (JsonNode?)parsed;
        var body = await ReadBody(context);
        context.Items["persona.body"] = body;
        return body;
    }
    private static async Task<JsonNode?> ReadBody(HttpContext context)
    {
        if (context.Request.ContentType?.Split(';')[0].Trim().Equals("application/x-www-form-urlencoded", StringComparison.OrdinalIgnoreCase) == true)
        {
            var form = await context.Request.ReadFormAsync(context.RequestAborted);
            var result = new JsonObject();
            foreach (var pair in form)
            {
                var array = pair.Key.EndsWith("[]", StringComparison.Ordinal);
                var key = array ? pair.Key[..^2] : pair.Key;
                if (key is "__proto__" or "constructor" or "prototype") continue;
                result[key] = array || pair.Value.Count > 1
                    ? new JsonArray(pair.Value.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray())
                    : JsonValue.Create(pair.Value.ToString());
            }
            return result;
        }
        if (context.Features.Get<IHttpRequestBodyDetectionFeature>()?.CanHaveBody == false
            || context.Request.ContentLength == 0 || context.Request.Body == Stream.Null) return new JsonObject();
        if (!context.Request.HasJsonContentType()) return new JsonObject();
        var body = await JsonNode.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted);
        if (body is not (JsonObject or JsonArray)) throw new JsonException("JSON body must be an object or array");
        return body;
    }
    public static string? Tenant(HttpContext context, Settings settings, out string? error)
    {
        error = null;
        if (settings.TenantMode == "single")
        {
            if (context.Request.Query.ContainsKey("tenant")) { error = "tenant parameter not allowed in single-tenant mode"; return null; }
            return settings.Tenants[0];
        }
        if (!context.Request.Query.TryGetValue("tenant", out var tenant) || tenant.ToString().Length == 0)
        { error = "tenant parameter required"; return null; }
        if (tenant.Count != 1 || !settings.Tenants.Contains(tenant.ToString(), StringComparer.Ordinal))
        { error = "invalid tenant"; return null; }
        return tenant.ToString();
    }
    public static CookieOptions Cookies(Settings settings, int? lifetime = null, bool access = false) => new()
    {
        HttpOnly = true, Secure = settings.Production, SameSite = settings.Production ? SameSiteMode.None : SameSiteMode.Lax,
        Path = "/", Domain = (access ? settings.AccessCookieDomain : settings.CookieDomain) is { Length: > 0 } domain ? domain : null,
        MaxAge = lifetime is { } seconds ? TimeSpan.FromSeconds(seconds) : null,
        Expires = lifetime is { } ttl ? DateTimeOffset.UtcNow.AddSeconds(ttl) : null
    };
    public static string? Refresh(HttpContext context, JsonNode? body) => context.Request.Cookies.TryGetValue("refresh_token", out var token) ? token : Text(body, "refreshToken");
    public static void SetTokens(HttpContext context, Settings settings, string access, string refresh, int lifetime)
    {
        context.Response.Cookies.Append("access_token", access, Cookies(settings, lifetime, access: true));
        context.Response.Cookies.Append("refresh_token", refresh, Cookies(settings, lifetime));
        ClearSharedCookie(context, settings, "refresh_token");
    }
    // Invalidate a former application-wide cookie when its owner now uses a
    // narrower scope. Otherwise the browser can retain both same-name cookies.
    public static void ClearSharedCookie(HttpContext context, Settings settings, string name)
    {
        if (settings.AccessCookieDomain is not { Length: > 0 } accessDomain
            || string.Equals(accessDomain.TrimStart('.'), settings.CookieDomain?.TrimStart('.'), StringComparison.OrdinalIgnoreCase))
            return;
        context.Response.Cookies.Delete(name, Cookies(settings, access: true));
    }
    public static void ClearCookie(HttpContext context, Settings settings, string name)
    {
        context.Response.Cookies.Delete(name, Cookies(settings));
        ClearSharedCookie(context, settings, name);
    }
    public static void ClearTokens(HttpContext context, Settings settings)
    {
        context.Response.Cookies.Delete("access_token", Cookies(settings, access: true));
        ClearCookie(context, settings, "refresh_token");
    }
}
