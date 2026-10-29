using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Persona.AdapterAuth;
using Persona.AdapterHttp;
using Persona.AdapterRuntime;
using Persona.Domain.Authentication;
using Persona.Domain.Identities;
using Persona.Kernel;

internal static class GoogleRoutesProbe
{
    public static async Task Run(IdentityStore identities, TokenService tokens, Action<bool, string> check)
    {
        var settings = new Settings("127.0.0.1", 5005, "https://persona.example.test", "/unused/persona.db",
            "probe-secret", "internal", "15m", "7d", ".example.test", ".example.test", "multi", ["routes-tenant"],
            ["https://app.example.test", "https://admin.example.test"], null,
            "production", "client", "secret", "https://persona.example.test/auth/google/callback");
        using var claims = JsonDocument.Parse("{\"sub\":\"http-google\",\"verified\":true}");
        var provider = new GoogleProvider((state, nonce, verifier, _) =>
        {
            check(state.Length == 64 && nonce.Length == 64 && verifier.Length == 43, "Google route produces fresh state, nonce and PKCE entropy");
            return Task.FromResult("https://accounts.google.com/authorize?state=" + state);
        }, (callback, verifier, state, nonce, _) =>
        {
            check(callback.Scheme == "https" && callback.Host == "persona.example.test" && callback.Query.Contains("code=code"), "Google callback reconstructs external HTTPS URL");
            check(verifier.Length == 43 && state.Length == 64 && nonce?.Length == 64, "Google callback passes stored verification material");
            return Task.FromResult(Result<OAuthUser>.Success(new OAuthUser("http-google", "routes@example.test", "Routes", null, claims.RootElement.Clone())));
        });
        var start = new DefaultHttpContext();
        start.Request.QueryString = new QueryString("?redirect=https%3A%2F%2Fapp.example.test%2Fwelcome");
        await GoogleRoutes.Start(start, settings, provider, "routes-tenant");
        check(start.Response.StatusCode == 302 && start.Response.Headers.Location.ToString().StartsWith("https://accounts.google.com/authorize?", StringComparison.Ordinal), "Google start redirects to provider");
        var cookies = start.Response.Headers.SetCookie.Select(value => value!).ToArray();
        check(cookies.Length == 5 && cookies.All(value => value.Contains("httponly", StringComparison.OrdinalIgnoreCase)
            && value.Contains("secure", StringComparison.OrdinalIgnoreCase) && value.Contains("max-age=600", StringComparison.OrdinalIgnoreCase)), "Google state cookies are secure and bounded");
        var noRedirect = new DefaultHttpContext();
        noRedirect.Request.Headers.Cookie = "oauth_redirect=https%3A%2F%2Fapp.example.test%2Fprevious";
        await GoogleRoutes.Start(noRedirect, settings, provider, "routes-tenant");
        check(noRedirect.Response.Headers.SetCookie.Any(value => value is not null
            && value.StartsWith("oauth_redirect=", StringComparison.Ordinal)
            && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)
            && value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase)),
            "Google start clears a previous redirect with the configured cookie domain");
        foreach (var destination in new[] { "https://outside.example.test/", "javascript:alert(1)",
            "https://app.example.test@outside.example.test/", "https://app.example.test.outside.example.test/",
            "http://app.example.test/", "//outside.example.test/" })
        {
            var invalid = new DefaultHttpContext();
            invalid.Request.QueryString = new QueryString("?redirect=" + Uri.EscapeDataString(destination));
            await GoogleRoutes.Start(invalid, settings, provider, "routes-tenant");
            check(invalid.Response.StatusCode == 400 && invalid.Response.Headers.SetCookie.Count == 0,
                "Google start rejects an untrusted redirect: " + destination);
        }
        var forgedCallback = new DefaultHttpContext();
        forgedCallback.Request.Host = new HostString("persona.example.test");
        forgedCallback.Request.Headers.Cookie = string.Join("; ", cookies.Select(value => value.Split(';')[0])
            .Where(value => !value.StartsWith("oauth_redirect=", StringComparison.Ordinal)))
            + "; oauth_redirect=" + Uri.EscapeDataString("https://outside.example.test/");
        await GoogleRoutes.Callback(forgedCallback, settings, provider, identities, tokens);
        check(forgedCallback.Response.StatusCode == 400 && forgedCallback.Response.Headers.Location.Count == 0,
            "Google callback rejects an untrusted redirect cookie");
        var callback = new DefaultHttpContext();
        callback.Request.Host = new HostString("persona.example.test");
        callback.Request.Scheme = "http";
        callback.Request.Path = "/auth/google/callback";
        callback.Request.QueryString = new QueryString("?code=code&state=state");
        callback.Request.Headers.Cookie = string.Join("; ", cookies.Select(value => value.Split(';')[0]));
        await GoogleRoutes.Callback(callback, settings, provider, identities, tokens);
        check(callback.Response.StatusCode == 302 && callback.Response.Headers.Location == "https://app.example.test/welcome", "Google callback returns to saved application URL");
        var output = callback.Response.Headers.SetCookie.Select(value => value!).ToArray();
        check(output.Count(value => value.StartsWith("oauth_", StringComparison.Ordinal) && value.Contains("expires=", StringComparison.OrdinalIgnoreCase)) == 5,
            "Google callback clears all transient state cookies");
        check(output.Where(value => value.StartsWith("oauth_", StringComparison.Ordinal)).All(value =>
            value.Contains("domain=.example.test", StringComparison.OrdinalIgnoreCase)), "Google callback clears transient cookies on their configured domain");
        check(output.Count(value => value.StartsWith("access_token=", StringComparison.Ordinal) || value.StartsWith("refresh_token=", StringComparison.Ordinal)) == 2,
            "Google callback issues both session cookies");
        var identity = await identities.FindByProvider("routes-tenant", "google", "http-google", CancellationToken.None);
        check(identity.IsSuccess && identity.Value?.Email == "routes@example.test" && identity.Value.Metadata?.GetProperty("verified").GetBoolean() == true,
            "Google HTTP callback persists verified identity under recovered tenant");
    }
}
