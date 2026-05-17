using System.Text;
using System.Text.Json;

namespace ThienPlan.Api.Services
{
    public class GeminiService
    {
        private readonly HttpClient _httpClient;
        private readonly string _apiKey;
        private readonly string _apiBaseUrl;

        private readonly int GEMINI_LIMITATIONS_INPUT = 5;//include model image

        public const string DefaultVirtualTryOnPrompt =
@"You are an expert virtual try-on AI. You will be given a 'model image' and a 'garment image'. Your task is to create a new photorealistic image where the person from the 'model image' is wearing the clothing from the 'garment image'.

**Crucial Rules:**
1.  **Full Body Integrity:** The final image MUST remain a full-body shot, showing the person from head to toe, with feet visible. Do not crop the image in any way.
2.  **Complete Garment Replacement:** You MUST completely REMOVE and REPLACE the clothing item worn by the person in the 'model image' with the new garment. No part of the original clothing (e.g., collars, sleeves, patterns) should be visible in the final image.
3.  **Preserve the Model:** The person's face, hair, body shape, and pose from the 'model image' MUST remain unchanged.
4.  **Preserve the Background:** The entire background from the 'model image' MUST be preserved perfectly.
5.  **Apply the Garment:** Realistically fit the new garment onto the person. It should adapt to their pose with natural folds, shadows, and lighting consistent with the original scene.
6.  **Output:** Return ONLY the final, edited image. Do not include any text.";

        public const string AdditionalSuggestionPrompt =
@"You are an expert personal stylist and fashion photographer.
    The user wants an outfit suggestion for: ""${userPrompt}"".
    
    INSTRUCTIONS:
    1. VALIDATION (CRITICAL):
       - Is the user's prompt related to fashion, clothing, styling, or an occasion/event where dressing up is required?
       - Is the prompt SAFE (not NSFW, not sexually explicit, not harmful)?
       
    2. IF INVALID:
       - If NOT fashion-related: Return text ""ERROR: Please provide a prompt related to fashion, clothing, or a specific occasion (e.g., 'wedding guest', 'office casual')."".
       - If NSFW/Unsafe: Return text ""ERROR: I cannot fulfill this request because it violates safety guidelines regarding inappropriate content."".
       - DO NOT generate an image if invalid.

    3. IF VALID:
       - Generate a photorealistic image of the person in the provided image wearing a suitable outfit for the requested occasion.
       - CRITICAL: You must preserve the person's exact identity, face, body shape, pose, and the original background. Only the clothing should change.
       - The lighting and realism must be high quality.
    
    Return ONLY the final image (if valid) or the error text (if invalid).";

        public const string DefaultModelEnhancementPrompt =
@"You are an expert fashion photographer AI. Transform the person in this image into a full-body fashion model photo suitable for an e-commerce website. It is critical that the final image shows the person from head to toe, with their feet clearly visible and not cropped. The background must be a clean, neutral studio backdrop (light gray, #f0f0f0). The person should have a neutral, professional model expression. Preserve the person's identity, unique features, and body type, but place them in a standard, relaxed standing model pose. The final image must be photorealistic. Return ONLY the final image.";

        public const string DefaultModelEnhancementPrompt_New =
            @"You are an expert fashion photographer AI. STEP 1: before generating any image, you must analyze the input image content. Requirement: The input image must contain a human being. Failure Condition: If the image contains only animals, inanimate objects, landscapes, or anything other than a human, you must immediately terminate the process. Action on Failure: Return ONLY the exact string: ""generation_aborted"" . STEP 2: If a human is detected in Step 1, proceed with this task : Transform the person in this image into a full-body fashion model photo suitable for an e-commerce website. It is critical that the final image shows the person from head to toe, with their feet clearly visible and not cropped. The background must be a clean, neutral studio backdrop (light gray, #f0f0f0). The person should have a neutral, professional model expression. Preserve the person's identity, unique features, and body type, but place them in a standard, relaxed standing model pose. The final image must be photorealistic. Return ONLY the final image.";
        public  GeminiService(IConfiguration configuration, HttpClient httpClient)
        {
            _httpClient = httpClient;
            _apiKey = configuration["Gemini:ApiKey"]
                      ?? throw new ArgumentNullException("Gemini:ApiKey not configured");
            _apiBaseUrl = configuration["Gemini:ApiUrl"]
                          ?? throw new ArgumentNullException("Gemini:ApiUrl not configured");
        }

      
        public async Task<string> GetVirtualTryOnAsync(List<string> images, string? prompt, bool saveToFile = false, List<int>? clothingItemIds = null)
        {
            if (images == null || images.Count == 0)
            {
                throw new ArgumentException("At least one image is required.", nameof(images));
            }

            var effectivePrompt = string.IsNullOrWhiteSpace(prompt)
                ? DefaultVirtualTryOnPrompt
                : prompt;

            // Non try-on flows (pose variation / enhancement) can keep the original payload size.
            if (images.Count <= GEMINI_LIMITATIONS_INPUT)
            {
                return await SendVirtualTryOnRequestAsync(images, effectivePrompt, saveToFile);
            }

            // Multi-garment try-on: always call Gemini with Model + up to 2 garments.
            var modelImage = images[0];
            var garmentImages = images.Skip(1).ToList();

            if (garmentImages.Count == 0)
            {
                return await SendVirtualTryOnRequestAsync(images, effectivePrompt, saveToFile);
            }

            var currentModelImage = modelImage;

            var clothingPerCall = Math.Max(1, GEMINI_LIMITATIONS_INPUT - 1);
            var garmentIdList = clothingItemIds != null
                ? clothingItemIds
                    .Take(garmentImages.Count)
                    .Select(id => (int?)id)
                    .ToList()
                : new List<int?>();

            while (garmentIdList.Count < garmentImages.Count)
            {
                garmentIdList.Add(null);
            }

            for (int i = 0, batchNumber = 1; i < garmentImages.Count; i += clothingPerCall, batchNumber++)
            {
                var takeCount = Math.Min(clothingPerCall, garmentImages.Count - i);
                var garmentBatch = garmentImages.GetRange(i, takeCount);
                var idBatch = garmentIdList.GetRange(i, takeCount);

                if (idBatch.Any(id => id.HasValue))
                {
                    var idText = string.Join(", ", idBatch.Select(id => id?.ToString() ?? "unknown"));
                    Console.WriteLine($"[GeminiHelper] Virtual try-on call #{batchNumber} clothing item IDs: {idText}");
                }
                else
                {
                    Console.WriteLine($"[GeminiHelper] Virtual try-on call #{batchNumber} clothing item IDs not provided.");
                }

                var requestImages = new List<string> { currentModelImage };
                requestImages.AddRange(garmentBatch);

                currentModelImage = await SendVirtualTryOnRequestAsync(requestImages, effectivePrompt, saveToFile);
            }

            return currentModelImage;
        }

        private async Task<string> SendVirtualTryOnRequestAsync(IEnumerable<string> imageInputs, string prompt, bool saveToFile)
        {
            var images = imageInputs.ToList();
            try
            {
                // Build request payload for Gemini 3
                var parts = BuildImageParts(images);
                parts.Add(new { text = prompt });

                var requestObj = new
                {
                    contents = new[] { new { parts = parts.ToArray() } },
                    generationConfig = new
                    {
                        responseModalities = new[] { "IMAGE" },
                        imageConfig = new
                        {
                            aspectRatio = "9:16",
                            imageSize = "1K"
                        }
                    }
                };

                var jsonPayload = JsonSerializer.Serialize(requestObj);

                // Send request to Gemini 3 API
                var imageBase64 = await SendRequestToGeminiAsync(jsonPayload);

                if (!string.IsNullOrEmpty(imageBase64))
                {
                    if (saveToFile)
                        await SaveImageToFileAsync(imageBase64, "image/webp");

                    return imageBase64;
                }

                throw new Exception("Failed to generate image. No valid image data returned from Gemini.");
            }
            catch (InvalidOperationException)
            {
                // Re-throw validation failures from model enhancement prompts without modification
                throw;
            }
        }

        /// <summary>
        /// Duplicate method for Gemini 2.5 Flash Image - use this if you need to revert
        /// Payload uses older format without imageConfig
        /// </summary>
        private async Task<string> SendVirtualTryOnRequestAsyncGemini2_5(IEnumerable<string> imageInputs, string prompt, bool saveToFile)
        {
            var images = imageInputs.ToList();
            try
            {
                // Build request payload for Gemini 2.5 Flash Image
                var parts = BuildImagePartsGemini2_5(images);
                parts.Add(new { text = prompt });

                var requestObj = new
                {
                    contents = new[] { new { role = "user", parts = parts.ToArray() } },
                    generationConfig = new
                    {
                        responseModalities = new[] { "IMAGE" }
                    }
                };

                var jsonPayload = JsonSerializer.Serialize(requestObj);

                // Send request to Gemini 2.5 Flash API
                var imageBase64 = await SendRequestToGeminiAsync(jsonPayload);

                if (!string.IsNullOrEmpty(imageBase64))
                {
                    if (saveToFile)
                        await SaveImageToFileAsync(imageBase64, "image/webp");

                    return imageBase64;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Attempt failed: {ex.Message}");
            }

            throw new Exception("Failed to generate image. No valid image data returned from Gemini.");
        }

        private async Task<string?> SendRequestToGeminiAsync2_5(string jsonPayload)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent");
            req.Headers.Add("x-goog-api-key", _apiKey);
            req.Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            using var resp = await _httpClient.SendAsync(req, cts.Token);
            var respText = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
                throw new Exception($"Gemini API error: {resp.StatusCode}\n{respText}");

            return ExtractImageFromResponse(respText);
        }

        private async Task<string?> SendRequestToGeminiAsync(string jsonPayload)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, _apiBaseUrl);
            req.Headers.Add("x-goog-api-key", _apiKey);
            req.Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            using var resp = await _httpClient.SendAsync(req, cts.Token);
            var respText = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
                throw new Exception($"Gemini API error: {resp.StatusCode}\n{respText}");

            return ExtractImageFromResponse(respText);
        }

        private List<object> BuildImageParts(List<string> images)
        {
            var parts = new List<object>();
            foreach (var img in images)
            {
                var mimeType = ExtractMimeType(img) ?? "image/png";
                var base64Data = ProcessImageAsync(img).GetAwaiter().GetResult();

                // Use inline_data (snake_case) for Gemini 3 API
                parts.Add(new
                {
                    inline_data = new { mime_type = mimeType, data = base64Data }
                });
            }
            return parts;
        }

        /// <summary>
        /// Duplicate method for Gemini 2.5 Flash Image - builds image parts with camelCase format
        /// </summary>
        private List<object> BuildImagePartsGemini2_5(List<string> images)
        {
            var parts = new List<object>();
            foreach (var img in images)
            {
                var mimeType = ExtractMimeType(img) ?? "image/png";
                var base64Data = ProcessImageAsync(img).GetAwaiter().GetResult();

                // Use inlineData (camelCase) for Gemini 2.5 Flash Image
                parts.Add(new
                {
                    inlineData = new { mimeType = mimeType, data = base64Data }
                });
            }
            return parts;
        }

        private string? ExtractImageFromResponse(string responseText)
        {
            using var doc = JsonDocument.Parse(responseText);

            // Check for blocked requests
            if (doc.RootElement.TryGetProperty("promptFeedback", out var promptFeedback))
            {
                if (promptFeedback.TryGetProperty("blockReason", out var blockReason) &&
                    !string.IsNullOrWhiteSpace(blockReason.GetString()))
                {
                    var reason = blockReason.GetString();
                    var message = promptFeedback.TryGetProperty("blockReasonMessage", out var msgProp)
                        ? msgProp.GetString()
                        : null;
                    throw new Exception($"Request blocked. Reason: {reason}. {message}".Trim());
                }
            }

            // Extract image data or text response
            if (doc.RootElement.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
            {
                var first = candidates[0];

                // Check for text response FIRST (handles "generation_aborted" case before finishReason)
                if (first.TryGetProperty("content", out var content) &&
                    content.TryGetProperty("parts", out var parts))
                {
                    foreach (var part in parts.EnumerateArray())
                    {
                        // Check for text response first (handles "generation_aborted" case)
                        if (part.TryGetProperty("text", out var textProp))
                        {
                            var textContent = textProp.GetString();
                            if (!string.IsNullOrEmpty(textContent))
                            {
                                // Check if the model returned the validation failure signal
                                if (textContent.Equals("generation_aborted", StringComparison.OrdinalIgnoreCase))
                                {
                                    throw new InvalidOperationException("generation_aborted");
                                }
                                // If text response but not the aborted signal, log it but continue looking for image
                                Console.WriteLine($"Text response received: {textContent}");
                            }
                        }
                    }
                }

                // Check finish reason AFTER checking text responses
                if (first.TryGetProperty("finishReason", out var finishReason))
                {
                    var reason = finishReason.GetString();

                    if (reason == "IMAGE_OTHER" || reason == "CONTENT_FILTER" || reason == "SAFETY" || reason == "NO_IMAGE")
                        throw new Exception("GENERATION_FAILED");

                    if (reason != "STOP" && !string.IsNullOrEmpty(reason))
                        throw new Exception($"Image generation stopped. Reason: {reason}");
                }

                // Extract image data or text response
                if (first.TryGetProperty("content", out var contentForImage) &&
                    contentForImage.TryGetProperty("parts", out var partsForImage))
                {
                    foreach (var part in partsForImage.EnumerateArray())
                    {
                        // Try both inlineData (camelCase) and inline_data (snake_case)
                        JsonElement inlineDataElement = default;
                        bool foundInlineData = false;

                        if (part.TryGetProperty("inline_data", out var inlineDataSnake))
                        {
                            inlineDataElement = inlineDataSnake;
                            foundInlineData = true;
                        }
                        else if (part.TryGetProperty("inlineData", out var inlineDataCamel))
                        {
                            inlineDataElement = inlineDataCamel;
                            foundInlineData = true;
                        }

                        if (foundInlineData && inlineDataElement.TryGetProperty("data", out var dataProp))
                        {
                            var imageBase64 = dataProp.GetString();
                            if (!string.IsNullOrEmpty(imageBase64))
                                return imageBase64;
                        }
                    }
                }
            }

            throw new Exception("No valid image data found in Gemini response.");
        }

        /// <summary>
        /// Result from AI segmentation containing both image and structured metadata
        /// </summary>
        public class AiSegmentResult
        {
            public string ImageDataUrl { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string[] Colors { get; set; } = Array.Empty<string>();
            public string[] Categories { get; set; } = Array.Empty<string>();
            public string[] Sizes { get; set; } = Array.Empty<string>();
            public string[] Seasons { get; set; } = Array.Empty<string>();
            public string[] Occasions { get; set; } = Array.Empty<string>();
            public string Description { get; set; } = string.Empty;
        }

        //Used for garment generations
        public async Task<AiSegmentResult> GetAiSegmentAsync(List<string> images, string prompt, bool saveToFile = false)
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                var parts = new List<object>();

                foreach (var img in images)
                {
                    var mimeType = ExtractMimeType(img) ?? "image/png";
                    var base64Data = await ProcessImageAsync(img);

                    parts.Add(new
                    {
                        inlineData = new
                        {
                            mimeType = mimeType,
                            data = base64Data
                        }
                    });
                }

                parts.Add(new { text = prompt });

                var requestObj = new
                {
                    contents = new[] { new { parts = parts.ToArray() } }
                };

                var jsonPayload = JsonSerializer.Serialize(requestObj);

                using var req = new HttpRequestMessage(HttpMethod.Post, _apiBaseUrl);
                req.Headers.Add("x-goog-api-key", _apiKey);
                req.Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
                using var resp = await _httpClient.SendAsync(req, cts.Token);

                var respText = await resp.Content.ReadAsStringAsync();
                //// Log the response to a file for debugging
                //var logFilePath = Path.Combine(Directory.GetCurrentDirectory(), "GeminiResponseLog.txt");
                //await File.AppendAllTextAsync(logFilePath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} - Response:\n{respText}\n\n");

                //Console.WriteLine(respText);

                Console.WriteLine($"Attempt {attempt + 1} - Status: {resp.StatusCode}");

                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Error Response: {respText}");
                    if (attempt == 2)
                        throw new Exception($"Gemini API error: {resp.StatusCode}\n{respText}");
                    continue;
                }

                using var doc = JsonDocument.Parse(respText);
                if (doc.RootElement.TryGetProperty("candidates", out var candidates) &&
                    candidates.GetArrayLength() > 0)
                {
                    var first = candidates[0];

                    if (first.TryGetProperty("content", out var content) &&
                        content.TryGetProperty("parts", out var partsResp))
                    {
                        string? imageDataUrl = null;
                        string? textPart = null;

                        foreach (var part in partsResp.EnumerateArray())
                        {
                            if (part.TryGetProperty("inlineData", out var inlineData) &&
                                inlineData.TryGetProperty("data", out var dataProp))
                            {
                                var imageBase64 = dataProp.GetString();
                                if (!string.IsNullOrEmpty(imageBase64))
                                {
                                    var responseMimeType = inlineData.TryGetProperty("mimeType", out var mimeTypeProp)
                                        ? mimeTypeProp.GetString() ?? "image/png"
                                        : "image/png";

                                    //  FIXED: Include data URL prefix for ReplicateService compatibility
                                    imageDataUrl = $"data:{responseMimeType};base64,{imageBase64}";

                                    if (saveToFile)
                                    {
                                        await SaveImageToFileAsync(imageBase64, responseMimeType);
                                    }
                                }
                            }

                            if (part.TryGetProperty("text", out var textProp))
                            {
                                var text = textProp.GetString();
                                if (!string.IsNullOrEmpty(text))
                                {
                                    textPart = string.IsNullOrWhiteSpace(textPart) ? text : (textPart + "\n" + text);
                                    Console.WriteLine($"AI Response Text: {text}");
                                }
                            }
                        }

                        // require an image plus strict JSON in the text part
                        if (!string.IsNullOrEmpty(imageDataUrl))
                        {
                            if (string.IsNullOrWhiteSpace(textPart))
                                throw new Exception("Gemini did not return metadata text (expected strict JSON).");

                            // isolate JSON if model wrapped it; prefer the first well-formed JSON object
                            string jsonCandidate = textPart.Trim();
                            var firstBrace = jsonCandidate.IndexOf('{');
                            var lastBrace = jsonCandidate.LastIndexOf('}');
                            if (firstBrace >= 0 && lastBrace > firstBrace)
                            {
                                jsonCandidate = jsonCandidate.Substring(firstBrace, lastBrace - firstBrace + 1);
                            }

                            // parse and validate exact JSON schema
                            try
                            {
                                using var payloadDoc = JsonDocument.Parse(jsonCandidate);
                                var root = payloadDoc.RootElement;

                                var name = ExtractString(root, "name");
                                var colors = ExtractStringArray(root, "colors");
                                var categories = ExtractStringArray(root, "categories");
                                var sizes = ExtractStringArray(root, "sizes");
                                var seasons = ExtractStringArray(root, "seasons");
                                var occasions = ExtractStringArray(root, "occasions");
                                var description = ExtractString(root, "description");


                                return new AiSegmentResult
                                {
                                    ImageDataUrl = imageDataUrl,
                                    Name = name,
                                    Colors = colors,
                                    Categories = categories,
                                    Sizes = sizes,
                                    Seasons = seasons,
                                    Occasions = occasions,
                                    Description = description
                                };
                            }
                            catch (JsonException jex)
                            {
                                throw new Exception($"Gemini returned invalid JSON metadata: {jex.Message}\nFull textPart: {textPart}");
                            }
                        }
                    }
                }

                if (attempt == 2)
                    throw new Exception("No valid image data found in Gemini response after retries.");
            }

            throw new Exception("No image returned from Gemini after retries.");
        }
        private string ExtractString(JsonElement root, string propertyName)
        {
            return root.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.String
                ? prop.GetString() ?? ""
                : "";
        }

        private string[] ExtractStringArray(JsonElement root, string propertyName)
        {
            return root.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.Array
                ? prop.EnumerateArray()
                    .Where(e => e.ValueKind == JsonValueKind.String)
                    .Select(e => e.GetString() ?? "")
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToArray()
                : Array.Empty<string>();
        }

        private string? ExtractMimeType(string base64)
        {
            if (base64.StartsWith("data:"))
            {
                var semicolonIndex = base64.IndexOf(";", StringComparison.Ordinal);
                if (semicolonIndex > 5)
                {
                    return base64.Substring(5, semicolonIndex - 5);
                }
            }
            return null;
        }


        private async Task SaveImageToFileAsync(string imageBase64, string mimeType)
        {
            try
            {
                var bytes = Convert.FromBase64String(imageBase64);
                var outputPath = Path.Combine(Directory.GetCurrentDirectory(), "VTO_Results");
                Directory.CreateDirectory(outputPath);

                var extension = mimeType switch
                {
                    "image/jpeg" => ".jpg",
                    "image/png" => ".png",
                    "image/webp" => ".webp",
                    _ => ".png"
                };

                var fileName = $"virtual_try_on_{DateTime.Now:yyyyMMdd_HHmmss}{extension}";
                var filePath = Path.Combine(outputPath, fileName);
                await File.WriteAllBytesAsync(filePath, bytes);
                Console.WriteLine($"Saved result to: {filePath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed saving image: {ex.Message}");
            }
        }

        private async Task<string> ProcessImageAsync(string imageInput)
        {
            if (string.IsNullOrEmpty(imageInput))
                return string.Empty;

            // Check if input looks like a presigned URL fragment (contains query parameters like X-Amz-Expires)
            if (imageInput.Contains("X-Amz-Expires") || imageInput.Contains("X-Amz-Algorithm") ||
                imageInput.Contains("X-Amz-Signature"))
            {
                try
                {
                    // Extract filename from presigned URL fragment
                    // Format: "filename.webp?X-Amz-Expires=120&X-Amz-Algorithm=..."
                    var questionMarkIndex = imageInput.IndexOf('?');
                    var fileName = questionMarkIndex >= 0 ? imageInput.Substring(0, questionMarkIndex) : imageInput;
                    return await ProcessImageAsync(imageInput);
                }
                catch (Exception ex)
                {
                    throw new Exception($"Failed to download presigned URL fragment: {imageInput}. Error: {ex.Message}", ex);
                }
            }

            // Check if input is a filename (has no slashes and likely ends with image extension)
            if (!imageInput.Contains("/") && !imageInput.Contains("\\") &&
                !imageInput.Contains("?") && // Not a URL with query params
                (imageInput.EndsWith(".webp", StringComparison.OrdinalIgnoreCase) ||
                 imageInput.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
                 imageInput.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
                 imageInput.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)))
            {
                try
                {
                    // Download from Wasabi (checks items/outfits folders)
                    return await ProcessImageAsync(imageInput); //Fix Later
                }
                catch (Exception ex)
                {
                    throw new Exception($"Failed to download file '{imageInput}' from Wasabi: {ex.Message}", ex);
                }
            }

            // Otherwise, treat as data URL or raw base64
            return CleanBase64(imageInput);
        }

        private string CleanBase64(string base64)
        {
            if (string.IsNullOrEmpty(base64)) return string.Empty;
            var commaIndex = base64.IndexOf(",");
            return commaIndex >= 0 ? base64[(commaIndex + 1)..] : base64;
        }
    }
}
