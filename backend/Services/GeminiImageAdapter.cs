using ThienPlan.Api.Data;

namespace ThienPlan.Api.Services;

/// <summary>
/// Adapter that wraps GeminiService to provide the same interface as OpenAiImageService.
/// This allows seamless replacement of OpenAI with Gemini for virtual try-on image generation.
/// </summary>
public sealed class GeminiImageAdapter(GeminiService gemini, IWebHostEnvironment env)
{
    private readonly GeminiService _gemini = gemini;
    private readonly IWebHostEnvironment _env = env;

    /// <summary>
    /// Generates a virtual try-on image using Gemini API, matching the OpenAiImageService interface.
    /// </summary>
    /// <param name="products">List of products being tried on</param>
    /// <param name="productImagePaths">File paths to product images</param>
    /// <param name="personImagePath">File path to the person/model image</param>
    /// <param name="outputDir">Directory where the generated image will be saved</param>
    /// <param name="note">Optional user note or customization request</param>
    /// <param name="cancellationToken">Cancellation token (best effort, Gemini service has timeout)</param>
    /// <returns>Tuple of (ImageUrl, Source, Message)</returns>
    public async Task<(string? ImageUrl, string Source, string Message)> GenerateTryOnAsync(
        IReadOnlyList<ProductRecord> products,
        IReadOnlyList<string> productImagePaths,
        string personImagePath,
        string outputDir,
        string? note,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Validate inputs
            if (productImagePaths.Count == 0)
            {
                return (null, "gemini-missing-product-images", "Không tìm thấy ảnh sản phẩm để gửi sang Gemini.");
            }

            if (!File.Exists(personImagePath))
            {
                return (null, "gemini-person-image-missing", "Không tìm thấy ảnh người mẫu hoặc ảnh khách hàng.");
            }

            if (productImagePaths.Any(path => !File.Exists(path)))
            {
                return (null, "gemini-product-image-missing", "Một số ảnh sản phẩm không tồn tại.");
            }

            // Convert file paths to data URLs (base64 encoded)
            var imageDataUrls = new List<string>();

            // Add product images
            foreach (var productPath in productImagePaths)
            {
                var dataUrl = ConvertFileToDataUrl(productPath);
                if (!string.IsNullOrEmpty(dataUrl))
                {
                    imageDataUrls.Add(dataUrl);
                }
            }

            // Add person image (must be last for virtual try-on)
            var personDataUrl = ConvertFileToDataUrl(personImagePath);
            if (string.IsNullOrEmpty(personDataUrl))
            {
                return (null, "gemini-person-image-convert-failed", "Không thể chuyển đổi ảnh người mẫu sang định dạng base64.");
            }
            imageDataUrls.Add(personDataUrl);

            // Build optimized prompt for Gemini (matches DefaultVirtualTryOnPrompt in GeminiService)
            var prompt = BuildGeminiTryOnPrompt(products, note);

            // Call Gemini service with cancellation support (best effort)
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(120)); // 2-minute timeout

            string? imageBase64;
            try
            {
                imageBase64 = await _gemini.GetVirtualTryOnAsync(imageDataUrls, prompt, saveToFile: false);
            }
            catch (OperationCanceledException)
            {
                return (null, "gemini-timeout", "Yêu cầu tạo ảnh thử đồ từ Gemini vượt quá thời gian chờ (120 giây).");
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("generation_aborted"))
            {
                return (null, "gemini-generation-aborted", "Gemini đã từ chối tạo ảnh vì lý do an toàn (không phải là hình ảnh người hoặc vi phạm chính sách).");
            }

            if (string.IsNullOrWhiteSpace(imageBase64))
            {
                return (null, "gemini-no-image", "Gemini đã phản hồi nhưng không trả về ảnh thử đồ.");
            }

            // Save the image to disk
            var savedUrl = await SaveImageToDiskAsync(imageBase64, outputDir);
            if (string.IsNullOrEmpty(savedUrl))
            {
                return (null, "gemini-file-save-failed", "Không thể lưu ảnh thử đồ được tạo bởi Gemini.");
            }

            return (savedUrl, "gemini", "Đã tạo ảnh thử đồ bằng Gemini từ ảnh sản phẩm và ảnh người mẫu.");
        }
        catch (Exception ex)
        {
            return (null, "gemini-adapter-error", $"Lỗi khi xử lý yêu cầu thử đồ: {ex.Message}");
        }
    }

    /// <summary>
    /// Converts a file to a data URL format (base64 encoded with MIME type).
    /// </summary>
    private string ConvertFileToDataUrl(string filePath)
    {
        try
        {
            if (!File.Exists(filePath))
                return string.Empty;

            var bytes = File.ReadAllBytes(filePath);
            var base64 = Convert.ToBase64String(bytes);
            var mimeType = GetMimeType(filePath);
            return $"data:{mimeType};base64,{base64}";
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// Saves base64-encoded image to disk and returns the relative URL.
    /// </summary>
    private async Task<string?> SaveImageToDiskAsync(string imageBase64, string outputDir)
    {
        try
        {
            // Clean base64 if it has data URL prefix
            var cleanBase64 = imageBase64.StartsWith("data:")
                ? imageBase64.Substring(imageBase64.IndexOf(",") + 1)
                : imageBase64;

            var bytes = Convert.FromBase64String(cleanBase64);
            Directory.CreateDirectory(outputDir);

            var safeName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.png";
            var targetPath = Path.Combine(outputDir, safeName);

            await File.WriteAllBytesAsync(targetPath, bytes);
            return $"/assets/uploads/tryon/{safeName}";
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Gets MIME type from file extension.
    /// </summary>
    private static string GetMimeType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/png"
        };
    }

    /// <summary>
    /// Builds a detailed prompt for Gemini that includes product information.
    /// </summary>
    private static string BuildGeminiTryOnPrompt(IReadOnlyList<ProductRecord> products, string? note)
    {
        var productLines = string.Join("\n", products.Select((product, index) =>
            $"- Sản phẩm {index + 1}: {product.Name}; chất liệu: {product.Material}; giới tính: {product.Gender}; thương hiệu: {product.Brand}; thẻ: {string.Join(", ", product.Tags)}"));

        return $"""
Bạn là một AI chuyên gia thử đồ ảo. Bạn sẽ được cung cấp ảnh "người mẫu/khách hàng" và ảnh "sản phẩm quần áo". Nhiệm vụ của bạn là tạo một ảnh mới sao cho người trong ảnh mẫu đang mặc những quần áo từ ảnh sản phẩm.

**Quy tắc quan trọng:**
1. Ảnh cuối cùng PHẢI là ảnh toàn bộ cơ thể, hiển thị người từ đầu đến chân, chân phải rõ ràng. Không được cắt ảnh.
2. PHẢI hoàn toàn LOẠI BỎ và THAY THẾ quần áo của người trong ảnh mẫu bằng quần áo mới. Không phần nào của quần áo cũ (tay áo, cổ, hoa văn) được phép hiển thị.
3. Bảo toàn mặt, tóc, hình dáng cơ thể và tư thế của người từ ảnh mẫu.
4. Bảo toàn hoàn toàn nền từ ảnh mẫu.
5. Áp dụng quần áo mới một cách thực tế. Nó nên thích ứng với tư thế của người với nếp gấp tự nhiên, bóng và ánh sáng phù hợp với cảnh ban đầu.
6. Trả về CHỈ ảnh cuối cùng đã chỉnh sửa. Không bao gồm bất kỳ văn bản nào.

Sản phẩm được chọn:
{productLines}

Ghi chú của khách hàng: {note ?? "không có"}

Hãy tạo ảnh thử đồ ảo thực tế cao.
""";
    }
}
