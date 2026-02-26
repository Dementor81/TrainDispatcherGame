using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Services;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class ScenarioEndpoints
    {
        public static IEndpointRouteBuilder MapScenarioEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapGet("/api/scenarios", () =>
            {
                var list = ScenarioService.ListScenarios();
                return Results.Ok(list);
            });

            app.MapGet("/api/scenarios/{id}", (string id) =>
            {
                var scenario = ScenarioService.GetScenarioById(id);
                if (scenario == null)
                {
                    return Results.NotFound(new { message = $"Scenario '{id}' not found" });
                }

                return Results.Ok(scenario);
            });

            app.MapPut("/api/scenarios/{id}", async (string id, HttpRequest req) =>
            {
                try
                {
                    using var reader = new StreamReader(req.Body);
                    var body = await reader.ReadToEndAsync();

                    if (string.IsNullOrWhiteSpace(body))
                    {
                        return Results.BadRequest(new { message = "Request body cannot be empty" });
                    }

                    SzenarioDTO? scenario;
                    try
                    {
                        scenario = JsonSerializer.Deserialize<SzenarioDTO>(body, new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                    }
                    catch (JsonException ex)
                    {
                        return Results.BadRequest(new { message = $"Invalid JSON: {ex.Message}" });
                    }

                    if (scenario == null)
                    {
                        return Results.BadRequest(new { message = "Failed to deserialize scenario" });
                    }

                    ScenarioService.SaveScenario(id, scenario);
                    return Results.Ok(new { message = "Scenario saved successfully", id });
                }
                catch (Exception ex)
                {
                    if (ex.Message.Contains("Network directory not found") || ex.Message.Contains("not found"))
                    {
                        return Results.NotFound(new { message = ex.Message });
                    }

                    return Results.Problem(ex.Message);
                }
            });

            return app;
        }
    }
}
