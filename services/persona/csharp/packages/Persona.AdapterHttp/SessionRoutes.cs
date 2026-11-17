using System.Text.Json.Nodes;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Persona.Kernel;
using Persona.Contracts;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;

namespace Persona.AdapterHttp;

public static partial class SessionRoutes
{
    public static async Task Password(HttpContext context, HttpSettings settings, PasswordVerifier devAuth,
        IdentityStore identities, TokenService tokens, string tenant)
    {
        var body = await Http.Body(context);
        var user = Http.Text(body, "username"); var password = Http.Text(body, "password");
        if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(password))
        { await Http.Error(context, 400, "username and password are required"); return; }
        if (!devAuth.Verify(user, password))
        { await Http.Error(context, 401, "Invalid username or password"); return; }
        using var metadata = JsonDocument.Parse("{}");
        var result = await Authentication.Login(identities, tokens, tenant, "password",
            new OAuthUser(user, EmailUsername().IsMatch(user) ? user : null, user, null, metadata.RootElement.Clone()),
            Ip(context, settings), context.Request.Headers.UserAgent.FirstOrDefault(), context.RequestAborted);
        if (!result.IsSuccess) { await Http.Error(context, 500, "Authentication failed"); return; }
        var value = result.Value;
        Http.SetTokens(context, settings, value.Tokens.AccessToken, value.Tokens.RefreshToken, tokens.RefreshLifetime);
        await Http.Json(context, new LoginResponse(value.Tokens.AccessToken, value.Tokens.ExpiresIn,
            new IdentityView(value.Identity.Id, value.Identity.Email, value.Identity.Name, value.Identity.Roles, value.Identity.UserId)), PersonaJson.Default.LoginResponse);
    }

    public static async Task Refresh(HttpContext context, HttpSettings settings, IdentityStore identities, TokenService tokens)
    {
        var refresh = Http.Refresh(context, await Http.Body(context));
        if (refresh is null) { await Http.Error(context, 401, "No refresh token provided"); return; }
        var result = await Authentication.Refresh(identities, tokens, refresh, context.RequestAborted);
        if (!result.IsSuccess)
        {
            var invalid = result.Error!.Code is "INVALID_TOKEN" or "NOT_FOUND";
            if (invalid) Http.ClearTokens(context, settings);
            await Http.Error(context, invalid ? 401 : 500, invalid ? result.Error.Message : "Failed to refresh token");
            return;
        }
        Http.SetTokens(context, settings, result.Value.AccessToken, result.Value.RefreshToken, tokens.RefreshLifetime);
        await Http.Json(context, new RefreshResponse(result.Value.AccessToken, result.Value.ExpiresIn), PersonaJson.Default.RefreshResponse);
    }

    public static async Task Logout(HttpContext context, HttpSettings settings, TokenService tokens)
    {
        var refresh = Http.Refresh(context, await Http.Body(context));
        var result = await Authentication.Logout(tokens, refresh, context.RequestAborted);
        Http.ClearTokens(context, settings);
        if (!result.IsSuccess) { await Http.Error(context, 500, "Failed to revoke session"); return; }
        await Http.Json(context, new JsonObject { ["success"] = true });
    }

    public static string? Ip(HttpContext context, HttpSettings settings)
    {
        if (settings.Production && context.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded))
            return forwarded.ToString().Split(',')[^1].Trim();
        var ip = context.Connection.RemoteIpAddress;
        return ip?.IsIPv4MappedToIPv6 == true ? ip.MapToIPv4().ToString() : ip?.ToString();
    }
    [GeneratedRegex(@"^[^@\s]+@[^@\s]+$", RegexOptions.CultureInvariant)]
    private static partial Regex EmailUsername();
}
