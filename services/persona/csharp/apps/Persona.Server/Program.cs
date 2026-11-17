using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Persona.AdapterAuth;
using Persona.AdapterHttp;
using Persona.AdapterRuntime;
using Persona.AdapterSqlite;
using Persona.Domain.Authentication;
using Persona.Kernel;

if (args.SequenceEqual(["health"]))
{
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
    try { return (await client.GetAsync("http://127.0.0.1:" + Settings.Number("PERSONA_SERVER_PORT", 5005) + "/health")).IsSuccessStatusCode ? 0 : 1; }
    catch (HttpRequestException) { return 1; }
}
var settings = Settings.Read();
var development = DevUsers.Resolve(settings.DevUsers, settings.RuntimeEnvironment);
var password = development is null ? null : new PasswordVerifier((user, value) => DevUsers.Verify(development, user, value));
using var googleHttp = new HttpClient();
var google = settings.GoogleClientId is null ? null : GoogleOAuth.Create(new GoogleOptions(
    settings.GoogleClientId, settings.GoogleClientSecret!, settings.GoogleRedirectUri!), googleHttp);
var clock = new Clock(() => DateTimeOffset.UtcNow);
Storage.Initialize(settings.DatabasePath);
var http = new HttpSettings(settings.Host, settings.Port, settings.PublicUrl, settings.InternalSecret,
    settings.CookieDomain, settings.AccessCookieDomain, settings.TenantMode, settings.Tenants, settings.CorsOrigins, settings.Production);
return await Persona.AdapterHttp.Host.Run(args, http, google, password, builder =>
{
    builder.Logging.SetMinimumLevel(Logging.Minimum(Environment.GetEnvironmentVariable("LOG_LEVEL")));
    builder.Services.AddScoped(_ => Storage.Open(settings.DatabasePath));
    builder.Services.AddScoped(provider =>
    {
        var db = provider.GetRequiredService<PersonaDbContext>();
        return new RequestPorts(Persona.AdapterSqlite.Identities.Identities.Create(db, clock),
            Persona.AdapterSqlite.Identities.Roles.Create(db, clock),
            Tokens.Create(Persona.AdapterSqlite.Sessions.Sessions.Create(db, clock), clock,
                settings.JwtSecret, settings.AccessExpiry, settings.RefreshExpiry));
    });
});
