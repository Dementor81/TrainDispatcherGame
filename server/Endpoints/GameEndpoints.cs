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
                    return Results.Json(new
                    {
                        message = "Maximum number of active game sessions reached.",
                        activeSessions = sessionManager.ActiveGameSessionCount,
                        maxSessions = sessionManager.MaxConcurrentSessions
                    }, statusCode: StatusCodes.Status429TooManyRequests);
                }

                var gameCode = EndpointSessionResolver.GenerateGameCode(sessionManager);
                if (!sessionManager.TryGetOrCreateWithinLimit(gameCode, out _))
                {
                    return Results.Json(new
                    {
                        message = "Maximum number of active game sessions reached.",
                        activeSessions = sessionManager.ActiveGameSessionCount,
                        maxSessions = sessionManager.MaxConcurrentSessions
                    }, statusCode: StatusCodes.Status429TooManyRequests);
                }

                return Results.Ok(new { gameCode });
            });

            return app;
        }
    }
}
