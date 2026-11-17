using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Persona.AdapterAuth;
using Persona.AdapterSqlite;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using Persona.Kernel;

if (args.Length != 1 || !Path.GetFullPath(args[0]).Split(Path.DirectorySeparatorChar).Contains(".tests"))
    throw new ArgumentException("Provide a disposable Knex-migrated database under .tests.");
var count = 0;
void Check(bool value, string label)
{
    count++;
    if (!value) throw new InvalidOperationException("Failed: " + label);
}
var now = new DateTimeOffset(2026, 10, 25, 12, 0, 0, TimeSpan.Zero);
var clock = new Clock(() => now);
await using var db = Storage.Open(Path.GetFullPath(args[0]));
var identities = Persona.AdapterSqlite.Identities.Identities.Create(db, clock);
var sessions = Persona.AdapterSqlite.Sessions.Sessions.Create(db, clock);
var tokens = Tokens.Create(sessions, clock, "probe-secret", "15m", "7d");
var ct = CancellationToken.None;
var authority = Persona.AdapterSqlite.Identities.Roles.Create(db, clock);
async Task<Result<RoleUpdate>> ReplaceRoles(string tenant, string user, string[] roles) {
 var current = await authority.Lookup(tenant, [user], ct);
 if (!current.IsSuccess) return Result<RoleUpdate>.Failed(current.Error!);
 return await authority.Replace(tenant, user, roles, current.Value[0].Version ?? "missing", ct);
}
using var metadata = JsonDocument.Parse("{\"verified\":true,\"name\":\"東京\"}");
var input = new NewIdentity("probe-tenant", "google", "provider-user", "user@example.test", "Name 東京", null, metadata.RootElement.Clone());
var identity = await identities.Create(input, ct);
Check(identity.IsSuccess && identity.Value.Id.Length == 16 && identity.Value.Id.All(char.IsAsciiLetterOrDigit), "base62 identity IDs");
Check(identity.Value.Roles.Count == 0 && identity.Value.UserId is null, "new identity optional fields");
Check(!(await identities.Create(input, ct)).IsSuccess, "duplicate identity returns storage failure");
Check(db.ChangeTracker.Entries().Count() == 0, "failed identity write clears tracking");
Check(!(await sessions.Create(new NewSession("missing", "probe-tenant", "orphan", now.AddDays(7), null, null), ct)).IsSuccess, "foreign key enforcement");
Check(db.ChangeTracker.Entries().Count() == 0, "failed session write clears tracking before subsequent successful writes");
var row = await db.Identity.AsNoTracking().FirstAsync(value => value.Id == identity.Value.Id, ct);
Check(row.CreatedAt == "2026-10-25T12:00:00.000Z" && row.UpdatedAt == row.CreatedAt, "stored identity timestamp and null roles");
Check(row.Metadata == metadata.RootElement.GetRawText() && row.Name == "Name 東京" && row.ProfileImageUrl is null, "stored JSON, unicode and null representations");
Check((await identities.FindById(identity.Value.Id, ct)).Value?.Id == identity.Value.Id, "identity ID lookup");
Check((await identities.FindByProvider("probe-tenant", "google", "provider-user", ct)).Value?.Id == identity.Value.Id, "provider lookup");
Check((await identities.FindByProvider("other", "google", "provider-user", ct)).Value is null, "provider tenant isolation");
Check((await identities.FindByEmail("probe-tenant", "user@example.test", ct)).Value?.Id == identity.Value.Id, "email lookup");
Check((await identities.FindByEmail("other", "user@example.test", ct)).Value is null, "email tenant isolation");
Check((await identities.FindById("missing", ct)).Value is null, "missing identity");
var linked = await identities.Link("probe-tenant", identity.Value.Id, "probe-user", ["USER", "ADMIN"], ct);
Check(linked.IsSuccess && linked.Value?.UserId == "probe-user" && linked.Value.Roles.SequenceEqual(["ADMIN", "USER"]), "identity linking");
row = await db.Identity.AsNoTracking().FirstAsync(value => value.Id == identity.Value.Id, ct);
Check((await db.UserRole.AsNoTracking().Where(value=>value.TenantId=="probe-tenant"&&value.UserId=="probe-user").CountAsync(ct))==2, "normalized roles have one membership row each");
Check((await identities.FindByUserId("probe-tenant", "probe-user", ct)).Value?.Id == identity.Value.Id, "user lookup");
Check((await identities.FindByUserId("other", "probe-user", ct)).Value is null, "user tenant isolation");
Check((await ReplaceRoles("other", "probe-user", ["OTHER"])).Error?.Code == "NOT_FOUND", "role update tenant isolation");
Check((await ReplaceRoles("probe-tenant", "probe-user", ["MODERATOR"])).Value.User.Roles.SequenceEqual(["MODERATOR"]), "role update count");
var generated = await tokens.Generate(linked.Value!, "127.0.0.1", "probe-agent", ct);
Check(generated.IsSuccess && generated.Value.RefreshToken.Length == 64 && generated.Value.RefreshToken.All(char.IsAsciiHexDigitLower), "refresh token entropy format");
var claims = tokens.Verify(generated.Value.AccessToken);
Check(claims.IsSuccess && claims.Value.GetProperty("tenant").GetString() == "probe-tenant"
    && claims.Value.GetProperty("roles").EnumerateArray().Select(value=>value.GetString()).SequenceEqual(["ADMIN", "USER"]), "signed JWT claims");
Check(claims.Value.GetProperty("exp").GetInt64() - claims.Value.GetProperty("iat").GetInt64() == 900, "JWT lifetime");
var session = await tokens.ValidateRefresh(generated.Value.RefreshToken, ct);
Check(session.IsSuccess && session.Value.IdentityId == identity.Value.Id && session.Value.IpAddress == "127.0.0.1" && session.Value.UserAgent == "probe-agent", "refresh session");
var storedSession = await db.Session.AsNoTracking().FirstAsync(value => value.Id == session.Value.Id, ct);
Check(storedSession.TokenHash == Tokens.Hash(generated.Value.RefreshToken) && storedSession.Revoked == 0
    && storedSession.ExpiresAt == "2026-11-01T12:00:00.000Z", "stored session representations");
Check((await sessions.FindById(session.Value.Id, ct)).Value?.Id == session.Value.Id, "session ID lookup");
Check((await sessions.FindByTokenHash(storedSession.TokenHash, ct)).Value?.Id == session.Value.Id, "session token lookup");
Check((await sessions.FindByIdentityId(identity.Value.Id, ct)).Value.Count == 1, "active session list");
Check((await sessions.FindById("missing", ct)).Value is null && (await sessions.FindByTokenHash("missing", ct)).Value is null
    && (await sessions.FindByIdentityId("missing", ct)).Value.Count == 0, "missing sessions");
now = now.AddDays(1);
Check((await tokens.Slide(session.Value.Id, ct)).IsSuccess, "rolling refresh");
Check((await sessions.FindById(session.Value.Id, ct)).Value?.ExpiresAt == now.AddDays(7), "rolling expiry storage");
Check(!(await tokens.Slide("missing", ct)).IsSuccess, "rolling missing session");
Check((await sessions.RevokeByUser("other", "probe-user", ct)).Value == 0, "revoke tenant isolation");
Check((await sessions.RevokeByUser("probe-tenant", "probe-user", ct)).Value == 1, "revoke user count");
Check((await sessions.RevokeByUser("probe-tenant", "probe-user", ct)).Value == 0, "already revoked excluded from user count");
Check((await sessions.RevokeByIdentity(identity.Value.Id, ct)).Value == 1, "identity revoke includes already revoked");
Check(!(await tokens.ValidateRefresh(generated.Value.RefreshToken, ct)).IsSuccess, "revoked refresh rejected");
Check(!(await sessions.Revoke("missing", ct)).Value, "missing session revoke");
var shortSession = await sessions.Create(new NewSession(identity.Value.Id, "probe-tenant", "expired-hash", now.AddSeconds(-1), null, null), ct);
Check(shortSession.IsSuccess && (await sessions.DeleteExpired(ct)).Value == 1, "expired cleanup count");
Check((await sessions.FindById(shortSession.Value.Id, ct)).Value is null, "expired session removed");
Check(!tokens.Verify(generated.Value.AccessToken).IsSuccess, "expired JWT rejected");
var valid = tokens.AccessToken(linked.Value!, "session");
Check(tokens.Verify(valid).IsSuccess, "fresh JWT accepted");
Check(!Tokens.Verify(valid, "wrong", now).IsSuccess, "wrong JWT signature rejected");
Check(!tokens.Verify("a.b.c").IsSuccess && !tokens.Verify("bad").IsSuccess, "malformed JWT rejected");
var pair = valid.Split('.');
var unsigned = Base64Url.Encode("{\"alg\":\"none\"}"u8) + "." + pair[1] + ".";
Check(!tokens.Verify(unsigned).IsSuccess, "unsigned JWT rejected");
Check(Tokens.Lifetime("90d") == 7776000 && tokens.AccessLifetime == 900 && tokens.RefreshLifetime == 604800, "configured lifetimes");
Check(DevUsers.Resolve("*:pw", "production") is null && DevUsers.Resolve("*:pw", "staging") is null, "fail-closed production and unknown environments");
var dev = DevUsers.Resolve("alice:own,*:wild", "test")!;
Check(DevUsers.Verify(dev, "alice", "own") && !DevUsers.Verify(dev, "alice", "wild"), "explicit dev user precedence");
Check(DevUsers.Verify(dev, "user@example.test", "wild") && !DevUsers.Verify(dev, "*", "wild"), "wildcard and reserved dev username");
Check(!DevUsers.Verify(dev, "Alice", "own"), "case-sensitive dev users");
Check(DevUsers.Resolve(null, "development") is null && DevUsers.Resolve("", "development") is null
    && DevUsers.Resolve(",,", "development") is null, "empty development configuration");
foreach (var environment in new string?[] { null, "", "development", "test" })
    Check(DevUsers.Resolve("alice:secret", environment)?.Users.Single() == new DevUser("alice", "secret"), "allowed development environment");
var parsedUsers = DevUsers.Resolve(" alice:pw1 ,, bob:a:b:c, ", "test")!;
Check(parsedUsers.Users.SequenceEqual([new DevUser("alice", "pw1"), new DevUser("bob", "a:b:c")]), "trim entries, ignore blanks and preserve password colons");
Check(DevUsers.Verify(parsedUsers, "alice", "pw1") && DevUsers.Verify(parsedUsers, "bob", "a:b:c"), "multiple explicit users");
Check(!DevUsers.Verify(parsedUsers, "alice", "wrong") && !DevUsers.Verify(parsedUsers, "unknown", "pw1"), "invalid explicit credentials");
var wildcardOnly = DevUsers.Resolve("*:wild", "development")!;
Check(wildcardOnly.Users.Count == 0 && wildcardOnly.WildcardPassword == "wild"
    && DevUsers.Verify(wildcardOnly, "anyone", "wild") && !DevUsers.Verify(wildcardOnly, "*", "wild")
    && !DevUsers.Verify(wildcardOnly, "anyone", "wrong"), "wildcard-only authentication");
foreach (var invalid in new[] { "alice", ":secret", "alice:", " :secret", "alice: ", "*:a,*:b" })
{
    var rejected = false;
    try { DevUsers.Resolve(invalid, "test"); }
    catch (ArgumentException) { rejected = true; }
    Check(rejected, "invalid development configuration: " + invalid);
}
var oauth = await Authentication.Login(identities, tokens, "oauth-tenant", "google", new OAuthUser("oauth-user", null, null, null, null), null, null, ct);
Check(oauth.IsSuccess && oauth.Value.IsNew && oauth.Value.Identity.Email == "oauth-user@google.local", "OAuth get-or-create defaults");
var returning = await Authentication.Login(identities, tokens, "oauth-tenant", "google", new OAuthUser("oauth-user", null, null, null, null), null, null, ct);
Check(returning.IsSuccess && !returning.Value.IsNew && returning.Value.Identity.Id == oauth.Value.Identity.Id, "returning OAuth user");
Check(!(await Authentication.Link(identities, tokens, "probe-tenant", "missing", "user", ["USER"], ct)).IsSuccess, "link missing identity");
var second = await identities.Create(new NewIdentity("probe-tenant", "password", "other-provider", "second@example.test", null, null, null), ct);
var otherTenant = await identities.Create(new NewIdentity("other-tenant", "google", "provider-user", "other@example.test", null, null, null), ct);
Check(second.IsSuccess && otherTenant.IsSuccess && second.Value.Name is null && second.Value.Metadata is null,
    "optional identity values and separate tenant creation");
Check((await identities.Link("probe-tenant", second.Value.Id, "probe-user", ["USER"], ct)).IsSuccess
    && (await identities.Link("other-tenant", otherTenant.Value.Id, "probe-user", ["OTHER"], ct)).IsSuccess, "link multiple provider identities");
Check((await ReplaceRoles("probe-tenant", "probe-user", ["MODERATOR"])).Value.User.Roles.SequenceEqual(["MODERATOR"])
    && (await identities.FindById(otherTenant.Value.Id, ct)).Value!.Roles.SequenceEqual(["OTHER"]),
    "role update covers all linked identities only in the specified tenant");
var firstSession = await tokens.Generate((await identities.FindById(identity.Value.Id, ct)).Value!, null, null, ct);
var secondSession = await tokens.Generate((await identities.FindById(second.Value.Id, ct)).Value!, null, null, ct);
var otherSession = await tokens.Generate((await identities.FindById(otherTenant.Value.Id, ct)).Value!, null, null, ct);
Check(firstSession.IsSuccess && secondSession.IsSuccess && otherSession.IsSuccess, "sessions for multiple identities and tenants");
Check((await sessions.RevokeByUser("probe-tenant", "probe-user", ct)).Value == 2
    && !(await tokens.ValidateRefresh(firstSession.Value.RefreshToken, ct)).IsSuccess
    && !(await tokens.ValidateRefresh(secondSession.Value.RefreshToken, ct)).IsSuccess
    && (await tokens.ValidateRefresh(otherSession.Value.RefreshToken, ct)).IsSuccess,
    "user session revocation covers all identities without crossing tenants");
Check(RoleMembership.ValidUser("abcdefghijklmnopqrst") && !RoleMembership.ValidUser("abcdefghijklmnopqrstu"), "twenty-character application IDs");
Check(RoleMembership.ValidRoles([]) && !RoleMembership.ValidRoles(["admin", "admin"]) && !RoleMembership.ValidRoles(["bad,role"]), "role set boundaries");
var snapshot = (await authority.Lookup("probe-tenant", ["probe-user"], ct)).Value[0];
var cleared = await authority.Replace("probe-tenant", "probe-user", [], snapshot.Version!, ct);
Check(cleared.IsSuccess && cleared.Value.User.Roles.Length == 0, "empty roles clear all linked identities");
Check((await authority.Replace("probe-tenant", "probe-user", ["ADMIN"], snapshot.Version!, ct)).Error?.Code == "PRECONDITION_FAILED", "stale membership rejected");
Check((await identities.Link("other-tenant", identity.Value.Id, "cross-tenant", ["ADMIN"], ct)).Value is null, "linking enforces tenant");
Check((await identities.Link("probe-tenant", identity.Value.Id, "probe-user", ["ADMIN"], ct)).Value!.Roles.Count == 0, "link replay does not restore revoked role");
Check((await identities.Link("probe-tenant", identity.Value.Id, "other-user", [], ct)).Error?.Code == "IDENTITY_CONFLICT", "identity cannot be relinked");
var stable=(await authority.Lookup("probe-tenant",["probe-user"],ct)).Value[0];
var third=(await identities.Create(new NewIdentity("probe-tenant","github","third-provider","third@example.test",null,null,null),ct)).Value;
var thirdLinked=await identities.Link("probe-tenant",third.Id,"probe-user",["ADMIN"],ct);
Check(thirdLinked.IsSuccess&&thirdLinked.Value!.Roles.Count==0,"new provider cannot grant roles to an existing member");
Check((await authority.Lookup("probe-tenant",["probe-user"],ct)).Value[0].Version==stable.Version,"identity linking preserves the role concurrency token");
Check(await db.User.AsNoTracking().CountAsync(x=>x.TenantId=="probe-tenant"&&x.Id=="probe-user",ct)==1,"linked providers share one user owner");
Check(!typeof(Persona.AdapterSqlite.Entities.IdentityRow).GetProperties().Any(p=>p.Name=="Roles"),"identity persistence has no role representation");
using(var cancelled=new CancellationTokenSource()){
 cancelled.Cancel();var rejected=false;
 try{await authority.Replace("probe-tenant","probe-user",["ADMIN"],stable.Version!,cancelled.Token);}catch(OperationCanceledException){rejected=true;}
 Check(rejected&&(await authority.Lookup("probe-tenant",["probe-user"],ct)).Value[0].Version==stable.Version,"cancelled membership write preserves roles and concurrency version");
}
var invalidLifetime=false;try{Tokens.Lifetime("nonsense");}catch(ArgumentException){invalidLifetime=true;}
Check(invalidLifetime,"invalid token lifetime is rejected without a fallback");
var boundarySession = await tokens.Generate((await identities.FindById(third.Id, ct)).Value!, null, null, ct);
var boundary = (await tokens.ValidateRefresh(boundarySession.Value.RefreshToken, ct)).Value;
now = boundary.ExpiresAt;
Check((await tokens.ValidateRefresh(boundarySession.Value.RefreshToken, ct)).Error?.Code == "INVALID_TOKEN", "refresh expires at the exact expiry instant");
Check(!(await sessions.ExtendExpiry(boundary.Id, now.AddDays(1), ct)).Value, "expired session cannot be revived by a delayed refresh");
var revocable = (await tokens.Generate((await identities.FindById(third.Id, ct)).Value!, null, null, ct)).Value;
var revocableId = (await tokens.ValidateRefresh(revocable.RefreshToken, ct)).Value.Id;
await tokens.Revoke(revocableId, ct);
Check(!(await sessions.ExtendExpiry(revocableId, now.AddDays(1), ct)).Value, "revoked session cannot be extended by a delayed refresh");
await AuthenticationProbe.Run(identities, tokens, Check);
await GoogleProbe.Run(Check);
await GoogleRoutesProbe.Run(identities, tokens, Check);
await SessionRoutesProbe.Run(identities, tokens, Check);
Console.WriteLine($"Persona storage/authentication probe: {count} assertions passed");
