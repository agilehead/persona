# CLAUDE.md

**NO QUICK FIXES**: Quick fixes and workarounds are banned in this project. Always fix the root cause properly.

**NEVER SSH INTO PRODUCTION**: Do not SSH into production servers unless the user explicitly asks you to. Production access requires explicit user authorization for each session.

**NEVER USE FORCE PUSH OR DESTRUCTIVE GIT OPERATIONS**: `git push --force`, `git push --force-with-lease`, `git reset --hard`, `git clean -fd`, or any other destructive git operations are ABSOLUTELY FORBIDDEN. Use `git revert` to undo changes instead.

This file provides guidance to Claude Code when working with the Persona OAuth authentication service.

## Service-owned layout

The repository follows Ctlflow's product ownership model. The repository root owns workspace configuration, build orchestration and documentation. Product source, database assets, operations and acceptance tests belong to `services/persona/`. The existing Node implementation retains its behavior and package contracts; it is explicitly selected for comparison and is never a C# fallback.

```text
services/persona/
  package.json
  node/
    apps/                     Existing Node application composition roots
    packages/                 Existing Node libraries and client SDKs
    tests/                    Node service tests and support
    Dockerfile
  csharp/
    apps/                     Thin native/managed application roots
    packages/                 Kernel, domain, contracts and adapters
    tests/                    C# probes and regression assertions
    build/                    Build-only EF compiler and design-time host
    scripts/                  C# generation/publication tools
    Dockerfile
  database/persona/sqlite/   Existing Knex migrations and seed assets
  knexfile.persona.mjs
  docker/                     Development and production configuration
  scripts/                    Shared product generators, operations and acceptance
  tests/contracts/            One cross-runtime assertion bank
```

Only implemented capabilities receive directories. Public package names, wire contracts, migration filenames/history, stored bytes and media paths remain unchanged. No production data is moved or reset by the source reorganization.

`npm run verify:structure` checks workspace ownership, required service roots, solution project paths and the absence of the superseded repository-wide source pools. The build runs this check. Product-specific commands are under `services/persona/scripts/`; root npm commands remain the workspace entry points. Knex alone owns schema changes; moving its source does not run migrations.

## Canonical server architecture

The application server is C# / NativeAOT under `services/persona/csharp/`, with the same apps/packages/build/scripts/tests structure and pinned build infrastructure as Snapped. Read `README.md` and `services/persona/csharp/README.md` for current commands and architecture. The Node server is retained for explicit comparison, not as a runtime fallback. The TypeScript client SDK and Knex migrations remain Node-owned.

C# uses functional static modules, immutable domain records, function-delegate persistence ports, `Result<T>`, cancellation and `IUnitOfWork.Run`. Classes are used where EF, ASP.NET, GraphQL or provider frameworks require them. Database queries use EF LINQ in C# and Tinqer in Node; handwritten runtime SQL is forbidden. Generated EF rows are separate from domain records. Existing database schema and representations are preserved; identity IDs are base62 strings, not UUIDs.

Required verification: `npm run build`, `npm run lint`, `npm run build:native`, `npm test`, then `npm run test:integration`. Execute real NativeAOT binaries and both Docker variants; successful managed tests alone are insufficient. Never run broad process killers for acceptance. Keep private `.analysis/` notes ignored and preserve production data. Do not publish, deploy or push without the applicable user authorization.

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
- **JWT Tokens**: Access tokens with sliding refresh sessions
- **Internal API**: Service-to-service identity linking and role management
- **Session Management**: Secure session handling with revocation

### Documentation & Code Principles

**Documentation Guidelines:**

- Write as if the spec was designed from the beginning
- Be concise and technical - avoid promotional language
- Use active voice and include code examples
- Keep README.md as single source of truth

**Code Principles:**

- **FUNCTIONAL MODULES** - Use strict types; C# framework-bound classes are permitted as described above
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
- **Persistence** - EF LINQ in C#; Tinqer in Node; never write runtime SQL
- **Repository Pattern** - Interfaces with SQLite implementation
- **Singular table names**: lowercase (e.g., `identity`, `session`)
- **Column names**: snake_case for all columns
- **Primary keys** preserve the existing stored identifier formats
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
./services/persona/scripts/start.sh

# Lint entire project
./scripts/lint-all.sh           # Run ESLint on all packages
./scripts/lint-all.sh --fix     # Run ESLint with auto-fix

# Format code with Prettier (MUST run before committing)
./scripts/format-all.sh

# Docker commands
./services/persona/scripts/docker-build.sh       # Build Docker image
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
├── services/persona/node/                    # Monorepo packages
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
- `PERSONA_INTERNAL_SECRET` - Bearer token for internal API endpoints (REQUIRED)
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
