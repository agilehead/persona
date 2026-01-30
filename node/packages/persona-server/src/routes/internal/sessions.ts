/**
 * Internal Sessions Route
 * DELETE /internal/user/:userId/sessions - Revoke all user sessions
 *
 * Note: Tenant comes from middleware (query param or implicit)
 */

import { Router, type Request, type Response } from "express";
import { createLogger } from "@agilehead/persona-logger";
import type { AuthService } from "../../services/auth-service.js";

const logger = createLogger("persona-internal-sessions");

export function createSessionsRoutes(authService: AuthService): Router {
  const router = Router();

  // DELETE /internal/user/:userId/sessions
  router.delete(
    "/user/:userId/sessions",
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const tenantId = req.tenant;

        if (userId === undefined || Array.isArray(userId)) {
          res.status(400).json({ error: "User ID is required" });
          return;
        }

        if (tenantId === undefined) {
          res.status(400).json({ error: "Tenant context is required" });
          return;
        }

        // Revoke all sessions
        const result = await authService.revokeUserSessions(tenantId, userId);

        if (!result.success) {
          res.status(500).json({ error: result.error.message });
          return;
        }

        logger.info("User sessions revoked via internal API", {
          tenantId,
          userId,
          revokedCount: result.data,
        });

        res.json({
          success: true,
          revokedCount: result.data,
        });
      } catch (error) {
        logger.error("Internal sessions revoke error", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  return router;
}
