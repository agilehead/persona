/**
 * Internal API Authentication Middleware
 * Validates X-Internal-Secret header for service-to-service calls
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "@agilehead/persona-logger";

const logger = createLogger("persona-internal-auth");

export function createInternalAuthMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const providedSecret = req.headers["x-internal-secret"];

    if (providedSecret !== secret) {
      logger.warn("Internal API: Invalid or missing secret", {
        path: req.path,
        ip: req.ip,
      });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
