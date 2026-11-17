using Microsoft.AspNetCore.Http;
using Persona.AdapterHttp;
using Persona.AdapterRuntime;
using Persona.Domain.Authentication;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Kernel;

internal static class SessionRoutesProbe
{
    public static async Task Run(IdentityStore identities, TokenService tokens, Action<bool, string> check)
    {
        var settings = new HttpSettings("127.0.0.1", 5005, "https://persona.example.test", "internal",
            null, ".example.test", "single", ["tenant"], [], true);
        var issued = new DefaultHttpContext();
        Http.SetTokens(issued, settings, "access", "refresh", 600);
        var issuedCookies = issued.Response.Headers.SetCookie.Select(value => value!).ToArray();
        check(issuedCookies.Length == 2
            && issuedCookies.Any(value => value.StartsWith("access_token=", StringComparison.Ordinal)
                && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase))
            && issuedCookies.Any(value => value.StartsWith("refresh_token=", StringComparison.Ordinal)
                && !value.Contains("domain=", StringComparison.OrdinalIgnoreCase)),
            "access cookie reaches application subdomains while refresh cookie stays host-only");
        var invalid = new DefaultHttpContext();
        invalid.Request.Headers.Cookie = "refresh_token=invalid";
        await SessionRoutes.Refresh(invalid, settings, identities, tokens);
        check(invalid.Response.StatusCode == 401 && ClearsConfiguredCookies(invalid),
            "invalid refresh clears each cookie on its configured domain");

        var logout = new DefaultHttpContext();
        logout.Request.Headers.Cookie = "refresh_token=invalid";
        var unavailable = tokens with { ValidateRefresh = (_, _) => Task.FromResult(Result<Session>.Failed("INFRASTRUCTURE", "fixture failure")) };
        await SessionRoutes.Logout(logout, settings, unavailable);
        check(logout.Response.StatusCode == 500 && ClearsConfiguredCookies(logout),
            "logout clears browser cookies without falsely confirming failed server revocation");
        var retry = new DefaultHttpContext();
        retry.Request.Headers.Cookie = "refresh_token=retryable";
        await SessionRoutes.Refresh(retry, settings, identities, unavailable);
        check(retry.Response.StatusCode == 500 && retry.Response.Headers.SetCookie.Count == 0,
            "transient refresh storage failure preserves retryable credentials and is not reported as invalid authentication");
    }

    private static bool ClearsConfiguredCookies(HttpContext context)
    {
        var cookies = context.Response.Headers.SetCookie.Select(value => value!).ToArray();
        return cookies.Length == 2
            && cookies.Any(value => value.StartsWith("access_token=", StringComparison.Ordinal)
                && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)
                && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase))
            && cookies.Any(value => value.StartsWith("refresh_token=", StringComparison.Ordinal)
                && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)
                && !value.Contains("domain=", StringComparison.OrdinalIgnoreCase));
    }
}
