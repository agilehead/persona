# Coding Standards

Persona uses functional modules and immutable records. Domain features own
business rules and function-delegate storage ports. Adapters implement those
ports; use classes where the framework requires them. Expected failures use
`Result<T>`, and asynchronous storage operations carry cancellation tokens.
Use a unit of work for changes that must be atomic.

## Database

The C# application queries SQLite through EF LINQ. Generated persistence rows
are separate from domain records; the database contract and existing Knex
schema lives under `services/persona/database/persona/sqlite/`. The model
generator checks that contract against a freshly migrated disposable database.
Knex owns schema changes. Before deployment, maintain one canonical00 initial
schema and use fresh disposable test databases. Preserve running databases and
configuration; do not reset or import prototype state. Actual production changes
require verified backups and forward migrations. Never write handwritten SQL in the application.

Tables use singular lowercase names; columns use snake_case. Validate values at
the system boundary and keep business authorization in the owning domain.

The executable owns composition. HTTP accepts domain ports and its own transport
settings; it cannot import auth, runtime or SQL implementations. Domain imports
only Kernel; wire contracts never flow inward. Identity rows reference one
tenant/user owner. Roles exist only in normalized user_role rows, with one
independent membership version on user. Never copy roles onto provider identities.
Enforce these boundaries with negative project/source graph tests.

## HTTP and authentication

The HTTP adapter owns request parsing, tenant selection and transport. The auth
adapter owns token and provider verification. Validate OAuth return URLs against
configured origins and require the internal secret for service-to-service calls.
Do not disclose credentials, tokens or sensitive values in logs or errors.

## TypeScript clients and tooling

Use strict TypeScript without `any`, named exports and explicit `.js` extensions
for relative ESM imports. Prefer functions and immutable data. Validate external
input, return results for expected failures, and use async/await. Follow the
compiler and lint configuration without disabling checks. Use structured logs
where logging is required.

## Verification

Run build, lint and tests in that order. Exercise managed compilation for internal
verification and actual NativeAOT application execution locally and in Docker,
including storage, HTTP, SDK and migration acceptance. Application serving and
container images are NativeAOT only; do not add a managed serving selector.
Tests use isolated disposable databases; do not reset production
or weaken assertions to make a gate pass. Review the complete change, generated
artifacts, contracts and configuration before preparing a PR.
