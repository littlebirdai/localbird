namespace LocalbirdCapture.Models;

public record AccessibilitySnapshot
{
    public string? FocusedApp { get; init; }
    public string? FocusedWindow { get; init; }
    public List<AccessibilityElement> Elements { get; init; } = [];
}

public record AccessibilityElement
{
    public required string Role { get; init; }
    public string? Title { get; init; }
    public string? Value { get; init; }
    public WindowBounds? Frame { get; init; }
    public List<AccessibilityElement>? Children { get; init; }
}
