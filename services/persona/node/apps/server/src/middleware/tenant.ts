/**
 * Tenant Validation Middleware
 *
 * Validates tenant parameter based on tenant mode:
 * - Single mode: tenant param must NOT be passed (error if present)
 * - Multi mode: tenant param is REQUIRED and must be in allowed list
 */

import type { Request, Response, NextFunction } from "express";
import type { TenantConfig } from "../config.js";

export function createTenantMiddleware(tenantConfig: TenantConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenantParam = req.query.tenant as string | undefined;

    if (tenantConfig.mode === "single") {
      // Single mode: tenant param must NOT be passed
      if (tenantParam !== undefined) {
        res.status(400).json({
          error: "tenant parameter not allowed in single-tenant mode",
        });
        return;
      }
      req.tenant = tenantConfig.tenants[0];
    } else {
      // Multi mode: tenant param REQUIRED
      if (tenantParam === undefined || tenantParam === "") {
        res.status(400).json({
          error: "tenant parameter required",
        });
        return;
      }
      if (!tenantConfig.tenants.includes(tenantParam)) {
        res.status(400).json({
          error: "invalid tenant",
        });
        return;
      }
      req.tenant = tenantParam;
    }

    next();
  };
}

/**
 * Get tenant from request (for use in routes after middleware has run)
 * Throws if tenant is not set (middleware not applied)
 */
export function getTenantFromRequest(req: Request): string {
  if (req.tenant === undefined) {
    throw new Error(
      "Tenant not set on request - ensure tenant middleware is applied",
    );
  }
  return req.tenant;
}
