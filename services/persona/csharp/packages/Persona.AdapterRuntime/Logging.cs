using Microsoft.Extensions.Logging;

namespace Persona.AdapterRuntime;

public static class Logging
{
    public static LogLevel Minimum(string? value) => value switch
    {
        "trace" => LogLevel.Trace, "debug" => LogLevel.Debug, "warn" => LogLevel.Warning,
        "error" => LogLevel.Error, "fatal" => LogLevel.Critical, _ => LogLevel.Information
    };
}
