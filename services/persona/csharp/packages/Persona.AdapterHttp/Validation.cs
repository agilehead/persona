using System.Text.Json;
using System.Text.Json.Nodes;

namespace Persona.AdapterHttp;

public static class Validation
{
    public static JsonArray Link(JsonNode? body, bool userRequired)
    {
        var issues = new JsonArray();
        if (body is not JsonObject map) { issues.Add((JsonNode)TypeIssue("object", body, [])); return issues; }
        if (userRequired)
        {
            var value = Http.Text(body, "userId");
            if (value is null) issues.Add((JsonNode)TypeIssue("string", map["userId"], new JsonArray(JsonValue.Create("userId")), map.ContainsKey("userId")));
            else if (value.Length < 3) issues.Add((JsonNode)SizeIssue("string", 3, true, new JsonArray(JsonValue.Create("userId"))));
            else if (value.Length > 20) issues.Add((JsonNode)SizeIssue("string", 20, false, new JsonArray(JsonValue.Create("userId"))));
        }
        if (map["roles"] is not JsonArray roles) issues.Add((JsonNode)TypeIssue("array", map["roles"], new JsonArray(JsonValue.Create("roles")), map.ContainsKey("roles")));
        else
        {
            for (var index = 0; index < roles.Count; index++)
                if (roles[index] is not JsonValue item || !item.TryGetValue<string>(out _))
                    issues.Add((JsonNode)TypeIssue("string", roles[index], new JsonArray(JsonValue.Create("roles"), JsonValue.Create(index))));
            if (roles.Count == 0) issues.Add((JsonNode)SizeIssue("array", 1, true, new JsonArray(JsonValue.Create("roles"))));
        }
        return issues;
    }
    public static string[] Roles(JsonNode? body) => ((JsonArray)body!["roles"]!).Select(value => value!.GetValue<string>()).ToArray();
    private static JsonObject TypeIssue(string expected, JsonNode? value, JsonArray path, bool present = true)
    {
        var received = value is null ? present ? "null" : "undefined" : value.GetValueKind() switch
        { JsonValueKind.String => "string", JsonValueKind.Array => "array", JsonValueKind.Object => "object",
            JsonValueKind.True or JsonValueKind.False => "boolean", JsonValueKind.Number => "number", _ => "null" };
        return new JsonObject { ["expected"] = expected, ["code"] = "invalid_type", ["path"] = path,
            ["message"] = $"Invalid input: expected {expected}, received {received}" };
    }
    private static JsonObject SizeIssue(string origin, int size, bool minimum, JsonArray path) => new()
    {
        ["origin"] = origin, ["code"] = minimum ? "too_small" : "too_big",
        [minimum ? "minimum" : "maximum"] = size, ["inclusive"] = true, ["path"] = path,
        ["message"] = $"Too {(minimum ? "small" : "big")}: expected {origin} to have {(minimum ? ">=" : "<=")}{size} {(origin == "string" ? "characters" : "items") }"
    };
}
