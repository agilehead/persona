using Persona.AdapterSqlite.Entities;
using Persona.Kernel;

namespace Persona.AdapterSqlite;

public sealed record UnitOfWork(PersonaDbContext Database) : IUnitOfWork
{
    public Task<Result<T>> Run<T>(Func<CancellationToken, Task<Result<T>>> operation, CancellationToken cancellation) =>
        Storage.Transaction(Database, () => operation(cancellation), cancellation);
}
