#nullable enable

namespace Persona.AdapterSqlite.Entities;

public sealed class IdentityRow
{
    public required string Id { get; set; }
    public required string TenantId { get; set; }
    public required string Provider { get; set; }
    public required string ProviderUserId { get; set; }
    public required string Email { get; set; }
    public string? Name { get; set; }
    public string? ProfileImageUrl { get; set; }
    public string? UserId { get; set; }
    public string? Roles { get; set; }
    public string? Metadata { get; set; }
    public required string CreatedAt { get; set; }
    public required string UpdatedAt { get; set; }
}
