using Microsoft.EntityFrameworkCore;
using Persona.AdapterSqlite.Entities;
using Persona.Domain.Identities;
using Persona.Kernel;
using System.Security.Cryptography;
namespace Persona.AdapterSqlite.Identities;
public static class Roles
{
    public static string Version() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
    public static RoleStore Create(PersonaDbContext db, Clock clock) => new(
        (tenant, users, ct) => Lookup(db, tenant, users, ct),
        (tenant, user, roles, expected, ct) => Storage.Transaction(db, async () =>
        {
            if (!RoleMembership.ValidUser(user) || !RoleMembership.ValidRoles(roles))
                return Result<RoleUpdate>.Failed("INVALID_REQUEST", "Invalid role membership");
            var row = await db.User.SingleOrDefaultAsync(row => row.TenantId == tenant && row.Id == user, ct);
            if (row is null) return Result<RoleUpdate>.Failed("NOT_FOUND", "User not found");
            if (row.RoleVersion != expected) return Result<RoleUpdate>.Failed("PRECONDITION_FAILED", "Role membership has changed");
            row.RoleVersion=Version(); row.UpdatedAt=clock.IsoNow();
            await db.UserRole.Where(value=>value.TenantId==tenant&&value.UserId==user).ExecuteDeleteAsync(ct);
            db.UserRole.AddRange(roles.Select(role=>new UserRoleRow{TenantId=tenant,UserId=user,Role=role}));
            await Storage.Save(db,ct);
            return Result<RoleUpdate>.Success(new(new(user,true,roles.Order(StringComparer.Ordinal).ToArray(),row.RoleVersion)));
        }, ct));
    private static Task<Result<UserRoles[]>> Lookup(PersonaDbContext db, string tenant, string[] users, CancellationToken ct)
    {
        if (users.Length > RoleMembership.MaximumUsers || users.Distinct(StringComparer.Ordinal).Count() != users.Length
            || users.Any(user => !RoleMembership.ValidUser(user)))
            return Task.FromResult(Result<UserRoles[]>.Failed("INVALID_REQUEST", "Invalid user lookup"));
        return Storage.Guard(() => Storage.ReadSnapshot(db, async () => {
            var memberships = await db.User.AsNoTracking().Where(row => row.TenantId == tenant && users.Contains(row.Id)).ToArrayAsync(ct);
            var roles = await db.UserRole.AsNoTracking().Where(row => row.TenantId == tenant && users.Contains(row.UserId)).OrderBy(row => row.Role).ToArrayAsync(ct);
            return users.Select(user => {
                var membership = memberships.SingleOrDefault(row=>row.Id==user);
                return new UserRoles(user, membership != null, roles.Where(row=>row.UserId==user).Select(row=>row.Role).ToArray(), membership?.RoleVersion);
            }).ToArray();
        }, ct));
    }
    public static async Task<string[]> ForUser(PersonaDbContext db, string tenant,string? user,CancellationToken ct) =>
        user is null ? [] : await db.UserRole.AsNoTracking().Where(row=>row.TenantId==tenant&&row.UserId==user).OrderBy(row=>row.Role).Select(row=>row.Role).ToArrayAsync(ct);
}
