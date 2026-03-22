using TrainDispatcherGame.Server.Endpoints;
using TrainDispatcherGame.Server.Hubs;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Sessions;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowDevClient", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod()
              .DisallowCredentials();
    });
});

// Add SignalR — keep-alive and timeout tuned so the 30s grace period reliably
// covers the window between server-side disconnect detection and client reconnect.
builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(20);
});

// Add track layout service as a singleton service
builder.Services.AddSingleton<TrackLayoutService>();
builder.Services.AddSingleton<LicenceKeyValidator>();
builder.Services.AddSingleton<GameSessionManager>();

var app = builder.Build();

// Forward proxy headers (X-Forwarded-For/X-Forwarded-Proto) for SSL termination behind a reverse proxy
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    // Accept forwarded headers from any proxy/network (simplifies container/proxy setups). Adjust for stricter security if needed.
    RequireHeaderSymmetry = false
});
// Allow forwarded headers from any proxy (common for Docker/K8s with ingress). Configure specific proxies in locked-down environments.
var forwardedHeadersOptions = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<ForwardedHeadersOptions>>().Value;
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();

if (!app.Environment.IsDevelopment())
{
    // Enforce HTTPS in production and add HSTS. If TLS is terminated at a proxy, forwarded headers prevent unnecessary redirects.
    app.UseHsts();
    app.UseHttpsRedirection();
}

// Configure CORS for both API and SignalR
app.UseCors("AllowDevClient");

// Serve static files from wwwroot and map default files (e.g., index.html)
app.UseDefaultFiles();
app.UseStaticFiles();

// Map SignalR hub with CORS
app.MapHub<GameHub>("/gamehub").RequireCors("AllowDevClient");

app.MapGameEndpoints();
app.MapLayoutEndpoints();
app.MapLogsEndpoints();
app.MapSimulationEndpoints();
app.MapScenarioEndpoints();

if (app.Environment.IsDevelopment())
{
    const string devGameCode = "DEV101";
    var sessionManager = app.Services.GetRequiredService<GameSessionManager>();
    sessionManager.GetOrCreate(devGameCode);
    app.Logger.LogInformation("Development session ready with game code {GameCode}", devGameCode);
}

app.Run();
