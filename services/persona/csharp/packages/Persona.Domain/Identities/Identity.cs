using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using System.Text.Json;
using Persona.Kernel;

namespace Persona.Domain.Identities;

public sealed record Identity(string Id, string TenantId, string Provider, string ProviderUserId,
    string Email, string? Name, string? ProfileImageUrl, string? UserId, IReadOnlyList<string> Roles,
    JsonElement? Metadata, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record NewIdentity(string TenantId, string Provider, string ProviderUserId, string Email,
    string? Name, string? ProfileImageUrl, JsonElement? Metadata);
public sealed record IdentityStore(
    Func<NewIdentity, CancellationToken, Task<Result<Identity>>> Create,
    Func<string, CancellationToken, Task<Result<Identity?>>> FindById,
    Func<string, string, string, CancellationToken, Task<Result<Identity?>>> FindByProvider,
    Func<string, string, CancellationToken, Task<Result<Identity?>>> FindByEmail,
    Func<string, string, CancellationToken, Task<Result<Identity?>>> FindByUserId,
    Func<string, string, IReadOnlyList<string>, CancellationToken, Task<Result<Identity?>>> Link,
    Func<string, string, IReadOnlyList<string>, CancellationToken, Task<Result<int>>> UpdateRoles);
