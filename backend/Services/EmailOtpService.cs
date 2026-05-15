using System.Collections.Concurrent;
using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;

namespace ThienPlan.Api.Services;

public sealed class EmailOtpService(IConfiguration configuration)
{
    private sealed record OtpEntry(string Code, DateTimeOffset ExpiresAt);

    private readonly ConcurrentDictionary<string, OtpEntry> _otpByEmail = new(StringComparer.OrdinalIgnoreCase);

    public async Task SendRegisterOtpAsync(string email, string fullName, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(email);
        var code = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        _otpByEmail[normalizedEmail] = new OtpEntry(code, DateTimeOffset.UtcNow.AddMinutes(10));

        var host = configuration["Smtp:Host"] ?? "smtp.gmail.com";
        var port = int.TryParse(configuration["Smtp:Port"], out var parsedPort) ? parsedPort : 587;
        var userName = configuration["Smtp:UserName"] ?? string.Empty;
        var password = configuration["Smtp:Password"] ?? string.Empty;
        var fromName = configuration["Smtp:FromName"] ?? "MiiChin";

        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Chưa cấu hình tài khoản gửi OTP.");
        }

        using var message = new MailMessage
        {
            From = new MailAddress(userName, fromName),
            Subject = "Mã xác thực tài khoản MiiChin",
            Body = $"""
Xin chào {fullName},

Mã OTP tạo tài khoản MiiChin của bạn là: {code}

Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu tạo tài khoản, vui lòng bỏ qua email này.
""",
            IsBodyHtml = false
        };
        message.To.Add(normalizedEmail);

        using var smtp = new SmtpClient(host, port)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(userName, password)
        };

        using var registration = cancellationToken.Register(smtp.SendAsyncCancel);
        await smtp.SendMailAsync(message);
    }

    public bool VerifyRegisterOtp(string email, string code)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (!_otpByEmail.TryGetValue(normalizedEmail, out var entry))
        {
            return false;
        }

        if (entry.ExpiresAt < DateTimeOffset.UtcNow)
        {
            _otpByEmail.TryRemove(normalizedEmail, out _);
            return false;
        }

        var ok = string.Equals(entry.Code, code?.Trim(), StringComparison.Ordinal);
        if (ok)
        {
            _otpByEmail.TryRemove(normalizedEmail, out _);
        }

        return ok;
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
