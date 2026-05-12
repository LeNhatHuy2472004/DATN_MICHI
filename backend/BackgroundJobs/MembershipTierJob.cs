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
                using var scope = serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var silver = configuration.GetValue("Membership:SilverThreshold", 2_000_000m);
                var gold = configuration.GetValue("Membership:GoldThreshold", 10_000_000m);
                var diamond = configuration.GetValue("Membership:DiamondThreshold", 30_000_000m);
                
                var userCount = await db.Users.CountAsync(stoppingToken);

                logger.LogInformation("Membership tier job checked {UserCount} users with thresholds {Silver}/{Gold}/{Diamond}.", userCount, silver, gold, diamond);
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
