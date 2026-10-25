using System.Runtime.CompilerServices;

namespace Persona.Build.Ef;

public static class ParameterValues
{
    public static object? Placeholder(Type type)
    {
        if (Nullable.GetUnderlyingType(type) is not null) return null;
        if (type == typeof(string)) return "<dummy>";
        if (type.IsArray) return Array.CreateInstance(type.GetElementType()!, new int[type.GetArrayRank()]);
        if (type.IsInterface || type.IsAbstract)
        {
            // The SQL generator needs the declared collection carrier, even though
            // a captured runtime value is unavailable during native publication.
            var sequence = type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IEnumerable<>)
                ? type : type.GetInterfaces().FirstOrDefault(candidate => candidate.IsGenericType
                    && candidate.GetGenericTypeDefinition() == typeof(IEnumerable<>));
            if (sequence is not null)
            {
                var array = Array.CreateInstance(sequence.GetGenericArguments()[0], 0);
                if (type.IsInstanceOfType(array)) return array;
            }
            return null;
        }
        return RuntimeHelpers.GetUninitializedObject(type);
    }
}
