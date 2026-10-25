import { dirname } from "node:path";
export const modes = ["single", "multi", "production"];
export const secret = "test-jwt-secret-for-integration-tests";
export const internalSecret = "test-internal-secret";
export function environment(port, database, mode) {
  return {
    NODE_ENV: mode === "production" ? "production" : "test",
    PERSONA_SERVER_HOST: "127.0.0.1",
    PERSONA_SERVER_PORT: String(port),
    PERSONA_SERVER_PUBLIC_URL: `http://127.0.0.1:${port}`,
    PERSONA_DATA_DIR: dirname(database.dbPath),
    PERSONA_JWT_SECRET: secret,
    PERSONA_SESSION_SECRET: secret,
    PERSONA_INTERNAL_SECRET: internalSecret,
    PERSONA_TENANT_MODE: mode === "multi" ? "multi" : "single",
    PERSONA_TENANTS: mode === "multi" ? "app1,app2" : "test-tenant",
    PERSONA_ACCESS_TOKEN_EXPIRY: "15m",
    PERSONA_REFRESH_TOKEN_EXPIRY: "7d",
    PERSONA_COOKIE_DOMAIN: "",
    PERSONA_DEV_USERS: "alice:alice-secret,*:wild-secret",
    PERSONA_CORS_ORIGINS: "http://localhost:3000",
    PERSONA_GOOGLE_CLIENT_ID: mode === "multi" ? "test-client" : "",
    PERSONA_GOOGLE_CLIENT_SECRET: mode === "multi" ? "test-secret" : "",
    PERSONA_GOOGLE_REDIRECT_URI: `http://127.0.0.1:${port}/auth/google/callback`,
    LOG_LEVEL: "error",
  };
}
export const nodeArguments = [
  "--import",
  "./services/persona/node/tests/google-fixture.mjs",
];
