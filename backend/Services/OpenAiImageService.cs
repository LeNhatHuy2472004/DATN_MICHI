using System.Text;
using System.Text.Json;
using ThienPlan.Api.Data;

namespace ThienPlan.Api.Services;

public sealed class OpenAiImageService(IConfiguration configuration, HttpClient httpClient)
{
    private readonly HttpClient _httpClient = httpClient;
    private readonly string? _apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? configuration["OpenAI:ApiKey"];
    private readonly string _model = configuration["OpenAI:ImageModel"] ?? "gpt-image-1.5";

    public async Task<(string? ImageUrl, string Source, string Message)> GenerateTryOnAsync(
        IReadOnlyList<ProductRecord> products,
        IReadOnlyList<string> productImagePaths,
        string personImagePath,
        string outputDir,
        string? note,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            return (null, "openai-missing-key", "Chưa cấu hình OPENAI_API_KEY để tạo ảnh thử đồ bằng ChatGPT/OpenAI.");
        }

        if (productImagePaths.Count == 0 || productImagePaths.Any(path => !File.Exists(path)))
        {
            return (null, "product-image-missing", "Không tìm thấy ảnh sản phẩm để gửi sang OpenAI.");
        }

        if (!File.Exists(personImagePath))
        {
            return (null, "person-image-missing", "Không tìm thấy ảnh người mẫu hoặc ảnh khách hàng.");
        }

        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(_model), "model");
        content.Add(new StringContent(BuildTryOnPrompt(products, note), Encoding.UTF8), "prompt");
        content.Add(new StringContent("1024x1536"), "size");
        content.Add(new StringContent("medium"), "quality");
        content.Add(new StringContent("png"), "output_format");

        foreach (var path in productImagePaths)
        {
            var bytes = await File.ReadAllBytesAsync(path, cancellationToken);
            var imageContent = new ByteArrayContent(bytes);
            imageContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(DetectMimeType(path));
            content.Add(imageContent, "image[]", Path.GetFileName(path));
        }

        var personBytes = await File.ReadAllBytesAsync(personImagePath, cancellationToken);
        var personContent = new ByteArrayContent(personBytes);
        personContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(DetectMimeType(personImagePath));
        content.Add(personContent, "image[]", Path.GetFileName(personImagePath));

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/images/edits");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _apiKey);
        request.Content = content;

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var error = ExtractOpenAiError(raw, response.StatusCode);
            return (null, error.Code, error.Message);
        }

        using var doc = JsonDocument.Parse(raw);
        var first = doc.RootElement.GetProperty("data")[0];
        Directory.CreateDirectory(outputDir);
        var safeName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.png";
        var targetPath = Path.Combine(outputDir, safeName);

        if (first.TryGetProperty("b64_json", out var b64Json))
        {
            var bytes = Convert.FromBase64String(b64Json.GetString() ?? string.Empty);
            await File.WriteAllBytesAsync(targetPath, bytes, cancellationToken);
            return ($"/assets/uploads/tryon/{safeName}", _model, "Đã tạo ảnh thử đồ bằng ChatGPT/OpenAI từ ảnh sản phẩm và ảnh người mẫu.");
        }

        if (first.TryGetProperty("url", out var urlProp))
        {
            var url = urlProp.GetString();
            if (!string.IsNullOrWhiteSpace(url))
            {
                var bytes = await _httpClient.GetByteArrayAsync(url, cancellationToken);
                await File.WriteAllBytesAsync(targetPath, bytes, cancellationToken);
                return ($"/assets/uploads/tryon/{safeName}", _model, "Đã tạo ảnh thử đồ bằng ChatGPT/OpenAI từ ảnh sản phẩm và ảnh người mẫu.");
            }
        }

        return (null, "openai-no-image", "OpenAI đã phản hồi nhưng không trả về ảnh thử đồ.");
    }

    private static string BuildTryOnPrompt(IReadOnlyList<ProductRecord> products, string? note)
    {
        var productLines = string.Join("\n", products.Select((product, index) =>
            $"- Garment {index + 1}: {product.Name}; categoryId {product.CategoryId}; brand {product.Brand}; material {product.Material}; gender {product.Gender}; tags {string.Join(", ", product.Tags)}"));

        return $"""
Edit the customer/model photo into a realistic virtual try-on result for a fashion e-commerce website.

Reference images:
- The first reference image(s) show the exact MiiChin product(s).
- The final reference image is the customer/model photo and must be used as the person/base photo.

Requirements:
- Dress the same person in the selected garment(s), combining multiple selected products into one coherent outfit if provided.
- Preserve the person's identity, face, pose, body proportions, background, camera angle, and lighting.
- Preserve each garment's color, silhouette, material, texture, seams, folds, length, and styling details from the product reference.
- Make the outfit naturally fit the body with realistic drape, occlusion, shadows, and fabric behavior.
- Produce one polished photorealistic fashion try-on image suitable for an online clothing shop.
- Do not create a collage, product card, before/after layout, poster, text, watermark, logo, border, or UI element.
- Do not change the person's face or identity.

Selected products:
{productLines}

Customer edit note: {note ?? "none"}
""";
    }

    private static string DetectMimeType(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/png"
        };
    }

    private static (string Code, string Message) ExtractOpenAiError(string raw, System.Net.HttpStatusCode statusCode)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("error", out var error) &&
                error.TryGetProperty("message", out var message))
            {
                var openAiMessage = message.GetString() ?? string.Empty;
                var lowerMessage = openAiMessage.ToLowerInvariant();

                if (lowerMessage.Contains("billing hard limit") || lowerMessage.Contains("billing"))
                {
                    return ("openai-billing-limit", "Tài khoản OpenAI đã chạm giới hạn thanh toán. Vui lòng tăng hard limit hoặc dùng API key của project còn hạn mức để tạo ảnh thử đồ.");
                }

                if (lowerMessage.Contains("quota") || lowerMessage.Contains("rate limit"))
                {
                    return ("openai-quota", "OpenAI chưa còn quota/rate limit cho yêu cầu tạo ảnh. Vui lòng kiểm tra hạn mức project hoặc thử lại sau.");
                }

                if (lowerMessage.Contains("api key") || lowerMessage.Contains("authentication") || lowerMessage.Contains("unauthorized"))
                {
                    return ("openai-auth", "OPENAI_API_KEY không hợp lệ hoặc chưa có quyền gọi OpenAI Images API.");
                }

                return ("openai-error", $"OpenAI trả lỗi {(int)statusCode}: {openAiMessage}");
            }
        }
        catch
        {
            // Fall through to raw response.
        }

        return ("openai-error", $"OpenAI trả lỗi {(int)statusCode}: {raw}");
    }
}
