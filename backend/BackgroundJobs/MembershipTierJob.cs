using ThienPlan.Api.Data;

namespace ThienPlan.Api.BackgroundJobs;

public sealed class MembershipTierJob(ILogger<MembershipTierJob> logger, IConfiguration configuration, DemoStore store) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var silver = configuration.GetValue("Membership:SilverThreshold", 2_000_000m);
                var gold = configuration.GetValue("Membership:GoldThreshold", 10_000_000m);
                var diamond = configuration.GetValue("Membership:DiamondThreshold", 30_000_000m);
                logger.LogInformation("Membership tier job checked {UserCount} users with thresholds {Silver}/{Gold}/{Diamond}.", store.Users.Count, silver, gold, diamond);
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
