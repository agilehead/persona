# CLAUDE.md

**NO QUICK FIXES**: Quick fixes and workarounds are banned in this project. Always fix the root cause properly.

**NEVER SSH INTO PRODUCTION**: Do not SSH into production servers unless the user explicitly asks you to. Production access requires explicit user authorization for each session.

**NEVER USE FORCE PUSH OR DESTRUCTIVE GIT OPERATIONS**: `git push --force`, `git push --force-with-lease`, `git reset --hard`, `git clean -fd`, or any other destructive git operations are ABSOLUTELY FORBIDDEN. Use `git revert` to undo changes instead.

This file provides guidance to Claude Code when working with the Persona OAuth authentication service.

## Critical Guidelines

### NEVER ACT WITHOUT EXPLICIT USER APPROVAL

**YOU MUST ALWAYS ASK FOR PERMISSION BEFORE:**

- Making architectural decisions or changes
- Implementing new features or functionality
- Modifying APIs, interfaces, or data structures
- Changing expected behavior or test expectations
- Adding new dependencies or patterns

**ONLY make changes AFTER the user explicitly approves.** When you identify issues or potential improvements, explain them clearly and wait for the user's decision. Do NOT assume what the user wants or make "helpful" changes without permission.

### NEVER COMMIT DIRECTLY TO MAIN

**CRITICAL**: ALL changes must be made on a feature branch, never directly on main.

- Always create a new branch before making changes (e.g., `feature/add-provider`, `fix/token-refresh`)
- Push the feature branch and create a pull request
- Only merge to main after user approval

### FINISH DISCUSSIONS BEFORE WRITING CODE

**IMPORTANT**: When the user asks a question or you're in the middle of a discussion, DO NOT jump to writing code. Always:

1. **Complete the discussion first** - Understand the problem fully
2. **Analyze and explain** - Work through the issue verbally
3. **Get confirmation** - Ensure the user agrees with the approach
4. **Only then write code** - After the user explicitly asks you to implement

## Session Startup & Task Management

### First Steps When Starting a Session

When you begin working on this project, you MUST:

1. **Read this entire CLAUDE.md file** to understand the project structure and conventions
2. **Check for ongoing tasks in `.todos/` directory** - Look for any in-progress task files
3. **Read the key documentation files** in this order:
   - `/README.md` - Project overview
   - `/CODING-STANDARDS.md` - Mandatory coding patterns and conventions
   - `.env.example` - Configuration options

Only after reading these documents should you proceed with any implementation or analysis tasks.

## Project Overview & Principles

Persona is a standalone multi-tenant OAuth authentication service. It handles user authentication via OAuth providers (Google, etc.) and issues JWT tokens for downstream services.

### Production System

**IMPORTANT**: Persona is designed for production deployments:

- **Always use migrations** - All database schema changes MUST use the migration system
- **Never modify initial schema** - The initial migration files are immutable; create new migrations for changes
- **Backward compatibility matters** - Consider existing data when making schema changes
- **All code should follow current best practices** - Maintain high quality standards
- **No change tracking in comments** - Avoid "changed from X to Y" comments in code

### Key Features

- **Multi-tenancy**: Single mode (one tenant) or multi mode (many tenants)
- **OAuth Providers**: Google (expandable to other providers)
- **JWT Tokens**: Access tokens with refresh token rotation
- **Internal API**: Service-to-service identity linking and role management
- **Session Management**: Secure session handling with revocation

### Documentation & Code Principles

**Documentation Guidelines:**

- Write as if the spec was designed from the beginning
- Be concise and technical - avoid promotional language
- Use active voice and include code examples
- Keep README.md as single source of truth

**Code Principles:**

- **NO CLASSES** - Use functional style with strict types
- **NO DYNAMIC IMPORTS** - Always use static imports
- **PREFER FUNCTIONS** - Export functions from modules
- **USE RESULT TYPES** - For error handling
- **PREFER `type` over `interface`**
- **NO EMOJIS** - Do not use emojis in code, logs, or comments

### Environment Variables

**CRITICAL**: NEVER use fallback defaults with `||` for required environment variables.

```typescript
// BAD - silent failure with default value
const secret = process.env.PERSONA_JWT_SECRET || "dev-secret";

// GOOD - fail fast if required var is missing
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Required environment variable ${name} is not set`);
    process.exit(1);
  }
  return value;
}
const secret = required("PERSONA_JWT_SECRET");
```

All environment variables must be validated at startup in `src/config.ts`. The application should fail immediately if required variables are missing.

### Linting and Code Quality Standards

**CRITICAL**: NEVER weaken linting, testing, or type-checking rules:

- **NO eslint-disable comments** - Fix the actual issues instead of suppressing warnings
- **NO test.skip or test.only in committed code** - All tests must run and pass
- **NO @ts-expect-error or @ts-ignore** - Fix type errors properly
- **NO relaxing TypeScript strict mode** - Maintain full type safety
- **NO lowering code coverage thresholds** - Improve coverage instead
- **NO weakening any quality gates** - Standards exist for a reason

When you encounter linting, type, or test errors, the solution is ALWAYS to fix the underlying issue properly, never to suppress or bypass the error. Quality standards are non-negotiable.

**PRE-EXISTING ERRORS**: If you encounter lint, type, or test errors that existed before your changes, you MUST fix them. Pre-existing errors are never an excuse - the codebase must always be in a clean state.

## Key Technical Decisions

### Security: Never Use npx

**CRITICAL SECURITY REQUIREMENT**: NEVER use `npx` for any commands. This poses grave security risks.

- **ALWAYS use exact dependency versions** in package.json
- **ALWAYS use local node_modules binaries**
- **NEVER use `npx`** - use local dependencies

### Security: Never SSH as Root

**CRITICAL**: NEVER SSH to production servers as root.

- **ALWAYS use the application-specific user** (e.g., `personauser@persona.example.com`)
- **NEVER use `root@`** in any SSH commands, scripts, or configurations
- Production uses rootless Docker - each app has its own isolated user and Docker daemon

### Database Conventions

- **SQLite** for development/initial deployment (via Tinqer)
- **All SQL via Tinqer** - Never write raw SQL
- **Repository Pattern** - Interfaces with SQLite implementation
- **Singular table names**: lowercase (e.g., `identity`, `session`)
- **Column names**: snake_case for all columns
- **UUIDs** for primary keys
- **Hard deletes** with audit logging
- **MIGRATION POLICY**: Use migration system for all schema changes

### ESM Modules

- **All imports MUST include `.js` extension**: `import { foo } from "./bar.js"`
- **TypeScript configured for `"module": "NodeNext"`**
- **Type: `"module"` in all package.json files**
- **NO DYNAMIC IMPORTS**: Always use static imports

## Essential Commands & Workflow

### Build & Development Commands

```bash
# Build entire project (from root)
./scripts/build.sh              # Standard build with formatting
./scripts/build.sh --no-format  # Skip prettier formatting (faster)

# Clean build artifacts
./scripts/clean.sh

# Start server
./scripts/start.sh

# Lint entire project
./scripts/lint-all.sh           # Run ESLint on all packages
./scripts/lint-all.sh --fix     # Run ESLint with auto-fix

# Format code with Prettier (MUST run before committing)
./scripts/format-all.sh

# Docker commands
./scripts/docker-build.sh       # Build Docker image
```

### Database Commands

```bash
# Check migration status
npm run migrate:persona:status

# Run migrations (ONLY when explicitly asked)
npm run migrate:persona:latest
npm run migrate:persona:rollback
```

### Testing Commands

```bash
# Run all tests
npm test

# Run specific tests
npm run test:grep -- "pattern to match"
```

### Git Workflow

**CRITICAL GIT SAFETY RULES**:

1. **NEVER use `git push --force`**
2. **ALL git push commands require EXPLICIT user authorization**
3. **Use revert commits instead of force push**

**NEW BRANCH REQUIREMENT**: ALL changes must be made on a new feature branch, never directly on main.

When the user asks you to commit and push:

1. Run `./scripts/build.sh` to build all packages (this also formats code)
2. Run `./scripts/lint-all.sh` to ensure code passes linting
3. Follow git commit guidelines
4. Get explicit user confirmation before any `git push`

### Pull Request Workflow

**NEVER use `gh pr create` to create pull requests automatically.** Always provide the URL for manual PR creation:

```
https://github.com/agilehead/persona/pull/new/<branch-name>
```

After pushing a feature branch, provide this URL to the user so they can create the PR manually with their preferred title and description.

## Core Architecture

### Project Structure

```
persona/
├── node/                    # Monorepo packages
│   └── packages/
│       ├── persona-server/  # Express API server
│       ├── persona-db/      # Database layer
│       ├── persona-logger/  # Structured logging
│       └── persona-test-utils/ # Test utilities
├── database/                # Migrations
│   └── persona/
│       ├── knexfile.js      # Knex configuration
│       └── migrations/      # SQLite migrations
├── scripts/                 # Build and utility scripts
└── docs/                    # Documentation
```

### Temporary Directories (gitignored)

These directories are excluded from git and used for temporary data:

- `.tests/` - Test run data (e.g., `.tests/test-1234567890/data/` for test databases)
- `.analysis/` - Analysis output and scratch files
- `.temp/` - General temporary files

### Key Concepts

- **Identity**: OAuth provider identity (email, provider, providerUserId)
- **Session**: Refresh token session with expiration
- **Tenant**: Application/service using Persona for auth
- **Internal API**: Service-to-service calls for identity linking

### Multi-Tenancy

Persona supports two tenant modes:

- **Single mode** (`PERSONA_TENANT_MODE=single`): One implicit tenant, `?tenant=` parameter forbidden
- **Multi mode** (`PERSONA_TENANT_MODE=multi`): Multiple tenants, `?tenant=` parameter required

Tenant is stored in:
- JWT payload as `tenant` claim
- OAuth cookie during redirect flow

### Repository Pattern

```typescript
// Interface
export type IIdentityRepository = {
  findById: (id: string) => Promise<Result<Identity>>;
  findByEmail: (tenantId: string, email: string) => Promise<Result<Identity>>;
  create: (data: CreateIdentityData) => Promise<Result<Identity>>;
};

// Implementation
export function createIdentityRepository(db: Database): IIdentityRepository {
  return {
    findById: async (id) => {
      // Tinqer query implementation
    },
    // ...
  };
}
```

## Environment Variables

See `.env.example` for complete list. Key variables:

### Server

- `PERSONA_SERVER_HOST` - Server bind address (default: 0.0.0.0)
- `PERSONA_SERVER_PORT` - Server port (default: 5005)
- `PERSONA_SERVER_PUBLIC_URL` - Public URL for callbacks

### Tenant Configuration

- `PERSONA_TENANT_MODE` - `single` or `multi` (REQUIRED)
- `PERSONA_TENANTS` - Comma-separated list of allowed tenants (REQUIRED)

### Authentication

- `PERSONA_JWT_SECRET` - JWT signing secret (REQUIRED)
- `PERSONA_INTERNAL_SECRET` - Internal API secret (REQUIRED)
- `PERSONA_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `PERSONA_GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `PERSONA_GOOGLE_REDIRECT_URI` - Google OAuth callback URL

### Database

- `PERSONA_DATA_DIR` - Directory for SQLite database (REQUIRED)

## Code Patterns

### Import Patterns

```typescript
// Always include .js extension
import { createIdentityRepository } from "./repositories/identity.js";
import type { Result } from "./types.js";
```

### Result Type Pattern

```typescript
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export async function doSomething(): Promise<Result<Data>> {
  if (error) {
    return {
      success: false,
      error: new Error("Description"),
    };
  }
  return { success: true, data: result };
}
```

### Tinqer Query Pattern

```typescript
import { createSchema, executeSelect } from "@tinqerjs/tinqer";

const schema = createSchema<DatabaseSchema>();

export async function getIdentity(db: Database, identityId: string) {
  const identities = await executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("identity")
        .where((i) => i.id === p.identityId)
        .select((i) => ({
          id: i.id,
          email: i.email,
          tenant_id: i.tenant_id,
        }))
        .take(1),
    { identityId }
  );

  return identities.length > 0
    ? { success: true, data: identities[0] }
    : { success: false, error: new Error("Identity not found") };
}
```

## Testing Strategy

### Unit Tests

- Repository functions
- Token service
- Auth service

### Integration Tests

- API endpoints
- OAuth flow mocking
- Internal API authentication

## Additional Resources

- `/CODING-STANDARDS.md` - Detailed coding conventions
- `/docs/api.md` - REST API documentation
