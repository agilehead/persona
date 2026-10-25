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
            return Map(row);
        }),
        (id, ct) => Storage.Guard(async () => Optional(await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.Id == id, ct))),
        (tenant, provider, user, ct) => Storage.Guard(async () => Optional(await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.TenantId == tenant && row.Provider == provider && row.ProviderUserId == user, ct))),
        (tenant, email, ct) => Storage.Guard(async () => Optional(await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.TenantId == tenant && row.Email == email, ct))),
        (tenant, user, ct) => Storage.Guard(async () => Optional(await db.Identity.AsNoTracking()
            .FirstOrDefaultAsync(row => row.TenantId == tenant && row.UserId == user, ct))),
        (id, user, roles, ct) => Storage.Guard(async () =>
        {
            var csv = string.Join(',', roles);
            var now = clock.IsoNow();
            await db.Identity.Where(row => row.Id == id).ExecuteUpdateAsync(setters => setters
                .SetProperty(row => row.UserId, user).SetProperty(row => row.Roles, csv)
                .SetProperty(row => row.UpdatedAt, now), ct);
            return Optional(await db.Identity.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id, ct));
        }),
        (tenant, user, roles, ct) => Storage.Guard(async () =>
        {
            var csv = string.Join(',', roles);
            var now = clock.IsoNow();
            return await db.Identity.Where(row => row.TenantId == tenant && row.UserId == user)
                .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.Roles, csv)
                    .SetProperty(row => row.UpdatedAt, now), ct);
        }));

    public static string NewId()
    {
        const string alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        return new string(RandomNumberGenerator.GetBytes(16).Select(value => alphabet[value % 62]).ToArray());
    }

    public static Identity Map(IdentityRow row) => new(row.Id, row.TenantId, row.Provider,
        row.ProviderUserId, row.Email, row.Name, row.ProfileImageUrl, row.UserId,
        row.Roles?.Split(',', StringSplitOptions.RemoveEmptyEntries) ?? [], Metadata(row.Metadata),
        DateTimeOffset.Parse(row.CreatedAt, System.Globalization.CultureInfo.InvariantCulture),
        DateTimeOffset.Parse(row.UpdatedAt, System.Globalization.CultureInfo.InvariantCulture));

    private static Identity? Optional(IdentityRow? row) => row is null ? null : Map(row);
    private static JsonElement? Metadata(string? text)
    {
        if (string.IsNullOrEmpty(text)) return null;
        try { using var document = JsonDocument.Parse(text); return document.RootElement.Clone(); }
        catch (JsonException) { return null; }
    }
}
