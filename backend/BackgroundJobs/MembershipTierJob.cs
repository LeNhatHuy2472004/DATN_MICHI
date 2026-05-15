using ThienPlan.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace ThienPlan.Api.BackgroundJobs;

public sealed class MembershipTierJob(ILogger<MembershipTierJob> logger, IConfiguration configuration, IServiceProvider serviceProvider) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await RecalculateAsync(stoppingToken);
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public async Task RecalculateAsync(CancellationToken ct = default)
    {
        using var scope = serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var store = scope.ServiceProvider.GetRequiredService<DemoStore>();

        var silver = configuration.GetValue("Membership:SilverThreshold", 2_000_000m);
        var gold = configuration.GetValue("Membership:GoldThreshold", 10_000_000m);
        var diamond = configuration.GetValue("Membership:DiamondThreshold", 30_000_000m);

        var users = await db.Users.ToListAsync(ct);
        var changed = 0;
        foreach (var user in users)
        {
            var newTier = user.TotalSpent >= diamond ? "Diamond"
                        : user.TotalSpent >= gold ? "Gold"
                        : user.TotalSpent >= silver ? "Silver"
                        : "Bronze";
            if (user.MembershipTier != newTier)
            {
                user.MembershipTier = newTier;
                changed++;
            }
        }

        if (changed > 0)
        {
            await db.SaveChangesAsync(ct);
            // Sync DemoStore in-memory users
            lock (store.SyncRoot)
            {
                foreach (var entity in users)
                {
                    var idx = store.Users.FindIndex(u => u.Id == entity.Id);
                    if (idx >= 0)
                    {
                        var old = store.Users[idx];
                        store.Users[idx] = old with { MembershipTier = entity.MembershipTier };
                    }
                }
            }
        }

        logger.LogInformation("Membership tier job: checked {Total} users, updated {Changed} tiers.", users.Count, changed);
    }
}
