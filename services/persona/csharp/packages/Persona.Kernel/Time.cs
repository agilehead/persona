using System.Globalization;

namespace Persona.Kernel;

public readonly record struct Unit;

public sealed record Clock(Func<DateTimeOffset> UtcNow)
{
    public string IsoNow() => Time.Iso(UtcNow());
}

public static class Time
{
    public static string Iso(DateTimeOffset value) => value.UtcDateTime.ToString(
        "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    public static Result<DateTimeOffset> Parse(string value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)
            ? Result<DateTimeOffset>.Success(parsed)
            : Result<DateTimeOffset>.Failed("invalid", "Invalid timestamp");
}
