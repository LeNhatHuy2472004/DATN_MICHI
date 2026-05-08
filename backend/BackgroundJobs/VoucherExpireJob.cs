using ThienPlan.Api.Data;

namespace ThienPlan.Api.BackgroundJobs;

public sealed class VoucherExpireJob(ILogger<VoucherExpireJob> logger, DemoStore store) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var expired = 0;
                lock (store.SyncRoot)
                {
                    foreach (var voucher in store.Vouchers.Where(x => x.ExpireAt < DateTimeOffset.UtcNow && x.IsActive))
                    {
                        voucher.IsActive = false;
                        expired++;
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
