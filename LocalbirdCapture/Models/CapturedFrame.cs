namespace LocalbirdCapture.Models;

public record CapturedFrame
{
    public required Guid Id { get; init; }
    public required DateTime Timestamp { get; init; }
    public required byte[] ImageData { get; init; }
    public AccessibilitySnapshot? AccessibilityData { get; init; }
    public CaptureMetadata? Metadata { get; init; }
}

public record CaptureMetadata
{
    public required CaptureTrigger Trigger { get; init; }
    public string? AppBundleId { get; init; }
    public string? AppName { get; init; }
    public string? WindowTitle { get; init; }
    public WindowBounds? WindowBounds { get; init; }
}

public record WindowBounds(double X, double Y, double Width, double Height);

public enum CaptureTrigger
{
    Timer,
    AppChanged,
    FullScreen,
    Manual
}
