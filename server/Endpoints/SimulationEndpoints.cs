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

            app.MapGet("/api/gamemaster/snapshot", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var simulation = session!.Simulation;
                var controlledStations = session.PlayerManager.GetAllPlayers()
                    .Where(p => !string.IsNullOrWhiteSpace(p.StationId))
                    .Select(p => new PlayerControlledStationDto
                    {
                        PlayerId = p.Id,
                        PlayerName = p.Name,
                        StationId = p.StationId
                    })
                    .ToList();

                return Results.Ok(BuildGameMasterSnapshot(simulation, controlledStations));
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

            app.MapGet("/api/trains/{trainNumber}/events", (string trainNumber, HttpRequest req, GameSessionManager sessionManager) =>
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

                return Results.Ok(train.Events.Select(ToTrainEventDto).ToList());
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

        private static GameMasterSnapshotDto BuildGameMasterSnapshot(
            Simulation.Simulation simulation,
            List<PlayerControlledStationDto> controlledStations)
        {
            var trains = new List<GameMasterTrainDto>(simulation.Trains.Count);
            int running = 0, finished = 0, removed = 0, accidents = 0, delay = 0;

            foreach (var t in simulation.Trains)
            {
                trains.Add(ToGameMasterTrainDto(t));
                delay += Math.Max(0, t.delay);
                if (t.damaged) accidents++;
                else if (t.removed) removed++;
                else if (t.completed) finished++;
                else if (t.TrainEvent is not TrainStartEvent) running++;
            }

            return new GameMasterSnapshotDto
            {
                Trains = trains,
                OpenLineTracks = simulation.GetOpenLineTrackStatuses(),
                ControlledStations = controlledStations,
                MajorEvents = simulation.GetMajorEventsNewestFirst(),
                RunningCount = running,
                FinishedCount = finished,
                RemovedCount = removed,
                AccidentCount = accidents,
                CausedDelaySeconds = delay
            };
        }

        private static GameMasterTrainDto ToGameMasterTrainDto(Train t)
        {
            return new GameMasterTrainDto
            {
                Number = t.Number,
                Category = t.Category,
                Type = t.Type,
                Completed = t.completed,
                Damaged = t.damaged,
                CurrentLocation = t.CurrentLocation,
                HeadingForStation = t.TrainEvent is TrainSpawnEvent spawn ? spawn.HeadingStation : null,
                Delay = t.delay,
                NextEventTime = t.TrainEvent?.ScheduledTime,
                NextEventType = t.TrainEvent is TrainSpawnEvent ? "Spawn"
                    : t.TrainEvent is SendApprovalEvent ? "Approval"
                    : t.TrainEvent is TrainStartEvent ? "Start"
                    : t.TrainEvent is RetryDispatchEvent ? "Retry"
                    : t.TrainEvent is TrainWaitEvent ? "Wait"
                    : null,
                SpawnStation = (t.TrainEvent as TrainSpawnEvent)?.Connection.ToStation
            };
        }

        private static TrainEventDto ToTrainEventDto(TrainEventBase evt)
        {
            var dto = new TrainEventDto
            {
                ScheduledTime = evt.ScheduledTime,
                Processed = evt.Processed
            };

            switch (evt)
            {
                case TrainSpawnEvent spawn:
                    dto.Type = "Spawn";
                    dto.Data["headingStation"] = spawn.HeadingStation;
                    dto.Data["fromStation"] = spawn.Connection.FromStation;
                    dto.Data["toStation"] = spawn.Connection.ToStation;
                    dto.Data["isReversed"] = spawn.IsReversed;
                    dto.Data["headingExitId"] = spawn.HeadingExitId;
                    break;
                case TrainStartEvent start:
                    dto.Type = "Start";
                    dto.Data["station"] = start.Station;
                    break;
                case SendApprovalEvent approval:
                    dto.Type = "Approval";
                    dto.Data["approvalSent"] = approval.ApprovalSent;
                    break;
                case TrainWaitEvent wait:
                    dto.Type = "Wait";
                    dto.Data["station"] = wait.Station;
                    break;
                case RetryDispatchEvent retry:
                    dto.Type = "Retry";
                    dto.Data["blockingTrainNumber"] = retry.BlockingTrainNumber;
                    break;
                case TrainHandedToPlayerEvent handed:
                    dto.Type = "HandedToPlayer";
                    dto.Data["station"] = handed.Station;
                    if (handed.ExitPointId.HasValue)
                        dto.Data["exitPointId"] = handed.ExitPointId.Value;
                    break;
                case TrainReturnedFromPlayerEvent returned:
                    dto.Type = "ReturnedFromPlayer";
                    dto.Data["station"] = returned.Station;
                    if (returned.ExitPointId.HasValue)
                        dto.Data["exitPointId"] = returned.ExitPointId.Value;
                    break;
                case TrainStoppedEvent stopped:
                    dto.Type = "Stopped";
                    dto.Data["station"] = stopped.Station;
                    dto.Data["delay"] = stopped.Delay;
                    break;
                case TrainDepartedEvent departed:
                    dto.Type = "Departed";
                    dto.Data["station"] = departed.Station;
                    dto.Data["delay"] = departed.Delay;
                    break;
                case TrainCompletedEvent:
                    dto.Type = "Completed";
                    break;
                case TrainMissedStopEvent missed:
                    dto.Type = "MissedStop";
                    dto.Data["station"] = missed.Station;
                    break;
                case TrainMissroutedEvent missrouted:
                    dto.Type = "Missrouted";
                    dto.Data["expectedStation"] = missrouted.ExpectedStation;
                    dto.Data["actualStation"] = missrouted.ActualStation;
                    break;
                default:
                    dto.Type = evt.GetType().Name;
                    break;
            }

            return dto;
        }
    }
}
