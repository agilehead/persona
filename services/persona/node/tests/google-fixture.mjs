const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (
    String(input) ===
    "https://accounts.google.com/.well-known/openid-configuration"
  )
    return Promise.resolve(
      new Response(
        JSON.stringify({
          issuer: "https://accounts.google.com",
          authorization_endpoint: "https://accounts.google.com/authorize",
          token_endpoint: "https://accounts.google.com/token",
          jwks_uri: "https://accounts.google.com/keys",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
  return originalFetch(input, init);
};
