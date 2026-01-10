using LocalbirdCapture.Models;
using LocalbirdCapture.Services;

var builder = WebApplication.CreateBuilder(args);

// Parse port from command line (--port 9111)
var port = 9111;
var portIndex = Array.IndexOf(args, "--port");
if (portIndex >= 0 && portIndex + 1 < args.Length)
{
    if (int.TryParse(args[portIndex + 1], out var parsedPort))
    {
        port = parsedPort;
    }
}

builder.WebHost.UseUrls($"http://localhost:{port}");

// Configure logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

// Register services
builder.Services.AddSingleton<ScreenCaptureService>();
builder.Services.AddSingleton<AccessibilityService>();
builder.Services.AddSingleton<ForegroundWindowMonitor>();
builder.Services.AddSingleton<CaptureCoordinator>();
builder.Services.AddCors();

var app = builder.Build();

// Enable CORS for Electron
app.UseCors(policy => policy
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader());

// Get coordinator instance
var coordinator = app.Services.GetRequiredService<CaptureCoordinator>();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Status endpoint
app.MapGet("/status", () => Results.Ok(coordinator.GetStatus()));

// Configure endpoint
app.MapPost("/configure", (ServiceConfig config) =>
{
    coordinator.Configure(config);
    return Results.Ok(new { success = true });
});

// Start capture
app.MapPost("/capture/start", async () =>
{
    await coordinator.StartCaptureAsync();
    return Results.Ok(new { success = true });
});

// Stop capture
app.MapPost("/capture/stop", () =>
{
    coordinator.StopCapture();
    return Results.Ok(new { success = true });
});

// Get latest frame (new endpoint for Electron to fetch frames)
app.MapGet("/frame/latest", () =>
{
    var frame = coordinator.GetLatestFrame();
    if (frame == null)
    {
        return Results.NotFound(new { error = "No frames captured" });
    }

    return Results.Ok(new
    {
        id = frame.Id.ToString(),
        timestamp = new DateTimeOffset(frame.Timestamp).ToUnixTimeMilliseconds() / 1000.0,
        imageBase64 = Convert.ToBase64String(frame.ImageData),
        windowTitle = frame.Metadata?.WindowTitle,
        appName = frame.Metadata?.AppName,
        appBundleId = frame.Metadata?.AppBundleId,
        trigger = frame.Metadata?.Trigger.ToString().ToLowerInvariant(),
        windowBounds = frame.Metadata?.WindowBounds != null ? new
        {
            x = frame.Metadata.WindowBounds.X,
            y = frame.Metadata.WindowBounds.Y,
            width = frame.Metadata.WindowBounds.Width,
            height = frame.Metadata.WindowBounds.Height
        } : null,
        accessibilityData = frame.AccessibilityData != null ? new
        {
            focusedApp = frame.AccessibilityData.FocusedApp,
            focusedWindow = frame.AccessibilityData.FocusedWindow,
            elements = frame.AccessibilityData.Elements.Select(SerializeElement).ToList()
        } : null
    });
});

Console.WriteLine($"Localbird Capture Service starting on port {port}...");
app.Run();

// Helper to serialize accessibility elements
static object SerializeElement(AccessibilityElement e) => new
{
    role = e.Role,
    title = e.Title,
    value = e.Value,
    frame = e.Frame != null ? new { x = e.Frame.X, y = e.Frame.Y, width = e.Frame.Width, height = e.Frame.Height } : null,
    children = e.Children?.Select(SerializeElement).ToList()
};
