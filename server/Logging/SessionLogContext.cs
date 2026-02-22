namespace TrainDispatcherGame.Server.Logging
{
    public static class SessionLogContext
    {
        public static string Prefix(string sessionId, string? context)
        {
            var normalizedSessionId = string.IsNullOrWhiteSpace(sessionId) ? "default" : sessionId.Trim().ToLowerInvariant();
            var safeContext = context ?? string.Empty;
            return $"s:{normalizedSessionId}|{safeContext}";
        }

        public static string SessionPrefix(string sessionId)
        {
            var normalizedSessionId = string.IsNullOrWhiteSpace(sessionId) ? "default" : sessionId.Trim().ToLowerInvariant();
            return $"s:{normalizedSessionId}|";
        }
    }
}
