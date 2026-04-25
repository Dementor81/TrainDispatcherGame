using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Sessions;
using TrainDispatcherGame.Server.Simulation;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class SimulationEndpoints
    {
        private static DateTime? NormalizeScheduledTime(DateTime time)
        {
            return time.Year <= 1 ? null : time;
        }

        public static IEndpointRouteBuilder MapSimulationEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapPost("/api/simulation/start", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                simulation.Start();
                return Results.Ok(new { message = "Simulation started", state = simulation.State.ToString() });
            });

            app.MapPost("/api/simulation/stop", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                simulation.Stop();
                return Results.Ok(new { message = "Simulation stopped", state = simulation.State.ToString() });
            });

            app.MapPost("/api/simulation/pause", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                simulation.Pause();
                return Results.Ok(new { message = "Simulation paused", state = simulation.State.ToString() });
            });

            app.MapPost("/api/simulation/resume", async (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                await simulation.Resume();
                return Results.Ok(new { message = "Simulation resumed", state = simulation.State.ToString() });
            });

            app.MapPost("/api/simulation/reset", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                simulation.Stop();
                return Results.Ok(new { message = "Simulation reset", state = simulation.State.ToString() });
            });

            app.MapPost("/api/simulation/advance-minute", async (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                await simulation.AdvanceSeconds(60);
                return Results.Ok(new
                {
                    message = "Simulation advanced by 60 seconds",
                    state = simulation.State.ToString(),
                    elapsedSeconds = simulation.ElapsedSeconds,
                    currentTime = simulation.SimulationTime
                });
            });

            app.MapPost("/api/simulation/speed", async (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
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
                    return Results.Ok(new { message = "Speed updated", speed });
                }
                catch (Exception ex)
                {
                    return Results.Problem(ex.Message);
                }
            });

            app.MapGet("/api/simulation/status", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                return Results.Ok(new
                {
                    state = simulation.State.ToString(),
                    errorMessage = simulation.ErrorMessage,
                    elapsedSeconds = simulation.ElapsedSeconds,
                    currentTime = simulation.SimulationTime,
                    speed = simulation.Speed
                });
            });

            app.MapGet("/api/simulation/scenario", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                return Results.Ok(new { id = simulation.ScenarioId });
            });

            app.MapPost("/api/simulation/scenario", async (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
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

            app.MapGet("/api/simulation/trains", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                var list = simulation.Trains.Select(t => new
                {
                    number = t.Number,
                    category = t.Category,
                    type = t.Type,
                    completed = t.completed,
                    damaged = t.damaged,
                    currentLocation = t.CurrentLocation,
                    headingForStation = t.TrainEvent is TrainSpawnEvent sp1 ? sp1.HeadingStation : null,
                    delay = t.delay,
                    nextEventTime = t.TrainEvent?.ScheduledTime,
                    nextEventType = t.TrainEvent is TrainSpawnEvent ? "Spawn"
                        : t.TrainEvent is SendApprovalEvent ? "Approval"
                        : t.TrainEvent is TrainStartEvent ? "Start"
                        : t.TrainEvent is RetryDispatchEvent ? "Retry"
                        : t.TrainEvent is TrainWaitEvent ? "Wait"
                        : null,
                    spawnStation = (t.TrainEvent as TrainSpawnEvent)?.Connection.ToStation
                }).ToList();
                return Results.Ok(list);
            });

            app.MapGet("/api/trains/{trainNumber}/waypoints", (string trainNumber, HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                var train = simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    return Results.NotFound(new { message = $"Train {trainNumber} not found" });
                }

                var waypoints = train.Route.Select(wp => new
                {
                    station = wp.Station,
                    arrivalTime = NormalizeScheduledTime(wp.ArrivalTime),
                    departureTime = NormalizeScheduledTime(wp.DepartureTime),
                    processed = wp.Processed,
                    isLast = wp.IsLast,
                    stops = wp.Stops,
                    action = wp.Action.ToString()
                }).ToList();

                return Results.Ok(waypoints);
            });

            app.MapGet("/api/trains/{trainNumber}/details", (string trainNumber, HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                var train = simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    return Results.NotFound(new { message = $"Train {trainNumber} not found" });
                }

                return Results.Ok(new TrainDetailsDto
                {
                    TrainNumber = train.Number,
                    Category = train.Category,
                    Type = train.Type,
                    Cars = train.Cars,
                    SpeedMax = train.SpeedMax,
                    FollowingTrainNumber = train.FollowingTrainNumber
                });
            });

            app.MapGet("/api/openline/tracks", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                var list = simulation.GetOpenLineTrackStatuses();
                return Results.Ok(list);
            });

            app.MapGet("/api/stations/{stationId}/upcoming-trains", (string stationId, HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                stationId = stationId.ToLower();
                var stationEvents = simulation.GetStationTimetableEvents(stationId);
                return Results.Ok(stationEvents);
            });

            app.MapGet("/api/players/controlled-stations", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var playerManager = session!.PlayerManager;
                var players = playerManager.GetAllPlayers();
                var controlledStations = players
                    .Where(p => !string.IsNullOrWhiteSpace(p.StationId))
                    .Select(p => new PlayerControlledStationDto
                    {
                        PlayerId = p.Id,
                        PlayerName = p.Name,
                        StationId = p.StationId
                    })
                    .ToList();

                return Results.Ok(controlledStations);
            });

            return app;
        }
    }
}
