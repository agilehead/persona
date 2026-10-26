using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Persona.AdapterAuth;
using Persona.AdapterRuntime;
using Persona.AdapterSqlite;
using Persona.Kernel;

namespace Persona.AdapterHttp;

public static class Host
{
    public static async Task<int> Run(string[] arguments)
    {
        if (arguments.SequenceEqual(["health"]))
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            try { return (await client.GetAsync("http://127.0.0.1:" + Settings.Number("PERSONA_SERVER_PORT", 5005) + "/health")).IsSuccessStatusCode ? 0 : 1; }
            catch (HttpRequestException) { return 1; }
        }
        var settings = Settings.Read();
        var devAuth = DevUsers.Resolve(settings.DevUsers, settings.RuntimeEnvironment);
        var builder = WebApplication.CreateSlimBuilder(arguments);
        builder.Logging.SetMinimumLevel(Logging.Minimum(Environment.GetEnvironmentVariable("LOG_LEVEL")));
        builder.WebHost.UseUrls($"http://{settings.Host}:{settings.Port}");
        builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(settings.CorsOrigins).AllowCredentials().AllowAnyHeader().AllowAnyMethod()));
        var app = builder.Build();
        Storage.Initialize(settings.DatabasePath);
        using var googleHttp = new HttpClient();
        var google = settings.GoogleClientId is not null ? GoogleOAuth.Create(new GoogleOptions(
            settings.GoogleClientId, settings.GoogleClientSecret!, settings.GoogleRedirectUri!), googleHttp) : null;
        var clock = new Clock(() => DateTimeOffset.UtcNow);
        if (settings.CorsOrigins.Length > 0) app.UseCors();
        if (devAuth is not null) Console.Error.WriteLine("WARNING: development username/password login is ENABLED; production environments disable it");
        app.Use(async (context, next) =>
        {
            if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } feature) feature.MaxRequestBodySize = 1024 * 1024;
            try { await Http.Body(context); await next(context); }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
            catch (Exception error)
            {
                app.Logger.LogError(error, "Persona request failed");
                if (!context.Response.HasStarted) await Http.Error(context, 500, "Internal server error");
            }
        });
        app.MapGet("/health", context => Http.Json(context, new System.Text.Json.Nodes.JsonObject { ["status"] = "ok" }));
        app.Map("/{**path}", async context =>
        {
            var path = context.Request.Path.Value?.TrimEnd('/') ?? "";
            var internalRequest = path.StartsWith("/internal", StringComparison.OrdinalIgnoreCase);
            if (internalRequest && context.Request.Headers.Authorization != "Bearer " + settings.InternalSecret)
            { await Http.Error(context, 401, "Unauthorized"); return; }
            string? tenant = null;
            if (internalRequest || path.StartsWith("/auth", StringComparison.OrdinalIgnoreCase)
                && (devAuth is not null || google is not null) && !path.Equals("/auth/google/callback", StringComparison.OrdinalIgnoreCase))
            {
                tenant = Http.Tenant(context, settings, out var error);
                if (error is not null) { await Http.Error(context, 400, error); return; }
            }
            await using var db = Storage.Open(settings.DatabasePath);
            var identities = AdapterSqlite.Identities.Identities.Create(db, clock);
            var tokens = Tokens.Create(AdapterSqlite.Sessions.Sessions.Create(db, clock), clock,
                settings.JwtSecret, settings.AccessExpiry, settings.RefreshExpiry);
            if (HttpMethods.IsGet(context.Request.Method) && google is not null && path.Equals("/auth/google", StringComparison.OrdinalIgnoreCase))
                await GoogleRoutes.Start(context, settings, google, tenant!);
            else if (HttpMethods.IsGet(context.Request.Method) && google is not null && path.Equals("/auth/google/callback", StringComparison.OrdinalIgnoreCase))
                await GoogleRoutes.Callback(context, settings, google, identities, tokens);
            else if (HttpMethods.IsPost(context.Request.Method) && path.Equals("/auth/login", StringComparison.OrdinalIgnoreCase) && devAuth is not null)
                await SessionRoutes.Password(context, settings, devAuth, identities, tokens, tenant!);
            else if (HttpMethods.IsPost(context.Request.Method) && path.Equals("/token/refresh", StringComparison.OrdinalIgnoreCase))
                await SessionRoutes.Refresh(context, settings, identities, tokens);
            else if (HttpMethods.IsPost(context.Request.Method) && path.Equals("/logout", StringComparison.OrdinalIgnoreCase))
                await SessionRoutes.Logout(context, settings, tokens);
            else if (internalRequest)
            {
                var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 4 && parts[1].Equals("identity", StringComparison.OrdinalIgnoreCase)
                    && parts[3].Equals("link", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPost(context.Request.Method))
                    await InternalRoutes.Link(context, identities, tokens, Uri.UnescapeDataString(parts[2]));
                else if (parts.Length == 4 && parts[1].Equals("user", StringComparison.OrdinalIgnoreCase)
                    && parts[3].Equals("roles", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPut(context.Request.Method))
                    await InternalRoutes.Roles(context, identities, tenant!, Uri.UnescapeDataString(parts[2]));
                else if (parts.Length == 4 && parts[1].Equals("user", StringComparison.OrdinalIgnoreCase)
                    && parts[3].Equals("sessions", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsDelete(context.Request.Method))
                    await InternalRoutes.Sessions(context, tokens, tenant!, Uri.UnescapeDataString(parts[2]));
                else context.Response.StatusCode = 404;
            }
            else context.Response.StatusCode = 404;
        });
        await app.RunAsync();
        return 0;
    }
}
