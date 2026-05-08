using Microsoft.EntityFrameworkCore;
using ThienPlan.Api.Data;

namespace ThienPlan.Api.BackgroundJobs;

public sealed class VoucherExpireJob(ILogger<VoucherExpireJob> logger, IServiceScopeFactory scopeFactory) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var expired = 0;
                await using (var scope = scopeFactory.CreateAsyncScope())
                {
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var vouchers = await db.Vouchers
                        .Where(x => x.ExpireAt < DateTimeOffset.UtcNow && x.IsActive)
                        .ToListAsync(stoppingToken);

                    foreach (var voucher in vouchers)
                    {
                        voucher.IsActive = false;
                    }

                    expired = vouchers.Count;
                    if (expired > 0)
                    {
                        await db.SaveChangesAsync(stoppingToken);
                    }
                }

                if (expired > 0)
                {
                    logger.LogInformation("Expired {VoucherCount} vouchers.", expired);
                }

                await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
