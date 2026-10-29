using System.Diagnostics.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Editing;
using Microsoft.EntityFrameworkCore.Query.Internal;
using Microsoft.EntityFrameworkCore.Query.SqlExpressions;
using Microsoft.EntityFrameworkCore.Query;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using System.Runtime.CompilerServices;

namespace Persona.Build.Ef;

[Experimental("EF9100")]
[SuppressMessage("Usage", "EF1001", Justification = "Version-pinned build-time expression emitter; native sealed-entity migration tests verify its generated queries.")]
public sealed class NativeModelTranslator(SyntaxGenerator generator, IModel model, NativeQueryMappings mappings) : RuntimeModelLinqToCSharpSyntaxTranslator(generator)
{
    private readonly NativeSqlQuoter _quoter = new(model);
    private string? _commandText;
    private NewExpression? _initializedConstructor;

    protected override Expression VisitMemberInit(MemberInitExpression initializer)
    {
        // A complete initializer satisfies C# required members. Upstream instead
        // emits an unsafe constructor invocation, then expects it to be a new
        // expression when adding the initializer. Retain normal construction
        // for public constructors whose required members are all assigned here.
        var previous = _initializedConstructor;
        var assigned = initializer.Bindings.OfType<MemberAssignment>()
            .Select(binding => binding.Member).ToHashSet();
        _initializedConstructor = initializer.NewExpression.Constructor is { IsPublic: true }
            && RequiredMembers(initializer.Type).All(assigned.Contains)
            ? initializer.NewExpression : null;
        try { return base.VisitMemberInit(initializer); }
        finally { _initializedConstructor = previous; }
    }

    private static IEnumerable<MemberInfo> RequiredMembers(Type type)
    {
        for (Type? current = type; current is not null; current = current.BaseType)
            foreach (var member in current.GetMembers(BindingFlags.Instance | BindingFlags.Public
                | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                if (member.IsDefined(typeof(RequiredMemberAttribute), inherit: false)) yield return member;
    }


    protected override ExpressionSyntax GenerateUnknownValue(object value)
        => value is IRelationalQuotableExpression quotable
            ? (ExpressionSyntax)Translate(_quoter.Quote(value is Expression expression
                ? (IRelationalQuotableExpression)new ConstantQuoting().Visit(expression) : quotable))
            : base.GenerateUnknownValue(value);

    protected override Expression VisitNew(NewExpression expression)
    {
        if (expression.Type == typeof(RelationalCommand)
            && expression.Arguments[1] is ConstantExpression { Value: string command })
        {
            var previous = _commandText;
            _commandText = command;
            try { return base.VisitNew(expression); }
            finally { _commandText = previous; }
        }
        if (expression.Type == typeof(Microsoft.EntityFrameworkCore.Storage.Internal.TypeMappedRelationalParameter)
            && _commandText is { } text
            && expression.Arguments[1] is ConstantExpression { Value: string name }
            && mappings.Find(text, name) is { } mapping)
        {
            var arguments = expression.Arguments.ToArray();
            arguments[2] = _quoter.QuoteMapping(mapping);
            expression = expression.Update(arguments);
        }
        var result = base.VisitNew(expression);
        if (ReferenceEquals(expression, _initializedConstructor)
            && Result is InvocationExpressionSyntax invocation)
            Result = SyntaxFactory.ObjectCreationExpression(Generate(expression.Type), invocation.ArgumentList, initializer: null);
        return result;
    }

    // EF can represent SQL NULL with a non-nullable CLR type. Upstream's
    // Constant(Value, Type) then throws while recursively quoting its parent.
    private sealed class ConstantQuoting : ExpressionVisitor
    {
        protected override Expression VisitExtension(Expression expression)
            => expression is SqlConstantExpression constant ? new NativeConstant(constant) : base.VisitExtension(expression);
    }

    private sealed class NativeConstant(SqlConstantExpression source)
        : SqlConstantExpression(source.Value, source.Type, source.IsSensitive, source.TypeMapping)
    {
        public override Expression Quote() => Expression.New(
            typeof(SqlConstantExpression).GetConstructor([typeof(object), typeof(Type), typeof(bool), typeof(RelationalTypeMapping)])!,
            Expression.Constant(Value, typeof(object)), Expression.Constant(Type), Expression.Constant(IsSensitive),
            RelationalExpressionQuotingUtilities.QuoteTypeMapping(TypeMapping));
    }

    protected override Expression VisitMember(MemberExpression member)
    {
        // Compiled models reconstruct mapping converters from their expressions,
        // so their carrier is ValueConverter<TModel,TProvider>. The typed accessor
        // belongs to that base class, not the design-time converter subclass.
        if (member.Member.DeclaringType is { IsGenericType: true } carrier
            && carrier.GetGenericTypeDefinition() == typeof(ValueConverter<,>)
            && member.Expression is UnaryExpression { NodeType: ExpressionType.Convert, Operand: var receiver }
            && receiver.Type == typeof(ValueConverter))
            return base.VisitMember(member.Update(Expression.Convert(receiver, carrier)));
        return base.VisitMember(member);
    }

    protected override Expression VisitConditional(ConditionalExpression conditional)
    {
        if (conditional.Test is TypeBinaryExpression { NodeType: ExpressionType.TypeIs, Expression: ParameterExpression parameter } test
            && parameter.Type.IsSealed && !test.TypeOperand.IsAssignableFrom(parameter.Type))
        {
            if (conditional.IfFalse is DefaultExpression { Type: var type } && type == typeof(void))
            {
                Result = SyntaxFactory.EmptyStatement();
                return conditional;
            }
            return Visit(conditional.IfFalse);
        }
        return base.VisitConditional(conditional);
    }

}
