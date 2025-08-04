using Microsoft.AspNetCore.Builder;

using TrainDispatcherGame.Server.Simulation;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Hubs;
using TrainDispatcherGame.Server.Services;



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

// Add SignalR
builder.Services.AddSignalR();

// Add simulation as a singleton service
builder.Services.AddSingleton<Simulation>();

// Add player manager as a singleton service
builder.Services.AddSingleton<PlayerManager>();

// Add notification manager as a singleton service
builder.Services.AddSingleton<INotificationManager, NotificationManager>();

// Add track layout service as a singleton service
builder.Services.AddSingleton<ITrackLayoutService, TrackLayoutService>();

var app = builder.Build();

// Configure CORS for both API and SignalR
app.UseCors("AllowDevClient");

// Map SignalR hub with CORS
app.MapHub<GameHub>("/gamehub").RequireCors("AllowDevClient");

// Endpoint to serve a specific track layout JSON file
app.MapGet("/api/layouts/{stationName}", (string stationName, ITrackLayoutService trackLayoutService) =>
{
    var layout = trackLayoutService.GetTrackLayout(stationName);
    if (layout == null)
    {
        return Results.NotFound($"No layout found for station: {stationName}");
    }

    var json = File.ReadAllText(Path.Combine("TrackLayouts", $"{stationName}.json"));
    return Results.Content(json, "application/json");
});

app.MapGet("/api/layouts", (ITrackLayoutService trackLayoutService) =>
{
    var layouts = trackLayoutService.GetAllTrackLayouts();
    var stations = layouts.Select(layout => new
    {
        id = layout.Id,
        title = layout.Title
    }).ToList();

    return Results.Json(stations);
});

// Endpoint to get exit points for a station
app.MapGet("/api/layouts/{stationName}/exits", (string stationName, ITrackLayoutService trackLayoutService) =>
{
    var layout = trackLayoutService.GetTrackLayout(stationName);
    if (layout == null)
    {
        return Results.NotFound($"No layout found for station: {stationName}");
    }

    return Results.Json(layout.Exits);
});

// Endpoint to get exit point from one station to another
app.MapGet("/api/layouts/{fromStation}/exit-to/{toStation}", (string fromStation, string toStation, ITrackLayoutService trackLayoutService) =>
{
    var exitPoint = trackLayoutService.GetExitPointToStation(fromStation, toStation);
    if (exitPoint == null)
    {
        return Results.NotFound($"No exit found from {fromStation} to {toStation}");
    }

    return Results.Json(exitPoint);
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



app.MapGet("/api/simulation/trains", (Simulation simulation) =>
{
    return Results.Ok(simulation.Trains);
});

app.MapGet("/api/simulation/trains/active", (Simulation simulation) =>
{
    var activeTrains = simulation.GetActiveTrains();
    return Results.Ok(activeTrains);
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
