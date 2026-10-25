# Persona

Persona provides tenant-scoped identities, Google OpenID Connect authorization with PKCE, signed access tokens, sliding refresh sessions, development password login, and authenticated identity linking, role updates and session revocation.

Development login is fail-closed: production and unrecognized `NODE_ENV` values disable it. Google validates HTTPS discovery, issuer, audience, signature, expiration, nonce, authorized party and token-response hashes. Signing-key rotation refreshes discovery synchronously. Secrets and provider tokens are never included in error responses.

The multi-tenant Google callback recovers its tenant from the OAuth cookie; it does not require the initial request's `tenant` query parameter. Single mode rejects explicit tenant parameters; multi mode requires a configured tenant on initiating and internal requests. Refresh keeps the existing token and advances its expiry, matching the existing service.

The application server uses C# and NativeAOT, following Snapped's architecture. Node remains for the comparison server, TypeScript client SDK, build/test tools and the existing one-shot Knex migration runner. Runtime application images contain no Node.

Copy `.env.example` to `.env` and configure it. The C# server loads an existing SQLite database; run the existing migrations explicitly against the intended environment before starting. Never reset production data. A verified backup is required before production data changes. This migration does not change the Knex history, tables, columns or stored representations.

Use Node from `.nvmrc`, the SDK pinned in `global.json`, and Linux NativeAOT prerequisites (GCC, G++, zlib development headers). From the repository root:

```bash
npm ci
npm run build
npm run lint
npm run build:native
npm test
npm run test:integration
```

`npm start` starts managed C# and reads `.env`. `npm run start:nativeaot` starts the published ELF executable; `npm run start:node` explicitly selects the comparison server. Missing artifacts fail rather than changing runtimes.

`npm test` runs the client SDK tests, retained Node suites and identical HTTP contracts against Node, managed C# and actual NativeAOT, with isolated Knex-created fixtures. The C# storage/service/security probes run both managed and native. Node-internal tests remain Node tests even when the HTTP server is C#.

`npm run test:integration` builds and runs the actual Compose services in Node comparison, managed and NativeAOT images, including the unchanged Knex runner, shared HTTP contracts, image health, absence of Node from C# images, schema preservation and clean shutdown. It owns unique Compose projects and disposable data; it never kills unrelated processes. Select one variant with `PERSONA_DOTNET_CONTAINER_TARGET=managed` or `nativeaot`.

`./services/persona/scripts/docker-build.sh <tag>` builds the Knex image and defaults the application image to NativeAOT. Set `PERSONA_DOTNET_CONTAINER_TARGET=managed` for the managed image. Building and testing do not publish images or deploy anything.

- [C# architecture and verification](services/persona/csharp/README.md)
- [Environment settings](.env.example)
- [Coding standards](CODING-STANDARDS.md)

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

Application and migration commands use the workspace `.env` and resolve relative data directories from the repository root. Absolute data paths are used unchanged. Knex migration files and stored migration history remain unchanged.
