using Microsoft.AspNetCore.Http;
using Persona.AdapterHttp;
using Persona.AdapterRuntime;
using Persona.Domain.Authentication;
using Persona.Domain.Identities;

internal static class SessionRoutesProbe
{
    public static async Task Run(IdentityStore identities, TokenService tokens, Action<bool, string> check)
    {
        var settings = new Settings("127.0.0.1", 5005, "https://persona.example.test", "/unused/persona.db",
            "probe-secret", "internal", "15m", "7d", null, ".example.test", "single", ["tenant"],
            [], null, "production", null, null, null);
        var issued = new DefaultHttpContext();
        Http.SetTokens(issued, settings, "access", "refresh", 600);
        var issuedCookies = issued.Response.Headers.SetCookie.Select(value => value!).ToArray();
        check(issuedCookies.Length == 3
            && issuedCookies.Any(value => value.StartsWith("access_token=", StringComparison.Ordinal)
                && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase))
            && issuedCookies.Any(value => value.StartsWith("refresh_token=", StringComparison.Ordinal)
                && !value.Contains("domain=", StringComparison.OrdinalIgnoreCase))
            && issuedCookies.Any(value => value.StartsWith("refresh_token=;", StringComparison.Ordinal)
                && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase)
                && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)),
            "access cookie reaches application subdomains while refresh cookie stays host-only");
        var invalid = new DefaultHttpContext();
        invalid.Request.Headers.Cookie = "refresh_token=invalid";
        await SessionRoutes.Refresh(invalid, settings, identities, tokens);
        check(invalid.Response.StatusCode == 401 && ClearsConfiguredCookies(invalid),
            "invalid refresh clears each cookie on its configured domain");

        var logout = new DefaultHttpContext();
        logout.Request.Headers.Cookie = "refresh_token=invalid";
        var unavailable = tokens with { ValidateRefresh = (_, _) => throw new IOException("fixture failure") };
        await SessionRoutes.Logout(logout, settings, unavailable);
        check(logout.Response.StatusCode == 200 && ClearsConfiguredCookies(logout),
            "logout clears both cookies even when session validation fails");
    }

    private static bool ClearsConfiguredCookies(HttpContext context)
    {
        var cookies = context.Response.Headers.SetCookie.Select(value => value!).ToArray();
        return cookies.Length == 3
            && cookies.Any(value => value.StartsWith("access_token=", StringComparison.Ordinal)
                && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)
                && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase))
            && cookies.Any(value => value.StartsWith("refresh_token=", StringComparison.Ordinal)
                && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)
                && !value.Contains("domain=", StringComparison.OrdinalIgnoreCase))
            && cookies.Any(value => value.StartsWith("refresh_token=;", StringComparison.Ordinal)
                && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)
                && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase));
    }
}
