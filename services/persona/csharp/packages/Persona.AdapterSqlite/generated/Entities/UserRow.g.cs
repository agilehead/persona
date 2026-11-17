#nullable enable

namespace Persona.AdapterSqlite.Entities;

public sealed class UserRow
{
    public required string TenantId { get; set; }
    public required string Id { get; set; }
    public required string RoleVersion { get; set; }
    public required string CreatedAt { get; set; }
    public required string UpdatedAt { get; set; }
}
