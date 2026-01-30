# Coding Standards

This document outlines the coding standards and patterns used throughout the Persona OAuth service codebase. All contributors must follow these guidelines to maintain consistency and quality.

## Core Principles

### 1. Functional Programming First

**NO CLASSES** - Use functions and modules exclusively.

```typescript
// Good - Pure function with explicit dependencies
export async function createIdentity(
  db: Database,
  data: CreateIdentityData,
): Promise<Result<Identity>> {
  // Implementation
}

// Bad - Service class for stateless operations
export class IdentityService {
  constructor(private db: Database) {}

  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    // This should be a function, not a class method
  }
}
```

### 2. Explicit Error Handling with Result Types

Use `Result<T>` for all operations that can fail. Never throw exceptions for expected errors.

```typescript
// Result type definition (in types.ts)
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

// Good - Using Result type
export async function findIdentity(db: Database, identityId: string): Promise<Result<Identity>> {
  try {
    const identities = await executeSelect(
      db,
      schema,
      (q, p) =>
        q
          .from("identity")
          .where((i) => i.id === p.identityId)
          .select((i) => ({ ...i }))
          .take(1),
      { identityId }
    );

    if (identities.length === 0) {
      return {
        success: false,
        error: new Error("Identity not found"),
      };
    }

    return { success: true, data: identities[0] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

// Bad - Throwing exceptions
export async function findIdentity(db: Database, identityId: string): Promise<Identity> {
  const identities = await executeSelect(/* ... */);
  if (identities.length === 0) throw new Error("Identity not found");
  return identities[0];
}
```

### 3. Database Patterns with Tinqer

#### All SQL MUST use Tinqer

**CRITICAL**: Never write raw SQL. Always use Tinqer for type-safe queries.

```typescript
// Good - Tinqer query
import { createSchema, executeSelect, executeInsert } from "@tinqerjs/tinqer";
import { executeSqlite } from "@tinqerjs/tinqer-sqlite";

const schema = createSchema<DatabaseSchema>();

export async function createSession(db: Database, data: CreateSessionData): Promise<Result<Session>> {
  const result = await executeInsert(
    db,
    schema,
    (q, p) =>
      q
        .insertInto("session")
        .values({
          id: p.id,
          identity_id: p.identityId,
          tenant_id: p.tenantId,
          token_hash: p.tokenHash,
          expires_at: p.expiresAt,
        })
        .returning((s) => ({ ...s })),
    {
      id: generateUUID(),
      identityId: data.identityId,
      tenantId: data.tenantId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    }
  );

  return { success: true, data: result };
}

// Bad - Raw SQL
export async function createSession(db: Database, data: CreateSessionData): Promise<Session> {
  return db.run(`INSERT INTO session (id, identity_id, token_hash) VALUES (?, ?, ?)`, [
    data.id,
    data.identityId,
    data.tokenHash,
  ]);
}
```

#### DbRow Types

All database types must exactly mirror the database schema with snake_case:

```typescript
// Database schema types (snake_case)
type IdentityDbRow = {
  id: string;
  tenant_id: string;
  provider: string;
  provider_user_id: string;
  email: string;
  name: string | null;
  profile_image_url: string | null;
  user_id: string | null;
  roles: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

type SessionDbRow = {
  id: string;
  identity_id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: string;
  revoked: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};
```

#### Repository Pattern

Implement repositories as functional interfaces:

```typescript
// Repository interface
export type IIdentityRepository = {
  findById: (id: string) => Promise<Result<Identity>>;
  findByEmail: (tenantId: string, email: string) => Promise<Result<Identity>>;
  create: (data: CreateIdentityData) => Promise<Result<Identity>>;
  updateUserIdAndRoles: (id: string, userId: string, roles: string[]) => Promise<Result<Identity>>;
};

// Repository implementation
export function createIdentityRepository(db: Database): IIdentityRepository {
  const schema = createSchema<DatabaseSchema>();

  return {
    findById: async (id) => {
      const identities = await executeSelect(
        db,
        schema,
        (q, p) =>
          q
            .from("identity")
            .where((i) => i.id === p.id)
            .select((i) => ({ ...i }))
            .take(1),
        { id }
      );

      return identities.length > 0
        ? { success: true, data: mapIdentityFromDb(identities[0]) }
        : { success: false, error: new Error("Identity not found") };
    },
    // ... other methods
  };
}
```

### 4. Module Structure

#### Imports

All imports MUST include the `.js` extension:

```typescript
// Good
import { createIdentityRepository } from "./repositories/identity.js";
import { verifyToken } from "./middleware/auth.js";
import type { Result } from "./types.js";

// Bad
import { createIdentityRepository } from "./repositories/identity";
import { verifyToken } from "./middleware/auth";
```

#### Exports

Use named exports exclusively:

```typescript
// Good
export function createSession() { ... }
export function revokeSession() { ... }
export type Session = { ... };

// Bad
export default class SessionService { ... }
```

### 5. Naming Conventions

#### General Rules

- **Functions**: camelCase (`createIdentity`, `verifyToken`, `revokeSession`)
- **Types**: PascalCase (`Identity`, `Session`, `TokenPayload`)
- **Constants**: UPPER_SNAKE_CASE (`ACCESS_TOKEN_EXPIRY`, `DEFAULT_PORT`)
- **Files**: kebab-case (`create-identity.ts`, `token-service.ts`)
- **Database**: snake_case tables and columns (`identity`, `created_at`, `tenant_id`)

#### Database Naming

- **Tables**: singular, lowercase (`identity`, `session`)
- **Columns**: snake_case (`tenant_id`, `created_at`, `token_hash`)
- **Foreign Keys**: `{table}_id` (`identity_id`, `tenant_id`)

### 6. TypeScript Guidelines

#### Strict Mode

Always use TypeScript strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

#### Type vs Interface

Prefer `type` over `interface`:

```typescript
// Good - Using type
type Identity = {
  id: string;
  tenantId: string;
  email: string;
  provider: string;
  providerUserId: string;
};

type TokenPayload = {
  sub: string;
  tenant: string;
  email: string;
  roles: string[];
};

// Use interface only for extensible contracts or declaration merging
```

#### Strict Equality Only

**CRITICAL**: Always use strict equality operators (`===` and `!==`). Never use loose equality (`==` or `!=`).

```typescript
// Good - Strict equality
if (value === null) { ... }
if (value !== undefined) { ... }
if (identity !== null && identity !== undefined) { ... }

// Bad - Loose equality (BANNED)
if (value == null) { ... }
if (value != undefined) { ... }
```

#### Avoid `any`

Never use `any`. Use `unknown` if type is truly unknown:

```typescript
// Good
function parseJSON(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Bad
function parseJSON(content: any): any {
  return JSON.parse(content);
}
```

### 7. Async/Await Pattern

Always use async/await instead of promises:

```typescript
// Good
export async function refreshTokens(
  tokenService: TokenService,
  refreshToken: string
): Promise<Result<TokenPair>> {
  const sessionResult = await tokenService.validateRefreshToken(refreshToken);
  if (!sessionResult.success) {
    return sessionResult;
  }

  const newTokens = await tokenService.generateTokenPair(sessionResult.data);
  return newTokens;
}

// Bad - Promise chains
export function refreshTokens(
  tokenService: TokenService,
  refreshToken: string
): Promise<Result<TokenPair>> {
  return tokenService.validateRefreshToken(refreshToken).then((sessionResult) => {
    if (!sessionResult.success) {
      return sessionResult;
    }
    return tokenService.generateTokenPair(sessionResult.data);
  });
}
```

### 8. Express Route Patterns

```typescript
// Good - Proper error handling with Result types
router.post("/token/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (typeof refreshToken !== "string") {
    res.status(400).json({ error: "Missing refresh token" });
    return;
  }

  const result = await tokenService.refreshTokens(refreshToken);

  if (!result.success) {
    res.status(401).json({ error: result.error.message });
    return;
  }

  res.json({
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
  });
});
```

### 9. Documentation

Add JSDoc comments for exported functions:

```typescript
/**
 * Creates a new identity from OAuth provider data.
 *
 * @param repos - Repository instances
 * @param tenantId - Tenant identifier
 * @param data - OAuth provider identity data
 * @returns Result containing the created identity or an error
 */
export async function createIdentity(
  repos: Repositories,
  tenantId: string,
  data: OAuthIdentityData
): Promise<Result<Identity>> {
  // Implementation
}
```

### 10. Testing

```typescript
describe("Token Service", () => {
  let db: Database;
  let tokenService: TokenService;
  let identity: Identity;

  beforeEach(async () => {
    db = await createTestDatabase();
    const repos = createRepositories(db);
    tokenService = createTokenService({ sessionRepo: repos.sessions, config });

    const identityResult = await repos.identities.create({
      tenantId: "test-tenant",
      email: "test@example.com",
      provider: "google",
      providerUserId: "google-123",
    });
    if (!identityResult.success) throw identityResult.error;
    identity = identityResult.data;
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  it("should generate valid access token", async () => {
    // Arrange
    const sessionData = {
      identityId: identity.id,
      tenantId: identity.tenantId,
    };

    // Act
    const result = await tokenService.generateTokenPair(sessionData);

    // Assert
    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.accessToken).to.be.a("string");
      expect(result.data.refreshToken).to.be.a("string");
    }
  });
});
```

### 11. Security Patterns

#### Input Validation

Always validate input:

```typescript
// Good - Validate before processing
router.post("/internal/identity/:identityId/link", async (req, res) => {
  const { identityId } = req.params;
  const { userId, roles } = req.body;

  if (typeof userId !== "string" || userId.length === 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  if (!Array.isArray(roles) || !roles.every((r) => typeof r === "string")) {
    res.status(400).json({ error: "Invalid roles" });
    return;
  }

  // Process validated input
});
```

#### Authentication & Authorization

```typescript
// Internal API authentication middleware
export function createInternalAuthMiddleware(internalSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = req.headers["x-internal-secret"];

    if (secret !== internalSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
```

### 12. Logging

Use structured logging, never console.log:

```typescript
import { createLogger } from "@agilehead/persona-logger";

const logger = createLogger("token-service");

// Good - Structured logging
logger.info("Token generated", { identityId, tenantId });
logger.error("Token validation failed", { error: error.message, tokenHash });

// Bad - console.log
console.log("Token generated for " + identityId);
```

## Code Review Checklist

Before submitting a PR, ensure:

- [ ] All functions use Result types for error handling
- [ ] No classes used
- [ ] All imports include `.js` extension
- [ ] All database queries use Tinqer (no raw SQL)
- [ ] Repository pattern implemented for data access
- [ ] JSDoc comments for public functions
- [ ] Input validation for all endpoints
- [ ] No `any` types used
- [ ] Strict equality only (`===`/`!==`, never `==`/`!=`)
- [ ] Tests included for new functionality
- [ ] No console.log statements (use logger)
- [ ] Environment variables validated at startup
