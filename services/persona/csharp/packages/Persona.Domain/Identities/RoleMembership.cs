using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Persona.Kernel;

namespace Persona.Domain.Identities;

public sealed record UserRoles(string UserId, bool Exists, string[] Roles, string? Version);
public sealed record RoleUpdate(UserRoles User);
public sealed record RoleStore(
    Func<string, string[], CancellationToken, Task<Result<UserRoles[]>>> Lookup,
    Func<string, string, string[], string, CancellationToken, Task<Result<RoleUpdate>>> Replace);

public static class RoleMembership
{
    public const int MaximumUsers = 500;
    public static bool ValidUser(string user) => user.Length is >= 3 and <= 20
        && user.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');
    public static bool ValidRoles(IReadOnlyList<string> roles) => roles.Count <= 64
        && roles.Distinct(StringComparer.Ordinal).Count() == roles.Count
        && roles.All(role => role.Length is >= 1 and <= 64 && char.IsAsciiLetter(role[0])
            && role.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or ':' or '.'));
}
