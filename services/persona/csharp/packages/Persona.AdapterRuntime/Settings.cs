namespace Persona.AdapterRuntime;

public sealed record Settings(string Host, int Port, string PublicUrl, string DatabasePath,
    string JwtSecret, string InternalSecret, string AccessExpiry, string RefreshExpiry,
    string? CookieDomain, string TenantMode, string[] Tenants, string[] CorsOrigins,
    string? DevUsers, string? RuntimeEnvironment, string? GoogleClientId, string? GoogleClientSecret, string? GoogleRedirectUri)
{
    public bool Production => RuntimeEnvironment == "production";
    public static Settings Read()
    {
        var mode = Required("PERSONA_TENANT_MODE");
        var tenants = Required("PERSONA_TENANTS").Split(',').Select(value => value.Trim()).Where(value => value.Length > 0).ToArray();
        if (mode is not ("single" or "multi")) throw new ArgumentException("PERSONA_TENANT_MODE must be single or multi");
        if (tenants.Length < 1 || mode == "single" && tenants.Length != 1) throw new ArgumentException("Invalid PERSONA_TENANTS for tenant mode");
        var google = Environment.GetEnvironmentVariable("PERSONA_GOOGLE_CLIENT_ID");
        return new Settings(Required("PERSONA_SERVER_HOST"), Number("PERSONA_SERVER_PORT", 5005),
            Required("PERSONA_SERVER_PUBLIC_URL"), Path.GetFullPath(Path.Combine(Required("PERSONA_DATA_DIR"), "persona.db")),
            Required("PERSONA_JWT_SECRET"), Required("PERSONA_INTERNAL_SECRET"), Optional("PERSONA_ACCESS_TOKEN_EXPIRY", "15m"),
            Optional("PERSONA_REFRESH_TOKEN_EXPIRY", "7d"), Environment.GetEnvironmentVariable("PERSONA_COOKIE_DOMAIN"),
            mode, tenants, Optional("PERSONA_CORS_ORIGINS", "").Split(',').Select(value => value.Trim()).Where(value => value.Length > 0).ToArray(),
            Environment.GetEnvironmentVariable("PERSONA_DEV_USERS"), Environment.GetEnvironmentVariable("NODE_ENV"),
            string.IsNullOrEmpty(google) ? null : google,
            string.IsNullOrEmpty(google) ? null : Required("PERSONA_GOOGLE_CLIENT_SECRET"),
            string.IsNullOrEmpty(google) ? null : Required("PERSONA_GOOGLE_REDIRECT_URI"));
    }
    public static string Required(string name) => Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
        ? value : throw new ArgumentException("Required environment variable " + name + " is not set");
    public static string Optional(string name, string value) => Environment.GetEnvironmentVariable(name) is { Length: > 0 } text ? text : value;
    public static int Number(string name, int fallback) => int.TryParse(Optional(name,
        fallback.ToString(System.Globalization.CultureInfo.InvariantCulture)), out var value) && value > 0 && value <= 65535
            ? value : throw new ArgumentException("Invalid " + name);
}
