using System.Diagnostics.CodeAnalysis;
using System.Linq.Expressions;
using Persona.Build.Ef;
using Microsoft.EntityFrameworkCore.Query;
using Microsoft.EntityFrameworkCore.Query.SqlExpressions;
using Microsoft.EntityFrameworkCore.Sqlite.Query.Internal;

namespace Persona.EfHost;

// EF's pinned SQL pregenerator creates new object() for interface parameters.
// Its collection SQL processor then casts that dummy to IEnumerable. Preserve
// the declared collection metadata and supply a typed empty build-time value.
// This service exists only in the design-time host, never application runtime.
[SuppressMessage("Usage", "EF1001", Justification = "Version-pinned build-only SQL placeholder correction; actual native repository suites verify generated collection queries.")]
public sealed class PrecompiledSqlParameterFactory(RelationalParameterBasedSqlProcessorDependencies dependencies)
    : IRelationalParameterBasedSqlProcessorFactory
{
    public RelationalParameterBasedSqlProcessor Create(RelationalParameterBasedSqlProcessorParameters parameters)
        => new PrecompiledSqlParameters(dependencies, parameters);
}

[SuppressMessage("Usage", "EF1001", Justification = "Version-pinned build-only SQL placeholder correction; runtime values and query metadata are unchanged.")]
internal sealed class PrecompiledSqlParameters(RelationalParameterBasedSqlProcessorDependencies dependencies,
    RelationalParameterBasedSqlProcessorParameters options) : SqliteParameterBasedSqlProcessor(dependencies, options)
{
    public override Expression Process(Expression queryExpression, Dictionary<string, object?> parameters, out bool canCache)
    {
        new CollectionValues(parameters).Visit(queryExpression);
        return base.Process(queryExpression, parameters, out canCache);
    }

    private sealed class CollectionValues(Dictionary<string, object?> parameters) : ExpressionVisitor
    {
        protected override Expression VisitExtension(Expression expression)
        {
            if (expression is InExpression { ValuesParameter: { } values }) Prepare(values);
            if (expression is ValuesExpression { ValuesParameter: { } rows }) Prepare(rows);
            return base.VisitExtension(expression);
        }

        private void Prepare(SqlParameterExpression parameter)
        {
            if (parameters.TryGetValue(parameter.Name, out var value) && value?.GetType() == typeof(object))
            {
                var placeholder = ParameterValues.Placeholder(parameter.Type);
                if (placeholder is not System.Collections.IEnumerable)
                    throw new InvalidOperationException($"No typed build-time collection value for {parameter.Type}");
                parameters[parameter.Name] = placeholder;
            }
        }
    }
}
