using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using Persona.Kernel;

namespace Persona.Domain.Sessions;

public sealed record Session(string Id, string IdentityId, string TenantId, string TokenHash,
    DateTimeOffset ExpiresAt, bool Revoked, string? IpAddress, string? UserAgent, DateTimeOffset CreatedAt);
public sealed record NewSession(string IdentityId, string TenantId, string TokenHash,
    DateTimeOffset ExpiresAt, string? IpAddress, string? UserAgent);
public sealed record SessionStore(
    Func<NewSession, CancellationToken, Task<Result<Session>>> Create,
    Func<string, CancellationToken, Task<Result<Session?>>> FindById,
    Func<string, CancellationToken, Task<Result<Session?>>> FindByTokenHash,
    Func<string, CancellationToken, Task<Result<IReadOnlyList<Session>>>> FindByIdentityId,
    Func<string, CancellationToken, Task<Result<bool>>> Revoke,
    Func<string, DateTimeOffset, CancellationToken, Task<Result<bool>>> ExtendExpiry,
    Func<string, CancellationToken, Task<Result<int>>> RevokeByIdentity,
    Func<string, string, CancellationToken, Task<Result<int>>> RevokeByUser,
    Func<CancellationToken, Task<Result<int>>> DeleteExpired);
