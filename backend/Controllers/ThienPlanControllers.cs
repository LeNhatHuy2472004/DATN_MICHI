using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using ThienPlan.Api.Data;
using ThienPlan.Api.Helpers;
using ThienPlan.Api.Services;

namespace ThienPlan.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AppDbContext db, DemoStore store, JwtTokenService jwt, EmailOtpService otpService) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == request.Email, cancellationToken);
        if (user is null || user.PasswordHash != request.Password || !user.IsActive)
        {
            return Unauthorized(new ApiError("Email hoặc mật khẩu không đúng.", "invalid_credentials"));
        }

        return Ok(ToAuthResponse(user, store, jwt.CreateToken(user)));
    }

    [HttpPost("register/request-otp")]
    public async Task<IActionResult> RequestRegisterOtp(RegisterOtpRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.FullName))
        {
            return BadRequest(new ApiError("Vui lòng nhập họ tên và email để nhận OTP.", "invalid_otp_request"));
        }

        if (await db.Users.AnyAsync(x => x.Email == email, cancellationToken))
        {
            return Conflict(new ApiError("Email đã tồn tại.", "email_exists"));
        }

        try
        {
            await otpService.SendRegisterOtpAsync(email, request.FullName.Trim(), cancellationToken);
            return Ok(new { message = "Mã OTP đã được gửi đến email của bạn. Mã có hiệu lực trong 10 phút." });
        }
        catch (Exception ex)
        {
            return StatusCode(502, new ApiError($"Không gửi được OTP qua Gmail: {ex.Message}", "otp_send_failed"));
        }
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) ||
            string.IsNullOrWhiteSpace(request.Password) ||
            string.IsNullOrWhiteSpace(request.FullName) ||
            string.IsNullOrWhiteSpace(request.OtpCode))
        {
            return BadRequest(new ApiError("Vui lòng nhập đầy đủ họ tên, email, mật khẩu và OTP.", "invalid_register"));
        }

        if (!otpService.VerifyRegisterOtp(email, request.OtpCode))
        {
            return BadRequest(new ApiError("Mã OTP không đúng hoặc đã hết hạn.", "invalid_otp"));
        }

        if (await db.Users.AnyAsync(x => x.Email == email, cancellationToken))
        {
            return Conflict(new ApiError("Email đã tồn tại.", "email_exists"));
        }

        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = request.Password,
            Role = "Customer",
            FullName = request.FullName.Trim(),
            IsActive = true,
            MembershipTier = "Bronze",
            TotalSpent = 0,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);

        lock (store.SyncRoot)
        {
            store.Users.RemoveAll(x => x.Id == user.Id || x.Email.Equals(user.Email, StringComparison.OrdinalIgnoreCase));
            store.Users.Add(new UserRecord(user.Id, user.Email, user.PasswordHash, user.Role, user.FullName, user.IsActive, user.MembershipTier, user.TotalSpent, user.CreatedAt));
            store.UserPermissions[user.Id] = [];
        }

        return Ok(ToAuthResponse(user, store, jwt.CreateToken(user)));
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var id)) return Unauthorized();

        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (user is null) return Unauthorized();

        return Ok(ToAuthResponse(user, store, jwt.CreateToken(user)));
    }

    private static object ToAuthResponse(UserEntity user, DemoStore store, string token) => new
    {
        accessToken = token,
        refreshToken = $"refresh-{Guid.NewGuid():N}",
        user = new
        {
            user.Id,
            user.Email,
            user.FullName,
            user.Role,
            user.MembershipTier,
            user.TotalSpent,
            permissions = store.UserPermissions.TryGetValue(user.Id, out var permissions) ? permissions.Order().ToArray() : []
        }
    };
}

[ApiController]
[Route("api/account")]
public sealed class AccountController(AppDbContext db, DemoStore store) : ControllerBase
{
    [HttpGet("orders")]
    public IActionResult GetOrders()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var id)) return Unauthorized();
        var user = db.Users.FirstOrDefault(x => x.Id == id);
        if (user is null) return Unauthorized();

        var orders = store.Orders.Where(x => x.UserId == user.Id).OrderByDescending(x => x.CreatedAt).ToList();
        return Ok(orders);
    }

    [HttpGet("vouchers")]
    public async Task<IActionResult> GetVouchers(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var id)) return Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (user is null) return Unauthorized();

        var vouchers = await db.Vouchers
            .Where(x => x.IsActive && x.StartAt <= DateTimeOffset.UtcNow && x.ExpireAt >= DateTimeOffset.UtcNow)
            .Where(x => x.Scope == "All" || (x.Scope == "Tier" && x.ApplicableTier == user.MembershipTier) || (x.Scope == "Customer" && x.CustomerId == user.Id))
            .ToListAsync(cancellationToken);

        return Ok(vouchers);
    }

    [HttpPatch("me")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var id)) return Unauthorized();

        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (user is null) return Unauthorized();

        var newEmail = request.Email?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(newEmail) && newEmail != user.Email)
        {
            if (await db.Users.AnyAsync(x => x.Email == newEmail && x.Id != id, cancellationToken))
                return Conflict(new ApiError("Email này đã được sử dụng bởi tài khoản khác."));
            user.Email = newEmail;
        }

        if (!string.IsNullOrWhiteSpace(request.FullName))
            user.FullName = request.FullName.Trim();

        await db.SaveChangesAsync(cancellationToken);

        lock (store.SyncRoot)
        {
            var idx = store.Users.FindIndex(u => u.Id == id);
            if (idx >= 0)
            {
                var old = store.Users[idx];
                store.Users[idx] = old with { Email = user.Email, FullName = user.FullName };
            }
        }

        return Ok(new { user.Id, user.Email, user.FullName, user.Role, user.MembershipTier, user.TotalSpent });
    }
}

[ApiController]
[Route("api/catalog")]
public sealed class CatalogController(DemoStore store, AppDbContext db) : ControllerBase
{
    [HttpGet("categories")]
    public IActionResult Categories() => Ok(store.Categories.OrderBy(x => x.DisplayOrder));

    [HttpGet("products")]
    public IActionResult Products([FromQuery] string? search, [FromQuery] int? categoryId, [FromQuery] string? color, [FromQuery] string? size)
    {
        var query = store.Products.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(x => x.Name.Contains(search, StringComparison.OrdinalIgnoreCase) || x.Tags.Any(t => t.Contains(search, StringComparison.OrdinalIgnoreCase)));
        }

        if (categoryId.HasValue)
        {
            query = query.Where(x => x.CategoryId == categoryId);
        }

        if (!string.IsNullOrWhiteSpace(color))
        {
            query = query.Where(x => x.Variants.Any(v => v.Color.Contains(color, StringComparison.OrdinalIgnoreCase)));
        }

        if (!string.IsNullOrWhiteSpace(size))
        {
            query = query.Where(x => x.Variants.Any(v => v.Size.Equals(size, StringComparison.OrdinalIgnoreCase)));
        }

        return Ok(query.Select(ProductDto));
    }

    [HttpGet("products/{slug}")]
    public IActionResult Product(string slug)
    {
        var product = store.Products.FirstOrDefault(x => x.Slug.Equals(slug, StringComparison.OrdinalIgnoreCase));
        return product is null ? NotFound() : Ok(ProductDto(product));
    }

    [HttpGet("vouchers")]
    public async Task<IActionResult> Vouchers()
    {
        var now = DateTimeOffset.UtcNow;
        var vouchers = await db.Vouchers
            .AsNoTracking()
            .Where(x => x.IsActive && x.StartAt <= now && x.ExpireAt >= now && x.UsedCount < x.Quantity)
            .OrderBy(x => x.ExpireAt)
            .ToListAsync();
        return Ok(vouchers.Select(VoucherDto));
    }

    public static object ProductDto(ProductRecord product) => new
    {
        product.Id,
        product.Name,
        product.Slug,
        product.Description,
        product.CategoryId,
        product.Brand,
        product.Material,
        product.Gender,
        product.BasePrice,
        product.IsActive,
        product.Tags,
        product.ImageUrl,
        variants = product.Variants.Select(v => new { v.Id, v.Sku, v.Color, v.Size, v.Price, v.StockQty, v.ImageUrl })
    };

    public static object VoucherDto(VoucherEntity voucher) => new
    {
        voucher.Id,
        voucher.Code,
        voucher.Name,
        voucher.Type,
        voucher.Value,
        voucher.MaxDiscount,
        voucher.MinOrderAmount,
        voucher.Quantity,
        voucher.UsedCount,
        voucher.ApplicableTier,
        voucher.Scope,
        voucher.CustomerId,
        voucher.ExpireAt,
        voucher.StartAt,
        voucher.IsActive
    };
}

[ApiController]
[Route("api/cart")]
public sealed class CartController(DemoStore store) : ControllerBase
{
    [HttpGet]
    public IActionResult Get([FromQuery] Guid? userId, [FromQuery] string? guestToken) => Ok(CartDto(store.GetCart(userId, guestToken)));

    [HttpPost("items")]
    public IActionResult AddItem(AddCartItemRequest request)
    {
        lock (store.SyncRoot)
        {
            var variant = store.Products.SelectMany(x => x.Variants).FirstOrDefault(x => x.Id == request.ProductVariantId);
            if (variant is null)
            {
                return NotFound(new ApiError("Không tìm thấy biến thể sản phẩm."));
            }

            if (variant.StockQty < request.Quantity)
            {
                return BadRequest(new ApiError("Số lượng tồn kho không đủ."));
            }

            var cart = store.GetCart(request.UserId, request.GuestToken);
            var item = cart.Items.FirstOrDefault(x => x.ProductVariantId == request.ProductVariantId);
            if (item is null)
            {
                cart.Items.Add(new CartItemRecord(request.ProductVariantId, request.Quantity, variant.Price));
            }
            else
            {
                cart.Items.Remove(item);
                cart.Items.Add(item with { Quantity = Math.Min(variant.StockQty, item.Quantity + request.Quantity) });
            }

            return Ok(CartDto(cart));
        }
    }

    [HttpPatch("items/{variantId:guid}")]
    public IActionResult UpdateItem(Guid variantId, UpdateCartItemRequest request)
    {
        lock (store.SyncRoot)
        {
            var cart = store.GetCart(request.UserId, request.GuestToken);
            var item = cart.Items.FirstOrDefault(x => x.ProductVariantId == variantId);
            if (item is null)
            {
                return NotFound();
            }

            cart.Items.Remove(item);
            if (request.Quantity > 0)
            {
                cart.Items.Add(item with { Quantity = request.Quantity });
            }

            return Ok(CartDto(cart));
        }
    }

    [HttpDelete("items/{variantId:guid}")]
    public IActionResult RemoveItem(Guid variantId, [FromQuery] Guid? userId, [FromQuery] string? guestToken)
    {
        lock (store.SyncRoot)
        {
            var cart = store.GetCart(userId, guestToken);
            cart.Items.RemoveAll(x => x.ProductVariantId == variantId);
            return Ok(CartDto(cart));
        }
    }

    private object CartDto(CartRecord cart)
    {
        var items = cart.Items.Select(item =>
        {
            var product = store.Products.First(x => x.Variants.Any(v => v.Id == item.ProductVariantId));
            var variant = product.Variants.First(x => x.Id == item.ProductVariantId);
            return new
            {
                product.Id,
                product.Name,
                product.Slug,
                product.ImageUrl,
                variantId = variant.Id,
                variant.Sku,
                variant.Color,
                variant.Size,
                item.Quantity,
                item.UnitPrice,
                lineTotal = item.UnitPrice * item.Quantity
            };
        }).ToArray();

        return new
        {
            cart.Id,
            cart.UserId,
            cart.GuestToken,
            items,
            subtotal = items.Sum(x => x.lineTotal)
        };
    }
}

[ApiController]
[Route("api/orders")]
public sealed class OrdersController(DemoStore store, AppDbContext db, ILogger<OrdersController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Checkout(CheckoutRequest request)
    {
        if (request.GuestInfo is null)
        {
            return BadRequest(new ApiError("Thiếu thông tin người nhận."));
        }

        if (string.IsNullOrWhiteSpace(request.GuestInfo.FullName) ||
            string.IsNullOrWhiteSpace(request.GuestInfo.PhoneNumber) ||
            string.IsNullOrWhiteSpace(request.ShippingAddress))
        {
            return BadRequest(new ApiError("Vui lòng nhập đủ họ tên, số điện thoại và địa chỉ nhận hàng."));
        }

        if (!string.Equals(request.PaymentMethod, "Cash", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.PaymentMethod, "VnPay", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new ApiError("Phương thức thanh toán không hợp lệ."));
        }

        var voucherCode = request.VoucherCode?.Trim();
        VoucherEntity? voucher = null;
        var discount = 0m;

        if (!string.IsNullOrWhiteSpace(voucherCode))
        {
            if (!request.UserId.HasValue)
            {
                return BadRequest(new ApiError("Vui lòng đăng nhập hoặc tạo tài khoản để sử dụng voucher."));
            }

            var userEntity = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.UserId.Value && x.IsActive);
            var user = userEntity is null
                ? null
                : new UserRecord(userEntity.Id, userEntity.Email, userEntity.PasswordHash, userEntity.Role, userEntity.FullName, userEntity.IsActive, userEntity.MembershipTier, userEntity.TotalSpent, userEntity.CreatedAt);
            if (user is null)
            {
                return BadRequest(new ApiError("Tài khoản không hợp lệ hoặc đã ngừng hoạt động."));
            }

            voucher = await db.Vouchers.FirstOrDefaultAsync(x => x.Code == voucherCode.ToUpperInvariant());
            if (voucher is null)
            {
                return BadRequest(new ApiError("Voucher không tồn tại."));
            }

            var now = DateTimeOffset.UtcNow;
            if (!voucher.IsActive || now < voucher.StartAt || now > voucher.ExpireAt)
            {
                return BadRequest(new ApiError("Voucher hiện không còn hiệu lực."));
            }

            if (voucher.UsedCount >= voucher.Quantity)
            {
                return BadRequest(new ApiError("Voucher đã hết lượt sử dụng."));
            }

            if (voucher.Scope == "Tier" && !voucher.ApplicableTier.Equals("All", StringComparison.OrdinalIgnoreCase) &&
                !voucher.ApplicableTier.Equals(user.MembershipTier, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new ApiError($"Voucher này chỉ áp dụng cho khách hạng {voucher.ApplicableTier}.", "invalid_tier"));
            }

            if (voucher.Scope == "Customer" && voucher.CustomerId != user.Id)
            {
                return BadRequest(new ApiError("Voucher này chỉ dành riêng cho một số khách hàng cụ thể.", "invalid_customer"));
            }

            var cart = store.GetCart(request.UserId, request.GuestToken);
            var subtotal = cart.Items.Sum(x => x.UnitPrice * x.Quantity);
            if (subtotal < voucher.MinOrderAmount)
            {
                return BadRequest(new { message = $"Đơn hàng cần đạt tối thiểu {voucher.MinOrderAmount:N0} đ để sử dụng voucher này." });
            }

            discount = voucher.CalculateDiscount(subtotal);
            if (discount <= 0)
            {
                return BadRequest(new ApiError("Voucher chưa đủ điều kiện áp dụng cho đơn hàng này."));
            }
        }

        try
        {
            var order = store.CreateOrder(new CreateOrderRequest(
                request.UserId,
                request.GuestToken,
                request.GuestInfo,
                request.PaymentMethod,
                request.ShippingMethod,
                request.ShippingAddress,
                voucher?.Code,
                discount,
                request.Note));

            if (voucher is not null)
            {
                voucher.UsedCount++;
                await db.SaveChangesAsync();
            }

            // Mock email confirmation — log to console (no real SMTP configured for demo)
            var recipientEmail = request.GuestInfo.Email;
            logger.LogInformation("[EMAIL-MOCK] Order confirmation sent to {Email} for order #{Code}, total {Total:N0} đ",
                recipientEmail, order.OrderCode, order.Total);

            return Ok(new { order, emailSent = !string.IsNullOrWhiteSpace(recipientEmail), emailAddress = recipientEmail });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet]
    public IActionResult List([FromQuery] Guid? userId) =>
        Ok(store.Orders.Where(x => !userId.HasValue || x.UserId == userId).OrderByDescending(x => x.CreatedAt));

    [HttpGet("{code}")]
    public IActionResult Detail(string code)
    {
        var order = store.Orders.FirstOrDefault(x => x.OrderCode.Equals(code, StringComparison.OrdinalIgnoreCase));
        return order is null ? NotFound() : Ok(order);
    }

    [HttpGet("{code}/payment-status")]
    public IActionResult PaymentStatus(string code)
    {
        var order = store.Orders.FirstOrDefault(x => x.OrderCode.Equals(code, StringComparison.OrdinalIgnoreCase));
        return order is null ? NotFound() : Ok(new { order.OrderCode, order.PaymentMethod, order.PaymentStatus, order.OrderStatus });
    }

    [HttpPost("{id:guid}/returns")]
    public IActionResult RequestReturn(Guid id, ReturnRequestDto request)
    {
        var order = store.Orders.FirstOrDefault(x => x.Id == id);
        if (order is null)
        {
            return NotFound();
        }

        var record = new ReturnRecord(Guid.NewGuid(), id, request.Reason, "Requested", request.RefundAmount, DateTimeOffset.UtcNow, null, null);
        lock (store.SyncRoot)
        {
            store.Returns.Add(record);
        }

        return Ok(record);
    }
}

[ApiController]
[Route("api/payments")]
public sealed class PaymentsController(DemoStore store, AppDbContext db, IConfiguration configuration) : ControllerBase
{
    [HttpPost("cash/confirm")]
    public async Task<IActionResult> ConfirmCash(ConfirmCashRequest request)
    {
        OrderRecord? order;
        lock (store.SyncRoot)
        {
            order = store.Orders.FirstOrDefault(x => x.Id == request.OrderId);
            if (order is null) return NotFound();

            order.PaymentStatus = "Paid";
            order.OrderStatus = "Confirmed";
            order.History.Add(new StatusHistoryRecord("Unpaid", "Paid", request.StaffName ?? "Staff", DateTimeOffset.UtcNow, "Xác nhận đã thu tiền mặt"));
            var payment = new PaymentRecord(Guid.NewGuid(), order.Id, "Cash", order.Total, $"CASH-{order.OrderCode}", null, null, "00", "{}", DateTimeOffset.UtcNow, "Paid");
            store.Payments.Add(payment);
        }

        if (order.UserId.HasValue)
            await UpdateSpentAsync(order.UserId.Value, order.Total);

        return Ok(new { order });
    }

    [HttpPost("vnpay/create-url")]
    public IActionResult CreateVnPayUrl(CreateVnPayUrlRequest request)
    {
        var order = store.Orders.FirstOrDefault(x => x.Id == request.OrderId);
        if (order is null)
        {
            return NotFound();
        }

        lock (store.SyncRoot)
        {
            if (order.PaymentStatus != "Paid")
            {
                var previousStatus = order.PaymentStatus;
                order.PaymentMethod = "VnPay";
                order.PaymentStatus = "Pending";
                order.History.Add(new StatusHistoryRecord(previousStatus, "Pending", "Customer", DateTimeOffset.UtcNow, "Khách hàng thực hiện thanh toán lại qua VNPAY"));
            }
        }

        var txnRef = $"{order.OrderCode}-{DateTimeOffset.UtcNow:HHmmss}";
        var vnPay = new VnPayLibrary();
        vnPay.AddRequestData("vnp_Version", "2.1.0");
        vnPay.AddRequestData("vnp_Command", "pay");
        vnPay.AddRequestData("vnp_TmnCode", configuration["VnPay:TmnCode"] ?? "CRA0CZJY");
        vnPay.AddRequestData("vnp_Amount", ((long)(order.Total * 100)).ToString());
        vnPay.AddRequestData("vnp_CreateDate", VnPayLibrary.FormatVnPayDate(DateTimeOffset.UtcNow));
        vnPay.AddRequestData("vnp_CurrCode", "VND");
        vnPay.AddRequestData("vnp_IpAddr", HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1");
        vnPay.AddRequestData("vnp_Locale", "vn");
        vnPay.AddRequestData("vnp_OrderInfo", $"Thanh toan don hang {order.OrderCode} tai MiiChin");
        vnPay.AddRequestData("vnp_OrderType", "other");
        vnPay.AddRequestData("vnp_ReturnUrl", configuration["VnPay:ReturnUrl"] ?? "http://localhost:5173/payment/vnpay-return");
        vnPay.AddRequestData("vnp_TxnRef", txnRef);

        var url = vnPay.CreateRequestUrl(configuration["VnPay:Url"] ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", configuration["VnPay:HashSecret"] ?? string.Empty);
        return Ok(new { paymentUrl = url, txnRef, order.OrderCode });
    }

    [HttpPost("change-method")]
    public IActionResult ChangePaymentMethod(ChangePaymentMethodRequest request)
    {
        var paymentMethod = request.PaymentMethod?.Trim();
        if (!string.Equals(paymentMethod, "Cash", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(paymentMethod, "VnPay", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new ApiError("Phương thức thanh toán không hợp lệ.", "invalid_payment_method"));
        }

        lock (store.SyncRoot)
        {
            var order = store.Orders.FirstOrDefault(x => x.Id == request.OrderId);
            if (order is null)
            {
                return NotFound(new ApiError("Không tìm thấy đơn hàng.", "order_not_found"));
            }

            if (order.PaymentStatus == "Paid")
            {
                return BadRequest(new ApiError("Đơn hàng đã thanh toán, không thể đổi phương thức.", "order_already_paid"));
            }

            var oldMethod = order.PaymentMethod;
            order.PaymentMethod = string.Equals(paymentMethod, "Cash", StringComparison.OrdinalIgnoreCase) ? "Cash" : "VnPay";
            order.PaymentStatus = order.PaymentMethod == "Cash" ? "Unpaid" : "Pending";
            order.OrderStatus = order.PaymentMethod == "Cash" ? "Confirmed" : order.OrderStatus;
            order.History.Add(new StatusHistoryRecord(oldMethod, order.PaymentMethod, "Customer", DateTimeOffset.UtcNow, order.PaymentMethod == "Cash"
                ? "Khách hàng chuyển sang thanh toán khi nhận hàng"
                : "Khách hàng chuyển sang thanh toán trực tuyến VNPAY"));

            return Ok(order);
        }
    }

    [HttpGet("vnpay/verify-return")]
    public IActionResult VerifyReturn()
    {
        var query = Request.Query.ToDictionary(x => x.Key, x => x.Value.ToString());
        var valid = ValidateVnPayQuery(query);
        var responseCode = query.GetValueOrDefault("vnp_ResponseCode") ?? string.Empty;
        var txnRef = query.GetValueOrDefault("vnp_TxnRef") ?? string.Empty;
        var orderCode = txnRef.Split('-').FirstOrDefault() ?? txnRef;

        if (valid && !string.IsNullOrWhiteSpace(orderCode))
        {
            lock (store.SyncRoot)
            {
                var order = store.Orders.FirstOrDefault(x => x.OrderCode.Equals(orderCode, StringComparison.OrdinalIgnoreCase));
                if (order is not null)
                {
                    if (responseCode == "00")
                    {
                        order.PaymentStatus = "Paid";
                        order.OrderStatus = "Confirmed";
                        order.History.Add(new StatusHistoryRecord("Pending", "Paid", "VNPAY", DateTimeOffset.UtcNow, "VNPAY return xác nhận thanh toán thành công"));
                    }
                    else
                    {
                        order.PaymentStatus = "Failed";
                        order.History.Add(new StatusHistoryRecord("Pending", "Failed", "VNPAY", DateTimeOffset.UtcNow, $"VNPAY return mã lỗi {responseCode}"));
                    }
                }
            }
        }

        return Ok(new
        {
            valid,
            responseCode,
            transactionStatus = query.GetValueOrDefault("vnp_TransactionStatus") ?? string.Empty,
            txnRef,
            message = valid ? "Chữ ký hợp lệ." : "Chữ ký không hợp lệ."
        });
    }

    [HttpPost("vnpay/mark-failed")]
    public IActionResult MarkVnPayFailed(MarkVnPayFailedRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OrderCode))
        {
            return BadRequest(new ApiError("Thiếu mã đơn hàng cần cập nhật thanh toán VNPAY."));
        }

        lock (store.SyncRoot)
        {
            var order = store.Orders.FirstOrDefault(x => x.OrderCode.Equals(request.OrderCode, StringComparison.OrdinalIgnoreCase));
            if (order is null)
            {
                return NotFound();
            }

            if (order.PaymentStatus != "Paid")
            {
                order.PaymentStatus = "Failed";
                order.History.Add(new StatusHistoryRecord("Pending", "Failed", "VNPAY", DateTimeOffset.UtcNow, string.IsNullOrWhiteSpace(request.Reason) ? "Không nhận được kết quả thanh toán VNPAY." : request.Reason));
            }

            return Ok(new { order.OrderCode, order.PaymentStatus, order.OrderStatus });
        }
    }

    [HttpGet("vnpay/ipn")]
    public async Task<IActionResult> Ipn()
    {
        var query = Request.Query.ToDictionary(x => x.Key, x => x.Value.ToString());
        if (!ValidateVnPayQuery(query))
        {
            return Ok(new { RspCode = "97", Message = "Invalid signature" });
        }

        var txnRef = query.GetValueOrDefault("vnp_TxnRef") ?? string.Empty;
        var orderCode = txnRef.Split('-').FirstOrDefault() ?? txnRef;
        var order = store.Orders.FirstOrDefault(x => x.OrderCode == orderCode);
        if (order is null)
        {
            return Ok(new { RspCode = "01", Message = "Order not found" });
        }

        var amount = decimal.TryParse(query.GetValueOrDefault("vnp_Amount"), out var parsedAmount) ? parsedAmount / 100 : 0;
        if (amount != order.Total)
        {
            return Ok(new { RspCode = "04", Message = "Invalid amount" });
        }

        var paid = false;
        lock (store.SyncRoot)
        {
            if (query.GetValueOrDefault("vnp_ResponseCode") == "00")
            {
                order.PaymentStatus = "Paid";
                order.OrderStatus = "Confirmed";
                paid = true;
            }

            store.Payments.Add(new PaymentRecord(
                Guid.NewGuid(),
                order.Id,
                "VnPay",
                order.Total,
                txnRef,
                query.GetValueOrDefault("vnp_TransactionNo"),
                query.GetValueOrDefault("vnp_BankCode"),
                query.GetValueOrDefault("vnp_ResponseCode"),
                JsonSerializer.Serialize(query),
                DateTimeOffset.UtcNow,
                order.PaymentStatus));
        }

        if (paid && order.UserId.HasValue)
            await UpdateSpentAsync(order.UserId.Value, order.Total);

        return Ok(new { RspCode = "00", Message = "Confirm Success" });
    }

    private async Task UpdateSpentAsync(Guid userId, decimal amount)
    {
        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return;
        user.TotalSpent += amount;
        await db.SaveChangesAsync();
        lock (store.SyncRoot)
        {
            var idx = store.Users.FindIndex(u => u.Id == userId);
            if (idx >= 0)
            {
                var old = store.Users[idx];
                store.Users[idx] = old with { TotalSpent12M = old.TotalSpent12M + amount };
            }
        }
    }

    private bool ValidateVnPayQuery(Dictionary<string, string> query)
    {
        var hash = query.GetValueOrDefault("vnp_SecureHash") ?? string.Empty;
        var vnPay = new VnPayLibrary();
        foreach (var pair in query)
        {
            vnPay.AddResponseData(pair.Key, pair.Value);
        }

        return vnPay.ValidateSignature(hash, configuration["VnPay:HashSecret"] ?? string.Empty);
    }
}

[ApiController]
[Route("api/admin")]
public sealed class AdminController(DemoStore store, AppDbContext db, IConfiguration configuration, IWebHostEnvironment env, ThienPlan.Api.BackgroundJobs.MembershipTierJob membershipJob) : ControllerBase
{
    private static readonly string[] AllowedImageExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];
    private static readonly string[] VoucherTypes = ["FixedAmount", "Percent", "FreeShip"];
    private static readonly string[] VoucherTiers = ["All", "Bronze", "Silver", "Gold", "Diamond"];
    private const long MaxImageBytes = 5 * 1024 * 1024; // 5 MB

    [HttpPost("upload/image")]
    [RequestSizeLimit(MaxImageBytes)]
    public async Task<IActionResult> UploadImage(IFormFile file, [FromQuery] string? folder = "products")
    {
        if (file is null || file.Length == 0)
            return BadRequest(new ApiError("Thiếu file ảnh."));
        if (file.Length > MaxImageBytes)
            return BadRequest(new ApiError("Ảnh tối đa 5MB."));

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedImageExt.Contains(ext))
            return BadRequest(new { message = $"Định dạng không hỗ trợ. Cho phép: {string.Join(", ", AllowedImageExt)}." });

        // Restrict folder to a safe whitelist so callers can't write outside assets/.
        var safeFolder = folder?.Trim('/', '\\').ToLowerInvariant() switch
        {
            "products" => "uploads/products",
            "brand"    => "uploads/brand",
            _          => "uploads"
        };

        var assetsRoot = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "assets"));
        var targetDir = Path.Combine(assetsRoot, safeFolder.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(targetDir);

        var safeName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}{ext}";
        var targetPath = Path.Combine(targetDir, safeName);

        await using (var stream = System.IO.File.Create(targetPath))
        {
            await file.CopyToAsync(stream);
        }

        var url = $"/assets/{safeFolder}/{safeName}";
        return Ok(new { url, fileName = safeName, folder = safeFolder, size = file.Length });
    }

    [HttpGet("dashboard")]
    public IActionResult Dashboard()
    {
        var sevenDaysAgo = DateTimeOffset.UtcNow.AddDays(-7);
        return Ok(new
        {
            revenue = store.Orders.Where(x => x.PaymentStatus == "Paid").Sum(x => x.Total),
            orderCount = store.Orders.Count,
            productCount = store.Products.Count,
            lowStock = store.Products.SelectMany(x => x.Variants).Count(x => x.StockQty <= 10),
            openChats = store.Conversations.Count(x => x.Status == "Open"),
            revenueByDay = Enumerable.Range(0, 7)
                .Select(i => DateTimeOffset.UtcNow.Date.AddDays(-6 + i))
                .Select(date => new
                {
                    date = date.ToString("yyyy-MM-dd"),
                    revenue = store.Orders.Where(x => x.PaymentStatus == "Paid" && x.CreatedAt.Date == date).Sum(x => x.Total),
                    orders = store.Orders.Count(x => x.CreatedAt.Date == date)
                }).ToList(),
            ordersByStatus = store.Orders.GroupBy(x => x.OrderStatus).Select(g => new { status = g.Key, count = g.Count() }).ToList(),
            topProducts = store.Orders.SelectMany(x => x.Items)
                .GroupBy(x => x.ProductName)
                .Select(g => new { name = g.Key, quantity = g.Sum(i => i.Quantity), revenue = g.Sum(i => i.UnitPrice * i.Quantity) })
                .OrderByDescending(x => x.revenue)
                .Take(5)
                .ToList(),
            stockByCategory = store.Products.GroupBy(x => store.Categories.FirstOrDefault(c => c.Id == x.CategoryId)?.Name ?? "Khác")
                .Select(g => new { category = g.Key, stock = g.Sum(p => p.Variants.Sum(v => v.StockQty)) })
                .ToList()
        });
    }

    [HttpGet("staff")]
    public IActionResult Staff() => Ok(store.Users.Where(x => x.Role is "Staff" or "Administrator").Select(UserDto));

    [HttpGet("staff/{id:guid}/permissions")]
    public IActionResult StaffPermissions(Guid id)
    {
        var user = store.Users.FirstOrDefault(x => x.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        return Ok(new
        {
            user = UserDto(user),
            permissions = store.Permissions,
            granted = store.UserPermissions.TryGetValue(id, out var granted) ? granted.Order().ToArray() : []
        });
    }

    [HttpPut("staff/{id:guid}/permissions")]
    public IActionResult UpdateStaffPermissions(Guid id, UpdatePermissionsRequest request)
    {
        lock (store.SyncRoot)
        {
            store.UserPermissions[id] = [.. request.PermissionCodes];
            return Ok(new { userId = id, granted = request.PermissionCodes.Order() });
        }
    }

    [HttpPost("products")]
    public async Task<IActionResult> CreateProduct(CreateProductRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new ApiError("Vui lòng nhập tên sản phẩm.", "invalid_name"));
        }

        if (request.BasePrice < 0)
        {
            return BadRequest(new ApiError("Giá sản phẩm không hợp lệ.", "invalid_price"));
        }

        if (request.Variants is null || request.Variants.Count == 0)
        {
            return BadRequest(new ApiError("Sản phẩm phải có ít nhất một phiên bản.", "invalid_variants"));
        }

        var imageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? "/assets/products/ao-thun.svg" : request.ImageUrl;

        // Ensure unique slug — append short timestamp suffix if slug already taken
        var baseSlug = Slugify(request.Name);
        var slug = baseSlug;
        var slugExists = await db.CatalogProducts.AnyAsync(p => p.Slug == slug);
        if (slugExists)
        {
            slug = $"{baseSlug}-{DateTimeOffset.UtcNow:MMddHHmmss}";
        }

        // Ensure unique SKUs — append suffix when duplicate detected
        var requestedSkus = request.Variants.Select(v => v.Sku).ToList();
        var existingSkus = (await db.CatalogProductVariants
            .Where(v => requestedSkus.Contains(v.Sku))
            .Select(v => v.Sku)
            .ToListAsync()).ToHashSet();

        var variants = request.Variants.Select(v =>
        {
            var sku = existingSkus.Contains(v.Sku)
                ? $"{v.Sku}-{DateTimeOffset.UtcNow:HHmmss}"
                : v.Sku;
            return new ProductVariantRecord(Guid.NewGuid(), sku, v.Color, v.Size, v.Price, v.StockQty, imageUrl);
        }).ToList();

        var product = new ProductRecord(
            Guid.NewGuid(),
            request.Name,
            slug,
            request.Description,
            request.CategoryId,
            request.Brand,
            request.Material,
            request.Gender,
            request.BasePrice,
            true,
            request.Tags,
            imageUrl,
            variants);

        db.CatalogProducts.Add(CatalogDatabaseSeeder.ToEntity(product));
        await db.SaveChangesAsync();
        store.AddCatalogProduct(product);
        return Ok(CatalogController.ProductDto(product));
    }

    [HttpPut("products/{id:guid}")]
    public async Task<IActionResult> UpdateProduct(Guid id, UpdateProductRequest request)
    {
        var entity = await db.CatalogProducts.Include(p => p.Variants).FirstOrDefaultAsync(p => p.Id == id);
        if (entity is null) return NotFound(new ApiError("Không tìm thấy sản phẩm."));

        entity.Name = request.Name;
        entity.Description = request.Description;
        entity.CategoryId = request.CategoryId;
        entity.Brand = request.Brand;
        entity.Material = request.Material;
        entity.Gender = request.Gender;
        entity.BasePrice = request.BasePrice;
        entity.IsActive = request.IsActive;
        entity.TagsCsv = string.Join(", ", request.Tags ?? []);
        entity.ImageUrl = request.ImageUrl ?? "";
        // Slug stays stable; if name changed enough, admin can delete + recreate.

        // Replace variants wholesale: drop missing ones, upsert provided ones.
        var keepIds = (request.Variants ?? []).Where(v => v.Id.HasValue).Select(v => v.Id!.Value).ToHashSet();
        var toRemove = entity.Variants.Where(v => !keepIds.Contains(v.Id)).ToList();
        foreach (var v in toRemove) db.CatalogProductVariants.Remove(v);

        foreach (var vr in request.Variants ?? [])
        {
            var match = vr.Id.HasValue ? entity.Variants.FirstOrDefault(x => x.Id == vr.Id) : null;
            if (match is null)
            {
                entity.Variants.Add(new CatalogProductVariantEntity
                {
                    Id = vr.Id ?? Guid.NewGuid(),
                    ProductId = entity.Id,
                    Sku = vr.Sku,
                    Color = vr.Color,
                    Size = vr.Size,
                    Price = vr.Price,
                    StockQty = vr.StockQty,
                    ImageUrl = vr.ImageUrl ?? entity.ImageUrl
                });
            }
            else
            {
                match.Sku = vr.Sku;
                match.Color = vr.Color;
                match.Size = vr.Size;
                match.Price = vr.Price;
                match.StockQty = vr.StockQty;
                match.ImageUrl = vr.ImageUrl ?? entity.ImageUrl;
            }
        }

        await db.SaveChangesAsync();
        await CatalogDatabaseSeeder.ReloadStoreAsync(db, store);

        var fresh = store.Products.First(p => p.Id == id);
        return Ok(CatalogController.ProductDto(fresh));
    }

    [HttpDelete("products/{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id)
    {
        var entity = await db.CatalogProducts.Include(p => p.Variants).FirstOrDefaultAsync(p => p.Id == id);
        if (entity is null) return NotFound(new ApiError("Không tìm thấy sản phẩm."));

        db.CatalogProductVariants.RemoveRange(entity.Variants);
        db.CatalogProducts.Remove(entity);
        await db.SaveChangesAsync();
        store.RemoveCatalogProduct(id);
        return Ok(new { id, deleted = true });
    }

    [HttpGet("orders")]
    public IActionResult Orders() => Ok(store.Orders.OrderByDescending(x => x.CreatedAt));

    [HttpPatch("orders/{id:guid}/status")]
    public IActionResult UpdateOrderStatus(Guid id, UpdateOrderStatusRequest request)
    {
        lock (store.SyncRoot)
        {
            var order = store.Orders.FirstOrDefault(x => x.Id == id);
            if (order is null)
            {
                return NotFound();
            }

            var from = order.OrderStatus;
            order.OrderStatus = request.Status;
            order.History.Add(new StatusHistoryRecord(from, request.Status, request.ChangedBy ?? "Admin", DateTimeOffset.UtcNow, request.Note));
            return Ok(order);
        }
    }

    [HttpGet("vouchers")]
    public async Task<IActionResult> Vouchers()
    {
        var vouchers = await db.Vouchers
            .AsNoTracking()
            .OrderBy(x => x.ExpireAt)
            .ToListAsync();
        return Ok(vouchers.Select(CatalogController.VoucherDto));
    }

    [HttpPost("vouchers")]
    public async Task<IActionResult> CreateVoucher(CreateVoucherRequest request)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new ApiError("Vui lòng nhập mã và tên voucher."));
        }

        if (!VoucherTypes.Contains(request.Type))
        {
            return BadRequest(new ApiError("Loại voucher không hợp lệ."));
        }

        if (!VoucherTiers.Contains(request.ApplicableTier))
        {
            return BadRequest(new ApiError("Hạng khách hàng áp dụng không hợp lệ."));
        }

        if (request.Quantity <= 0 || request.Value <= 0 || request.MinOrderAmount < 0 || request.MaxDiscount < 0 || request.ExpireAt <= request.StartAt)
        {
            return BadRequest(new ApiError("Thông tin voucher chưa hợp lệ."));
        }

        if (await db.Vouchers.AnyAsync(x => x.Code == code))
        {
            return Conflict(new ApiError("Mã voucher đã tồn tại."));
        }

        var voucher = new VoucherEntity
        {
            Id = Guid.NewGuid(),
            Code = code,
            Name = request.Name.Trim(),
            Type = request.Type,
            Value = request.Value,
            MaxDiscount = request.MaxDiscount,
            MinOrderAmount = request.MinOrderAmount,
            Quantity = request.Quantity,
            UsedCount = 0,
            ApplicableTier = request.ApplicableTier ?? "All",
            Scope = request.Scope ?? "All",
            CustomerId = request.CustomerId,
            IsActive = true,
            StartAt = request.StartAt,
            ExpireAt = request.ExpireAt
        };

        db.Vouchers.Add(voucher);
        await db.SaveChangesAsync();
        return Ok(CatalogController.VoucherDto(voucher));
    }

    [HttpPost("vouchers/{id:guid}/expire")]
    public async Task<IActionResult> ExpireVoucher(Guid id)
    {
        var voucher = await db.Vouchers.FirstOrDefaultAsync(x => x.Id == id);
        if (voucher is null)
        {
            return NotFound();
        }

        voucher.IsActive = false;
        await db.SaveChangesAsync();
        return Ok(CatalogController.VoucherDto(voucher));
    }

    [HttpPost("membership/recalculate")]
    public async Task<IActionResult> RecalculateMembership(CancellationToken cancellationToken)
    {
        await membershipJob.RecalculateAsync(cancellationToken);
        return Ok(new { recalculated = true, message = "Đã cập nhật hạng thành viên." });
    }

    [HttpGet("membership/customers")]
    public async Task<IActionResult> MembershipCustomers(CancellationToken cancellationToken)
    {
        var users = await db.Users.AsNoTracking()
            .Where(x => x.Role == "Customer")
            .OrderByDescending(x => x.TotalSpent)
            .ToListAsync(cancellationToken);
        return Ok(users.Select(u => new
        {
            u.Id, u.Email, u.FullName, u.MembershipTier, totalSpent = u.TotalSpent, u.CreatedAt, u.IsActive
        }));
    }

    [HttpGet("chat/conversations")]
    public IActionResult AdminChatConversations() =>
        Ok(store.Conversations.OrderByDescending(x => x.LastMessageAt));

    [HttpGet("_health/features")]
    public async Task<IActionResult> FeatureHealth() => Ok(new[]
    {
        new { code = "permissions.seeded", ok = store.Permissions.Count >= 25, detail = $"{store.Permissions.Count} permissions đã seed." },
        new { code = "roles.seeded", ok = new[] { "Administrator", "Staff", "Customer" }.All(role => store.Users.Any(x => x.Role == role)), detail = "3 role mặc định đã sẵn sàng." },
        new { code = "catalog.db", ok = await db.CatalogProducts.CountAsync() >= 30, detail = $"{await db.CatalogProducts.CountAsync()} sản phẩm đang lưu trong SQL Server LocalDB." },
        new { code = "vnpay.config", ok = !string.IsNullOrWhiteSpace(configuration["VnPay:TmnCode"]) && !string.IsNullOrWhiteSpace(configuration["VnPay:HashSecret"]), detail = "VNPAY đã cấu hình." },
        new { code = "openai.key", ok = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY")) || !string.IsNullOrWhiteSpace(configuration["OpenAI:ApiKey"]), detail = "OPENAI_API_KEY dùng cho tạo ảnh thử đồ bằng OpenAI Images API." },
        new { code = "signalr.hub", ok = true, detail = "ChatHub mapped tại /hubs/chat." },
        new { code = "jobs.running", ok = true, detail = "MembershipTierJob và VoucherExpireJob đã đăng ký." }
    });

    private object UserDto(UserRecord user) => new { user.Id, user.Email, user.FullName, user.Role, user.IsActive, user.MembershipTier, user.TotalSpent12M };

    private static string Slugify(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;

        var normalizedString = value.Normalize(System.Text.NormalizationForm.FormD);
        var stringBuilder = new System.Text.StringBuilder(capacity: normalizedString.Length);

        foreach (var c in normalizedString)
        {
            var unicodeCategory = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
            if (unicodeCategory != System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                stringBuilder.Append(c);
            }
        }

        var noDiacritics = stringBuilder
            .ToString()
            .Normalize(System.Text.NormalizationForm.FormC)
            .ToLowerInvariant();

        var slug = System.Text.RegularExpressions.Regex.Replace(noDiacritics, @"[^a-z0-9\s-]", "");
        return string.Join('-', slug.Split(new[] { ' ', '-' }, StringSplitOptions.RemoveEmptyEntries));
    }
}

[ApiController]
[Route("api/ai")]
public sealed class AiController(DemoStore store, AppDbContext db, ThienPlan.Api.Services.OpenAiImageService openAiImageService, IWebHostEnvironment env) : ControllerBase
{
    [HttpPost("outfit-suggest")]
    public IActionResult Suggest(OutfitSuggestRequest request)
    {
        var anchor = store.Products.FirstOrDefault(x => x.Id == request.AnchorProductId) ?? store.Products.First();
        var suggestions = store.Products
            .Where(x => x.Id != anchor.Id)
            .Take(3)
            .Select((product, index) => new
            {
                name = index == 0 ? "Set đi chơi hằng ngày" : "Set tối giản dễ mặc",
                reason = $"AI gợi ý phối {anchor.Name} với {product.Name} dựa trên chất liệu, kiểu dáng và tag {string.Join(", ", product.Tags)}.",
                products = new[] { CatalogController.ProductDto(anchor), CatalogController.ProductDto(product) }
            });

        return Ok(new
        {
            model = "catalog-style-rules",
            source = "catalog-rules",
            suggestions
        });
    }

    [HttpGet("try-on/quota")]
    public async Task<IActionResult> TryOnQuota(CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null) return Unauthorized(new ApiError("Vui lòng đăng nhập để dùng AI thử đồ.", "auth_required"));

        var limit = GetDailyTryOnLimit(user.MembershipTier);
        var used = await CountTodayTryOnsAsync(user.Id, cancellationToken);
        return Ok(new
        {
            membershipTier = user.MembershipTier,
            dailyLimit = limit,
            usedToday = used,
            remainingToday = limit is null ? (int?)null : Math.Max(0, limit.Value - used)
        });
    }

    [HttpGet("try-on/history")]
    public async Task<IActionResult> TryOnHistory(CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null) return Unauthorized(new ApiError("Vui lòng đăng nhập để xem lịch sử thử đồ.", "auth_required"));

        var rows = await db.AiTryOnImages
            .AsNoTracking()
            .Where(x => x.UserId == user.Id)
            .OrderByDescending(x => x.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);

        return Ok(rows.Select(TryOnDto));
    }

    [HttpPost("try-on")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10MB
    public async Task<IActionResult> TryOn([FromForm] Guid? productId, [FromForm] string? productIds, IFormFile? modelImage, [FromForm] Guid? baseTryOnId, [FromForm] string? note)
    {
        var user = await GetCurrentUserAsync(HttpContext.RequestAborted);
        if (user is null)
        {
            return Unauthorized(new ApiError("Vui lòng đăng nhập để dùng AI thử đồ.", "auth_required"));
        }

        var limit = GetDailyTryOnLimit(user.MembershipTier);
        var usedToday = await CountTodayTryOnsAsync(user.Id, HttpContext.RequestAborted);
        if (limit is not null && usedToday >= limit.Value)
        {
            return BadRequest(new ApiError($"Bạn đã dùng hết {limit.Value} lượt thử đồ AI hôm nay theo hạng {user.MembershipTier}.", "try_on_limit_reached"));
        }

        var ids = ParseProductIds(productId, productIds);
        if (ids.Count == 0)
        {
            return BadRequest(new ApiError("Vui lòng chọn ít nhất một sản phẩm để thử đồ.", "product_required"));
        }

        if (ids.Count > 6)
        {
            return BadRequest(new ApiError("Mỗi lần thử đồ chỉ nên phối tối đa 6 sản phẩm.", "too_many_products"));
        }

        var products = ids.Select(id => store.Products.FirstOrDefault(x => x.Id == id)).ToList();
        if (products.Any(x => x is null))
        {
            return NotFound(new ApiError("Một số sản phẩm không tồn tại.", "product_not_found"));
        }

        var selectedProducts = products.OfType<ProductRecord>().ToList();
        var itemTypes = selectedProducts.Select(GetTryOnItemType).ToList();
        var duplicateCategory = selectedProducts.GroupBy(x => x.CategoryId).FirstOrDefault(x => x.Count() > 1);
        if (duplicateCategory is not null)
        {
            return BadRequest(new ApiError($"Mỗi lần phối chỉ được chọn một sản phẩm trong danh mục {GetCategoryName(duplicateCategory.Key)}.", "duplicate_try_on_category"));
        }

        var assetsRoot = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "assets"));
        var tryOnRoot = Path.Combine(assetsRoot, "uploads", "tryon");
        Directory.CreateDirectory(tryOnRoot);

        var productImagePaths = selectedProducts
            .Select(product => ResolveAssetPath(assetsRoot, product.ImageUrl))
            .ToList();
        if (productImagePaths.Any(path => path is null || !System.IO.File.Exists(path)))
        {
            return BadRequest(new ApiError("Không tìm thấy ảnh sản phẩm để tạo ảnh thử đồ.", "product_image_missing"));
        }

        AiTryOnImageEntity? parent = null;
        string targetPath;
        string sourceUrl;
        if (modelImage is not null && modelImage.Length > 0)
        {
            var ext = Path.GetExtension(modelImage.FileName).ToLowerInvariant();
            if (!new[] { ".jpg", ".jpeg", ".png", ".webp" }.Contains(ext))
            {
                return BadRequest(new ApiError("Ảnh thử đồ chỉ hỗ trợ JPG, PNG hoặc WebP.", "invalid_image_type"));
            }

            var safeName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}{ext}";
            targetPath = Path.Combine(tryOnRoot, safeName);
            await using (var stream = System.IO.File.Create(targetPath))
            {
                await modelImage.CopyToAsync(stream);
            }
            sourceUrl = $"/assets/uploads/tryon/{safeName}";
        }
        else if (baseTryOnId.HasValue)
        {
            parent = await db.AiTryOnImages.FirstOrDefaultAsync(x => x.Id == baseTryOnId && x.UserId == user.Id, HttpContext.RequestAborted);
            if (parent is null)
            {
                return NotFound(new ApiError("Không tìm thấy ảnh thử đồ cần chỉnh sửa.", "try_on_not_found"));
            }

            var parentPath = ResolveAssetPath(assetsRoot, parent.ResultImageUrl);
            if (parentPath is null || !System.IO.File.Exists(parentPath))
            {
                return BadRequest(new ApiError("Ảnh thử đồ cũ không còn tồn tại trên máy.", "try_on_source_missing"));
            }
            targetPath = parentPath;
            sourceUrl = parent.ResultImageUrl;
        }
        else
        {
            return BadRequest(new ApiError("Vui lòng tải ảnh người mẫu/khách hàng hoặc chọn một ảnh cũ để chỉnh sửa.", "invalid_image"));
        }

        var result = await openAiImageService.GenerateTryOnAsync(selectedProducts, productImagePaths.OfType<string>().ToList(), targetPath, tryOnRoot, note, HttpContext.RequestAborted);
        if (string.IsNullOrWhiteSpace(result.ImageUrl))
        {
            return StatusCode(502, new ApiError(result.Message, result.Source));
        }

        var row = new AiTryOnImageEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            ParentId = parent?.Id,
            SourceImageUrl = sourceUrl,
            ResultImageUrl = result.ImageUrl,
            ProductIdsCsv = string.Join(",", selectedProducts.Select(x => x.Id)),
            ProductNamesCsv = string.Join(" | ", selectedProducts.Select(x => x.Name)),
            ItemTypesCsv = string.Join(",", itemTypes),
            Note = note?.Trim() ?? string.Empty,
            Source = result.Source,
            Message = result.Message,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.AiTryOnImages.Add(row);
        await db.SaveChangesAsync(HttpContext.RequestAborted);

        return Ok(new
        {
            imageUrl = row.ResultImageUrl,
            uploadedImageUrl = row.SourceImageUrl,
            source = row.Source,
            message = row.Message,
            tryOn = TryOnDto(row),
            quota = new
            {
                membershipTier = user.MembershipTier,
                dailyLimit = limit,
                usedToday = usedToday + 1,
                remainingToday = limit is null ? (int?)null : Math.Max(0, limit.Value - usedToday - 1)
            }
        });
    }

    private async Task<UserEntity?> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(userId, out var id)
            ? await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.IsActive, cancellationToken)
            : null;
    }

    private async Task<int> CountTodayTryOnsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
        var start = new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, TimeSpan.FromHours(7)).ToUniversalTime();
        return await db.AiTryOnImages.CountAsync(x => x.UserId == userId && x.CreatedAt >= start, cancellationToken);
    }

    private static int? GetDailyTryOnLimit(string tier) => tier switch
    {
        "Diamond" => null,
        "Gold" => 10,
        "Silver" => 5,
        _ => 2
    };

    private static List<Guid> ParseProductIds(Guid? productId, string? productIds)
    {
        var ids = new List<Guid>();
        if (productId.HasValue && productId.Value != Guid.Empty)
        {
            ids.Add(productId.Value);
        }

        if (!string.IsNullOrWhiteSpace(productIds))
        {
            ids.AddRange(productIds
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(x => Guid.TryParse(x, out _))
                .Select(Guid.Parse));
        }

        return ids.Distinct().ToList();
    }

    private static string GetTryOnItemType(ProductRecord product)
    {
        var name = product.Name.ToLowerInvariant();
        return product.CategoryId switch
        {
            1 => "top",
            2 => "bottom",
            3 => "outerwear",
            5 => "skirt",
            6 => "dress",
            7 => "shoes",
            8 => "bag",
            4 when name.Contains("nón") || name.Contains("mũ") || name.Contains("cap") => "hat",
            4 when name.Contains("thắt lưng") => "belt",
            4 when name.Contains("khăn") => "scarf",
            4 when name.Contains("vớ") => "socks",
            4 => "accessory",
            _ => $"category-{product.CategoryId}"
        };
    }

    private static string TranslateItemType(string type) => type switch
    {
        "top" => "áo",
        "bottom" => "quần",
        "outerwear" => "áo khoác",
        "skirt" => "chân váy",
        "dress" => "đầm",
        "shoes" => "giày",
        "bag" => "túi",
        "hat" => "mũ/nón",
        "belt" => "thắt lưng",
        "scarf" => "khăn",
        "socks" => "vớ",
        "accessory" => "phụ kiện",
        _ => type
    };

    private static string GetCategoryName(int categoryId) => categoryId switch
    {
        1 => "Áo",
        2 => "Quần",
        3 => "Áo khoác",
        4 => "Phụ kiện",
        5 => "Váy",
        6 => "Đầm",
        7 => "Giày",
        8 => "Túi",
        _ => $"#{categoryId}"
    };

    private static object TryOnDto(AiTryOnImageEntity row) => new
    {
        row.Id,
        row.ParentId,
        row.SourceImageUrl,
        row.ResultImageUrl,
        ProductIds = row.ProductIdsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        ProductNames = row.ProductNamesCsv.Split(" | ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        ItemTypes = row.ItemTypesCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        row.Note,
        row.Source,
        row.Message,
        row.CreatedAt
    };

    private static string? ResolveAssetPath(string assetsRoot, string imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl) || !imageUrl.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var relative = imageUrl["/assets/".Length..].Replace('/', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(assetsRoot, relative));
        return fullPath.StartsWith(assetsRoot, StringComparison.OrdinalIgnoreCase) ? fullPath : null;
    }
}

[ApiController]
[Route("api/chat")]
public sealed class ChatController(DemoStore store) : ControllerBase
{
    [HttpGet("conversations")]
    public IActionResult Conversations([FromQuery] Guid? userId) =>
        Ok(store.Conversations.Where(x => !userId.HasValue || x.CustomerId == userId || x.AssignedStaffId == userId).OrderByDescending(x => x.LastMessageAt));

    [HttpPost("conversations")]
    public IActionResult CreateConversation(CreateConversationRequest request)
    {
        var staff = store.Users.FirstOrDefault(x => x.Role == "Staff")?.Id;
        var conversation = new ChatConversationRecord(Guid.NewGuid(), request.CustomerId, request.GuestToken, staff, "Open", request.Subject, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);
        lock (store.SyncRoot)
        {
            store.Conversations.Add(conversation);
        }

        return Ok(conversation);
    }

    [HttpGet("conversations/{id:guid}/messages")]
    public IActionResult Messages(Guid id) => Ok(store.ChatMessages.Where(x => x.ConversationId == id).OrderBy(x => x.CreatedAt));

    [HttpPost("conversations/{id:guid}/messages")]
    public IActionResult Send(Guid id, SendMessageRequest request)
    {
        var message = new ChatMessageRecord(Guid.NewGuid(), id, request.SenderId, request.SenderType, request.Content, request.AttachmentUrl, false, null, DateTimeOffset.UtcNow);
        lock (store.SyncRoot)
        {
            store.ChatMessages.Add(message);
            var conversation = store.Conversations.FirstOrDefault(x => x.Id == id);
            if (conversation is not null)
            {
                conversation.LastMessageAt = message.CreatedAt;
            }
        }

        return Ok(message);
    }
}

public sealed record LoginRequest(string Email, string Password);
public sealed record RegisterOtpRequest(string Email, string FullName);
public sealed record RegisterRequest(string Email, string Password, string FullName, string OtpCode);
public sealed record AddCartItemRequest(Guid? UserId, string? GuestToken, Guid ProductVariantId, int Quantity);
public sealed record UpdateCartItemRequest(Guid? UserId, string? GuestToken, int Quantity);
public sealed record CheckoutRequest(Guid? UserId, string? GuestToken, GuestInfoRecord GuestInfo, string PaymentMethod, string ShippingMethod, string ShippingAddress, string? VoucherCode, string? Note);
public sealed record ReturnRequestDto(string Reason, decimal RefundAmount);
public sealed record ConfirmCashRequest(Guid OrderId, string? StaffName);
public sealed record CreateVnPayUrlRequest(Guid OrderId);
public sealed record ChangePaymentMethodRequest(Guid OrderId, string PaymentMethod);
public sealed record MarkVnPayFailedRequest(string OrderCode, string Reason);
public sealed record UpdatePermissionsRequest(List<string> PermissionCodes);
public sealed record CreateProductRequest(string Name, string Description, int CategoryId, string Brand, string Material, string Gender, decimal BasePrice, string ImageUrl, List<string> Tags, List<CreateProductVariantRequest> Variants);
public sealed record CreateProductVariantRequest(string Sku, string Color, string Size, decimal Price, int StockQty);
public sealed record UpdateProductRequest(string Name, string Description, int CategoryId, string Brand, string Material, string Gender, decimal BasePrice, string? ImageUrl, bool IsActive, List<string>? Tags, List<UpdateProductVariantRequest>? Variants);
public sealed record UpdateProductVariantRequest(Guid? Id, string Sku, string Color, string Size, decimal Price, int StockQty, string? ImageUrl);
public sealed record UpdateOrderStatusRequest(string Status, string? ChangedBy, string? Note);
public sealed record CreateVoucherRequest(string Code, string Name, string Type, decimal Value, decimal MaxDiscount, decimal MinOrderAmount, int Quantity, string ApplicableTier, string Scope, Guid? CustomerId, DateTimeOffset StartAt, DateTimeOffset ExpireAt);
public sealed record OutfitSuggestRequest(Guid AnchorProductId, string? Occasion, string? Style);
public sealed record CreateConversationRequest(Guid? CustomerId, string? GuestToken, string Subject);
public sealed record SendMessageRequest(Guid? SenderId, string SenderType, string Content, string? AttachmentUrl);
public sealed record AssignStaffRequest(Guid StaffId);
public sealed record UpdateProfileRequest(string? FullName, string? Email);
public sealed record ApiError(string Message, string? Code = null);
