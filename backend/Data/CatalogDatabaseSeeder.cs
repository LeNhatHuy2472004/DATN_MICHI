using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ThienPlan.Api.Data;

public static class CatalogDatabaseSeeder
{
    // Bump the version suffix to force a re-seed (e.g. when adding new demo SKUs).
    // Existing rows are preserved; only the absence of this marker triggers seeding.
    private const string InitialSeedKey = "initial-catalog/v1";

    private static readonly CategoryRecord[] SeedCategories =
    [
        new(1, "Áo", "ao", null, 1),
        new(2, "Quần", "quan", null, 2),
        new(3, "Áo khoác", "ao-khoac", 1, 3),
        new(4, "Phụ kiện", "phu-kien", null, 4),
        new(5, "Váy", "vay", null, 5),
        new(6, "Đầm", "dam", null, 6),
        new(7, "Giày", "giay", null, 7),
        new(8, "Túi", "tui", 4, 8)
    ];

    public static async Task SeedAsync(
        AppDbContext db,
        DemoStore store,
        string? assetsRoot = null,
        CancellationToken cancellationToken = default)
    {
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await EnsureSchemaUpdatesAsync(db, cancellationToken);
        await SeedUsersAsync(db, cancellationToken);

        var alreadySeeded = await db.SeedMarkers.AnyAsync(x => x.Key == InitialSeedKey, cancellationToken);
        if (!alreadySeeded)
        {
            // First-run seed: categories + products with image URLs resolved from manifest.
            // Once the marker is committed, future startups skip this block — admin
            // deletions are respected forever (no auto-revival).
            db.CatalogCategories.AddRange(SeedCategories.Select(x => new CatalogCategoryEntity
            {
                Name = x.Name,
                Slug = x.Slug,
                ParentId = x.ParentId,
                DisplayOrder = x.DisplayOrder
            }));

            var manifest = LoadSeedManifest(assetsRoot);
            var products = BuildProducts(manifest);
            db.CatalogProducts.AddRange(products.Select(ToEntity));

            db.SeedMarkers.Add(new SeedMarkerEntity
            {
                Key = InitialSeedKey,
                AppliedAt = DateTimeOffset.UtcNow,
                Notes = $"{products.Count} products, {SeedCategories.Length} categories"
            });

            await db.SaveChangesAsync(cancellationToken);
        }

        await SeedVouchersAsync(db, cancellationToken);
        await ReloadStoreAsync(db, store, cancellationToken);
    }

    private static async Task EnsureSchemaUpdatesAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[Vouchers]', N'U') IS NULL
BEGIN
    CREATE TABLE [Vouchers] (
        [Id] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Name] nvarchar(180) NOT NULL,
        [Type] nvarchar(40) NOT NULL,
        [Value] decimal(18,2) NOT NULL,
        [MaxDiscount] decimal(18,2) NOT NULL,
        [MinOrderAmount] decimal(18,2) NOT NULL,
        [Quantity] int NOT NULL,
        [UsedCount] int NOT NULL,
        [ApplicableTier] nvarchar(40) NOT NULL,
        [Scope] nvarchar(40) DEFAULT N'All' NOT NULL,
        [CustomerId] uniqueidentifier NULL,
        [IsActive] bit NOT NULL,
        [StartAt] datetimeoffset NOT NULL,
        [ExpireAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Vouchers] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Vouchers_Code' AND object_id = OBJECT_ID(N'[Vouchers]'))
BEGIN
    CREATE UNIQUE INDEX [IX_Vouchers_Code] ON [Vouchers] ([Code]);
END;

IF COL_LENGTH(N'[Vouchers]', N'Scope') IS NULL
BEGIN
    ALTER TABLE [Vouchers] ADD [Scope] nvarchar(40) DEFAULT N'All' NOT NULL;
    ALTER TABLE [Vouchers] ADD [CustomerId] uniqueidentifier NULL;
END;

IF OBJECT_ID(N'[Users]', N'U') IS NULL
BEGIN
    CREATE TABLE [Users] (
        [Id] uniqueidentifier NOT NULL,
        [Email] nvarchar(180) NOT NULL,
        [PasswordHash] nvarchar(256) NOT NULL,
        [Role] nvarchar(40) NOT NULL,
        [FullName] nvarchar(180) NOT NULL,
        [IsActive] bit NOT NULL,
        [MembershipTier] nvarchar(40) NOT NULL,
        [TotalSpent] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]);
END;
""", cancellationToken);
    }

    private static async Task SeedUsersAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        if (await db.Users.AnyAsync(cancellationToken)) return;

        var now = DateTimeOffset.UtcNow;
        db.Users.AddRange(
            new UserEntity { Id = Guid.Parse("11111111-1111-1111-1111-111111111111"), Email = "admin@miichin.local", PasswordHash = "Admin@123", Role = "Administrator", FullName = "Quản trị MiiChin", IsActive = true, MembershipTier = "Diamond", TotalSpent = 36000000, CreatedAt = now },
            new UserEntity { Id = Guid.Parse("22222222-2222-2222-2222-222222222222"), Email = "staff@miichin.local", PasswordHash = "Staff@123", Role = "Staff", FullName = "Nhân viên MiiChin", IsActive = true, MembershipTier = "Silver", TotalSpent = 4000000, CreatedAt = now },
            new UserEntity { Id = Guid.Parse("33333333-3333-3333-3333-333333333333"), Email = "customer@miichin.local", PasswordHash = "Customer@123", Role = "Customer", FullName = "Khách hàng MiiChin", IsActive = true, MembershipTier = "Bronze", TotalSpent = 1500000, CreatedAt = now }
        );
        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task SeedVouchersAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        if (await db.Vouchers.AnyAsync(cancellationToken))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        db.Vouchers.AddRange(
            new VoucherEntity
            {
                Id = Guid.NewGuid(),
                Code = "WELCOME50",
                Name = "Giảm 50K cho đơn đầu",
                Type = "FixedAmount",
                Value = 50000,
                MaxDiscount = 50000,
                MinOrderAmount = 300000,
                Quantity = 100,
                UsedCount = 0,
                ApplicableTier = "All",
                Scope = "All",
                IsActive = true,
                StartAt = now.AddDays(-1),
                ExpireAt = now.AddMonths(2)
            },
            new VoucherEntity
            {
                Id = Guid.NewGuid(),
                Code = "FREESHIP",
                Name = "Miễn phí vận chuyển",
                Type = "FreeShip",
                Value = 30000,
                MaxDiscount = 30000,
                MinOrderAmount = 200000,
                Quantity = 200,
                UsedCount = 0,
                ApplicableTier = "All",
                Scope = "All",
                IsActive = true,
                StartAt = now.AddDays(-1),
                ExpireAt = now.AddMonths(1)
            },
            new VoucherEntity
            {
                Id = Guid.NewGuid(),
                Code = "BRONZE30",
                Name = "Ưu đãi khách Bronze",
                Type = "FixedAmount",
                Value = 30000,
                MaxDiscount = 30000,
                MinOrderAmount = 250000,
                Quantity = 100,
                UsedCount = 0,
                ApplicableTier = "Bronze",
                Scope = "Tier",
                IsActive = true,
                StartAt = now.AddDays(-1),
                ExpireAt = now.AddMonths(2)
            },
            new VoucherEntity
            {
                Id = Guid.NewGuid(),
                Code = "SILVER7",
                Name = "Ưu đãi khách Silver",
                Type = "Percent",
                Value = 7,
                MaxDiscount = 90000,
                MinOrderAmount = 500000,
                Quantity = 80,
                UsedCount = 0,
                ApplicableTier = "Silver",
                Scope = "Tier",
                IsActive = true,
                StartAt = now.AddDays(-1),
                ExpireAt = now.AddMonths(3)
            },
            new VoucherEntity
            {
                Id = Guid.NewGuid(),
                Code = "GOLD10",
                Name = "Ưu đãi khách Gold",
                Type = "Percent",
                Value = 10,
                MaxDiscount = 120000,
                MinOrderAmount = 800000,
                Quantity = 50,
                UsedCount = 0,
                ApplicableTier = "Gold",
                Scope = "Tier",
                IsActive = true,
                StartAt = now.AddDays(-1),
                ExpireAt = now.AddMonths(3)
            },
            new VoucherEntity
            {
                Id = Guid.NewGuid(),
                Code = "DIAMOND15",
                Name = "Ưu đãi khách Diamond",
                Type = "Percent",
                Value = 15,
                MaxDiscount = 200000,
                MinOrderAmount = 1200000,
                Quantity = 30,
                UsedCount = 0,
                ApplicableTier = "Diamond",
                Scope = "Tier",
                IsActive = true,
                StartAt = now.AddDays(-1),
                ExpireAt = now.AddMonths(3)
            });

        await db.SaveChangesAsync(cancellationToken);
    }

    // Manifest schema:
    //   { "<slug>": "/assets/seed/products/foo.jpg", ...,
    //     "_default": { "1": "/assets/seed/products/top.jpg", "2": ... } }
    private sealed class SeedManifest
    {
        public Dictionary<string, string> BySlug { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<int, string> ByCategory { get; } = new();

        public string Resolve(string slug, int categoryId)
        {
            if (BySlug.TryGetValue(slug, out var url) && !string.IsNullOrWhiteSpace(url))
                return url;
            if (ByCategory.TryGetValue(categoryId, out var fallback) && !string.IsNullOrWhiteSpace(fallback))
                return fallback;
            return string.Empty;
        }
    }

    private static SeedManifest LoadSeedManifest(string? assetsRoot)
    {
        var manifest = new SeedManifest();
        if (string.IsNullOrWhiteSpace(assetsRoot)) return manifest;
        var path = Path.Combine(assetsRoot, "seed", "products", "manifest.json");
        if (!File.Exists(path)) return manifest;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Name == "_default" && prop.Value.ValueKind == JsonValueKind.Object)
                {
                    foreach (var inner in prop.Value.EnumerateObject())
                    {
                        if (int.TryParse(inner.Name, out var catId) && inner.Value.ValueKind == JsonValueKind.String)
                        {
                            manifest.ByCategory[catId] = inner.Value.GetString() ?? string.Empty;
                        }
                    }
                }
                else if (prop.Value.ValueKind == JsonValueKind.String)
                {
                    manifest.BySlug[prop.Name] = prop.Value.GetString() ?? string.Empty;
                }
            }
        }
        catch (Exception ex)
        {
            // Manifest corruption shouldn't break startup — products just get empty ImageUrl.
            Console.Error.WriteLine($"[seed] manifest.json parse failed: {ex.Message}");
        }
        return manifest;
    }

    public static async Task ReloadStoreAsync(AppDbContext db, DemoStore store, CancellationToken cancellationToken = default)
    {
        var categories = await db.CatalogCategories
            .AsNoTracking()
            .OrderBy(x => x.DisplayOrder)
            .Select(x => new CategoryRecord(x.Id, x.Name, x.Slug, x.ParentId, x.DisplayOrder))
            .ToListAsync(cancellationToken);

        var productEntities = await db.CatalogProducts
            .AsNoTracking()
            .Include(x => x.Variants)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        var products = productEntities
            .Select(x => new ProductRecord(
                x.Id,
                x.Name,
                x.Slug,
                x.Description,
                x.CategoryId,
                x.Brand,
                x.Material,
                x.Gender,
                x.BasePrice,
                x.IsActive,
                x.TagsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
                x.ImageUrl,
                x.Variants.OrderBy(v => v.Sku).Select(v => new ProductVariantRecord(v.Id, v.Sku, v.Color, v.Size, v.Price, v.StockQty, v.ImageUrl)).ToList()))
            .ToList();

        store.ReplaceCatalog(categories, products);
    }

    public static CatalogProductEntity ToEntity(ProductRecord product) => new()
    {
        Id = product.Id,
        Name = product.Name,
        Slug = product.Slug,
        Description = product.Description,
        CategoryId = product.CategoryId,
        Brand = product.Brand,
        Material = product.Material,
        Gender = product.Gender,
        BasePrice = product.BasePrice,
        IsActive = product.IsActive,
        TagsCsv = string.Join(", ", product.Tags),
        ImageUrl = product.ImageUrl,
        Variants = product.Variants.Select(v => new CatalogProductVariantEntity
        {
            Id = v.Id,
            ProductId = product.Id,
            Sku = v.Sku,
            Color = v.Color,
            Size = v.Size,
            Price = v.Price,
            StockQty = v.StockQty,
            ImageUrl = v.ImageUrl
        }).ToList()
    };

    private static List<ProductRecord> BuildProducts(SeedManifest manifest)
    {
        // imageUrl per product comes from assets/seed/products/manifest.json — the seeder
        // resolves it once at first-run time. After that admin can upload/replace via
        // POST /api/admin/upload/image + PUT /api/admin/products/:id.
        ProductRecord DemoProduct(
            string name,
            string slug,
            string description,
            int categoryId,
            string material,
            string gender,
            decimal price,
            string[] tags,
            string[] colors,
            string[] sizes)
        {
            var imageUrl = manifest.Resolve(slug, categoryId);
            var skuPrefix = string.Join(string.Empty, slug.Split('-', StringSplitOptions.RemoveEmptyEntries).Take(3)).ToUpperInvariant();
            return new ProductRecord(
                StableGuid(slug),
                name,
                slug,
                description,
                categoryId,
                "MiiChin",
                material,
                gender,
                price,
                true,
                [.. tags],
                imageUrl,
                colors.SelectMany((color, colorIndex) =>
                    sizes.Select((size, sizeIndex) => new ProductVariantRecord(
                        StableGuid($"{slug}-{colorIndex}-{size}"),
                        $"MIICHIN-{skuPrefix}-{colorIndex + 1}{size}",
                        color,
                        size,
                        price + sizeIndex * 10000,
                        10 + colorIndex * 6 + sizeIndex * 4,
                        imageUrl))).ToList());
        }

        return
        [
            DemoProduct("Áo thun cotton MiiChin Daily", "ao-thun-cotton-miichin-daily", "Áo thun cotton mềm, form vừa, cổ tròn gọn và dễ phối với quần jeans hoặc chân váy.", 1, "Cotton 100%", "Unisex", 249000, ["daily", "cotton", "minimal"], ["Đen", "Trắng"], ["M", "L"]),
            DemoProduct("Quần jeans ống suông xanh nhạt", "quan-jeans-ong-suong", "Chất denim đứng form, dáng ống suông thoải mái, hợp đi làm, đi học và dạo phố cuối tuần.", 2, "Denim", "Unisex", 520000, ["denim", "street", "casual"], ["Xanh denim", "Đen washed"], ["M", "L"]),
            DemoProduct("Áo khoác linen dáng ngắn", "ao-khoac-linen-dang-ngan", "Áo khoác linen nhẹ, bề mặt mềm, phù hợp phối nhiều lớp khi đi làm hoặc đi cafe.", 3, "Linen blend", "Unisex", 690000, ["outerwear", "linen", "soft-neutral"], ["Be", "Ghi"], ["M", "L"]),
            DemoProduct("Sơ mi linen trắng MiiChin", "so-mi-linen-trang-miichin", "Sơ mi linen trắng nhẹ, đường may tối giản, mặc riêng hoặc khoác ngoài áo thun đều đẹp.", 1, "Linen", "Unisex", 430000, ["linen", "office", "minimal"], ["Trắng", "Kem"], ["M", "L"]),
            DemoProduct("Áo polo pique cổ dệt", "ao-polo-pique-co-det", "Áo polo pique bề mặt thoáng, cổ dệt gọn, hợp đi học và đi làm casual.", 1, "Pique cotton", "Unisex", 329000, ["polo", "smart-casual", "daily"], ["Đen", "Trắng ngà", "Xám"], ["S", "M", "L"]),
            DemoProduct("Áo tank top rib mềm", "ao-tank-top-rib-mem", "Tank top rib co giãn nhẹ, mặc riêng mùa nóng hoặc làm lớp lót bên trong áo khoác.", 1, "Rib cotton", "Nữ", 199000, ["summer", "rib", "layering"], ["Đen", "Trắng", "Nâu nhạt"], ["S", "M", "L"]),
            DemoProduct("Áo croptop basic cổ vuông", "ao-croptop-basic-co-vuong", "Croptop cổ vuông, phom ôm vừa, phù hợp phối quần cạp cao hoặc chân váy chữ A.", 1, "Cotton spandex", "Nữ", 259000, ["croptop", "casual", "feminine"], ["Đen", "Trắng", "Hồng phấn"], ["S", "M", "L"]),
            DemoProduct("Áo sơ mi Oxford xanh nhạt", "ao-so-mi-oxford-xanh-nhat", "Sơ mi Oxford dày vừa, cổ đứng, dễ phối với quần tây, quần jeans hoặc mặc khoác ngoài.", 1, "Oxford cotton", "Unisex", 459000, ["office", "oxford", "classic"], ["Xanh nhạt", "Trắng"], ["M", "L", "XL"]),
            DemoProduct("Áo blouse tay phồng", "ao-blouse-tay-phong", "Blouse tay phồng nhẹ, cổ tròn, tạo điểm nhấn mềm cho outfit đi làm hoặc cafe.", 1, "Voan cotton", "Nữ", 389000, ["blouse", "office", "soft"], ["Trắng", "Kem"], ["S", "M", "L"]),
            DemoProduct("Áo hoodie nỉ trơn", "ao-hoodie-ni-tron", "Hoodie nỉ trơn, mũ hai lớp, bo tay chắc và đủ ấm cho ngày se lạnh.", 1, "Fleece cotton", "Unisex", 590000, ["hoodie", "street", "warm"], ["Đen", "Xám tro"], ["M", "L", "XL"]),
            DemoProduct("Áo sweater cổ tròn", "ao-sweater-co-tron", "Sweater cổ tròn chất nỉ mềm, fit rộng vừa, hợp phối nhiều lớp.", 1, "French terry", "Unisex", 520000, ["sweater", "layering", "minimal"], ["Xám", "Navy", "Kem"], ["M", "L", "XL"]),
            DemoProduct("Áo cardigan len mỏng", "ao-cardigan-len-mong", "Cardigan len mỏng, cài nút trước, mặc ngoài áo thun hoặc đầm hai dây.", 3, "Acrylic wool", "Nữ", 560000, ["cardigan", "layering", "soft"], ["Kem", "Ghi", "Đen"], ["S", "M", "L"]),
            DemoProduct("Áo blazer linen relaxed", "ao-blazer-linen-relaxed", "Blazer linen phom relaxed, vai mềm, dùng tốt cho outfit công sở tối giản.", 3, "Linen rayon", "Unisex", 890000, ["blazer", "office", "linen"], ["Đen", "Be", "Ghi"], ["M", "L", "XL"]),
            DemoProduct("Áo khoác denim washed", "ao-khoac-denim-washed", "Áo khoác denim washed phom rộng, túi hộp trước, phối tốt với áo thun basic.", 3, "Denim", "Unisex", 760000, ["denim", "outerwear", "street"], ["Xanh denim", "Đen washed"], ["M", "L", "XL"]),
            DemoProduct("Áo khoác bomber nylon", "ao-khoac-bomber-nylon", "Bomber nylon nhẹ, chống gió vừa phải, cổ và bo tay dệt gọn.", 3, "Nylon", "Unisex", 720000, ["bomber", "street", "outerwear"], ["Đen", "Xanh rêu"], ["M", "L", "XL"]),
            DemoProduct("Quần tây ống đứng", "quan-tay-ong-dung", "Quần tây ống đứng, cạp gọn, chất ít nhăn cho ngày làm việc dài.", 2, "Poly rayon", "Unisex", 540000, ["trousers", "office", "minimal"], ["Đen", "Ghi"], ["M", "L", "XL"]),
            DemoProduct("Quần kaki slim crop", "quan-kaki-slim-crop", "Quần kaki slim crop ngang mắt cá, dễ phối sneaker hoặc loafer.", 2, "Kaki cotton", "Unisex", 490000, ["khaki", "daily", "smart-casual"], ["Be", "Đen", "Xanh olive"], ["M", "L", "XL"]),
            DemoProduct("Quần cargo túi hộp", "quan-cargo-tui-hop", "Quần cargo túi hộp, dây rút lai, phù hợp outfit streetwear năng động.", 2, "Canvas cotton", "Unisex", 620000, ["cargo", "street", "utility"], ["Đen", "Xanh rêu"], ["M", "L", "XL"]),
            DemoProduct("Quần jogger nỉ bo gấu", "quan-jogger-ni-bo-gau", "Jogger nỉ bo gấu, lưng thun dây rút, mặc nhà hoặc đi chơi cuối tuần.", 2, "Fleece cotton", "Unisex", 430000, ["jogger", "comfort", "daily"], ["Xám", "Đen"], ["M", "L", "XL"]),
            DemoProduct("Quần short linen", "quan-short-linen", "Short linen lưng thun, nhẹ và thoáng cho mùa nóng.", 2, "Linen blend", "Unisex", 350000, ["shorts", "summer", "linen"], ["Be", "Trắng", "Đen"], ["S", "M", "L"]),
            DemoProduct("Chân váy chữ A denim", "chan-vay-chu-a-denim", "Chân váy chữ A denim, cạp cao, dễ phối croptop hoặc áo sơ mi.", 5, "Denim", "Nữ", 420000, ["skirt", "denim", "casual"], ["Xanh denim", "Đen"], ["S", "M", "L"]),
            DemoProduct("Chân váy midi xếp ly", "chan-vay-midi-xep-ly", "Váy midi xếp ly rũ nhẹ, chuyển động mềm, hợp đi làm và đi chơi.", 5, "Poly chiffon", "Nữ", 480000, ["midi", "feminine", "office"], ["Đen", "Kem", "Nâu"], ["S", "M", "L"]),
            DemoProduct("Đầm suông cotton", "dam-suong-cotton", "Đầm suông cotton cổ tròn, phom thoải mái, mặc nhanh cho ngày bận.", 6, "Cotton", "Nữ", 520000, ["dress", "daily", "comfort"], ["Đen", "Trắng", "Xanh navy"], ["S", "M", "L"]),
            DemoProduct("Đầm sơ mi thắt eo", "dam-so-mi-that-eo", "Đầm sơ mi thắt eo, hàng nút trước, tạo dáng gọn nhưng vẫn dễ vận động.", 6, "Cotton poplin", "Nữ", 650000, ["shirt-dress", "office", "smart"], ["Trắng", "Xanh nhạt"], ["S", "M", "L"]),
            DemoProduct("Đầm hai dây satin", "dam-hai-day-satin", "Đầm hai dây satin bề mặt mịn, có thể phối cardigan hoặc blazer mỏng.", 6, "Satin", "Nữ", 590000, ["satin", "party", "layering"], ["Đen", "Champagne"], ["S", "M", "L"]),
            DemoProduct("Nón cap thêu logo MiiChin", "non-cap-theu-logo-miichin", "Nón cap cotton thêu logo MiiChin, khóa chỉnh sau, phù hợp outfit casual.", 4, "Cotton twill", "Unisex", 190000, ["cap", "accessory", "logo"], ["Đen", "Trắng", "Be"], ["FreeSize"]),
            DemoProduct("Túi tote canvas MiiChin", "tui-tote-canvas-miichin", "Túi tote canvas dày, quai dài, chứa vừa laptop nhỏ và đồ cá nhân.", 8, "Canvas", "Unisex", 240000, ["tote", "accessory", "daily"], ["Trắng ngà", "Đen"], ["FreeSize"]),
            DemoProduct("Thắt lưng da basic", "that-lung-da-basic", "Thắt lưng da basic mặt kim loại tối giản, dùng tốt với quần jeans hoặc quần tây.", 4, "Da tổng hợp", "Unisex", 260000, ["belt", "accessory", "classic"], ["Đen", "Nâu"], ["FreeSize"]),
            DemoProduct("Khăn lụa vuông", "khan-lua-vuong", "Khăn lụa vuông mềm, dùng quàng cổ, buộc túi hoặc làm điểm nhấn tóc.", 4, "Poly silk", "Nữ", 220000, ["scarf", "accessory", "soft"], ["Kem", "Đen", "Nâu"], ["FreeSize"]),
            DemoProduct("Vớ cổ cao rib", "vo-co-cao-rib", "Vớ cổ cao rib co giãn, chất cotton blend thấm hút tốt.", 4, "Cotton blend", "Unisex", 69000, ["socks", "basic", "daily"], ["Trắng", "Đen", "Xám"], ["FreeSize"]),
            DemoProduct("Giày sneaker trắng tối giản", "giay-sneaker-trang-toi-gian", "Sneaker trắng tối giản, đế êm, dễ phối với hầu hết outfit trong shop.", 7, "Da tổng hợp", "Unisex", 790000, ["sneaker", "minimal", "daily"], ["Trắng", "Đen"], ["38", "39", "40", "41"]),
            DemoProduct("Giày loafer đen", "giay-loafer-den", "Loafer đen mũi tròn, hợp outfit công sở và smart casual.", 7, "Da tổng hợp", "Unisex", 850000, ["loafer", "office", "classic"], ["Đen", "Nâu"], ["38", "39", "40", "41"]),
            DemoProduct("Dép quai ngang mềm", "dep-quai-ngang-mem", "Dép quai ngang nhẹ, lót mềm, dùng cho ngày nghỉ hoặc đi biển.", 7, "EVA", "Unisex", 290000, ["slides", "summer", "comfort"], ["Đen", "Kem"], ["38", "39", "40", "41"])
        ];
    }

    private static Guid StableGuid(string value)
    {
        var bytes = System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes(value));
        return new Guid(bytes);
    }
}
