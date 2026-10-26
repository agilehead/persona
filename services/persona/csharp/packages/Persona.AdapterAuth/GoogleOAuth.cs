using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Domain.Authentication;
using Persona.Kernel;

namespace Persona.AdapterAuth;

public sealed record GoogleOptions(string ClientId, string ClientSecret, string RedirectUri,
    string Issuer = "https://accounts.google.com");
public sealed record GoogleProvider(
    Func<string, string, string, CancellationToken, Task<string>> Authorize,
    Func<Uri, string, string, string?, CancellationToken, Task<Result<OAuthUser>>> Exchange);

public static class GoogleOAuth
{
    public static GoogleProvider Create(GoogleOptions config, HttpClient http)
    {
        ConfigurationManager<OpenIdConnectConfiguration> Metadata() => new(
            config.Issuer.TrimEnd('/') + "/.well-known/openid-configuration",
            new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever(http));
        var metadata = Metadata();
        return new GoogleProvider(
            async (state, nonce, verifier, ct) =>
            {
                var discovery = await metadata.GetConfigurationAsync(ct);
                if (discovery.Issuer != config.Issuer) throw new InvalidOperationException("Unexpected Google issuer");
                RequireHttps(discovery.AuthorizationEndpoint);
                return discovery.AuthorizationEndpoint + "?" + Query(new Dictionary<string, string>
                {
                    ["client_id"] = config.ClientId, ["redirect_uri"] = config.RedirectUri,
                    ["response_type"] = "code", ["scope"] = "openid email profile", ["state"] = state,
                    ["nonce"] = nonce, ["code_challenge"] = Tokens.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))),
                    ["code_challenge_method"] = "S256"
                });
            },
            async (callback, verifier, state, nonce, ct) =>
            {
                try
                {
                    var query = ParseQuery(callback.Query);
                    if (!query.TryGetValue("state", out var returnedState) || !SecureEqual(state, returnedState))
                        return Rejected("Invalid OAuth state");
                    if (query.ContainsKey("error") || !query.TryGetValue("code", out var code) || code.Length == 0)
                        return Rejected("OAuth authorization failed");
                    var discovery = await metadata.GetConfigurationAsync(ct);
                    if (discovery.Issuer != config.Issuer) return Rejected("Unexpected Google issuer");
                    RequireHttps(discovery.TokenEndpoint);
                    using var response = await http.PostAsync(discovery.TokenEndpoint, new FormUrlEncodedContent(new Dictionary<string, string>
                    {
                        ["grant_type"] = "authorization_code", ["code"] = code,
                        ["redirect_uri"] = config.RedirectUri, ["code_verifier"] = verifier,
                        ["client_id"] = config.ClientId, ["client_secret"] = config.ClientSecret
                    }), ct);
                    response.EnsureSuccessStatusCode();
                    using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
                    var idToken = body.RootElement.GetProperty("id_token").GetString();
                    if (string.IsNullOrEmpty(idToken)) return Rejected("Missing Google ID token");
                    var validation = await Validate(idToken, discovery, config.ClientId);
                    if (!validation.IsValid && validation.Exception is SecurityTokenSignatureKeyNotFoundException)
                    {
                        // A new signing key needs a synchronous refresh for this grant.
                        // ConfigurationManager.RequestRefresh alone runs in the background.
                        var refreshed = Metadata();
                        discovery = await refreshed.GetConfigurationAsync(ct);
                        if (discovery.Issuer != config.Issuer) return Rejected("Unexpected Google issuer");
                        validation = await Validate(idToken, discovery, config.ClientId);
                        if (validation.IsValid) metadata = refreshed;
                    }
                    if (!validation.IsValid || validation.SecurityToken is not JsonWebToken token)
                        return Rejected("Invalid Google ID token");
                    using var claimsDocument = JsonDocument.Parse(Tokens.Decode(token.EncodedPayload));
                    var claims = claimsDocument.RootElement;
                    new OpenIdConnectProtocolValidator
                    {
                        RequireTimeStampInNonce = false, RequireNonce = nonce is not null,
                        RequireAzp = token.Audiences.Skip(1).Any()
                    }.ValidateTokenResponse(new OpenIdConnectProtocolValidationContext
                    {
                        ClientId = config.ClientId, Nonce = nonce, ValidatedIdToken = new JwtSecurityToken(idToken),
                        ProtocolMessage = new OpenIdConnectMessage { IdToken = idToken,
                            AccessToken = String(body.RootElement, "access_token") }
                    });
                    var subject = String(claims, "sub");
                    if (string.IsNullOrEmpty(subject)) return Rejected("Missing Google subject");
                    return Result<OAuthUser>.Success(new OAuthUser(subject, String(claims, "email"),
                        String(claims, "name"), String(claims, "picture"), claims.Clone()));
                }
                catch (Exception error) when (error is HttpRequestException or JsonException or KeyNotFoundException
                    or SecurityTokenException or OpenIdConnectProtocolException or InvalidOperationException or FormatException)
                { return Rejected("Google OAuth exchange failed"); }
            });
    }

    private static Task<TokenValidationResult> Validate(string token, OpenIdConnectConfiguration metadata, string clientId) =>
        new JsonWebTokenHandler { MapInboundClaims = false }.ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidateIssuer = true, ValidIssuer = metadata.Issuer, ValidateAudience = true, ValidAudience = clientId,
            ValidateLifetime = true, RequireExpirationTime = true, RequireSignedTokens = true,
            ValidateIssuerSigningKey = true, IssuerSigningKeys = metadata.SigningKeys,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256], ClockSkew = TimeSpan.FromSeconds(30)
        });
    private static void RequireHttps(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("Google endpoints must use HTTPS");
    }
    private static string? String(JsonElement value, string key) => value.TryGetProperty(key, out var field)
        && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
    private static bool SecureEqual(string left, string right) => CryptographicOperations.FixedTimeEquals(
        SHA256.HashData(Encoding.UTF8.GetBytes(left)), SHA256.HashData(Encoding.UTF8.GetBytes(right)));
    private static Result<OAuthUser> Rejected(string message) => Result<OAuthUser>.Failed("INVALID_TOKEN", message);
    private static string Query(IReadOnlyDictionary<string, string> values) => string.Join('&', values.Select(pair =>
        Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value)));
    private static Dictionary<string, string> ParseQuery(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = entry.Split('=', 2);
            var name = Uri.UnescapeDataString(parts[0].Replace('+', ' '));
            if (!result.TryAdd(name, parts.Length == 1 ? "" : Uri.UnescapeDataString(parts[1].Replace('+', ' '))))
                throw new FormatException("Duplicate OAuth response parameter");
        }
        return result;
    }
}
