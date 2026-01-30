/**
 * Internal Roles Route
 * POST /internal/user/:userId/roles - Update user roles
 *
 * Note: Tenant comes from middleware (query param or implicit)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { createLogger } from "@agilehead/persona-logger";
import type { AuthService } from "../../services/auth-service.js";

const logger = createLogger("persona-internal-roles");

const UpdateRolesSchema = z.object({
  roles: z.array(z.string()).min(1),
});

export function createRolesRoutes(authService: AuthService): Router {
  const router = Router();

  // POST /internal/user/:userId/roles
  router.post("/user/:userId/roles", async (req: Request, res: Response) => {
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

      // Validate request body
      const parseResult = UpdateRolesSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "Invalid request body",
          details: parseResult.error.errors,
        });
        return;
      }

      const { roles } = parseResult.data;

      // Update roles
      const result = await authService.updateUserRoles(tenantId, userId, roles);

      if (!result.success) {
        res.status(500).json({ error: result.error.message });
        return;
      }

      logger.info("User roles updated via internal API", {
        tenantId,
        userId,
        roles,
        updatedCount: result.data,
      });

      res.json({
        success: true,
        updatedCount: result.data,
      });
    } catch (error) {
      logger.error("Internal roles update error", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
