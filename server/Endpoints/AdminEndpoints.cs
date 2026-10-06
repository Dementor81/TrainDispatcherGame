using Microsoft.AspNetCore.Mvc;
using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class AdminEndpoints
    {
        public const string AdminCodeHeader = "X-Admin-Code";

        public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapPost("/api/admin/login", (AdminLoginRequest request, AdminCodeValidator validator) =>
            {
                if (!validator.IsValid(request.Code))
                {
                    return Unauthorized();
                }

                return Results.Ok();
            });

            app.MapGet("/api/admin/sessions", (HttpRequest req, AdminCodeValidator validator, GameSessionManager sessionManager) =>
            {
                var denied = RequireAdmin(req, validator);
                if (denied != null)
                {
                    return denied;
                }

                var titles = ScenarioService.ListScenarios()
                    .GroupBy(summary => summary.Id, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(group => group.Key, group => group.First().Title, StringComparer.OrdinalIgnoreCase);

                var sessions = sessionManager.ListSessions();
                foreach (var session in sessions)
                {
                    session.ScenarioTitle = titles.TryGetValue(session.ScenarioId, out var title) && !string.IsNullOrWhiteSpace(title)
                        ? title
                        : session.ScenarioId;
                }

                return Results.Ok(sessions);
            });

            app.MapGet("/api/admin/keys", (HttpRequest req, AdminCodeValidator validator, LicenceKeyValidator keys) =>
            {
                var denied = RequireAdmin(req, validator);
                if (denied != null)
                {
                    return denied;
                }

                return Results.Ok(keys.Keys);
            });

            app.MapPost("/api/admin/keys", (HttpRequest req, AddLicenceKeyRequest request, AdminCodeValidator validator, LicenceKeyValidator keys) =>
            {
                var denied = RequireAdmin(req, validator);
                if (denied != null)
                {
                    return denied;
                }

                if (string.IsNullOrWhiteSpace(request.Label))
                {
                    return Results.BadRequest(new { message = "Bezeichnung fehlt." });
                }

                if (string.IsNullOrWhiteSpace(request.Key))
                {
                    return Results.BadRequest(new { message = "Lizenzschlüssel fehlt." });
                }

                if (!keys.TryAdd(request.Key, request.Label))
                {
                    return Results.Json(
                        new { message = "Lizenzschlüssel ist bereits vorhanden." },
                        statusCode: StatusCodes.Status409Conflict);
                }

                return Results.Ok(new { encodedKey = LicenceKeyValidator.Encode(request.Key), label = request.Label.Trim() });
            });

            app.MapDelete("/api/admin/keys", (HttpRequest req, [FromBody] DeleteLicenceKeyRequest request, AdminCodeValidator validator, LicenceKeyValidator keys) =>
            {
                var denied = RequireAdmin(req, validator);
                if (denied != null)
                {
                    return denied;
                }

                if (string.IsNullOrWhiteSpace(request.Key) || !keys.TryRemove(request.Key))
                {
                    return Results.NotFound(new { message = "Lizenzschlüssel wurde nicht gefunden." });
                }

                return Results.Ok();
            });

            return app;
        }

        public static IResult? RequireAdmin(HttpRequest req, AdminCodeValidator validator)
        {
            var code = req.Headers.TryGetValue(AdminCodeHeader, out var values)
                ? values.FirstOrDefault()
                : null;
            return validator.IsValid(code) ? null : Unauthorized();
        }

        private static IResult Unauthorized() =>
            Results.Json(new { message = "Ungültiger Admin-Code." }, statusCode: StatusCodes.Status401Unauthorized);
    }
}
