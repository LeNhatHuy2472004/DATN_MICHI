using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using ThienPlan.Api.Data;

namespace ThienPlan.Api.Helpers;

public sealed class JwtTokenService(IConfiguration configuration, DemoStore store)
{
    public string CreateToken(UserRecord user)
    {
        var permissions = store.UserPermissions.TryGetValue(user.Id, out var codes) ? codes : [];
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.Role)
        };
        claims.AddRange(permissions.Select(x => new Claim("permission", x)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:Key"] ?? "dev-only-secret-key-change-before-production-123456789"));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(configuration.GetValue("Jwt:AccessTokenMinutes", 15));

        var token = new JwtSecurityToken(claims: claims, expires: expires, signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
