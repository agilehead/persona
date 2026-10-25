using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using Persona.Kernel;

namespace Persona.AdapterAuth;

public static partial class Tokens
{
    public static TokenService Create(SessionStore sessions, Clock clock, string secret, string accessExpiry, string refreshExpiry)
    {
        var accessLifetime = Lifetime(accessExpiry); var refreshLifetime = Lifetime(refreshExpiry);
        return new TokenService(accessLifetime, refreshLifetime,
            async (identity, ip, agent, ct) =>
            {
                var refresh = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
                var session = await sessions.Create(new NewSession(identity.Id, identity.TenantId,
                    Hash(refresh), clock.UtcNow().AddSeconds(refreshLifetime), ip, agent), ct);
                return session.IsSuccess ? Result<TokenPair>.Success(new TokenPair(
                    Sign(identity, session.Value.Id, secret, accessLifetime, clock.UtcNow()), refresh, accessLifetime))
                    : Result<TokenPair>.Failed(session.Error!);
            },
            (identity, session) => Sign(identity, session, secret, accessLifetime, clock.UtcNow()),
            token => Verify(token, secret, clock.UtcNow()),
            async (token, ct) =>
            {
                var result = await sessions.FindByTokenHash(Hash(token), ct);
                if (!result.IsSuccess) return Result<Session>.Failed(result.Error!);
                if (result.Value is not { } session) return Result<Session>.Failed("INVALID_TOKEN", "Invalid refresh token");
                if (session.Revoked) return Result<Session>.Failed("INVALID_TOKEN", "Session has been revoked");
                if (session.ExpiresAt < clock.UtcNow()) return Result<Session>.Failed("INVALID_TOKEN", "Refresh token expired");
                return Result<Session>.Success(session);
            },
            async (id, ct) => Updated(await sessions.ExtendExpiry(id, clock.UtcNow().AddSeconds(refreshLifetime), ct)),
            async (id, ct) => Updated(await sessions.Revoke(id, ct)),
            sessions.RevokeByIdentity, sessions.RevokeByUser);
    }

    private static Result<Unit> Updated(Result<bool> result) => !result.IsSuccess ? Result<Unit>.Failed(result.Error!)
        : result.Value ? Result<Unit>.Success(new Unit()) : Result<Unit>.Failed("NOT_FOUND", "Session not found");
    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static string Encode(ReadOnlySpan<byte> bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] Decode(string value)
    {
        if (value.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_'))
            throw new FormatException("Invalid base64url");
        return Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/').PadRight((value.Length + 3) / 4 * 4, '='));
    }

    public static string Sign(Identity identity, string session, string secret, int lifetime, DateTimeOffset now)
    {
        var claims = new JsonObject { ["sub"] = identity.Id, ["tenant"] = identity.TenantId,
            ["email"] = identity.Email, ["roles"] = new JsonArray(identity.Roles.Select(role => (JsonNode?)JsonValue.Create(role)).ToArray()),
            ["sessionId"] = session, ["iat"] = now.ToUnixTimeSeconds(), ["exp"] = now.ToUnixTimeSeconds() + lifetime };
        if (identity.UserId is not null) claims["userId"] = identity.UserId;
        if (identity.Name is not null) claims["name"] = identity.Name;
        if (identity.ProfileImageUrl is not null) claims["profileImageUrl"] = identity.ProfileImageUrl;
        var body = Encode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"u8) + "." + Encode(Encoding.UTF8.GetBytes(claims.ToJsonString()));
        return body + "." + Encode(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.ASCII.GetBytes(body)));
    }

    public static Result<JsonElement> Verify(string token, string secret, DateTimeOffset now)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3) return Invalid("Invalid token");
            using var header = JsonDocument.Parse(Decode(parts[0]));
            var algorithm = header.RootElement.GetProperty("alg").GetString();
            var bytes = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
            var key = Encoding.UTF8.GetBytes(secret);
            var signature = algorithm switch
            {
                "HS256" => HMACSHA256.HashData(key, bytes),
                "HS384" => HMACSHA384.HashData(key, bytes),
                "HS512" => HMACSHA512.HashData(key, bytes),
                _ => null
            };
            if (signature is null || !CryptographicOperations.FixedTimeEquals(signature, Decode(parts[2]))) return Invalid("Invalid token");
            using var payload = JsonDocument.Parse(Decode(parts[1]));
            if (payload.RootElement.ValueKind != JsonValueKind.Object) return Invalid("Invalid token");
            if (payload.RootElement.TryGetProperty("exp", out var exp) && now.ToUnixTimeSeconds() >= exp.GetDouble()) return Invalid("Token expired");
            if (payload.RootElement.TryGetProperty("nbf", out var nbf) && now.ToUnixTimeSeconds() < nbf.GetDouble()) return Invalid("Invalid token");
            return Result<JsonElement>.Success(payload.RootElement.Clone());
        }
        catch (Exception error) when (error is JsonException or FormatException or InvalidOperationException or KeyNotFoundException)
        { return Invalid("Invalid token"); }
    }

    private static Result<JsonElement> Invalid(string message) => Result<JsonElement>.Failed("INVALID_TOKEN", message);
    public static int Lifetime(string expiry)
    {
        var match = ExpiryPattern().Match(expiry);
        if (!match.Success) return 900;
        var value = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        return checked(value * (match.Groups[2].Value switch { "s" => 1, "m" => 60, "h" => 3600, "d" => 86400, "w" => 604800, _ => 1 }));
    }
    [GeneratedRegex(@"^(\d+)([smhdw])$", RegexOptions.CultureInvariant)]
    private static partial Regex ExpiryPattern();
}
