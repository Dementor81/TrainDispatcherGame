using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class EndpointSessionResolver
    {
        public static string GenerateGameCode(GameSessionManager sessionManager)
        {
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            const int codeLength = 6;

            for (int attempt = 0; attempt < 20; attempt++)
            {
                var chars = new char[codeLength];
                for (int i = 0; i < codeLength; i++)
                {
                    chars[i] = alphabet[Random.Shared.Next(alphabet.Length)];
                }

                var code = new string(chars);
                if (!sessionManager.TryGet(code, out _))
                {
                    return code;
                }
            }

            return Guid.NewGuid().ToString("N")[..codeLength].ToUpperInvariant();
        }

        public static bool TryResolveGameCode(HttpRequest req, out string gameCode)
        {
            gameCode = string.Empty;
            if (req.Query.TryGetValue("gameCode", out var gameCodeValues))
            {
                var fromQuery = gameCodeValues.FirstOrDefault();
                if (GameSessionManager.TryNormalizeSessionId(fromQuery, out var normalizedGameCode))
                {
                    gameCode = normalizedGameCode;
                    return true;
                }
            }

            return false;
        }

        public static IResult? TryResolveSession(HttpRequest req, GameSessionManager sessionManager, out GameSession? session)
        {
            session = null;
            if (!TryResolveGameCode(req, out var gameCode))
            {
                return Results.BadRequest(new { message = "Missing or invalid 'gameCode' query parameter." });
            }

            if (!sessionManager.TryGet(gameCode, out session) || session == null)
            {
                return Results.NotFound(new { message = "Invalid game code." });
            }

            return null;
        }
    }
}
