/**
 * Routes Index
 * Exports all route creators
 */

// OAuth routes
export {
  createGoogleOAuthRoutes,
  type GoogleOAuthRoutesConfig,
} from "./oauth/index.js";

// Token routes
export { createTokenRoutes, type TokenRouteConfig } from "./token.js";

// Logout routes
export { createLogoutRoutes, type LogoutRouteConfig } from "./logout.js";

// Internal routes
export { createInternalRoutes } from "./internal/index.js";
