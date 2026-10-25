using Persona.AdapterSqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Query;

namespace Persona.EfHost;

public sealed class PersonaDbContextFactory : IDesignTimeDbContextFactory<PersonaDbContext>
{
    public PersonaDbContext CreateDbContext(string[] arguments) => new(
        new DbContextOptionsBuilder<PersonaDbContext>().UseSqlite("Data Source=:memory:")
            .ReplaceService<IRelationalParameterBasedSqlProcessorFactory, PrecompiledSqlParameterFactory>()
            .ReplaceService<IQuerySqlGeneratorFactory, NativeSqlGeneratorFactory>().Options);
}
