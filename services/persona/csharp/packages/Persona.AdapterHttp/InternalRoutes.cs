using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Persona.Contracts;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;

namespace Persona.AdapterHttp;

public static class InternalRoutes
{
    public static async Task Link(HttpContext context, IdentityStore identities, TokenService tokens, string tenant, string id)
    {
        var body = await Http.Body(context);
        var issues = Validation.Link(body, true);
        if (issues.Count > 0)
        { await Http.Json(context, new JsonObject { ["error"] = "Invalid request body", ["details"] = issues }, 400); return; }
        var result = await Authentication.Link(identities, tokens, tenant, id, Http.Text(body, "userId")!, Validation.Roles(body), context.RequestAborted);
        if (!result.IsSuccess)
        { await Http.Error(context, Status(result.Error!.Code), result.Error.Message); return; }
        var value = result.Value;
        await Http.Json(context, new LinkResponse(true, value.Tokens.AccessToken, value.Tokens.RefreshToken,
            new LinkedIdentityView(value.Identity.Id, value.Identity.TenantId, value.Identity.UserId, value.Identity.Email, value.Identity.Roles)), PersonaJson.Default.LinkResponse);
    }
    private static int Status(string code) => code switch
    {
        "NOT_FOUND" => 404, "INVALID_REQUEST" => 400, "IDENTITY_CONFLICT" => 409,
        "PRECONDITION_FAILED" => 412, _ => 500
    };
    private static string Tag(UserRoles user) => "\"roles-" + user.Version + "\"";
    private static JsonObject View(UserRoles user) => new()
    {
        ["userId"] = user.UserId, ["exists"] = user.Exists,
        ["roles"] = new JsonArray(user.Roles.Select(role => (JsonNode?)JsonValue.Create(role)).ToArray()),
        ["etag"] = user.Exists ? Tag(user) : null
    };
    public static async Task LookupRoles(HttpContext context, RoleStore roles, string tenant)
    {
        var body = await Http.Body(context);
        if (body is not JsonObject map || map.Count != 1 || map["userIds"] is not JsonArray array
            || array.Count > RoleMembership.MaximumUsers || array.Any(value => value is not JsonValue item || !item.TryGetValue<string>(out var user) || !RoleMembership.ValidUser(user)))
        { await Http.Error(context, 400, "Supply up to500 distinct application user IDs of3–20 characters"); return; }
        var ids = array.Select(value => value!.GetValue<string>()).ToArray();
        if (ids.Distinct(StringComparer.Ordinal).Count() != ids.Length)
        { await Http.Error(context, 400, "User IDs must be distinct"); return; }
        var result = await roles.Lookup(tenant, ids, context.RequestAborted);
        if (!result.IsSuccess) { await Http.Error(context, Status(result.Error!.Code), result.Error.Message); return; }
        await Http.Json(context, new JsonObject { ["users"] = new JsonArray(result.Value.Select(user => (JsonNode)View(user)).ToArray()) });
    }
    public static async Task Roles(HttpContext context, RoleStore roles, string tenant, string user)
    {
        if (!RoleMembership.ValidUser(user)) { await Http.Error(context, 400, "Invalid application user ID"); return; }
        if (HttpMethods.IsGet(context.Request.Method))
        {
            var found = await roles.Lookup(tenant, [user], context.RequestAborted);
            if (!found.IsSuccess) { await Http.Error(context, Status(found.Error!.Code), found.Error.Message); return; }
            if (!found.Value[0].Exists) { await Http.Error(context, 404, "User not found"); return; }
            context.Response.Headers.ETag = Tag(found.Value[0]);
            await Http.Json(context, View(found.Value[0])); return;
        }
        var body = await Http.Body(context);
        var issues = Validation.Link(body, false);
        if (issues.Count > 0)
        { await Http.Json(context, new JsonObject { ["error"] = "Invalid request body", ["details"] = issues }, 400); return; }
        var expected = context.Request.Headers.IfMatch;
        if (expected.Count == 0) { await Http.Error(context, 428, "If-Match is required"); return; }
        var tag = expected.ToString();
        if (expected.Count != 1 || tag.Length != 72 || !tag.StartsWith("\"roles-", StringComparison.Ordinal) || tag[^1] != '"'
            || tag[7..^1].Any(c => !char.IsAsciiHexDigitLower(c)))
        { await Http.Error(context, 400, "A single strong role ETag is required"); return; }
        var result = await roles.Replace(tenant, user, Validation.Roles(body), tag[7..^1], context.RequestAborted);
        if (!result.IsSuccess) { await Http.Error(context, Status(result.Error!.Code), result.Error.Message); return; }
        context.Response.Headers.ETag = Tag(result.Value.User);
        await Http.Json(context, new JsonObject { ["success"] = true, ["user"] = View(result.Value.User) });
    }
    public static async Task Sessions(HttpContext context, TokenService tokens, string tenant, string user)
    {
        var result = await tokens.RevokeUser(tenant, user, context.RequestAborted);
        if (!result.IsSuccess) { await Http.Error(context, 500, "Internal server error"); return; }
        await Http.Json(context, new JsonObject { ["success"] = true, ["revokedCount"] = result.Value });
    }
}
