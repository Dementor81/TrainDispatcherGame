
using TrainDispatcherGame.Server.Simulation;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Hubs;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Models;



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
builder.Services.AddSingleton<Simulation>(serviceProvider =>
{
    var notificationManager = serviceProvider.GetRequiredService<INotificationManager>();
    var trackLayoutService = serviceProvider.GetRequiredService<ITrackLayoutService>();
    var timeTableService = serviceProvider.GetRequiredService<ITimeTableService>();
    var playerManager = serviceProvider.GetRequiredService<PlayerManager>();
    return new Simulation(notificationManager, trackLayoutService, timeTableService, playerManager);
});

// Add player manager as a singleton service
builder.Services.AddSingleton<PlayerManager>();

// Add notification manager as a singleton service
builder.Services.AddSingleton<INotificationManager, NotificationManager>();

// Add track layout service as a singleton service
builder.Services.AddSingleton<ITrackLayoutService, TrackLayoutService>();

// Add time table service as a singleton service
builder.Services.AddSingleton<ITimeTableService, TimeTableService>();

// Add scenario service for REST access to scenarios
builder.Services.AddSingleton<IScenarioService, ScenarioService>();

var app = builder.Build();

// Configure CORS for both API and SignalR
app.UseCors("AllowDevClient");

// Map SignalR hub with CORS
app.MapHub<GameHub>("/gamehub").RequireCors("AllowDevClient");

// Endpoint to serve a specific track layout JSON file
app.MapGet("/api/layouts/{stationName}", (string stationName, ITrackLayoutService trackLayoutService) =>
{
    var client = trackLayoutService.BuildClientTrackLayout(stationName);
    if (client == null)
    {
        return Results.NotFound($"No layout found for station: {stationName}");
    }
    return Results.Json(client);
});

app.MapGet("/api/layouts", (ITrackLayoutService trackLayoutService) =>
{
    var layouts = trackLayoutService.GetAllTrackLayouts();
    var stations = layouts.Select(layout => new
    {
        id = layout.Id
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

app.MapPost("/api/simulation/resume", async (Simulation simulation) =>
{
    await simulation.Resume();
    return Results.Ok(new { message = "Simulation resumed", state = simulation.State.ToString() });
});

app.MapPost("/api/simulation/clear-error", (Simulation simulation) =>
{
    simulation.ClearError();
    return Results.Ok(new { message = "Error cleared", state = simulation.State.ToString() });
});

// Endpoint to advance simulation time by one minute
app.MapPost("/api/simulation/advance-minute", (Simulation simulation) =>
{
    simulation.AdvanceSeconds(60);
    return Results.Ok(new { message = "Simulation advanced by 60 seconds", state = simulation.State.ToString(), elapsedSeconds = simulation.ElapsedSeconds, currentTime = simulation.SimulationTime });
});

app.MapGet("/api/simulation/status", (Simulation simulation) =>
{
    return Results.Ok(new { 
        state = simulation.State.ToString(),
        errorMessage = simulation.ErrorMessage,
        elapsedSeconds = simulation.ElapsedSeconds,
        currentTime = simulation.SimulationTime
    });
});

app.MapGet("/api/simulation/timetable", (Simulation simulation) =>
{
    return Results.Ok(simulation.Timetable);
});



app.MapGet("/api/simulation/trains", (Simulation simulation) =>
{
    var list = simulation.Trains.Select(t => new
    {
        number = t.Number,
        completed = t.completed,
        currentLocation = t.CurrentLocation,
        headingForStation = t.NextServerEvent is TrainSpawnEvent sp1 ? sp1.Station : null,
        delay = t.delay,
        nextEventTime = t.NextServerEvent?.ScheduledTime,
        nextEventType = t.NextServerEvent is TrainSpawnEvent ? "Spawn"
            : t.NextServerEvent is SendApprovalEvent ? "Approval"
            : null,
        spawnStation = (t.NextServerEvent as TrainSpawnEvent)?.Station
    }).ToList();
    return Results.Ok(list);
});

app.MapGet("/api/simulation/trains/active", (Simulation simulation) =>
{
    var activeTrains = simulation.GetActiveTrains().Select(t => new
    {
        number = t.Number,
        completed = t.completed,
        currentLocation = t.CurrentLocation,
        headingForStation = t.NextServerEvent is TrainSpawnEvent sp2 ? sp2.Station : null,
        delay = t.delay,
        nextEventTime = t.NextServerEvent?.ScheduledTime,
        nextEventType = t.NextServerEvent is TrainSpawnEvent ? "Spawn"
            : t.NextServerEvent is SendApprovalEvent ? "Approval"
            : null,
        spawnStation = (t.NextServerEvent as TrainSpawnEvent)?.Station
    }).ToList();
    return Results.Ok(activeTrains);
});



app.MapGet("/api/simulation/trains/completed", (Simulation simulation) =>
{
    var completedTrains = simulation.GetCompletedTrains().Select(t => new
    {
        number = t.Number,
        completed = t.completed,
        currentLocation = t.CurrentLocation,
        headingForStation = t.NextServerEvent is TrainSpawnEvent sp3 ? sp3.Station : null,
        delay = t.delay,
        nextEventTime = t.NextServerEvent?.ScheduledTime,
        nextEventType = t.NextServerEvent is TrainSpawnEvent ? "Spawn"
            : t.NextServerEvent is SendApprovalEvent ? "Approval"
            : null,
        spawnStation = (t.NextServerEvent as TrainSpawnEvent)?.Station
    }).ToList();
    return Results.Ok(completedTrains);
});

// Endpoint to get upcoming trains for a specific station
app.MapGet("/api/stations/{stationId}/upcoming-trains", (string stationId, Simulation simulation) =>
{
    var stationEvents = simulation.GetStationTimetableEvents(stationId);
    return Results.Ok(stationEvents);
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

// Scenario APIs
app.MapGet("/api/scenarios", (IScenarioService scenarioService) =>
{
    var list = scenarioService.ListScenarios();
    return Results.Ok(list);
});

app.MapGet("/api/scenarios/{id}", (string id, IScenarioService scenarioService) =>
{
    var scenario = scenarioService.GetScenarioById(id);
    if (scenario == null)
    {
        return Results.NotFound(new { message = $"Scenario '{id}' not found" });
    }
    return Results.Ok(scenario);
});

// Rail network API (serves TrackLayouts/network.json)
app.MapGet("/api/network", () =>
{
    try
    {
        var networkPath = Path.Combine("TrackLayouts", "network.json");
        if (!File.Exists(networkPath))
        {
            return Results.NotFound(new { message = "network.json not found" });
        }
        var json = File.ReadAllText(networkPath);
        return Results.Text(json, "application/json");
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.Run();
