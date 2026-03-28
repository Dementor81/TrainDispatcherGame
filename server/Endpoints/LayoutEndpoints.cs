using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class LayoutEndpoints
    {
        public static IEndpointRouteBuilder MapLayoutEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapGet("/api/layouts/{stationName}", (string stationName, HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var trackLayoutService = session!.TrackLayoutService;
                stationName = stationName.ToLower();
                var client = trackLayoutService.BuildClientTrackLayout(stationName);
                if (client == null)
                {
                    return Results.NotFound($"No layout found for station: {stationName}");
                }

                return Results.Json(client);
            });

            app.MapGet("/api/layouts", (HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var trackLayoutService = session!.TrackLayoutService;
                var layouts = trackLayoutService.GetAllTrackLayouts();
                var stations = layouts.Select(layout => new
                {
                    id = layout.Id,
                    name = layout.Id,
                    description = layout.Description ?? string.Empty
                }).ToList();

                return Results.Json(stations);
            });

            app.MapGet("/api/layouts/{stationName}/exits", (string stationName, HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var trackLayoutService = session!.TrackLayoutService;
                stationName = stationName.ToLower();
                var layout = trackLayoutService.GetTrackLayout(stationName);
                if (layout == null)
                {
                    return Results.NotFound($"No layout found for station: {stationName}");
                }

                return Results.Json(layout.Exits);
            });

            app.MapGet("/api/layouts/{fromStation}/exit-to/{toStation}", (string fromStation, string toStation, HttpRequest req, GameSessionManager sessionManager) =>
            {
                var sessionError = EndpointSessionResolver.TryResolveSession(req, sessionManager, out var session);
                if (sessionError != null)
                {
                    return sessionError;
                }

                var trackLayoutService = session!.TrackLayoutService;
                fromStation = fromStation.ToLower();
                toStation = toStation.ToLower();
                var exitPoint = trackLayoutService.GetExitPointToStation(fromStation, toStation);
                if (exitPoint == null)
                {
                    return Results.NotFound($"No exit found from {fromStation} to {toStation}");
                }

                return Results.Json(exitPoint);
            });

            app.MapGet("/api/network/{layoutId}", (string layoutId, TrackLayoutService trackLayoutService) =>
            {
                try
                {
                    trackLayoutService.SetActiveLayout(layoutId);

                    var networkPath = Path.Combine("data", "TrackLayouts", layoutId, "network.json");
                    if (!File.Exists(networkPath))
                    {
                        return Results.NotFound(new { message = $"Network file for layout '{layoutId}' not found" });
                    }

                    var json = File.ReadAllText(networkPath);
                    return Results.Text(json, "application/json");
                }
                catch (Exception ex)
                {
                    return Results.Problem(ex.Message);
                }
            });

            return app;
        }
    }
}
