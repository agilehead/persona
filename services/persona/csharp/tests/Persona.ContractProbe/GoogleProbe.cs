using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Persona.AdapterAuth;

internal static class GoogleProbe
{
    public static async Task Run(Action<bool, string> check)
    {
        using var key = RSA.Create(2048);
        var publicKey = key.ExportParameters(false);
        using var rotatedKey = RSA.Create(2048);
        var rotatedPublicKey = rotatedKey.ExportParameters(false);
        var keyRequests = 0;
        var mode = "valid";
        const string client = "test-client";
        const string issuer = "https://accounts.google.com";
        string Token()
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var claims = new JsonObject { ["iss"] = mode == "issuer" ? "https://attacker.example" : issuer,
                ["aud"] = mode == "audience" ? "other-client" : client, ["sub"] = "google-user",
                ["iat"] = now, ["exp"] = mode == "expired" ? now - 300 : now + 300,
                ["nonce"] = mode == "nonce" ? "other-nonce" : "test-nonce",
                ["email"] = "google@example.test", ["name"] = "Google 東京", ["picture"] = "https://image.example/avatar" };
            if (mode == "missing-exp") claims.Remove("exp");
            if (mode == "missing-iat") claims.Remove("iat");
            if (mode == "missing-sub") claims.Remove("sub");
            if (mode == "missing-nonce") claims.Remove("nonce");
            if (mode == "access-hash") claims["at_hash"] = "wrong-hash";
            if (mode == "multiple-audiences") claims["aud"] = new JsonArray(JsonValue.Create(client), JsonValue.Create("other-client"));
            if (mode == "party") claims["azp"] = "other-client";
            var header = new JsonObject { ["alg"] = "RS256", ["kid"] = mode == "rotated" ? "rotated-key" : "fixture-key" };
            var input = Tokens.Encode(Encoding.UTF8.GetBytes(header.ToJsonString())) + "." + Tokens.Encode(Encoding.UTF8.GetBytes(claims.ToJsonString()));
            var signature = (mode == "rotated" ? rotatedKey : key).SignData(Encoding.ASCII.GetBytes(input), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            if (mode == "signature") signature[0] ^= 1;
            return input + "." + Tokens.Encode(signature);
        }
        using var handler = new FixtureHandler(request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/keys") keyRequests++;
            var currentKey = mode == "rotated" ? rotatedPublicKey : publicKey;
            return path switch
            {
                "/.well-known/openid-configuration" => new JsonObject
                {
                    ["issuer"] = issuer, ["authorization_endpoint"] = issuer + "/authorize", ["token_endpoint"] = issuer + "/token",
                    ["jwks_uri"] = issuer + "/keys", ["id_token_signing_alg_values_supported"] = new JsonArray(JsonValue.Create("RS256")),
                    ["response_types_supported"] = new JsonArray(JsonValue.Create("code")),
                    ["subject_types_supported"] = new JsonArray(JsonValue.Create("public"))
                },
                "/keys" => new JsonObject { ["keys"] = new JsonArray(new JsonObject
                {
                    ["kty"] = "RSA", ["use"] = "sig", ["alg"] = "RS256", ["kid"] = mode == "rotated" ? "rotated-key" : "fixture-key",
                    ["n"] = Tokens.Encode(currentKey.Modulus!), ["e"] = Tokens.Encode(currentKey.Exponent!)
                }) },
                "/token" => new JsonObject { ["access_token"] = "provider-access", ["token_type"] = "Bearer", ["id_token"] = Token() },
                _ => throw new InvalidOperationException("Unexpected Google fixture URL")
            };
        }, check);
        using var http = new HttpClient(handler);
        var google = GoogleOAuth.Create(new GoogleOptions(client, "test-secret", "https://persona.example.test/auth/google/callback"), http);
        var url = await google.Authorize("test-state", "test-nonce", "test-verifier", CancellationToken.None);
        check(url.StartsWith(issuer + "/authorize?", StringComparison.Ordinal), "Google authorization endpoint");
        check(url.Contains("code_challenge=" + Tokens.Encode(SHA256.HashData("test-verifier"u8)))
            && url.Contains("code_challenge_method=S256") && url.Contains("scope=openid%20email%20profile"), "Google PKCE and scope");
        var callback = new Uri("https://persona.example.test/auth/google/callback?code=test-code&state=test-state");
        var result = await google.Exchange(callback, "test-verifier", "test-state", "test-nonce", CancellationToken.None);
        check(result.IsSuccess && result.Value is { Id: "google-user", Email: "google@example.test", Name: "Google 東京" }, "verified Google ID token");
        check(result.IsSuccess && result.Value.Raw?.GetProperty("iss").GetString() == issuer, "Google raw claims preserved");
        foreach (var invalid in new[] { "issuer", "audience", "expired", "nonce", "missing-exp", "missing-iat", "missing-sub", "missing-nonce", "access-hash", "multiple-audiences", "party", "signature" })
        {
            mode = invalid;
            check(!(await google.Exchange(callback, "test-verifier", "test-state", "test-nonce", CancellationToken.None)).IsSuccess,
                "Google rejects " + invalid);
        }
        mode = "rotated";
        check((await google.Exchange(callback, "test-verifier", "test-state", "test-nonce", CancellationToken.None)).IsSuccess,
            "Google refreshes discovery and signing keys synchronously after key rotation");
        check(keyRequests == 2, "Google signing-key rotation makes exactly one additional key request");
        check(!(await google.Exchange(callback, "test-verifier", "different-state", "test-nonce", CancellationToken.None)).IsSuccess, "Google state check");
        check(!(await google.Exchange(new Uri("https://persona.example.test/auth/google/callback?code=x&state=test-state&state=duplicate"),
            "test-verifier", "test-state", "test-nonce", CancellationToken.None)).IsSuccess, "duplicate OAuth response parameter");
        check(!(await google.Exchange(new Uri("https://persona.example.test/auth/google/callback?error=access_denied&state=test-state"),
            "test-verifier", "test-state", "test-nonce", CancellationToken.None)).IsSuccess, "OAuth provider rejection");
    }

    private sealed class FixtureHandler(Func<HttpRequestMessage, JsonObject> respond, Action<bool, string> check) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri!.AbsolutePath == "/token")
            {
                check(request.Method == HttpMethod.Post, "Google token exchange method");
                var body = await request.Content!.ReadAsStringAsync(cancellationToken);
                check(body.Contains("grant_type=authorization_code") && body.Contains("client_id=test-client")
                    && body.Contains("client_secret=test-secret") && body.Contains("code_verifier=test-verifier"), "Google token exchange credentials and verifier");
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(respond(request).ToJsonString(), Encoding.UTF8, "application/json") };
        }
    }
}
