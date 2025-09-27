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
    var playerManager = serviceProvider.GetRequiredService<PlayerManager>();
    var scenarioId = ScenarioService.ListScenarios().Last().Id;
    return new Simulation(notificationManager, trackLayoutService, playerManager, scenarioId);
});

// Add player manager as a singleton service
builder.Services.AddSingleton<PlayerManager>();

// Add notification manager as a singleton service
builder.Services.AddSingleton<INotificationManager, NotificationManager>();

// Add track layout service as a singleton service
builder.Services.AddSingleton<ITrackLayoutService, TrackLayoutService>();

var app = builder.Build();

// Configure CORS for both API and SignalR
app.UseCors("AllowDevClient");

// Serve static files from wwwroot and map default files (e.g., index.html)
app.UseDefaultFiles();
app.UseStaticFiles();

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

// Reset simulation (stop and reload current scenario)
app.MapPost("/api/simulation/reset", (Simulation simulation) =>
{
    simulation.Stop();
    return Results.Ok(new { message = "Simulation reset", state = simulation.State.ToString() });
});

// Endpoint to advance simulation time by one minute
app.MapPost("/api/simulation/advance-minute", (Simulation simulation) =>
{
    simulation.AdvanceSeconds(60);
    return Results.Ok(new { message = "Simulation advanced by 60 seconds", state = simulation.State.ToString(), elapsedSeconds = simulation.ElapsedSeconds, currentTime = simulation.SimulationTime });
});

// Set simulation speed
app.MapPost("/api/simulation/speed", async (HttpRequest req, Simulation simulation) =>
{
    try
    {
        using var reader = new StreamReader(req.Body);
        var body = await reader.ReadToEndAsync();
        var json = System.Text.Json.JsonDocument.Parse(body);
        if (!json.RootElement.TryGetProperty("speed", out var speedEl) || speedEl.ValueKind != System.Text.Json.JsonValueKind.Number)
        {
            return Results.BadRequest(new { message = "Missing or invalid 'speed'" });
        }
        var speed = speedEl.GetInt32();
        simulation.SetSpeed(speed);
        return Results.Ok(new { message = "Speed updated", speed = speed });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.MapGet("/api/simulation/status", (Simulation simulation) =>
{
    return Results.Ok(new
    {
        state = simulation.State.ToString(),
        errorMessage = simulation.ErrorMessage,
        elapsedSeconds = simulation.ElapsedSeconds,
        currentTime = simulation.SimulationTime,
        speed = simulation.Speed
    });
});

// Scenario selection endpoints for the running simulation
app.MapGet("/api/simulation/scenario", (Simulation simulation) =>
{
    return Results.Ok(new { id = simulation.ScenarioId });
});

app.MapPost("/api/simulation/scenario", async (HttpRequest req, Simulation simulation) =>
{
    try
    {
        using var reader = new StreamReader(req.Body);
        var body = await reader.ReadToEndAsync();
        var json = System.Text.Json.JsonDocument.Parse(body);
        if (!json.RootElement.TryGetProperty("id", out var idEl) || idEl.ValueKind != System.Text.Json.JsonValueKind.String)
        {
            return Results.BadRequest(new { message = "Missing or invalid 'id'" });
        }
        var id = idEl.GetString() ?? string.Empty;
        Console.WriteLine($"[DEBUG] Setting scenario to {id}");
        if (string.Equals(id, simulation.ScenarioId, StringComparison.OrdinalIgnoreCase))
        {
            return Results.Ok(new { message = "Scenario unchanged", id });
        }

        await simulation.SetScenario(id);
        return Results.Ok(new { message = "Scenario changed", id });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.MapGet("/api/simulation/trains", (Simulation simulation) =>
{
    var list = simulation.Trains.Select(t => new
    {
        number = t.Number,
        completed = t.completed,
        currentLocation = t.CurrentLocation,
        headingForStation = t.TrainEvent is TrainSpawnEvent sp1 ? sp1.HeadingStation : null,
        delay = t.delay,
        nextEventTime = t.TrainEvent?.ScheduledTime,
        nextEventType = t.TrainEvent is TrainSpawnEvent ? "Spawn"
            : t.TrainEvent is SendApprovalEvent ? "Approval"
            : t.TrainEvent is TrainStartEvent ? "Start"
            : null,
        spawnStation = (t.TrainEvent as TrainSpawnEvent)?.Connection.ToStation
    }).ToList();
    return Results.Ok(list);
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
app.MapGet("/api/scenarios", () =>
{
    var list = ScenarioService.ListScenarios();
    return Results.Ok(list);
});

app.MapGet("/api/scenarios/{id}", (string id) =>
{
    var scenario = ScenarioService.GetScenarioById(id);
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
