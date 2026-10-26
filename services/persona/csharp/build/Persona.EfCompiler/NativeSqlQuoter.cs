using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore.Query.SqlExpressions;
using static System.Linq.Expressions.Expression;

namespace Persona.Build.Ef;

// Upstream QuoteTypeMapping looks up CLR/store types, which loses property
// converters. Quote the original SQL metadata and reuse the compiled property's
// mapping instead. Constructor layouts are pinned to the EF revision in README.
[Experimental("EF9100")]
internal sealed class NativeSqlQuoter(IModel model)
{
    private readonly Dictionary<RelationalTypeMapping, IProperty> _properties = Properties(model);

    private static Dictionary<RelationalTypeMapping, IProperty> Properties(IModel source)
    {
        var properties = new Dictionary<RelationalTypeMapping, IProperty>(ReferenceEqualityComparer.Instance);
        foreach (var property in source.GetEntityTypes().SelectMany(entity => entity.GetProperties()))
            properties.TryAdd(property.GetRelationalTypeMapping(), property);
        return properties;
    }

    public Expression QuoteMapping(RelationalTypeMapping? mapping)
    {
        if (mapping is null || !_properties.TryGetValue(mapping, out var property))
            return RelationalExpressionQuotingUtilities.QuoteTypeMapping(mapping);
        var runtimeModel = Property(Parameter(typeof(IRelationalModel), "relationalModel"), nameof(IRelationalModel.Model));
        var entity = Call(runtimeModel, typeof(IReadOnlyModel).GetMethod(nameof(IReadOnlyModel.FindEntityType), [typeof(string)])!,
            Constant(property.DeclaringType.Name));
        var runtimeProperty = Call(entity, typeof(IReadOnlyTypeBase).GetMethod(nameof(IReadOnlyTypeBase.FindProperty), [typeof(string)])!,
            Constant(property.Name));
        return Call(typeof(Microsoft.EntityFrameworkCore.RelationalPropertyExtensions), nameof(Microsoft.EntityFrameworkCore.RelationalPropertyExtensions.GetRelationalTypeMapping), [], runtimeProperty);
    }

    private Expression Q(IRelationalQuotableExpression? source, Type type)
        => source is null ? Constant(null, type) : Quote(source);
    private Expression Array<T>(IEnumerable<T> values) where T : IRelationalQuotableExpression
        => NewArrayInit(typeof(T), values.Select(value => Quote(value)));

    public Expression Quote(IRelationalQuotableExpression source)
    {
        if (source is SqlConstantExpression constant)
            return New(typeof(SqlConstantExpression).GetConstructor([typeof(object), typeof(Type), typeof(bool), typeof(RelationalTypeMapping)])!,
                Constant(constant.Value, typeof(object)), Constant(constant.Type), Constant(constant.IsSensitive), QuoteMapping(constant.TypeMapping));
        if (source is SqlParameterExpression parameter)
            return New(typeof(SqlParameterExpression).GetConstructor(
                    [typeof(string), typeof(string), typeof(Type), typeof(bool), typeof(ParameterTranslationMode?), typeof(RelationalTypeMapping)])!,
                Constant(parameter.InvariantName), Constant(parameter.Name), Constant(parameter.Type), Constant(parameter.IsNullable),
                Constant(parameter.TranslationMode, typeof(ParameterTranslationMode?)), QuoteMapping(parameter.TypeMapping));
        if (source is TableExpression { Table: IView } view)
            return New(typeof(TableExpression).GetConstructor([typeof(string), typeof(ITableBase), typeof(IReadOnlyDictionary<string, IAnnotation>)])!,
                Constant(view.Alias, typeof(string)),
                Call(Parameter(typeof(IRelationalModel), "relationalModel"), typeof(IRelationalModel).GetMethod(nameof(IRelationalModel.FindView), [typeof(string), typeof(string)])!,
                    Constant(view.Table.Name), Constant(view.Table.Schema, typeof(string))),
                RelationalExpressionQuotingUtilities.QuoteAnnotations(view.GetAnnotations().ToDictionary(annotation => annotation.Name)));

        var quote = (NewExpression)source.Quote();
        var arguments = quote.Arguments.ToArray();
        void Set(int index, IRelationalQuotableExpression? child, Type type) => arguments[index] = Q(child, type);
        switch (source)
        {
            case SelectExpression select:
                arguments[1] = Array(select.Tables);
                Set(2, select.Predicate, typeof(SqlExpression));
                arguments[3] = Array(select.GroupBy);
                Set(4, select.Having, typeof(SqlExpression));
                arguments[5] = Array(select.Projection);
                arguments[7] = Array(select.Orderings);
                Set(8, select.Offset, typeof(SqlExpression));
                Set(9, select.Limit, typeof(SqlExpression));
                break;
            case UpdateExpression update:
                Set(0, update.Table, typeof(TableExpression)); Set(1, update.SelectExpression, typeof(SelectExpression));
                arguments[2] = NewArrayInit(typeof(ColumnValueSetter), update.ColumnValueSetters.Select(setter =>
                    New(typeof(ColumnValueSetter).GetConstructor([typeof(ColumnExpression), typeof(SqlExpression)])!, Quote(setter.Column), Quote(setter.Value))));
                break;
            case DeleteExpression delete:
                Set(0, delete.Table, typeof(TableExpression)); Set(1, delete.SelectExpression, typeof(SelectExpression)); break;
            case ProjectionExpression projection: Set(0, projection.Expression, typeof(SqlExpression)); break;
            case OrderingExpression ordering: Set(0, ordering.Expression, typeof(SqlExpression)); break;
            case SqlBinaryExpression binary: Set(1, binary.Left, typeof(SqlExpression)); Set(2, binary.Right, typeof(SqlExpression)); break;
            case SqlUnaryExpression unary: Set(1, unary.Operand, typeof(SqlExpression)); break;
            case SqlFunctionExpression function:
                Set(0, function.Instance, typeof(SqlExpression));
                if (function.Arguments is not null) arguments[3] = Array(function.Arguments);
                break;
            case CaseExpression @case:
                var index = @case.Operand is null ? 0 : 1;
                if (@case.Operand is not null) Set(0, @case.Operand, typeof(SqlExpression));
                arguments[index] = NewArrayInit(typeof(CaseWhenClause), @case.WhenClauses.Select(clause =>
                    New(typeof(CaseWhenClause).GetConstructor([typeof(SqlExpression), typeof(SqlExpression)])!, Quote(clause.Test), Quote(clause.Result))));
                Set(index + 1, @case.ElseResult, typeof(SqlExpression));
                break;
            case InExpression @in:
                Set(0, @in.Item, typeof(SqlExpression));
                arguments[1] = @in.Subquery is not null ? Quote(@in.Subquery)
                    : @in.Values is not null ? Array(@in.Values) : Quote(@in.ValuesParameter!);
                break;
            case LikeExpression like:
                Set(0, like.Match, typeof(SqlExpression)); Set(1, like.Pattern, typeof(SqlExpression)); Set(2, like.EscapeChar, typeof(SqlExpression)); break;
            case ExistsExpression exists: Set(0, exists.Subquery, typeof(SelectExpression)); break;
            case ScalarSubqueryExpression scalar: Set(0, scalar.Subquery, typeof(SelectExpression)); break;
            case PredicateJoinExpressionBase join:
                Set(0, join.Table, typeof(TableExpressionBase)); Set(1, join.JoinPredicate, typeof(SqlExpression)); break;
            case JoinExpressionBase join: Set(0, join.Table, typeof(TableExpressionBase)); break;
            case SetOperationBase operation:
                Set(1, operation.Source1, typeof(SelectExpression)); Set(2, operation.Source2, typeof(SelectExpression)); break;
            case RowValueExpression row: arguments[0] = Array(row.Values); break;
            case ValuesExpression values:
                if (values.RowValues is not null) arguments[1] = Array(values.RowValues);
                Set(2, values.ValuesParameter, typeof(SqlParameterExpression)); break;
            case DistinctExpression distinct: Set(0, distinct.Operand, typeof(SqlExpression)); break;
            case CollateExpression collate: Set(0, collate.Operand, typeof(SqlExpression)); break;
            case SqlParameterExpression or ColumnExpression or TableExpression or SqlFragmentExpression: break;
            default: throw new NotSupportedException($"Native SQL quoting is not implemented for {source.GetType().Name}");
        }
        if (source is SqlExpression sql)
        {
            var parameters = quote.Constructor!.GetParameters();
            for (var index = 0; index < parameters.Length; index++)
                if (parameters[index].ParameterType == typeof(RelationalTypeMapping)) arguments[index] = QuoteMapping(sql.TypeMapping);
        }
        return quote.Update(arguments);
    }
}
