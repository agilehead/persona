/**
 * Persona Server Entry Point
 *
 * Multi-tenant OAuth authentication service
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createLogger } from "@agilehead/persona-logger";
import { initSQLiteDatabase, runMigrations } from "@agilehead/persona-db";

import { config } from "../config.js";
import {
  createIdentityRepository,
  createSessionRepository,
} from "../repositories/index.js";
import { createTokenService, createAuthService } from "../services/index.js";
import {
  errorHandler,
  createInternalAuthMiddleware,
  createTenantMiddleware,
} from "../middleware/index.js";
import {
  createGoogleOAuthRoutes,
  createTokenRoutes,
  createLogoutRoutes,
  createInternalRoutes,
} from "../routes/index.js";

const logger = createLogger("persona-server");

async function main(): Promise<void> {
  logger.info("Starting Persona server", {
    nodeEnv: config.nodeEnv,
    host: config.server.host,
    port: config.server.port,
    tenantMode: config.tenant.mode,
    tenants: config.tenant.tenants,
  });

  // Initialize database
  logger.info("Initializing database", { dbPath: config.db.dbPath });
  const db = initSQLiteDatabase(config.db.dbPath);

  // Run migrations
  logger.info("Running migrations");
  await runMigrations(config.db.dataDir);

  // Create repositories
  const identityRepo = createIdentityRepository(db);
  const sessionRepo = createSessionRepository(db);

  // Create services
  const tokenService = createTokenService({
    sessionRepo,
    config: {
      jwtSecret: config.auth.jwtSecret,
      accessTokenExpiry: config.auth.accessTokenExpiry,
      refreshTokenExpiry: config.auth.refreshTokenExpiry,
    },
  });

  const authService = createAuthService({
    identityRepo,
    tokenService,
  });

  // Create Express app
  const app = express();

  // Trust proxy for reverse proxy setups
  app.set("trust proxy", true);

  // CORS configuration
  if (config.cors.origins.length > 0) {
    app.use(
      cors({
        origin: config.cors.origins,
        credentials: true,
      }),
    );
  }

  // Standard middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Health check (no auth required)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", tenant_mode: config.tenant.mode });
  });

  // Tenant middleware for OAuth routes (excluding callback)
  const tenantMiddleware = createTenantMiddleware(config.tenant);

  // OAuth routes (Google)
  if (config.google !== undefined) {
    const googleRoutes = createGoogleOAuthRoutes(authService, tokenService, {
      google: config.google,
      publicUrl: config.server.publicUrl,
      defaultRedirectUrl: config.server.publicUrl,
      isProduction: config.isProduction,
      cookieDomain: config.auth.cookieDomain,
    });

    // Apply tenant middleware to /auth/google (start flow) but NOT to /auth/google/callback
    app.use("/auth", tenantMiddleware, googleRoutes);
    // Callback is handled separately within googleRoutes without tenant middleware
  }

  // Token routes
  const tokenRoutes = createTokenRoutes(tokenService, identityRepo, {
    isProduction: config.isProduction,
    cookieDomain: config.auth.cookieDomain,
  });
  app.use("/token", tokenRoutes);

  // Logout routes
  const logoutRoutes = createLogoutRoutes(tokenService, {
    isProduction: config.isProduction,
    cookieDomain: config.auth.cookieDomain,
  });
  app.use("/logout", logoutRoutes);

  // Internal API routes (with secret authentication)
  const internalAuthMiddleware = createInternalAuthMiddleware(
    config.internal.secret,
  );
  const internalRoutes = createInternalRoutes(authService, config.tenant);
  app.use("/internal", internalAuthMiddleware, internalRoutes);

  // Error handler
  app.use(errorHandler);

  // Start server
  app.listen(config.server.port, config.server.host, () => {
    logger.info("Persona server started", {
      url: `http://${config.server.host}:${String(config.server.port)}`,
      publicUrl: config.server.publicUrl,
    });
  });
}

main().catch((error: unknown) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});
