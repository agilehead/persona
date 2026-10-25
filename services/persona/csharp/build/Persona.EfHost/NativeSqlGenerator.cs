using System.Diagnostics.CodeAnalysis;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore.Query;
using Microsoft.EntityFrameworkCore.Sqlite.Query.Internal;
using Microsoft.EntityFrameworkCore.Storage;
using Persona.Build.Ef;

namespace Persona.EfHost;

[SuppressMessage("Usage", "EF1001", Justification = "Version-pinned build-only SQLite command metadata capture; native converter regressions verify emitted commands.")]
public sealed class NativeSqlGeneratorFactory(QuerySqlGeneratorDependencies dependencies)
    : IQuerySqlGeneratorFactory, INativeQueryMappings
{
    public NativeQueryMappings Mappings { get; } = new();
    public QuerySqlGenerator Create() => new NativeSqlGenerator(dependencies, Mappings);
}

[SuppressMessage("Usage", "EF1001", Justification = "Captures final parameter mappings at their producer, after SQL names are uniquified; absent from runtime dependencies.")]
internal sealed class NativeSqlGenerator(QuerySqlGeneratorDependencies dependencies, NativeQueryMappings mappings)
    : SqliteQuerySqlGenerator(dependencies)
{
    public override IRelationalCommand GetCommand(Expression expression)
    {
        var command = base.GetCommand(expression);
        mappings.Record(command);
        return command;
    }
}
