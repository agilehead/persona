# Persona service

This service runs the C# application in managed .NET or NativeAOT. The repository README describes current workspace commands, configuration and acceptance requirements. Application images default to NativeAOT. The TypeScript client and test tooling and the existing Knex migrations remain.

The service follows Ctlflow's layout: application code in `csharp/`, TypeScript client and test tooling in `node/`, database assets in `database/`, operational configuration in `docker/`, product tooling in `scripts/`, and runtime-independent acceptance in `tests/contracts/`.
