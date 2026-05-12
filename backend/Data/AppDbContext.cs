using Microsoft.EntityFrameworkCore;

namespace ThienPlan.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<CatalogCategoryEntity> CatalogCategories => Set<CatalogCategoryEntity>();
    public DbSet<CatalogProductEntity> CatalogProducts => Set<CatalogProductEntity>();
    public DbSet<CatalogProductVariantEntity> CatalogProductVariants => Set<CatalogProductVariantEntity>();
    public DbSet<VoucherEntity> Vouchers => Set<VoucherEntity>();
    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<SeedMarkerEntity> SeedMarkers => Set<SeedMarkerEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CatalogCategoryEntity>(entity =>
        {
            entity.ToTable("CatalogCategories");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Slug).HasMaxLength(180).IsRequired();
        });

        modelBuilder.Entity<CatalogProductEntity>(entity =>
        {
            entity.ToTable("CatalogProducts");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(220).IsRequired();
            entity.Property(x => x.Slug).HasMaxLength(240).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1200).IsRequired();
            entity.Property(x => x.Brand).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Material).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Gender).HasMaxLength(40).IsRequired();
            entity.Property(x => x.BasePrice).HasColumnType("decimal(18,2)");
            entity.Property(x => x.TagsCsv).HasMaxLength(600).IsRequired();
            entity.Property(x => x.ImageUrl).HasMaxLength(500).IsRequired();
            entity.HasIndex(x => x.Slug).IsUnique();
            entity.HasOne<CatalogCategoryEntity>()
                .WithMany()
                .HasForeignKey(x => x.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CatalogProductVariantEntity>(entity =>
        {
            entity.ToTable("CatalogProductVariants");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Sku).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Color).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Size).HasMaxLength(40).IsRequired();
            entity.Property(x => x.Price).HasColumnType("decimal(18,2)");
            entity.Property(x => x.ImageUrl).HasMaxLength(500).IsRequired();
            entity.HasIndex(x => x.Sku).IsUnique();
            entity.HasOne(x => x.Product)
                .WithMany(x => x.Variants)
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VoucherEntity>(entity =>
        {
            entity.ToTable("Vouchers");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(40).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(180).IsRequired();
            entity.Property(x => x.Type).HasMaxLength(40).IsRequired();
            entity.Property(x => x.Value).HasColumnType("decimal(18,2)");
            entity.Property(x => x.MaxDiscount).HasColumnType("decimal(18,2)");
            entity.Property(x => x.MinOrderAmount).HasColumnType("decimal(18,2)");
            entity.Property(x => x.ApplicableTier).HasMaxLength(40).IsRequired();
            entity.Property(x => x.Scope).HasMaxLength(40).IsRequired();
            entity.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<SeedMarkerEntity>(entity =>
        {
            entity.ToTable("SeedMarkers");
            entity.HasKey(x => x.Key);
            entity.Property(x => x.Key).HasMaxLength(80);
            entity.Property(x => x.Notes).HasMaxLength(400);
        });

        modelBuilder.Entity<UserEntity>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(180).IsRequired();
            entity.Property(x => x.PasswordHash).HasMaxLength(256).IsRequired();
            entity.Property(x => x.Role).HasMaxLength(40).IsRequired();
            entity.Property(x => x.FullName).HasMaxLength(180).IsRequired();
            entity.Property(x => x.MembershipTier).HasMaxLength(40).IsRequired();
            entity.Property(x => x.TotalSpent).HasColumnType("decimal(18,2)");
            entity.HasIndex(x => x.Email).IsUnique();
        });
    }
}

public sealed class CatalogCategoryEntity
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public int? ParentId { get; set; }
    public int DisplayOrder { get; set; }
}

public sealed class CatalogProductEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public string Brand { get; set; } = string.Empty;
    public string Material { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public decimal BasePrice { get; set; }
    public bool IsActive { get; set; }
    public string TagsCsv { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public List<CatalogProductVariantEntity> Variants { get; set; } = [];
}

public sealed class CatalogProductVariantEntity
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public CatalogProductEntity Product { get; set; } = null!;
    public string Sku { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public string Size { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int StockQty { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
}

public sealed class VoucherEntity
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public decimal Value { get; set; }
    public decimal MaxDiscount { get; set; }
    public decimal MinOrderAmount { get; set; }
    public int Quantity { get; set; }
    public int UsedCount { get; set; }
    public string ApplicableTier { get; set; } = "All";
    public string Scope { get; set; } = "All"; // All, Tier, Customer
    public Guid? CustomerId { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset StartAt { get; set; }
    public DateTimeOffset ExpireAt { get; set; }

    public decimal CalculateDiscount(decimal subtotal)
    {
        if (!IsActive || subtotal < MinOrderAmount || UsedCount >= Quantity || DateTimeOffset.UtcNow < StartAt || DateTimeOffset.UtcNow > ExpireAt)
        {
            return 0;
        }

        return Type switch
        {
            "Percent" => Math.Min(subtotal * Value / 100, MaxDiscount),
            "FixedAmount" => Math.Min(Value, subtotal),
            "FreeShip" => Math.Min(Value, MaxDiscount),
            _ => 0
        };
    }
}

// Records that a one-shot seed has already been applied. Once a row exists for a
// given Key (e.g. "initial-catalog/v1"), the seeder will skip itself even when
// the catalog tables are empty — admin deletions are respected forever.
public sealed class SeedMarkerEntity
{
    public string Key { get; set; } = string.Empty;
    public DateTimeOffset AppliedAt { get; set; }
    public string Notes { get; set; } = string.Empty;
}

public sealed class UserEntity
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "Customer";
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public string MembershipTier { get; set; } = "Bronze";
    public decimal TotalSpent { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
