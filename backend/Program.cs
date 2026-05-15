using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using ThienPlan.Api.BackgroundJobs;
using ThienPlan.Api.Data;
using ThienPlan.Api.Helpers;
using ThienPlan.Api.Hubs;
using ThienPlan.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddSingleton<DemoStore>();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<EmailOtpService>();
builder.Services.AddHttpClient<OpenAiImageService>();
builder.Services.AddSingleton<MembershipTierJob>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<MembershipTierJob>());
builder.Services.AddHostedService<VoucherExpireJob>();
builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-secret-key-change-before-production-123456789";
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

var app = builder.Build();

// Canonical assets root (DATN_MICHI/assets) - used both by static-file middleware below
// and by the seeder to read assets/seed/products/manifest.json on first run.
var assetsRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "assets"));

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var store = scope.ServiceProvider.GetRequiredService<DemoStore>();
    await CatalogDatabaseSeeder.SeedAsync(db, store, assetsRoot);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseStaticFiles();

// Serve every project asset (product photos, brand logos, seed images, future uploads)
// from the single canonical folder at repo root: DATN_MICHI/assets/. Mapped to /assets/.
Directory.CreateDirectory(assetsRoot);
Directory.CreateDirectory(Path.Combine(assetsRoot, "uploads"));
Directory.CreateDirectory(Path.Combine(assetsRoot, "seed", "products"));
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(assetsRoot),
    RequestPath = "/assets"
});

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");

app.Run();
