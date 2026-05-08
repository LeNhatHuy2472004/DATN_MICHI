using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace ThienPlan.Api.Helpers;

public sealed class VnPayLibrary
{
    private readonly SortedDictionary<string, string> _requestData = new(StringComparer.Ordinal);
    private readonly SortedDictionary<string, string> _responseData = new(StringComparer.Ordinal);

    public void AddRequestData(string key, string value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            _requestData[key] = value;
        }
    }

    public void AddResponseData(string key, string value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            _responseData[key] = value;
        }
    }

    public string CreateRequestUrl(string baseUrl, string hashSecret)
    {
        var query = string.Join('&', _requestData.Select(x => $"{WebUtility.UrlEncode(x.Key)}={WebUtility.UrlEncode(x.Value)}"));
        var signData = string.Join('&', _requestData.Select(x => $"{x.Key}={WebUtility.UrlEncode(x.Value)}"));
        var secureHash = HmacSha512(hashSecret, signData);
        return $"{baseUrl}?{query}&vnp_SecureHash={secureHash}";
    }

    public bool ValidateSignature(string inputHash, string hashSecret)
    {
        var filtered = _responseData
            .Where(x => !x.Key.Equals("vnp_SecureHash", StringComparison.OrdinalIgnoreCase)
                && !x.Key.Equals("vnp_SecureHashType", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(x => x.Key, x => x.Value);
        var signData = string.Join('&', filtered.OrderBy(x => x.Key, StringComparer.Ordinal).Select(x => $"{x.Key}={WebUtility.UrlEncode(x.Value)}"));
        var computed = HmacSha512(hashSecret, signData);
        return computed.Equals(inputHash, StringComparison.OrdinalIgnoreCase);
    }

    public static string HmacSha512(string key, string input)
    {
        var keyBytes = Encoding.UTF8.GetBytes(key);
        var inputBytes = Encoding.UTF8.GetBytes(input);
        using var hmac = new HMACSHA512(keyBytes);
        var hash = hmac.ComputeHash(inputBytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static string FormatVnPayDate(DateTimeOffset date) => date.ToOffset(TimeSpan.FromHours(7)).ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
}
