using Persona.Kernel;
namespace Persona.Domain.Authentication;
public sealed record OAuthProvider(
    Func<string, string, string, CancellationToken, Task<string>> Authorize,
    Func<Uri, string, string, string?, CancellationToken, Task<Result<OAuthUser>>> Exchange);
public sealed record PasswordVerifier(Func<string, string, bool> Verify);
