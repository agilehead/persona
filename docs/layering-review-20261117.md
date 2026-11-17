> Verification snapshot before release approval. The user subsequently authorized PR preparation and publication of the Persona application/migration image pair. Release receipts are recorded separately under /shared/persona/releases/20261117/.

# Persona and BadBets ownership review — 17 November 2026

The authorized Persona corrections and affected BadBets integration are complete.
Codex parent implemented, re-reviewed and verified the changes; no new agents.
No known layering violation remains within the reviewed application/project graph.
Changes remain uncommitted on feat/application-profile-authority (Persona) and
refactor/five-service-architecture (BadBets). No push, PR, registry publication or
deployment occurred. The requested pre-PR stopping point is retained.

## Corrections

| Finding | Canonical correction | Verification |
| --- | --- | --- |
| F9: roles stored/reconciled on provider identities | One tenant/user owns role_version and normalized user_role rows. Identity links reference that owner and have no roles column. | Multi-provider, replay, empty membership, tenant isolation and exact role-set tests pass. |
| F6: HTTP composing concrete adapters | Persona.Server selects configuration, persistence, token and provider implementations. HTTP receives Domain ports and transport-only settings. | Explicit project allowlists and negative source/graph tests reject concrete HTTP composition and forbidden dependencies. |
| Refresh/logout business sequencing in HTTP | Domain now owns refresh/logout. HTTP maps results, cookies and status codes only. | Failure/cancellation probes prove storage failures do not become invalid credentials or false-success logout. |
| Role consistency and concurrency | Strong If-Match uses the canonical membership version. Replacement commits roles/version together in a local immediate transaction. Bulk lookup uses two queries in one read snapshot. | Competing replacements produce one winner and one 412; identity linking cannot grant new roles to an existing user or change its version. No per-user query loop. |
| Weak relational relationships | Composite tenant foreign keys connect roles, users, identities and sessions. Unique keys/indexes and CHECK constraints own validity. | Canonical fresh-schema tests reject orphan/cross-tenant rows, duplicate providers/roles/tokens, malformed metadata and invalid versions; cascade/restrict behavior passes. |
| Changed role-update wire contract | Server, SDK, fixtures and BadBets decoder all use success plus current user membership. The old identity-row count is removed. | SDK cases, negative absence assertion and BadBets administrator role lifecycle pass. No old response parser or fallback. |
| Request/token/session defects found in re-review | Malformed JSON 400; bounded request 413; constant-time internal credentials; invalid lifetime/expiry rejected; exact refresh expiry enforced; extension requires an active unexpired session. | Native HTTP/internal cases cover malformed input, token/signature validation, exact expiry and delayed refresh after revocation/expiry. |
| Historical cookie handling | Issue/delete cookies only at configured scopes. Removed historical-scope cleanup. | Host-only refresh and configured-domain access-cookie tests pass. |
| Stale local Docker images | Both canonical build and acceptance commands use buildx build --load. | Migration inventory rejected the old cached image; corrected real images pass native-only, health, HTTP, repeat migration and strict shutdown checks. |

```text
Persona.Server -- selects concrete adapters
  +-- Runtime: environment/settings/logging
  +-- SQL: local EF queries/transactions
  +-- Auth: JWT, Google, development credential implementations
  +-- HTTP: transport/contracts/cookies
        |
        v
      Domain: use cases + ports
        |
        v
      Kernel: Result, clock, transaction port, encoding

Knex --> canonical initial schema --> generated EF model
Profiles --> Persona HTTP --> canonical tenant/user roles
Other BadBets owners retain separate databases and domain policies
```

User membership is created on trusted application-user linkage, not merely OAuth
identity creation. Additional providers share the same owner. Persona owns roles;
BadBets owns its product profiles, tier entitlements and content policies. No
second role store or permission cache was introduced. Already-issued JWT roles
remain signed snapshots until expiry; new login/refresh sees current membership.
Refresh-session revocation does not promise immediate invalidation of issued JWTs.

## Accepted current-source verification

Durations are measured command/phase wall times, not summed parent work time.
Node tooling uses pinned 26.13.1; application binaries are .NET 11 NativeAOT.

| Check | Accepted result | Measured duration |
| --- | --- | --- |
| Persona source build/lint and managed checks | Build zero warnings/errors;94 HTTP cases;170 internal assertions;11 SDK tests; schema/architecture/publication checks pass |25.739s |
| Final architecture guard/lint |11 projects,62 C# files;4 architecture tests including forbidden source edges pass |5.594s |
| Persona native publication and execution | Native server/probe;94 HTTP cases;170 internal assertions;13 schema/architecture/publication tests;11 SDK tests pass |2m52.858s |
| Persona real Docker images |94 HTTP cases across single/multi/production; migration replay preserves rows/schema; healthy native-only application; strict clean shutdown |3m39.371s |
| BadBets changed native consumers | Profiles and native internal test executable publish successfully |2m44.326s |
| BadBets integration against new Persona |1,411 assertions;107 external routes; zero failures/skips;483 native internal assertions;291 schema assertions;8 lifecycle/architecture tests |38.176s API phase;44.678s command |
| Focused real-browser integration |14/14 login, onboarding, admin, pictures/pins, content/workflow and desktop/mobile cases pass |52.7s browser phase;60.398s command |
| Fresh complete API seed/readback |200 companies;204 studies;30 human profiles;18 human pictures;12 robot pictures; sample notebook delivery passes |37.724s seed;4.172s readback |
| Repeat API refresh/readback | No new duplicate social fixtures; published studies remain 204; readback passes |9.081s refresh;4.044s readback |

The previous full 169-case BadBets browser coverage remains historical evidence;
this Persona follow-up ran the 14 affected browser cases rather than claiming a
new full 169-case run. Shared contract cases run against real local native servers.
Google cryptographic/provider behavior uses controlled signed fixtures; this is
not a claim that production Google credentials or a deployed OAuth flow were tested.

## Review/testing corrections and limits

Verification first caught the BadBets decoder requiring the removed count field;
the consumer was replaced directly and native/integrated tests rerun. A seed
verification helper initially omitted its canonical decoder bundle and stopped
before starting the fixture graph; that helper was corrected. A direct transient
launcher selected an older Node binary despite its child PATH setting; the final
BadBets integration/browser/seed commands use the absolute pinned Node executable.
Failed/intermediate commands are retained privately and are not accepted receipts.

EF upstream AOT/trimming warnings remain visible. Supported fixed queries pass
actual native execution; this is not a guarantee for arbitrary runtime EF models.
The initial schema replacement was exercised only on disposable fresh stores.
Existing databases, credentials, source and running previews were preserved; no
prototype converter, compatibility reader or running-data reset was added.

All review fixtures were cleaned up. The owned bounded BuildKit builder is stopped;
Docker remains active. No new daemon/storage-layout change or automatic backup.
Existing public/admin previews remain available on 5182/5183 and were not redeployed
against the new Persona schema. Their preserved data is not fresh-schema evidence.

- [Architecture and complete Persona API list](/shared/persona/layering-normalization-20261117/architecture.md)
- [Existing public preview](http://192.168.9.90:5182/)
- [Existing admin preview](http://192.168.9.90:5183/)
