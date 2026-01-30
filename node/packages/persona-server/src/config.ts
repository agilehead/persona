import { join } from "path";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`ERROR: Required environment variable ${name} is not set`);
    process.exit(1);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value !== undefined && value !== ""
    ? parseInt(value, 10)
    : defaultValue;
}

// Tenant configuration types
export type TenantConfig =
  | { mode: "single"; tenants: [string] } // Exactly 1 tenant
  | { mode: "multi"; tenants: string[] }; // 1 or more tenants

function validateTenantConfig(): TenantConfig {
  const mode = required("PERSONA_TENANT_MODE");
  const tenantsStr = required("PERSONA_TENANTS");
  const tenants = tenantsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (mode !== "single" && mode !== "multi") {
    console.error("ERROR: PERSONA_TENANT_MODE must be 'single' or 'multi'");
    process.exit(1);
  }

  if (mode === "single") {
    const singleTenant = tenants[0];
    if (tenants.length !== 1 || singleTenant === undefined) {
      console.error(
        "ERROR: Single tenant mode requires exactly 1 tenant in PERSONA_TENANTS",
      );
      process.exit(1);
    }
    return { mode: "single", tenants: [singleTenant] };
  } else {
    if (tenants.length < 1) {
      console.error(
        "ERROR: Multi tenant mode requires at least 1 tenant in PERSONA_TENANTS",
      );
      process.exit(1);
    }
    return { mode: "multi", tenants };
  }
}

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Validate tenant config early
const tenantConfig = validateTenantConfig();

export const config = {
  // Environment
  isProduction,
  isTest,
  nodeEnv: optional("NODE_ENV", "development"),

  // Tenant configuration
  tenant: tenantConfig,

  // Server
  server: {
    host: optional("PERSONA_SERVER_HOST", "0.0.0.0"),
    port: optionalInt("PERSONA_SERVER_PORT", 5005),
    publicUrl: required("PERSONA_SERVER_PUBLIC_URL"),
  },

  // Database
  db: {
    dataDir: required("PERSONA_DATA_DIR"),
    dbPath: join(required("PERSONA_DATA_DIR"), "persona.db"),
  },

  // JWT & Auth
  auth: {
    jwtSecret: required("PERSONA_JWT_SECRET"),
    // Session secret defaults to JWT secret if not provided
    sessionSecret:
      process.env.PERSONA_SESSION_SECRET ??
      process.env.PERSONA_JWT_SECRET ??
      "",
    accessTokenExpiry: optional("PERSONA_ACCESS_TOKEN_EXPIRY", "15m"),
    refreshTokenExpiry: optional("PERSONA_REFRESH_TOKEN_EXPIRY", "7d"),
    cookieDomain: process.env.PERSONA_COOKIE_DOMAIN,
  },

  // Internal API
  internal: {
    secret: required("PERSONA_INTERNAL_SECRET"),
  },

  // Google OAuth (optional - disabled if not set)
  google:
    process.env.GOOGLE_OAUTH_CLIENT_ID !== undefined &&
    process.env.GOOGLE_OAUTH_CLIENT_ID !== ""
      ? {
          clientId: required("GOOGLE_OAUTH_CLIENT_ID"),
          clientSecret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
          redirectUri: required("GOOGLE_OAUTH_REDIRECT_URI"),
          issuer: "https://accounts.google.com",
        }
      : undefined,

  // CORS
  cors: {
    origins: (process.env.PERSONA_CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  },

  // Logging
  logging: {
    level: optional("LOG_LEVEL", "info"),
    fileDir: process.env.PERSONA_LOG_FILE_DIR,
  },
};

export type Config = typeof config;
