# Persona

Persona provides tenant-scoped identities, Google OpenID Connect authorization with PKCE, signed access tokens, sliding refresh sessions, development password login, and authenticated identity linking, role updates and session revocation.

Development login is fail-closed: production and unrecognized `NODE_ENV` values disable it. Google validates HTTPS discovery, issuer, audience, signature, expiration, nonce, authorized party and token-response hashes. Signing-key rotation refreshes discovery synchronously. Secrets and provider tokens are never included in error responses.

The multi-tenant Google callback recovers its tenant from the OAuth cookie; it does not require the initial request's `tenant` query parameter. Single mode rejects explicit tenant parameters; multi mode requires a configured tenant on initiating and internal requests. Refresh advances the session expiry.

The application server uses C#/.NET11 NativeAOT. Managed builds are internal verification artifacts only. Node remains for the TypeScript client SDK, build/test tools and existing one-shot Knex migration runner. Runtime application images contain no Node.

Copy `.env.example` to `.env` and configure it. The C# server loads an existing SQLite database; run the Knex migrations explicitly against the intended environment before starting. Never reset production data. A verified backup is required before production data changes.

Use Node from `.nvmrc`, the SDK pinned in `global.json`, and Linux NativeAOT prerequisites (GCC, G++, zlib development headers). From the repository root:

```bash
npm ci
npm run build
npm run lint
npm run build:native
npm test
npm run test:integration
```

`npm start` reads `.env` and starts the published NativeAOT ELF executable. It accepts no runtime selector; missing artifacts fail.

`npm test` runs the client SDK tests, HTTP contracts and C# storage/service/security probes against managed .NET and actual NativeAOT with isolated Knex-created fixtures.

`npm run test:integration` builds and runs the actual NativeAOT Compose services, including the unchanged Knex runner, shared HTTP contracts, image health, absence of Node from application images, schema preservation and clean shutdown. It owns unique Compose projects and disposable data; it never kills unrelated processes.

`./services/persona/scripts/docker-build.sh <tag>` builds the Knex image and builds the NativeAOT application image. Building and testing do not publish images or deploy anything.

- [C# architecture and verification](services/persona/csharp/README.md)
- [Environment settings](.env.example)
- [Coding standards](CODING-STANDARDS.md)

## Service-owned layout

The repository follows Ctlflow's product ownership model. The repository root owns workspace configuration, build orchestration and documentation. Product source, database assets, operations and acceptance tests belong to `services/persona/`.

```text
services/persona/
  package.json
  node/
    packages/                 TypeScript SDK, logger and test tooling
  csharp/
    apps/                     Thin NativeAOT application roots
    packages/                 Kernel, domain, contracts and adapters
    tests/                    C# probes and regression assertions
    build/                    Build-only EF compiler and design-time host
    scripts/                  C# generation/publication tools
    Dockerfile
  database/persona/sqlite/    Database contract and existing Knex migrations
  knexfile.persona.mjs
  docker/                     Development and production configuration
  scripts/                    Shared product generators, operations and acceptance
  tests/contracts/            One cross-runtime assertion bank
```

Only implemented capabilities receive directories. Contracts and storage follow the current canonical model. No production data is moved or reset by source edits.

`npm run verify:structure` checks workspace ownership, required service roots, solution project paths and the absence of the superseded repository-wide source pools. The build runs this check. Product-specific commands are under `services/persona/scripts/`; root npm commands remain the workspace entry points. Knex alone owns schema changes; moving its source does not run migrations.

Application and migration commands use the workspace `.env` and resolve relative data directories from the repository root. Absolute data paths are used unchanged. Knex migration files and stored migration history remain unchanged.

## Application identity and roles

Persona is greenfield: WCBUBWHB (What Can Be, Unburdened By What Has Been)
applies to every layer. Keep one canonical implementation and API. No backward
compatibility, aliases, shims, hidden fallbacks or dual read/write paths are allowed.
Update owned contracts, consumers, fixtures and tests together. Other applications
must adopt the canonical contract; their update schedules do not justify retaining
superseded behavior in Persona.

Persona owns provider identities, authentication sessions and tenant-scoped human
role memberships. Consuming applications own their domain profiles and link the
chosen application user ID after onboarding. IDs use3–20 ASCII letters, digits,
underscore or hyphen. An identity cannot be reassigned to another application user.
A repeated same-user link preserves current roles; adding a provider identity to an
existing application user inherits that user's consistent role membership.

GET /auth/config returns googleEnabled, devLoginEnabled and tenantRequired from
actual runtime configuration. It creates neither a profile nor a session.
Trusted internal operations require the configured bearer secret and tenant boundary:

| Method | Resource | Request / result |
| --- | --- | --- |
| POST | /internal/identity/:id/link | userId and initial roles; links verified identity |
| POST | /internal/users/role-lookups | userIds, at most500 unique IDs; every requested ID has an explicit result |
| GET | /internal/user/:id/roles | authoritative membership and strong ETag |
| PUT | /internal/user/:id/roles | roles and mandatory If-Match; empty list clears memberships |
| DELETE | /internal/user/:id/sessions | revoke refresh sessions |

Role updates reject missing428, malformed400 and stale412 preconditions. The SDK
exposes getUserRoles, lookupUserRoles and updateUserRoles(userId, roles, etag).
Access JWTs carry signed roles. Changed membership or revoked refresh sessions affect
future refreshes; already-issued access JWTs remain valid until expiry. There is no
immediate per-request JWT revocation promise. Each tenant/user owns one normalized
role membership and independent concurrency token. Provider identities reference
that user; they never store roles. Linking another provider preserves membership
and its ETag. A role replacement returns the updated user membership, without an
identity-row update count.

Tooling uses Node26.13.1 and TypeScript6.0.3 (the newest compatible with the current
lint toolchain). Servers use SDK11.0.100/.NET11.0.0; NativeAOT is the application
image default. Image publication requires clean committed source and matching clean
image revision labels for both the application and migration image. Building a dirty
working tree is allowed for local verification but cannot publish it as a release.
