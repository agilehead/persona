using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore.Storage.Internal;

namespace Persona.Build.Ef;

public interface INativeQueryMappings
{
    NativeQueryMappings Mappings { get; }
}

// Capture the final command's actual parameter metadata before EF quotes it by
// CLR/store type. One source value can legitimately have several SQL mappings.
[SuppressMessage("Usage", "EF1001", Justification = "Version-pinned build-only access to final SQL parameter metadata; native converter and stored-value regressions verify it.")]
public sealed class NativeQueryMappings
{
    private static readonly PropertyInfo Mapping = typeof(TypeMappedRelationalParameter).GetProperty(
        "RelationalTypeMapping", BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new MissingMemberException(typeof(TypeMappedRelationalParameter).FullName, "RelationalTypeMapping");
    private readonly Dictionary<(string Command, string Parameter), RelationalTypeMapping> _parameters = [];

    public void Clear() => _parameters.Clear();
    public RelationalTypeMapping? Find(string command, string parameter) => _parameters.GetValueOrDefault((command, parameter));

    public void Record(IRelationalCommandTemplate command)
    {
        foreach (var parameter in command.Parameters.Cast<TypeMappedRelationalParameter>())
        {
            var mapping = (RelationalTypeMapping)Mapping.GetValue(parameter)!;
            var key = (command.CommandText, parameter.Name);
            if (_parameters.TryGetValue(key, out var previous) && !Equals(previous, mapping))
                throw new InvalidOperationException($"Conflicting SQL mappings for command parameter {parameter.Name}");
            _parameters[key] = mapping;
        }
    }
}
