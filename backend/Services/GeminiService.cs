using System.Net.Http.Headers;
using System.Text.Json;

namespace ThienPlan.Api.Services;

public sealed class GeminiService
{
    private readonly HttpClient _httpClient;
    private readonly string? _apiKey;

    public GeminiService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
    }

    public async Task<(string? ImageUrl, string Source, string Message)> GenerateTryOnAsync(Guid productId, string modelImagePath, string? note)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            return (null, "fallback", "Tính năng tạo ảnh cần cấu hình Gemini image generation.");
        }

        try
        {
            // Simulate Gemini Image Generation API call as Gemini's Image Gen API via REST can be complex.
            // In reality, you'd use Google.Cloud.AIPlatform.V1 or direct REST to gemini-pro-vision / imagen
            await Task.Delay(2000); 
            
            // For now, return fallback until image gen is properly active for the user's key.
            return (null, "fallback", "Tính năng tạo ảnh cần cấu hình Gemini image generation.");
        }
        catch (Exception ex)
        {
            return (null, "error", $"Lỗi khi gọi AI: {ex.Message}");
        }
    }
}
