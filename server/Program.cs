using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.FileProviders;
using TrainDispatcherGame.Server.Simulation;
using TrainDispatcherGame.Server.Managers;

using TrainDispatcherGame.Server.Hubs;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowDevClient", policy =>
    {
        policy.WithOrigins("http://localhost:9000") 
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Add SignalR
builder.Services.AddSignalR();

// Add simulation as a singleton service
builder.Services.AddSingleton<Simulation>();

// Add player manager as a singleton service
builder.Services.AddSingleton<PlayerManager>();

var app = builder.Build();

app.UseCors("AllowDevClient");

// Map SignalR hub
app.MapHub<GameHub>("/gamehub");

// Endpoint to serve a specific track layout JSON file
app.MapGet("/api/layouts/{stationName}", (string stationName) =>
{
    var filePath = Path.Combine("TrackLayouts", $"{stationName}.json");

    if (!File.Exists(filePath))
    {
        return Results.NotFound($"No layout found for station: {stationName}");
    }

    var json = File.ReadAllText(filePath);
    return Results.Content(json, "application/json");
});

app.MapGet("/api/layouts", () =>
{
    var directoryPath = Path.Combine("TrackLayouts");
    if (!Directory.Exists(directoryPath))
    {
        return Results.Problem("TrackLayouts folder not found.");
    }

    var files = Directory.GetFiles(directoryPath, "*.json")
                         .Select(f => Path.GetFileNameWithoutExtension(f))
                         .ToList();

    return Results.Json(files);
});

// Simulation control endpoints
app.MapPost("/api/simulation/start", (Simulation simulation) =>
{
    simulation.Start();
    return Results.Ok(new { message = "Simulation started", state = simulation.State.ToString() });
});

app.MapPost("/api/simulation/stop", (Simulation simulation) =>
{
    simulation.Stop();
    return Results.Ok(new { message = "Simulation stopped", state = simulation.State.ToString() });
});

app.MapPost("/api/simulation/pause", (Simulation simulation) =>
{
    simulation.Pause();
    return Results.Ok(new { message = "Simulation paused", state = simulation.State.ToString() });
});

app.MapPost("/api/simulation/resume", (Simulation simulation) =>
{
    simulation.Resume();
    return Results.Ok(new { message = "Simulation resumed", state = simulation.State.ToString() });
});

app.MapPost("/api/simulation/reset", (Simulation simulation) =>
{
    simulation.Reset();
    return Results.Ok(new { message = "Simulation reset", state = simulation.State.ToString() });
});

app.MapPost("/api/simulation/clear-error", (Simulation simulation) =>
{
    simulation.ClearError();
    return Results.Ok(new { message = "Error cleared", state = simulation.State.ToString() });
});

app.MapGet("/api/simulation/status", (Simulation simulation) =>
{
    return Results.Ok(new { 
        state = simulation.State.ToString(),
        errorMessage = simulation.ErrorMessage,
        elapsedSeconds = simulation.ElapsedSeconds,
        currentTime = simulation.CurrentTime
    });
});

app.MapGet("/api/simulation/timetable", (Simulation simulation) =>
{
    return Results.Ok(simulation.Timetable);
});

app.MapGet("/api/simulation/events", (Simulation simulation, int? count) =>
{
    var events = simulation.GetUpcomingEvents(count ?? 10);
    return Results.Ok(events);
});

app.MapGet("/api/simulation/trains", (Simulation simulation) =>
{
    return Results.Ok(simulation.Trains);
});

app.MapGet("/api/simulation/trains/active", (Simulation simulation) =>
{
    var activeTrains = simulation.GetActiveTrains();
    return Results.Ok(activeTrains);
});

app.MapGet("/api/simulation/trains/waiting", (Simulation simulation) =>
{
    var waitingTrains = simulation.GetWaitingTrains();
    return Results.Ok(waitingTrains);
});

app.MapGet("/api/simulation/trains/completed", (Simulation simulation) =>
{
    var completedTrains = simulation.GetCompletedTrains();
    return Results.Ok(completedTrains);
});

// Read-only player management endpoints (for admin/debugging)
app.MapGet("/api/players", (PlayerManager playerManager) =>
{
    var players = playerManager.GetAllPlayers();
    var playerResponses = players.Select(p => new
    {
        Id = p.Id,
        StationId = p.StationId,
        ConnectedAt = p.ConnectedAt,
        IsActive = p.IsActive
    }).ToList();
    
    return Results.Ok(playerResponses);
});

app.MapGet("/api/players/{playerId}", (string playerId, PlayerManager playerManager) =>
{
    var player = playerManager.GetPlayer(playerId);
    
    if (player == null)
    {
        return Results.NotFound(new { message = $"Player {playerId} not found" });
    }
    
    var response = new
    {
        Id = player.Id,
        StationId = player.StationId,
        ConnectedAt = player.ConnectedAt,
        IsActive = player.IsActive
    };
    
    return Results.Ok(response);
});

app.MapGet("/api/stations/controlled", (PlayerManager playerManager) =>
{
    var controlledStations = playerManager.GetControlledStations();
    return Results.Ok(controlledStations);
});

app.Run();
