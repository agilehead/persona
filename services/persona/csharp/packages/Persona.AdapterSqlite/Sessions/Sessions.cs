using Persona.AdapterSqlite.Entities;
using Microsoft.EntityFrameworkCore;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using Persona.Kernel;
using Persona.AdapterSqlite.Identities;

namespace Persona.AdapterSqlite.Sessions;

public static class Sessions
{
    public static SessionStore Create(PersonaDbContext db, Clock clock) => new(
        (data, ct) => Storage.Guard(async () =>
        {
            var row = new SessionRow
            {
                Id = Identities.Identities.NewId(), IdentityId = data.IdentityId, TenantId = data.TenantId,
                TokenHash = data.TokenHash, ExpiresAt = Time.Iso(data.ExpiresAt),
                IpAddress = data.IpAddress, UserAgent = data.UserAgent, CreatedAt = clock.IsoNow()
            };
            db.Session.Add(row);
            await Storage.Save(db, ct);
            return Map(row);
        }),
        (id, ct) => Storage.Guard(async () => Optional(await db.Session.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id, ct))),
        (hash, ct) => Storage.Guard(async () => Optional(await db.Session.AsNoTracking().FirstOrDefaultAsync(row => row.TokenHash == hash, ct))),
        (identity, ct) => Storage.Guard<IReadOnlyList<Session>>(async () =>
            (await db.Session.AsNoTracking().Where(row => row.IdentityId == identity && row.Revoked == 0).ToArrayAsync(ct)).Select(Map).ToArray()),
        (id, ct) => Storage.Guard(async () => await db.Session.Where(row => row.Id == id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.Revoked, 1), ct) > 0),
        (id, expiry, ct) => Storage.Guard(async () =>
        {
            var timestamp = Time.Iso(expiry);
            return await db.Session.Where(row => row.Id == id).ExecuteUpdateAsync(
                setters => setters.SetProperty(row => row.ExpiresAt, timestamp), ct) > 0;
        }),
        (identity, ct) => Storage.Guard(() => db.Session.Where(row => row.IdentityId == identity)
            .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.Revoked, 1), ct)),
        (tenant, user, ct) => Storage.Guard(() => db.Session.Where(row => row.Revoked == 0
            && db.Identity.Any(identity => identity.Id == row.IdentityId && identity.TenantId == tenant && identity.UserId == user))
            .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.Revoked, 1), ct)),
        ct => Storage.Guard(() =>
        {
            var now = clock.IsoNow();
            return db.Session.Where(row => string.Compare(row.ExpiresAt, now) < 0).ExecuteDeleteAsync(ct);
        }));

    public static Session Map(SessionRow row) => new(row.Id, row.IdentityId, row.TenantId, row.TokenHash,
        DateTimeOffset.Parse(row.ExpiresAt, System.Globalization.CultureInfo.InvariantCulture), row.Revoked == 1,
        row.IpAddress, row.UserAgent, DateTimeOffset.Parse(row.CreatedAt, System.Globalization.CultureInfo.InvariantCulture));
    private static Session? Optional(SessionRow? row) => row is null ? null : Map(row);
}
