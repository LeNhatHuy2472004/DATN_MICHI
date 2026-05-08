using System.Collections.Concurrent;

namespace ThienPlan.Api.Data;

public sealed class DemoStore
{
    private readonly object _lock = new();

    public List<UserRecord> Users { get; } = [];
    public List<PermissionRecord> Permissions { get; } = [];
    public List<CategoryRecord> Categories { get; } = [];
    public List<ProductRecord> Products { get; } = [];
    public List<CartRecord> Carts { get; } = [];
    public List<OrderRecord> Orders { get; } = [];
    public List<PaymentRecord> Payments { get; } = [];
    public List<ReturnRecord> Returns { get; } = [];
    public List<ChatConversationRecord> Conversations { get; } = [];
    public List<ChatMessageRecord> ChatMessages { get; } = [];
    public ConcurrentDictionary<Guid, HashSet<string>> UserPermissions { get; } = new();

    public DemoStore()
    {
        SeedRuntimeData();
    }

    public object SyncRoot => _lock;

    public UserRecord? FindUser(string email) =>
        Users.FirstOrDefault(x => x.Email.Equals(email, StringComparison.OrdinalIgnoreCase));

    public void ReplaceCatalog(IEnumerable<CategoryRecord> categories, IEnumerable<ProductRecord> products)
    {
        lock (_lock)
        {
            Categories.Clear();
            Categories.AddRange(categories);
            Products.Clear();
            Products.AddRange(products);
        }
    }

    public void AddCatalogProduct(ProductRecord product)
    {
        lock (_lock)
        {
            Products.RemoveAll(x => x.Id == product.Id || x.Slug.Equals(product.Slug, StringComparison.OrdinalIgnoreCase));
            Products.Add(product);
        }
    }

    public bool RemoveCatalogProduct(Guid id)
    {
        lock (_lock)
        {
            return Products.RemoveAll(x => x.Id == id) > 0;
        }
    }

    public CartRecord GetCart(Guid? userId, string? guestToken)
    {
        lock (_lock)
        {
            var cart = Carts.FirstOrDefault(x =>
                userId.HasValue && x.UserId == userId ||
                !string.IsNullOrWhiteSpace(guestToken) && x.GuestToken == guestToken);
            if (cart is not null)
            {
                return cart;
            }

            cart = new CartRecord(Guid.NewGuid(), userId, guestToken ?? $"guest-{Guid.NewGuid():N}", []);
            Carts.Add(cart);
            return cart;
        }
    }

    public OrderRecord CreateOrder(CreateOrderRequest request)
    {
        lock (_lock)
        {
            var cart = GetCart(request.UserId, request.GuestToken);
            if (cart.Items.Count == 0)
            {
                throw new InvalidOperationException("Giỏ hàng đang trống.");
            }

            var subtotal = cart.Items.Sum(x => x.UnitPrice * x.Quantity);
            var discount = Math.Min(request.DiscountAmount, subtotal);

            var shippingFee = request.ShippingMethod == "PickupAtStore" ? 0 : 30000;
            var order = new OrderRecord(
                Guid.NewGuid(),
                $"TPC{DateTimeOffset.UtcNow:yyMMddHHmmss}{Orders.Count + 1:D3}",
                request.UserId,
                request.GuestInfo,
                [.. cart.Items.Select(x =>
                {
                    var product = Products.First(p => p.Variants.Any(v => v.Id == x.ProductVariantId));
                    var variant = product.Variants.First(v => v.Id == x.ProductVariantId);
                    return new OrderItemRecord(Guid.NewGuid(), product.Id, x.ProductVariantId, product.Name, variant.Sku, variant.Color, variant.Size, x.UnitPrice, x.Quantity);
                })],
                subtotal,
                discount,
                shippingFee,
                subtotal - discount + shippingFee,
                request.PaymentMethod,
                request.PaymentMethod == "Cash" ? "Unpaid" : "Pending",
                request.PaymentMethod == "Cash" ? "Confirmed" : "Pending",
                request.ShippingMethod,
                request.ShippingAddress,
                request.VoucherCode,
                request.Note,
                DateTimeOffset.UtcNow,
                [new StatusHistoryRecord("Created", request.PaymentMethod == "Cash" ? "Confirmed" : "Pending", "System", DateTimeOffset.UtcNow, "Tạo đơn hàng")]
            );

            foreach (var item in cart.Items)
            {
                var variant = Products.SelectMany(p => p.Variants).First(v => v.Id == item.ProductVariantId);
                variant.StockQty = Math.Max(0, variant.StockQty - item.Quantity);
            }

            Orders.Add(order);
            cart.Items.Clear();
            return order;
        }
    }

    private void SeedRuntimeData()
    {
        var admin = new UserRecord(Guid.Parse("11111111-1111-1111-1111-111111111111"), "admin@michi.local", "Admin@123", "Administrator", "Quản trị Michi", true, "Diamond", 36000000, DateTimeOffset.UtcNow);
        var staff = new UserRecord(Guid.Parse("22222222-2222-2222-2222-222222222222"), "staff@michi.local", "Staff@123", "Staff", "Nhân viên Michi", true, "Silver", 4000000, DateTimeOffset.UtcNow);
        var customer = new UserRecord(Guid.Parse("33333333-3333-3333-3333-333333333333"), "customer@michi.local", "Customer@123", "Customer", "Khách hàng Michi", true, "Bronze", 1500000, DateTimeOffset.UtcNow);
        Users.AddRange([admin, staff, customer]);

        var permissionCodes = new[]
        {
            "product.view", "product.create", "product.update", "product.delete", "product.import",
            "order.view", "order.create_pos", "order.update_status", "order.cancel", "order.refund",
            "return.view", "return.approve", "return.reject", "return.process_refund",
            "customer.view", "customer.create", "customer.update",
            "voucher.view", "voucher.create", "voucher.update", "voucher.expire",
            "staff.view", "staff.create", "staff.update_permissions",
            "report.view_sales", "report.view_inventory",
            "inventory.view", "inventory.adjust",
            "chat.view", "chat.reply", "chat.assign", "chat.close"
        };
        Permissions.AddRange(permissionCodes.Select((code, index) => new PermissionRecord(index + 1, code, ToPermissionName(code), code.Split('.')[0])));
        UserPermissions[admin.Id] = [.. permissionCodes];
        UserPermissions[staff.Id] = [.. permissionCodes.Where(x => !x.StartsWith("staff.") && !x.StartsWith("report."))];
        UserPermissions[customer.Id] = [];

        var conversationId = Guid.NewGuid();
        Conversations.Add(new ChatConversationRecord(conversationId, customer.Id, null, staff.Id, "Open", "Tư vấn phối đồ", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow));
        ChatMessages.Add(new ChatMessageRecord(Guid.NewGuid(), conversationId, customer.Id, "Customer", "Shop tư vấn giúp mình áo thun phối với quần nào nhé?", null, false, null, DateTimeOffset.UtcNow.AddMinutes(-4)));
        ChatMessages.Add(new ChatMessageRecord(Guid.NewGuid(), conversationId, staff.Id, "Staff", "Bạn có thể phối áo thun cotton Michi Daily với quần jeans ống suông để có set đồ gọn, mềm và dễ mặc hằng ngày.", null, false, null, DateTimeOffset.UtcNow.AddMinutes(-2)));
    }

    private static string ToPermissionName(string code) => string.Join(' ', code.Split('.', '_').Select(x => char.ToUpperInvariant(x[0]) + x[1..]));
}

public sealed record UserRecord(Guid Id, string Email, string Password, string Role, string FullName, bool IsActive, string MembershipTier, decimal TotalSpent12M, DateTimeOffset CreatedAt);
public sealed record PermissionRecord(int Id, string Code, string Name, string Module);
public sealed record CategoryRecord(int Id, string Name, string Slug, int? ParentId, int DisplayOrder);
public sealed record ProductRecord(Guid Id, string Name, string Slug, string Description, int CategoryId, string Brand, string Material, string Gender, decimal BasePrice, bool IsActive, List<string> Tags, string ImageUrl, List<ProductVariantRecord> Variants);
public sealed record ProductVariantRecord(Guid Id, string Sku, string Color, string Size, decimal Price, int StockQty, string ImageUrl)
{
    public int StockQty { get; set; } = StockQty;
}
public sealed record CartRecord(Guid Id, Guid? UserId, string GuestToken, List<CartItemRecord> Items);
public sealed record CartItemRecord(Guid ProductVariantId, int Quantity, decimal UnitPrice);
public sealed record GuestInfoRecord(string FullName, string PhoneNumber, string Email, string Address);
public sealed record CreateOrderRequest(Guid? UserId, string? GuestToken, GuestInfoRecord GuestInfo, string PaymentMethod, string ShippingMethod, string ShippingAddress, string? VoucherCode, decimal DiscountAmount, string? Note);
public sealed record OrderRecord(Guid Id, string OrderCode, Guid? UserId, GuestInfoRecord GuestInfo, List<OrderItemRecord> Items, decimal Subtotal, decimal DiscountAmount, decimal ShippingFee, decimal Total, string PaymentMethod, string PaymentStatus, string OrderStatus, string ShippingMethod, string ShippingAddress, string? VoucherCode, string? Note, DateTimeOffset CreatedAt, List<StatusHistoryRecord> History)
{
    public string PaymentStatus { get; set; } = PaymentStatus;
    public string OrderStatus { get; set; } = OrderStatus;
}
public sealed record OrderItemRecord(Guid Id, Guid ProductId, Guid ProductVariantId, string ProductName, string Sku, string Color, string Size, decimal UnitPrice, int Quantity)
{
    public decimal LineTotal => UnitPrice * Quantity;
}
public sealed record StatusHistoryRecord(string FromStatus, string ToStatus, string ChangedBy, DateTimeOffset ChangedAt, string? Note);
public sealed record PaymentRecord(Guid Id, Guid OrderId, string Method, decimal Amount, string TxnRef, string? VnpTransactionNo, string? BankCode, string? ResponseCode, string RawResponse, DateTimeOffset? PaidAt, string Status);
public sealed record ReturnRecord(Guid Id, Guid OrderId, string Reason, string Status, decimal RefundAmount, DateTimeOffset CreatedAt, Guid? ProcessedById, DateTimeOffset? ProcessedAt);
public sealed record ChatConversationRecord(Guid Id, Guid? CustomerId, string? GuestToken, Guid? AssignedStaffId, string Status, string Subject, DateTimeOffset LastMessageAt, DateTimeOffset CreatedAt)
{
    public string Status { get; set; } = Status;
    public DateTimeOffset LastMessageAt { get; set; } = LastMessageAt;
}
public sealed record ChatMessageRecord(Guid Id, Guid ConversationId, Guid? SenderId, string SenderType, string Content, string? AttachmentUrl, bool IsRead, DateTimeOffset? ReadAt, DateTimeOffset CreatedAt);
