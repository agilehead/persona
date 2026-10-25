/**
 * Internal Routes Index
 * Combines all internal routes with tenant middleware
 */

import { Router } from "express";
import type { TenantConfig } from "../../config.js";
import type { AuthService } from "../../services/auth-service.js";
import { createTenantMiddleware } from "../../middleware/tenant.js";
import { createLinkRoutes } from "./link.js";
import { createRolesRoutes } from "./roles.js";
import { createSessionsRoutes } from "./sessions.js";

export function createInternalRoutes(
  authService: AuthService,
  tenantConfig: TenantConfig,
): Router {
  const router = Router();

  // Apply tenant middleware to all internal routes
  router.use(createTenantMiddleware(tenantConfig));

  // Mount internal routes
  router.use(createLinkRoutes(authService));
  router.use(createRolesRoutes(authService));
  router.use(createSessionsRoutes(authService));

  return router;
}
