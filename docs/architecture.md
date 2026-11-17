# Persona canonical architecture

17 November 2026. Parent-owned implementation and review; no delegated agents.

```text
Persona.Server (composition root)
  +-- AdapterRuntime: environment/settings/logging
  +-- AdapterSqlite: EF persistence + transactions
  +-- AdapterAuth: JWT, Google implementation, development credentials
  +-- AdapterHttp: routes, JSON, cookies, CORS, tenant selection
        |
        v
      Domain: authentication use cases and function-delegate ports
        |
        v
      Kernel: Result, clock, technical encoding, transaction port

Contracts: outward HTTP DTOs and generated JSON serialization
Knex: sole schema owner; EF mapping generated from fresh schema metadata
```

HTTP references Domain, Contracts and Kernel only. It receives OAuthProvider,
PasswordVerifier and scoped RequestPorts. It neither opens a database nor selects
provider/token/persistence implementations. Domain imports only Kernel. SQL cannot
import networking/HTTP/auth/runtime adapters. Architecture tests reject each
forbidden direction, not just verify the current graph.

## Canonical data

- user: primary key(tenant_id,id); role_version; creation/update timestamps.
- user_role: primary key(tenant_id,user_id,role); composite foreign key to user.
- identity: one provider identity; optional composite tenant/user link; no roles
  column. Unique tenant/provider/provider_user_id and tenant-bound identity key.
- session: identity/tenant composite foreign key; unique token hash; bounded
  revoked state; expiry/identity/tenant query indexes.

A user ID has 3–20 ASCII letters/digits/underscore/hyphen. Role identifiers are
unique per user and bounded/validated. Stored OAuth metadata remains genuine JSON;
role membership is relational data. Database constraints reject orphan memberships,
cross-tenant sessions, duplicate roles/providers/tokens, malformed metadata and
invalid membership versions. User deletion is restricted while identities refer
to it; session deletion cascades from its identity. Canonical 00 initial Knex schema
is used only on fresh verification stores. Existing running data is untouched.

## Roles and identity linking

Initial trusted identity linkage creates the tenant/user membership atomically.
Subsequent provider links reference that same user and cannot supply replacement
roles. Link replay neither restores removed roles nor changes the membership ETag.
Role replacement uses an immediate local write transaction, requires the strong
current If-Match, replaces normalized rows, and changes role_version atomically.
No identity-row update fanout or CSV reconciliation remains.

Bulk lookups validate at most 500 distinct users and use two SQL reads inside one
read snapshot: users/versions and role rows. They do not issue one query per user.
The result includes missing users explicitly. Empty roles remain a valid existing
membership. JWT delivery reads the same canonical roles. Already-issued signed
JWTs remain valid until expiry; new login/refresh sees current membership.

## API

| Method | Resource | Meaning |
| --- | --- | --- |
| GET | /health | Readiness |
| GET | /auth/config | Enabled providers and tenant-selection requirement |
| POST | /auth/login | Development credential login; disabled in production |
| GET | /auth/google | Start configured Google OAuth |
| GET | /auth/google/callback | Validate callback and establish session |
| POST | /token/refresh | Refresh signed access JWT from valid refresh session |
| POST | /logout | Clear configured cookies and revoke the selected session |
| POST | /internal/identity/:id/link | Trusted tenant-bound user linkage; initial roles only |
| GET | /internal/user/:id/roles | One membership and strong ETag |
| PUT | /internal/user/:id/roles | Replace roles with mandatory strong If-Match |
| POST | /internal/users/role-lookups | Bounded tenant membership lookup |
| DELETE | /internal/user/:id/sessions | Revoke linked identities' refresh sessions |

The role PUT response is success plus the current user membership. The obsolete
identity-row updatedCount is removed from server and SDK together; no alternate
response/parser exists. Missing/malformed/stale preconditions remain 428/400/412.
Domain owns refresh/logout sequencing. Storage failures are not invalid credentials or successful logout; expired and revoked sessions cannot be extended by a delayed refresh.
Malformed JSON is 400; oversized input is 413. Internal credentials use constant-time
comparison. Cancellation propagates to persistence/commit; rollback cleanup does
not use an already-cancelled token. Cookie operations use exactly the configured
scope, without historical-cookie migration behavior.

## Verification and release

Verify generated EF/schema parity, dependency-negative tests, database constraint
failures, multi-provider membership, ETag concurrency, cancellation, OAuth security,
SDK tests, managed internal execution, NativeAOT HTTP/internal execution and actual
Docker images/lifecycle. Runtime images contain no Node or CLR runtime. Tests/builds
run in verified finite memory/swap/task cgroups. There is one serving architecture.
No commit/push, registry publication, PR or deployment is performed by this task.
