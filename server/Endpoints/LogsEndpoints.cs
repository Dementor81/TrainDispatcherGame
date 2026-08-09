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

                var contexts = new List<string>();
                if (req.Query.TryGetValue("context", out StringValues contextValues))
                {
                    foreach (var value in contextValues)
                    {
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                            contexts.AddRange(parts);
                        }
                    }
                }

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

                if (contexts.Count > 0)
                {
                    logs = logs.Where(entry =>
                        contexts.Any(c => entry.Context.Contains(c, StringComparison.OrdinalIgnoreCase)));
                }

                return Results.Json(logs.ToList());
            });

            return app;
        }
    }
}
