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
                if (sessionError != null)
                {
                    return sessionError;
                }

                var contexts = new List<string>();
                if (req.Query.TryGetValue("context", out StringValues contextValues))
                {
                    foreach (var value in contextValues)
                    {
                        if (string.IsNullOrWhiteSpace(value))
                        {
                            continue;
                        }

                        var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                        contexts.AddRange(parts);
                    }
                }

                var prefix = SessionLogContext.SessionPrefix(session!.SessionId);
                var allLogs = ServerLogger.Instance.GetLogs()
                    .Where(entry => entry.Context.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    .ToList();
                var logs = contexts.Count == 0
                    ? allLogs
                    : allLogs.Where(entry => contexts.Any(c => entry.Context.Contains(c, StringComparison.OrdinalIgnoreCase))).ToList();

                return Results.Json(logs);
            });

            return app;
        }
    }
}
