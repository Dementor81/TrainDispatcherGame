using System.Reflection;

namespace TrainDispatcherGame.Server.Endpoints
{
    public static class VersionEndpoints
    {
        public static IEndpointRouteBuilder MapVersionEndpoints(this IEndpointRouteBuilder app)
        {
            app.MapGet("/api/version", () =>
            {
                var assembly = Assembly.GetExecutingAssembly();
                var informationalVersion = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
                var assemblyVersion = assembly.GetName().Version?.ToString();
                var version = informationalVersion ?? assemblyVersion ?? "0.0.0";
                return Results.Ok(new { version });
            });

            return app;
        }
    }
}
