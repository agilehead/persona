using System.Text.Json.Serialization;

namespace Persona.Contracts;

public sealed record IdentityView(string Id, string Email, string? Name, IReadOnlyList<string> Roles, string? UserId);
public sealed record LinkedIdentityView(string Id, string TenantId, string? UserId, string Email, IReadOnlyList<string> Roles);
public sealed record LoginResponse(string AccessToken, int ExpiresIn, IdentityView Identity);
public sealed record LinkResponse(bool Success, string AccessToken, string RefreshToken, LinkedIdentityView Identity);
public sealed record RefreshResponse(string AccessToken, int ExpiresIn);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(LoginResponse))]
[JsonSerializable(typeof(LinkResponse))]
[JsonSerializable(typeof(RefreshResponse))]
public partial class PersonaJson : JsonSerializerContext;
