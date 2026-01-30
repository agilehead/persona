/**
 * Test Entry Point
 *
 * Imports all test files and runs them with mocha
 */

// Repository tests
import "./tests/repositories/identity-repository.test.js";
import "./tests/repositories/session-repository.test.js";

// Service tests
import "./tests/services/token-service.test.js";
import "./tests/services/auth-service.test.js";

// Route tests
import "./tests/routes/tenant-middleware.test.js";
import "./tests/routes/internal-api.test.js";
import "./tests/routes/token-routes.test.js";
import "./tests/routes/logout-routes.test.js";
