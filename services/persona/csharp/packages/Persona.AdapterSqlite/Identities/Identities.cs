using Persona.AdapterSqlite.Entities;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using Persona.Kernel;

namespace Persona.AdapterSqlite.Identities;

public static class Identities
{
    public static IdentityStore Create(PersonaDbContext db, Clock clock) => new(
        (data, ct) => Storage.Guard(async () =>
        {
            var now = clock.IsoNow();
            var row = new IdentityRow
            {
                Id = NewId(), TenantId = data.TenantId, Provider = data.Provider,
                ProviderUserId = data.ProviderUserId, Email = data.Email, Name = data.Name,
                ProfileImageUrl = data.ProfileImageUrl, Metadata = data.Metadata?.GetRawText(),
                CreatedAt = now, UpdatedAt = now
            };
            db.Identity.Add(row);
            await Storage.Save(db, ct);
            return Map(row, []);
        }),
        (id, ct) => Storage.Guard(async () => await Optional(db, await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.Id == id, ct),ct)),
        (tenant, provider, user, ct) => Storage.Guard(async () => await Optional(db, await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.TenantId == tenant && row.Provider == provider && row.ProviderUserId == user, ct),ct)),
        (tenant, email, ct) => Storage.Guard(async () => await Optional(db, await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.TenantId == tenant && row.Email == email, ct),ct)),
        (tenant, user, ct) => Storage.Guard(async () => await Optional(db, await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.TenantId == tenant && row.UserId == user, ct),ct)),
        (tenant, id, user, roles, ct) => Storage.Transaction(db, async () =>
        {
            if (!RoleMembership.ValidUser(user) || !RoleMembership.ValidRoles(roles))
                return Result<Identity?>.Failed("INVALID_REQUEST", "Invalid linked user or roles");
            var row = await db.Identity.SingleOrDefaultAsync(row => row.Id == id && row.TenantId == tenant, ct);
            if (row is null) return Result<Identity?>.Success(null);
            if (row.UserId is not null)
                return row.UserId == user ? Result<Identity?>.Success(Map(row,await Roles.ForUser(db,tenant,user,ct)))
                    : Result<Identity?>.Failed("IDENTITY_CONFLICT", "Identity is already linked to another user");
            var membership = await db.User.AsNoTracking().SingleOrDefaultAsync(value=>value.TenantId==tenant&&value.Id==user,ct);
            if(membership is null) {
                var now=clock.IsoNow();
                db.User.Add(new UserRow{TenantId=tenant,Id=user,RoleVersion=Roles.Version(),CreatedAt=now,UpdatedAt=now});
                db.UserRole.AddRange(roles.Select(role=>new UserRoleRow{TenantId=tenant,UserId=user,Role=role}));
            }
            row.UserId = user;
            row.UpdatedAt = clock.IsoNow();
            await Storage.Save(db, ct);
            return Result<Identity?>.Success(Map(row,await Roles.ForUser(db,tenant,user,ct)));
        }, ct));

    public static string NewId()
    {
        const string alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        return new string(RandomNumberGenerator.GetBytes(16).Select(value => alphabet[value % 62]).ToArray());
    }

    private static Identity Map(IdentityRow row, IReadOnlyList<string> roles) => new(row.Id, row.TenantId, row.Provider,
        row.ProviderUserId, row.Email, row.Name, row.ProfileImageUrl, row.UserId,
        roles, Metadata(row.Metadata),
        DateTimeOffset.Parse(row.CreatedAt, System.Globalization.CultureInfo.InvariantCulture),
        DateTimeOffset.Parse(row.UpdatedAt, System.Globalization.CultureInfo.InvariantCulture));

    private static async Task<Identity?> Optional(PersonaDbContext db,IdentityRow? row,CancellationToken ct) => row is null ? null : Map(row,await Roles.ForUser(db,row.TenantId,row.UserId,ct));
    private static JsonElement? Metadata(string? text)
    {
        if (string.IsNullOrEmpty(text)) return null;
        using var document = JsonDocument.Parse(text); return document.RootElement.Clone();
    }
}
