using Persona.Domain.Authentication;
using Persona.Domain.Identities;
using Persona.Domain.Sessions;
using Persona.Kernel;

internal static class AuthenticationProbe
{
    public static async Task Run(IdentityStore identities, TokenService tokens, Action<bool, string> check)
    {
        var ct = CancellationToken.None;
        var session = new Session("session", "identity", "tenant", "hash", DateTimeOffset.MaxValue, false, null, null, DateTimeOffset.MinValue);
        var validateFailure = tokens with { ValidateRefresh = (_, _) => Task.FromResult(Result<Session>.Failed("INFRASTRUCTURE", "storage unavailable")) };
        check((await Authentication.Refresh(identities, validateFailure, "refresh", ct)).Error?.Code == "INFRASTRUCTURE", "refresh preserves validation infrastructure failure");
        check((await Authentication.Logout(validateFailure, "refresh", ct)).Error?.Code == "INFRASTRUCTURE", "logout preserves validation infrastructure failure");
        check((await Authentication.Logout(validateFailure, null, ct)).IsSuccess, "logout without credentials does not access storage");
        var invalid = tokens with { ValidateRefresh = (_, _) => Task.FromResult(Result<Session>.Failed("INVALID_TOKEN", "invalid")) };
        check((await Authentication.Logout(invalid, "refresh", ct)).IsSuccess, "invalid-token logout is idempotent");
        var valid = tokens with { ValidateRefresh = (_, _) => Task.FromResult(Result<Session>.Success(session)) };
        var missing = identities with { FindById = (_, _) => Task.FromResult(Result<Identity?>.Success(null)) };
        check((await Authentication.Refresh(missing, valid, "refresh", ct)).Error?.Code == "INVALID_TOKEN", "refresh rejects a missing identity");
        var unavailable = identities with { FindById = (_, _) => Task.FromResult(Result<Identity?>.Failed("INFRASTRUCTURE", "storage unavailable")) };
        check((await Authentication.Refresh(unavailable, valid, "refresh", ct)).Error?.Code == "INFRASTRUCTURE", "refresh preserves identity lookup failure");
        var identity = new Identity("identity", "tenant", "google", "provider", "user@example.test", null, null, "app-user", ["USER"], null, DateTimeOffset.MinValue, DateTimeOffset.MinValue);
        var found = identities with { FindById = (_, _) => Task.FromResult(Result<Identity?>.Success(identity)) };
        var slideFailure = valid with { Slide = (_, _) => Task.FromResult(Result<Unit>.Failed("INFRASTRUCTURE", "storage unavailable")), AccessToken = (_, _) => throw new InvalidOperationException("must not issue after a failed write") };
        check((await Authentication.Refresh(found, slideFailure, "refresh", ct)).Error?.Code == "INFRASTRUCTURE", "refresh cannot issue access after failed session extension");
        var revoked = valid with { Revoke = (_, _) => Task.FromResult(Result<Unit>.Failed("INFRASTRUCTURE", "storage unavailable")) };
        check((await Authentication.Logout(revoked, "refresh", ct)).Error?.Code == "INFRASTRUCTURE", "logout cannot confirm a failed revocation");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var cancelled = valid with { ValidateRefresh = (_, token) => Task.FromCanceled<Result<Session>>(token) };
        var observed = false;
        try { await Authentication.Logout(cancelled, "refresh", cancellation.Token); }
        catch (OperationCanceledException) { observed = true; }
        check(observed, "logout propagates cancellation instead of swallowing it");
    }
}
