#nullable enable

namespace Persona.AdapterSqlite.Entities;

public sealed class SessionRow
{
    public required string Id { get; set; }
    public required string IdentityId { get; set; }
    public required string TenantId { get; set; }
    public required string TokenHash { get; set; }
    public required string ExpiresAt { get; set; }
    public long Revoked { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public required string CreatedAt { get; set; }
}
