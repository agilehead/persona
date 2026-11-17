#nullable enable

namespace Persona.AdapterSqlite.Entities;

public sealed class UserRoleRow
{
    public required string TenantId { get; set; }
    public required string UserId { get; set; }
    public required string Role { get; set; }
}
