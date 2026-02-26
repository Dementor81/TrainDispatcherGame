using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class GameEndpoints
    {
        public static IEndpointRouteBuilder MapGameEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapPost("/api/games", (GameSessionManager sessionManager) =>
            {
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
