using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Persona.AdapterRuntime;
using Persona.Contracts;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;

namespace Persona.AdapterHttp;

public static class InternalRoutes
{
    public static async Task Link(HttpContext context, IdentityStore identities, TokenService tokens, string id)
    {
        var body = await Http.Body(context);
        var issues = Validation.Link(body, true);
        if (issues.Count > 0)
        { await Http.Json(context, new JsonObject { ["error"] = "Invalid request body", ["details"] = issues }, 400); return; }
        var result = await Authentication.Link(identities, tokens, id, Http.Text(body, "userId")!, Validation.Roles(body), context.RequestAborted);
        if (!result.IsSuccess)
        { await Http.Error(context, result.Error!.Code == "NOT_FOUND" ? 404 : 500, result.Error.Message); return; }
        var value = result.Value;
        await Http.Json(context, new LinkResponse(true, value.Tokens.AccessToken, value.Tokens.RefreshToken,
            new LinkedIdentityView(value.Identity.Id, value.Identity.TenantId, value.Identity.UserId, value.Identity.Email, value.Identity.Roles)), PersonaJson.Default.LinkResponse);
    }
    public static async Task Roles(HttpContext context, IdentityStore identities, string tenant, string user)
    {
        var body = await Http.Body(context);
        var issues = Validation.Link(body, false);
        if (issues.Count > 0)
        { await Http.Json(context, new JsonObject { ["error"] = "Invalid request body", ["details"] = issues }, 400); return; }
        var result = await identities.UpdateRoles(tenant, user, Validation.Roles(body), context.RequestAborted);
        if (!result.IsSuccess) { await Http.Error(context, 500, "Failed to update roles"); return; }
        await Http.Json(context, new JsonObject { ["success"] = true, ["updatedCount"] = result.Value });
    }
    public static async Task Sessions(HttpContext context, TokenService tokens, string tenant, string user)
    {
        var result = await tokens.RevokeUser(tenant, user, context.RequestAborted);
        if (!result.IsSuccess) { await Http.Error(context, 500, "Internal server error"); return; }
        await Http.Json(context, new JsonObject { ["success"] = true, ["revokedCount"] = result.Value });
    }
}
