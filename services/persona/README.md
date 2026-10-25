# Persona service

This service owns the shared product and its explicitly selected Node and C# implementations. The repository README describes current workspace commands, configuration and acceptance requirements. C# defaults to NativeAOT for application images; Node retains its existing implementation for comparison. Knex owns the existing schema.

The service follows Ctlflow's layout: shared frontends in `apps/`, implementation code in `node/` and `csharp/`, shared SQL assets in `database/`, operational configuration in `docker/`, product tooling in `scripts/` and runtime-independent acceptance in `tests/contracts/`. Directories exist only for implemented capabilities. No schema or production data changes accompany the source moves.
