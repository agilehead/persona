# Persona policies

Persona is completely greenfield. WCBUBWHB means "What Can Be, Unburdened By
What Has Been." Keep one canonical architecture, API and storage representation.
No backward compatibility, aliases, shims, hidden fallbacks, dual paths or
version-dispatched implementations are allowed, including temporary ones.
Replace incorrect owners directly and update owned contracts, clients, fixtures,
tests and documentation together. External applications must adopt the current
contract; their update schedules do not justify preserving a superseded API.
The user owns Snapped's subsequent integration update.

Persona owns provider identities, authentication sessions and tenant-scoped human
roles. Applications own their domain profiles. Do not duplicate these authorities
in consuming applications. Role replacement requires the current strong ETag;
signed JWT role claims remain valid until token expiry. Do not promise immediate
revocation of already issued access tokens.

Application serving is .NET11 NativeAOT only. Node26 is for tooling, the SDK,
Knex and tests; TypeScript6.0.3 is the explicit latest-compatible pin. Managed
compilation supports generation and internal verification, not a second serving
target. Follow CODING-STANDARDS.md for the implementation and verification sequence.

Preserve credentials, local data and shared source. Never commit or push to main,
publish images without authorization or track .analysis directories at any depth.
Build/test work must use a verified finite cgroup memory, swap and task scope.

Layering is enforced by scripts/service-boundaries.mjs and negative fixtures.
Persona.Server alone selects concrete adapters. HTTP consumes Domain/Contracts/
Kernel and its own transport settings, never AdapterAuth/AdapterRuntime/AdapterSqlite.
Domain imports Kernel only. Provider ports belong to Domain; concrete credentials,
JWT/provider implementations and environment parsing belong to outer adapters.

Roles have one tenant/user owner and normalized user_role rows. Provider identities
never store role membership. A role update changes one membership version; adding
or replaying an identity link cannot change that version or restore revoked roles.
Before deployment maintain the canonical00 initial schema and use fresh fixture
stores for verification; preserve running data/configuration. No prototype import
or compatibility reader/migration is permitted.
