using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Endpoints
{
    public record HostGameRequest(string? LicenceKey);

    public static class GameEndpoints
    {
        public static IEndpointRouteBuilder MapGameEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapPost("/api/games", (HostGameRequest request, LicenceKeyValidator keyValidator, GameSessionManager sessionManager) =>
            {
                if (!keyValidator.IsValid(request.LicenceKey ?? ""))
                {
                    return Results.Json(new { message = "Ungültiger Lizenzschlüssel." }, statusCode: StatusCodes.Status403Forbidden);
                }

                if (sessionManager.ActiveGameSessionCount >= sessionManager.MaxConcurrentSessions)
                {
                    return TooManySessions(sessionManager);
                }

                var gameCode = EndpointSessionResolver.GenerateGameCode(sessionManager);
                if (!sessionManager.TryReserveGameCode(gameCode))
                {
                    gameCode = EndpointSessionResolver.GenerateGameCode(sessionManager);
                    if (!sessionManager.TryReserveGameCode(gameCode))
                    {
                        return Results.Json(new { message = "Game code could not be issued." }, statusCode: StatusCodes.Status500InternalServerError);
                    }
                }

                return Results.Ok(new { gameCode });
            });

            app.MapPost("/api/games/start", (HttpRequest req, StartGameRequest request, GameSessionManager sessionManager) =>
            {
                if (!EndpointSessionResolver.TryResolveGameCode(req, out var gameCode))
                {
                    return Results.BadRequest(new { message = "Missing or invalid 'gameCode' query parameter." });
                }

                var status = sessionManager.TryCreateSession(gameCode, request.ScenarioId, out var session);
                return status switch
                {
                    SessionCreateStatus.Created => Results.Ok(new { gameCode, scenarioId = session!.Simulation.ScenarioId }),
                    SessionCreateStatus.AlreadyExists => Results.Json(
                        new { message = "Eine Sitzung mit diesem Game-Code existiert bereits." },
                        statusCode: StatusCodes.Status409Conflict),
                    SessionCreateStatus.NotReserved => Results.NotFound(new { message = "Invalid game code." }),
                    SessionCreateStatus.InvalidScenario => Results.BadRequest(new { message = "Missing or invalid 'scenarioId'." }),
                    SessionCreateStatus.AtCapacity => TooManySessions(sessionManager),
                    _ => Results.Problem()
                };
            });

            app.MapPost("/api/games/end", async (HttpRequest req, GameSessionManager sessionManager) =>
            {
                if (!EndpointSessionResolver.TryResolveGameCode(req, out var gameCode))
                {
                    return Results.BadRequest(new { message = "Missing or invalid 'gameCode' query parameter." });
                }

                if (!await sessionManager.TryEndSession(gameCode))
                {
                    return Results.NotFound(new { message = "Invalid game code." });
                }

                return Results.Ok(new { gameCode });
            });

            return app;
        }

        private static IResult TooManySessions(GameSessionManager sessionManager)
        {
            return Results.Json(new
            {
                message = "Maximum number of active game sessions reached.",
                activeSessions = sessionManager.ActiveGameSessionCount,
                maxSessions = sessionManager.MaxConcurrentSessions
            }, statusCode: StatusCodes.Status429TooManyRequests);
        }
    }
}
