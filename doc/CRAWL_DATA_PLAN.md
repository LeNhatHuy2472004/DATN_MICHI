# PLAN CRAWL DATA ẢNH QUẦN ÁO THẬT CHO MICHI

## Mục tiêu

Tạo nguồn ảnh và metadata sản phẩm thật cho shop Michi: ảnh rõ sản phẩm, text mô tả giống cửa hàng thật, có thông tin chất liệu, màu, size, giá và tag phối đồ.

## Nguồn dữ liệu ưu tiên

1. Ảnh tự chụp của shop: ưu tiên cao nhất vì không vướng quyền sử dụng thương mại.
2. Unsplash API: dùng cho ảnh lifestyle/lookbook và ảnh không có logo thương hiệu nổi bật. Theo trang license chính thức của Unsplash, ảnh có thể dùng miễn phí cho nhiều mục đích, kể cả thương mại, nhưng không dùng để tạo dịch vụ ảnh cạnh tranh và cần cẩn trọng với logo/người nhận diện.
3. Pexels/Pixabay API: nguồn dự phòng, vẫn phải lưu license/source URL.
4. Supplier feed: chỉ dùng khi có quyền phân phối ảnh từ nhà cung cấp.

## Schema dữ liệu crawl

```json
{
  "source": "unsplash",
  "sourceUrl": "https://unsplash.com/photos/...",
  "imageUrl": "https://images.unsplash.com/...",
  "downloadedFile": "frontend/public/assets/crawled/products/...",
  "name": "Sơ mi linen trắng Michi",
  "description": "Sơ mi linen trắng nhẹ, phom rộng vừa...",
  "category": "Áo",
  "brand": "Michi",
  "material": "Linen",
  "gender": "Unisex",
  "colors": ["Trắng"],
  "sizes": ["M", "L"],
  "tags": ["linen", "office", "minimal"],
  "license": "Unsplash License",
  "checkedAt": "2026-05-07"
}
```

## Pipeline đề xuất

1. Crawl danh sách ảnh theo keyword:
   - `linen shirt fashion`
   - `minimal outfit`
   - `denim streetwear`
   - `jacket outfit`
   - `clothing rack boutique`
2. Lọc tự động:
   - Loại ảnh mờ, quá tối, crop mất sản phẩm.
   - Loại ảnh có logo thương hiệu lớn hoặc watermark.
   - Ưu tiên ảnh tỉ lệ 4:5 hoặc 1:1 cho product card.
3. Chuẩn hóa ảnh:
   - Lưu local dưới `frontend/public/assets/crawled/products`.
   - Tạo bản `900px` cho detail và `480px` cho card.
   - Đổi tên file ASCII: `linen-shirt-white-001.jpg`.
4. Sinh metadata gợi ý:
   - Tên sản phẩm theo format: `{Loại sản phẩm} {chất liệu/màu} Michi`.
   - Mô tả ngắn 1-2 câu, giọng cửa hàng thật.
   - Tag phục vụ AI phối đồ: style, occasion, season, material.
5. Review thủ công:
   - Kiểm tra quyền sử dụng/source URL.
   - Kiểm tra ảnh không chứa logo thương hiệu rõ.
   - Kiểm tra mô tả tiếng Việt không lỗi dấu.
6. Import vào backend:
   - Dev nhanh: cập nhật seed trong `backend/Data/DemoStore.cs`.
   - Production: import vào bảng `Products`, `ProductVariants`, `ProductImages`, `ProductTags`.

## Acceptance

- Tối thiểu 30 sản phẩm thật, mỗi sản phẩm 2-4 ảnh.
- 100% ảnh có `sourceUrl`, `license`, `checkedAt`.
- Không có ảnh lỗi font/text watermark.
- Product card và detail page render không méo, không vỡ ảnh.

## Lưu ý pháp lý

Không crawl trực tiếp ảnh từ website shop khác nếu chưa có quyền. Với ảnh stock miễn phí, vẫn lưu nguồn và license để audit sau này.
