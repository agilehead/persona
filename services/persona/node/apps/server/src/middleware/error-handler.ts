/**
 * Error Handler Middleware
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "@agilehead/persona-logger";

const logger = createLogger("persona-error");

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error("Unhandled error", { error: err });

  res.status(500).json({
    error: "Internal server error",
  });
}
