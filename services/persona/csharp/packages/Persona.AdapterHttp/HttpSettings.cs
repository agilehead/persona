namespace Persona.AdapterHttp;
public sealed record HttpSettings(string Host, int Port, string PublicUrl, string InternalSecret,
    string? CookieDomain, string? AccessCookieDomain, string TenantMode, string[] Tenants,
    string[] CorsOrigins, bool Production);
public sealed record RequestPorts(Persona.Domain.Identities.IdentityStore Identities,
    Persona.Domain.Identities.RoleStore Roles, Persona.Domain.Authentication.TokenService Tokens);
