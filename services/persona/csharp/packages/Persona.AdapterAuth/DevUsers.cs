using System.Security.Cryptography;
using System.Text;

namespace Persona.AdapterAuth;

public sealed record DevUser(string Username, string Password);
public sealed record DevAuth(IReadOnlyList<DevUser> Users, string? WildcardPassword);

public static class DevUsers
{
    public static DevAuth? Resolve(string? raw, string? environment)
    {
        if (string.IsNullOrEmpty(raw) || environment is not (null or "" or "development" or "test")) return null;
        var users = new List<DevUser>();
        string? wildcard = null;
        foreach (var entry in raw.Split(','))
        {
            var value = entry.Trim();
            if (value.Length == 0) continue;
            var index = value.IndexOf(':');
            if (index <= 0 || index == value.Length - 1)
                throw new ArgumentException("Invalid PERSONA_DEV_USERS: expected username:password");
            var user = value[..index].Trim(); var password = value[(index + 1)..].Trim();
            if (user.Length == 0 || password.Length == 0)
                throw new ArgumentException("Invalid PERSONA_DEV_USERS: username and password must be non-empty");
            if (user == "*")
            {
                if (wildcard is not null) throw new ArgumentException("Invalid PERSONA_DEV_USERS: multiple wildcard entries");
                wildcard = password;
            }
            else users.Add(new DevUser(user, password));
        }
        return users.Count == 0 && wildcard is null ? null : new DevAuth(users, wildcard);
    }

    public static bool Verify(DevAuth config, string user, string password)
    {
        if (user == "*") return false;
        var expected = config.Users.FirstOrDefault(value => value.Username == user)?.Password ?? config.WildcardPassword;
        return expected is not null && CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)), SHA256.HashData(Encoding.UTF8.GetBytes(password)));
    }
}
