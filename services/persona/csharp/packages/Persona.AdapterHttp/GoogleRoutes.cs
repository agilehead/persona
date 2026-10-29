using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using Persona.AdapterAuth;
using Persona.AdapterRuntime;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;

namespace Persona.AdapterHttp;

public static class GoogleRoutes
{
    public static async Task Start(HttpContext context, Settings settings, GoogleProvider google, string tenant)
    {
        try
        {
            var options = Http.Cookies(settings, 600);
            var requestedRedirect = context.Request.Query["redirect"];
            if (requestedRedirect.Count > 0)
            {
                var redirect = requestedRedirect.Count == 1 ? AllowedRedirect(settings, requestedRedirect.ToString()) : null;
                if (redirect is null) { await Http.Error(context, 400, "Invalid redirect"); return; }
                context.Response.Cookies.Append("oauth_redirect", redirect, options);
            }
            else Http.ClearCookie(context, settings, "oauth_redirect");
            foreach (var name in new[] { "oauth_state", "oauth_nonce", "oauth_code_verifier", "oauth_redirect", "oauth_tenant" })
                Http.ClearSharedCookie(context, settings, name);
            var state = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
            var nonce = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
            var verifier = Tokens.Encode(RandomNumberGenerator.GetBytes(32));
            var url = await google.Authorize(state, nonce, verifier, context.RequestAborted);
            context.Response.Cookies.Append("oauth_state", state, options);
            context.Response.Cookies.Append("oauth_nonce", nonce, options);
            context.Response.Cookies.Append("oauth_code_verifier", verifier, options);
            context.Response.Cookies.Append("oauth_tenant", tenant, options);
            context.Response.Redirect(url);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        { context.Response.Redirect(settings.PublicUrl + "?error=oauth_failed"); }
    }

    public static async Task Callback(HttpContext context, Settings settings, GoogleProvider google,
        IdentityStore identities, TokenService tokens)
    {
        try
        {
            var cookies = context.Request.Cookies;
            if (!cookies.TryGetValue("oauth_state", out var state)
                || !cookies.TryGetValue("oauth_code_verifier", out var verifier)
                || !cookies.TryGetValue("oauth_tenant", out var tenant))
            { context.Response.Redirect(settings.PublicUrl + "?error=invalid_state"); return; }
            if (!context.Request.Host.HasValue)
            { context.Response.Redirect(settings.PublicUrl + "?error=invalid_request"); return; }
            cookies.TryGetValue("oauth_nonce", out var nonce);
            string? redirect = null;
            if (cookies.TryGetValue("oauth_redirect", out var requestedRedirect))
            {
                redirect = AllowedRedirect(settings, requestedRedirect);
                if (redirect is null) { await Http.Error(context, 400, "Invalid redirect"); return; }
            }
            var current = new Uri((settings.Production ? "https" : context.Request.Scheme) + "://"
                + context.Request.Host + context.Request.PathBase + context.Request.Path + context.Request.QueryString);
            var exchanged = await google.Exchange(current, verifier, state, nonce, context.RequestAborted);
            if (!exchanged.IsSuccess) { context.Response.Redirect(settings.PublicUrl + "?error=oauth_failed"); return; }
            foreach (var name in new[] { "oauth_state", "oauth_nonce", "oauth_code_verifier", "oauth_redirect", "oauth_tenant" })
                Http.ClearCookie(context, settings, name);
            var result = await Authentication.Login(identities, tokens, tenant, "google", exchanged.Value,
                SessionRoutes.Ip(context, settings), context.Request.Headers.UserAgent.FirstOrDefault(), context.RequestAborted);
            if (!result.IsSuccess) { context.Response.Redirect((redirect ?? settings.PublicUrl) + "?error=auth_failed"); return; }
            Http.SetTokens(context, settings, result.Value.Tokens.AccessToken, result.Value.Tokens.RefreshToken, tokens.RefreshLifetime);
            context.Response.Redirect(redirect ?? settings.PublicUrl);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        { context.Response.Redirect(settings.PublicUrl + "?error=oauth_failed"); }
    }

    private static string? AllowedRedirect(Settings settings, string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var target)
            || (target.Scheme != Uri.UriSchemeHttp && target.Scheme != Uri.UriSchemeHttps)
            || (settings.Production && target.Scheme != Uri.UriSchemeHttps)
            || target.UserInfo.Length != 0)
            return null;

        foreach (var origin in settings.CorsOrigins.Append(settings.PublicUrl))
        {
            if (Uri.TryCreate(origin, UriKind.Absolute, out var allowed)
                && allowed.UserInfo.Length == 0
                && string.Equals(target.Scheme, allowed.Scheme, StringComparison.OrdinalIgnoreCase)
                && string.Equals(target.IdnHost, allowed.IdnHost, StringComparison.OrdinalIgnoreCase)
                && target.Port == allowed.Port)
                return target.AbsoluteUri;
        }
        return null;
    }
}
