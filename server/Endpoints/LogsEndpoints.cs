using Microsoft.Extensions.Primitives;
using TrainDispatcherGame.Server.Logging;
using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class LogsEndpoints
    {
        public static IEndpointRouteBuilder MapLogsEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapGet("/api/logs", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null) return sessionError;

                long afterId = 0;
                if (req.Query.TryGetValue("afterId", out StringValues afterIdValues)
                    && long.TryParse(afterIdValues.FirstOrDefault(), out var parsedAfterId)
                    && parsedAfterId > 0)
                {
                    afterId = parsedAfterId;
                }

                var prefix = SessionLogContext.SessionPrefix(session!.SessionId);
                var logs = ServerLogger.Instance.GetLogs()
                    .Where(entry => entry.Context.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    .Where(entry => entry.Id > afterId);

                return Results.Json(logs.ToList());
            });

            return app;
        }
    }
}
