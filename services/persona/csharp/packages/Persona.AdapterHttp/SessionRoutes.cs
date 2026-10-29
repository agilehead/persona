using System.Text.Json.Nodes;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Persona.AdapterAuth;
using Persona.AdapterRuntime;
using Persona.Contracts;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;

namespace Persona.AdapterHttp;

public static partial class SessionRoutes
{
    public static async Task Password(HttpContext context, Settings settings, DevAuth devAuth,
        IdentityStore identities, TokenService tokens, string tenant)
    {
        var body = await Http.Body(context);
        var user = Http.Text(body, "username"); var password = Http.Text(body, "password");
        if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(password))
        { await Http.Error(context, 400, "username and password are required"); return; }
        if (!DevUsers.Verify(devAuth, user, password))
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

    public static async Task Refresh(HttpContext context, Settings settings, IdentityStore identities, TokenService tokens)
    {
        var refresh = Http.Refresh(context, await Http.Body(context));
        if (refresh is null) { await Http.Error(context, 401, "No refresh token provided"); return; }
        var validated = await tokens.ValidateRefresh(refresh, context.RequestAborted);
        if (!validated.IsSuccess)
        {
            Http.ClearTokens(context, settings);
            await Http.Error(context, 401, validated.Error!.Message);
            return;
        }
        var found = await identities.FindById(validated.Value.IdentityId, context.RequestAborted);
        if (!found.IsSuccess) { await Http.Error(context, 500, "Failed to refresh token"); return; }
        if (found.Value is null) { await Http.Error(context, 401, "Identity not found"); return; }
        var slid = await tokens.Slide(validated.Value.Id, context.RequestAborted);
        if (!slid.IsSuccess) { await Http.Error(context, 401, slid.Error!.Message); return; }
        var access = tokens.AccessToken(found.Value, validated.Value.Id);
        Http.SetTokens(context, settings, access, refresh, tokens.RefreshLifetime);
        await Http.Json(context, new RefreshResponse(access, tokens.AccessLifetime), PersonaJson.Default.RefreshResponse);
    }

    public static async Task Logout(HttpContext context, Settings settings, TokenService tokens)
    {
        try
        {
            var refresh = Http.Refresh(context, await Http.Body(context));
            if (refresh is not null)
            {
                var valid = await tokens.ValidateRefresh(refresh, context.RequestAborted);
                if (valid.IsSuccess) await tokens.Revoke(valid.Value.Id, context.RequestAborted);
            }
        }
        catch (Exception error) when (error is not OperationCanceledException) { }
        Http.ClearTokens(context, settings);
        await Http.Json(context, new JsonObject { ["success"] = true });
    }

    public static string? Ip(HttpContext context, Settings settings)
    {
        if (settings.Production && context.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded))
            return forwarded.ToString().Split(',')[^1].Trim();
        var ip = context.Connection.RemoteIpAddress;
        return ip?.IsIPv4MappedToIPv6 == true ? ip.MapToIPv4().ToString() : ip?.ToString();
    }
    [GeneratedRegex(@"^[^@\s]+@[^@\s]+$", RegexOptions.CultureInvariant)]
    private static partial Regex EmailUsername();
}
