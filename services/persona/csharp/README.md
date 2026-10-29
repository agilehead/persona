# Persona C# backend

The backend uses the same service-owned directory and dependency model as Ctlflow:

```text
services/persona/
  csharp/
    apps/Persona.Server/
    packages/
      Persona.Kernel/
      Persona.Domain/
      Persona.Contracts/
      Persona.AdapterSqlite/
      Persona.AdapterRuntime/
      Persona.AdapterHttp/
      Persona.AdapterAuth/
    build/
      Persona.EfCompiler/
      Persona.EfHost/
      NativeQueries.targets
    scripts/generate-model.mjs
    tests/Persona.ContractProbe/
    Dockerfile
  scripts/
  tests/contracts/
```

The executable delegates startup to the HTTP host. Domain feature modules own immutable records, function-delegate persistence ports, expected failures through `Result<T>`, and cancellation. Adapters implement the ports; EF persistence rows are distinct from domain records. HTTP owns ASP.NET context, identity/tenant extraction and wire validation. The authentication adapter owns token and provider verification. Runtime settings and composition remain outside the domain. Contracts own generated JSON metadata and wire shapes. Multi-store transactions use the shared `IUnitOfWork.Run` contract; no transaction spans an outbound provider call.

## Storage

Session mutations (`POST /auth/login`, `/token/refresh`, `/logout`) validate
Origin before reading the body or changing cookies/sessions. An Origin must
exactly match `PERSONA_CORS_ORIGINS`; opaque, multiple and unlisted origins are
rejected. Cookie requests also require that allowed Origin. Non-browser clients
can send refresh tokens in a JSON body without cookies or browser fetch metadata.
Credentialed CORS alone is not this mutation defense. OAuth GET callbacks retain
their separate state/PKCE validation; trusted internal calls use Bearer auth.

Knex in `services/persona/database/persona/sqlite/migrations/` remains the sole schema owner. Startup requires an existing absolute database path, enables WAL through the SQLite provider, and opens read/write connections with foreign keys and a busy timeout. It never creates tables, migrates, resets or seeds the schema. Runtime persistence uses EF LINQ and precompiled native queries; application code contains no handwritten SQL command text.

`npm run generate:model` creates a disposable Knex database, checks the database `DatabaseSchema` contract against every table, column, nullability and key, and generates persistence rows and the EF mapping under `AdapterSqlite/generated/`. `npm run build` runs that generator with `--check`; drift fails the build. These generated files are source artifacts. The design-time EF compiled model and interceptors are rebuildable `obj/` output and are not tracked.

SQLite strings preserve the Node representations: ISO UTC timestamps with milliseconds, nullable fields and stored JSON and CSV roles, base62 identifiers and SHA-256 refresh-token hashes. Failed writes detach persistence state so a subsequent operation is not contaminated. Transaction failures roll back.

The pinned SQLite provider's `IRelationalDatabaseCreator.Create` implementation configures WAL on its existing connection; table creation is a separate API. The adapter supplies `ReadWrite` mode and requires an existing absolute file. Acceptance verifies WAL and unchanged schema after initialization.

- [Pinned SQLite provider implementation](https://github.com/dotnet/efcore/blob/v11.0.0-rc.2.26504.105/src/EFCore.Sqlite.Core/Storage/Internal/SqliteDatabaseCreator.cs#L40)

## Native publication

The repository pins .NET 11 RC2 and EF 11 RC2 identically to Snapped. The build-only EF compiler is the same name-normalized implementation, including converter metadata, collection parameter and captured-value fixes. It and Roslyn/design-time dependencies do not enter the application image.

`npm run build:native` sequentially publishes the server and contract probe. Native tests require an ELF header and execute that binary; they do not accept a managed substitute. Application compiler/analyzer warnings are errors. Upstream EF/linker/AOT warnings remain visible under the same policy as Snapped; actual execution of all supported queries and provider paths is required in addition to successful publication.

The Dockerfile defaults to the `nativeaot` target and provides a `managed` target. Both use the same pinned base images as Snapped and expose `/app/persona health`; the native image contains neither Node nor the managed .NET runtime. Knex has a separate one-shot Node image built from `services/persona/database/Dockerfile`.

## Verification

Run build, lint, native publication and tests in order from the root. Bound the whole process group, for example on this host:

```bash
systemd-run --user --scope --quiet --expand-environment=no \
  -p MemoryMax=8G -p MemorySwapMax=0 -p TasksMax=1024 \
  env DOTNET_PROCESSOR_COUNT=4 npm test
```

The shared HTTP contracts cover normal and malformed inputs, tenant/security boundaries, wire and storage representations, and complete service operations. The C# probe verifies signed Google responses, claim rejection, PKCE, signing-key rotation and refresh/session behavior. All fixtures live under ignored `.tests/`; schema snapshots prove runtime operations leave Knex ownership intact. Docker acceptance uses the actual `services/persona/docker/development/docker-compose.yml` with test-owned names and data. Production deployment requires separate authorization and backup verification.

## Registry release

`services/persona/scripts/docker-build.sh` defaults to NativeAOT and builds both
the application and its separate Knex migration image. After verification,
`services/persona/scripts/docker-push.sh` publishes both images to GHCR under
the selected tag and the current commit tag. It requires an existing registry
login and checks that both local images exist before publishing either. Snapped
must refresh both images before its production rollout. Publishing does not
restart services or modify databases.
