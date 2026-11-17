using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Persona.Kernel;
using System.Text.Json;
using System.Text;
using System.Security.Cryptography;
using Persona.Domain.Authentication;

namespace Persona.AdapterHttp;

public static class Host
{
    public static async Task<int> Run(string[] arguments, HttpSettings settings, OAuthProvider? google,
        PasswordVerifier? devAuth, Action<WebApplicationBuilder> configure)
    {
        var internalCredential = SHA256.HashData(Encoding.UTF8.GetBytes("Bearer " + settings.InternalSecret));
        var builder = WebApplication.CreateSlimBuilder(arguments);
        builder.WebHost.UseUrls($"http://{settings.Host}:{settings.Port}");
        builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(settings.CorsOrigins).AllowCredentials().AllowAnyHeader().AllowAnyMethod()));
        configure(builder);
        var app = builder.Build();
        if (settings.CorsOrigins.Length > 0) app.UseCors();
        if (devAuth is not null) Console.Error.WriteLine("WARNING: development username/password login is ENABLED; production environments disable it");
        app.Use(async (context, next) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            var path = context.Request.Path.Value?.TrimEnd('/') ?? "";
            if (HttpMethods.IsPost(context.Request.Method) &&
                (path.Equals("/logout", StringComparison.OrdinalIgnoreCase)
                || path.Equals("/token/refresh", StringComparison.OrdinalIgnoreCase)
                || path.Equals("/auth/login", StringComparison.OrdinalIgnoreCase))
                && !Http.SessionOriginAllowed(context, settings))
            { await Http.Error(context, 403, "Browser origin is not allowed"); return; }
            if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } feature) feature.MaxRequestBodySize = 1024 * 1024;
            try { await Http.Body(context); await next(context); }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { context.Abort(); }
            catch (JsonException) { if(!context.Response.HasStarted)await Http.Error(context,400,"Malformed JSON body");else context.Abort(); }
            catch (BadHttpRequestException error) { if(!context.Response.HasStarted)await Http.Error(context,error.StatusCode,"Invalid request body");else context.Abort(); }
            catch (Exception error)
            {
                app.Logger.LogError(error, "Persona request failed");
                if (!context.Response.HasStarted) await Http.Error(context, 500, "Internal server error");
                else context.Abort();
            }
        });
        app.MapGet("/auth/config", context => Http.Json(context, new System.Text.Json.Nodes.JsonObject {
            ["googleEnabled"] = google is not null, ["devLoginEnabled"] = devAuth is not null,
            ["tenantRequired"] = settings.TenantMode == "multi"
        }));
        app.MapGet("/health", context => Http.Json(context, new System.Text.Json.Nodes.JsonObject { ["status"] = "ok" }));
        app.Map("/{**path}", async context =>
        {
            var path = context.Request.Path.Value?.TrimEnd('/') ?? "";
            var internalRequest = path.StartsWith("/internal", StringComparison.OrdinalIgnoreCase);
            if (internalRequest && !CryptographicOperations.FixedTimeEquals(internalCredential, SHA256.HashData(Encoding.UTF8.GetBytes(context.Request.Headers.Authorization.ToString()))))
            { await Http.Error(context, 401, "Unauthorized"); return; }
            string? tenant = null;
            if (internalRequest || path.StartsWith("/auth", StringComparison.OrdinalIgnoreCase)
                && (devAuth is not null || google is not null) && !path.Equals("/auth/google/callback", StringComparison.OrdinalIgnoreCase))
            {
                tenant = Http.Tenant(context, settings, out var error);
                if (error is not null) { await Http.Error(context, 400, error); return; }
            }
            var ports = context.RequestServices.GetRequiredService<RequestPorts>();
            var identities = ports.Identities;
            var tokens = ports.Tokens;
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
                    await InternalRoutes.Link(context, identities, tokens, tenant!, Uri.UnescapeDataString(parts[2]));
                else if (parts.Length == 4 && parts[1].Equals("user", StringComparison.OrdinalIgnoreCase)
                    && parts[3].Equals("roles", StringComparison.OrdinalIgnoreCase) && (HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsGet(context.Request.Method)))
                    await InternalRoutes.Roles(context, ports.Roles, tenant!, Uri.UnescapeDataString(parts[2]));
                else if (parts.SequenceEqual(["internal", "users", "role-lookups"]) && HttpMethods.IsPost(context.Request.Method))
                    await InternalRoutes.LookupRoles(context, ports.Roles, tenant!);
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
