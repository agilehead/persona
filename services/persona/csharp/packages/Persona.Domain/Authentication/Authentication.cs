using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using System.Text.Json;
using Persona.Kernel;

namespace Persona.Domain.Authentication;

public sealed record TokenPair(string AccessToken, string RefreshToken, int ExpiresIn);
public sealed record Login(Identity Identity, TokenPair Tokens, bool IsNew);
public sealed record OAuthUser(string Id, string? Email, string? Name, string? Picture, JsonElement? Raw);
public sealed record TokenService(
    int AccessLifetime, int RefreshLifetime,
    Func<Identity, string?, string?, CancellationToken, Task<Result<TokenPair>>> Generate,
    Func<Identity, string, string> AccessToken,
    Func<string, Result<JsonElement>> Verify,
    Func<string, CancellationToken, Task<Result<Session>>> ValidateRefresh,
    Func<string, CancellationToken, Task<Result<Unit>>> Slide,
    Func<string, CancellationToken, Task<Result<Unit>>> Revoke,
    Func<string, CancellationToken, Task<Result<int>>> RevokeIdentity,
    Func<string, string, CancellationToken, Task<Result<int>>> RevokeUser);

public static class Authentication
{
    public static async Task<Result<Login>> Login(IdentityStore identities, TokenService tokens,
        string tenant, string provider, OAuthUser user, string? ip, string? agent, CancellationToken ct)
    {
        var found = await identities.FindByProvider(tenant, provider, user.Id, ct);
        if (!found.IsSuccess) return Result<Login>.Failed(found.Error!);
        var identity = found.Value;
        var isNew = identity is null;
        if (identity is null)
        {
            var created = await identities.Create(new NewIdentity(tenant, provider, user.Id,
                user.Email ?? $"{user.Id}@{provider}.local", user.Name, user.Picture, user.Raw), ct);
            if (!created.IsSuccess) return Result<Login>.Failed(created.Error!);
            identity = created.Value;
        }
        var generated = await tokens.Generate(identity, ip, agent, ct);
        return generated.IsSuccess ? Result<Login>.Success(new Login(identity, generated.Value, isNew))
            : Result<Login>.Failed(generated.Error!);
    }

    public static async Task<Result<Login>> Link(IdentityStore identities, TokenService tokens,
        string id, string user, IReadOnlyList<string> roles, CancellationToken ct)
    {
        var linked = await identities.Link(id, user, roles, ct);
        if (!linked.IsSuccess) return Result<Login>.Failed(linked.Error!);
        if (linked.Value is null) return Result<Login>.Failed("NOT_FOUND", "Identity not found");
        var generated = await tokens.Generate(linked.Value, null, null, ct);
        return generated.IsSuccess ? Result<Login>.Success(new Login(linked.Value, generated.Value, false))
            : Result<Login>.Failed(generated.Error!);
    }
}
