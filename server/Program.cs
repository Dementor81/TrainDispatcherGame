using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowDevClient", policy =>
    {
        policy.WithOrigins("http://localhost:9000") 
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowDevClient");

// Endpoint to serve a specific track layout JSON file
app.MapGet("/api/layouts/{stationName}", (string stationName) =>
{
    var filePath = Path.Combine("TrackLayouts", $"{stationName}.json");

    if (!File.Exists(filePath))
    {
        return Results.NotFound($"No layout found for station: {stationName}");
    }

    var json = File.ReadAllText(filePath);
    return Results.Content(json, "application/json");
});

app.MapGet("/api/layouts", () =>
{
    var directoryPath = Path.Combine("TrackLayouts");
    if (!Directory.Exists(directoryPath))
    {
        return Results.Problem("TrackLayouts folder not found.");
    }

    var files = Directory.GetFiles(directoryPath, "*.json")
                         .Select(f => Path.GetFileNameWithoutExtension(f))
                         .ToList();

    return Results.Json(files);
});

app.Run();
