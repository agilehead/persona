/**
 * Internal Link Route
 * POST /internal/identity/:identityId/link - Link identity to user
 *
 * Note: Tenant is already known from the identity record, not from query param
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { createLogger } from "@agilehead/persona-logger";
import type { AuthService } from "../../services/auth-service.js";

const logger = createLogger("persona-internal-link");

const LinkRequestSchema = z.object({
  userId: z.string().min(3).max(20),
  roles: z.array(z.string()).min(1),
});

export function createLinkRoutes(authService: AuthService): Router {
  const router = Router();

  // POST /internal/identity/:identityId/link
  router.post(
    "/identity/:identityId/link",
    async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;

        if (identityId === undefined || Array.isArray(identityId)) {
          res.status(400).json({ error: "Identity ID is required" });
          return;
        }

        // Validate request body
        const parseResult = LinkRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: "Invalid request body",
            details: parseResult.error.errors,
          });
          return;
        }

        const { userId, roles } = parseResult.data;

        // Link identity to user
        const result = await authService.linkIdentityToUser(
          identityId,
          userId,
          roles,
        );

        if (!result.success) {
          if (result.error.code === "NOT_FOUND") {
            res.status(404).json({ error: result.error.message });
            return;
          }
          res.status(500).json({ error: result.error.message });
          return;
        }

        const { identity, tokens } = result.data;

        logger.info("Identity linked to user via internal API", {
          identityId,
          tenantId: identity.tenantId,
          userId,
          roles,
        });

        res.json({
          success: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          identity: {
            id: identity.id,
            tenantId: identity.tenantId,
            userId: identity.userId,
            email: identity.email,
            roles: identity.roles,
          },
        });
      } catch (error) {
        logger.error("Internal link error", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  return router;
}
