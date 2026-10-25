using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore.Query.Internal;

namespace Persona.Build.Ef;

[Experimental("EF9100")]
[SuppressMessage("Usage", "EF1001", Justification = "Pinned build-only query-parameter metadata; native filtering tests exercise generated value extraction.")]
public static class CapturedValues
{
    public static bool TryMemberPath(Expression expression, out string? name, out object? value)
    {
        var members = new Stack<MemberInfo>();
        Expression? current = expression;
        while (current is MemberExpression member)
        {
            members.Push(member.Member);
            current = member.Expression;
        }
        if (current is not ConstantExpression || members.Count == 0
            || members.Peek() is not IParameterNullabilityInfo)
        {
            name = null;
            value = null;
            return false;
        }
        name = string.Join('_', members.Select(member => member.Name));
        value = ParameterValues.Placeholder(expression.Type);
        return true;
    }

}
