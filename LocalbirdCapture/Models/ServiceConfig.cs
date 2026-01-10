namespace LocalbirdCapture.Models;

public record ServiceConfig
{
    public double CaptureInterval { get; init; } = 5.0;
    public bool EnableFullScreenCaptures { get; init; } = true;
    public double FullScreenCaptureInterval { get; init; } = 1.0;
}

public record ServiceStatus
{
    public bool IsRunning { get; init; }
    public int FrameCount { get; init; }
    public double? LastCaptureTime { get; init; }
    public string? LastError { get; init; }
}
