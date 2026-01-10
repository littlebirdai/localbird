using System.Diagnostics;
using System.Windows.Automation;
using LocalbirdCapture.Models;
using LocalbirdCapture.Utilities;

namespace LocalbirdCapture.Services;

public class AccessibilityService
{
    private readonly ILogger<AccessibilityService> _logger;
    private const int MaxDepth = 4;

    public AccessibilityService(ILogger<AccessibilityService> logger)
    {
        _logger = logger;
    }

    public AccessibilitySnapshot? CaptureSnapshot(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;

        try
        {
            var element = AutomationElement.FromHandle(hwnd);
            if (element == null) return null;

            var windowTitle = element.Current.Name;
            var processId = element.Current.ProcessId;
            var appName = GetProcessName(processId);

            var elements = ExtractElements(element, 0);

            return new AccessibilitySnapshot
            {
                FocusedApp = appName,
                FocusedWindow = windowTitle,
                Elements = elements
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to capture accessibility snapshot");
            return null;
        }
    }

    private List<AccessibilityElement> ExtractElements(AutomationElement element, int depth)
    {
        if (depth >= MaxDepth) return [];

        var results = new List<AccessibilityElement>();

        try
        {
            var children = element.FindAll(TreeScope.Children, Condition.TrueCondition);

            foreach (AutomationElement child in children)
            {
                try
                {
                    var role = child.Current.ControlType.ProgrammaticName;
                    var name = child.Current.Name;
                    var value = GetElementValue(child);
                    var bounds = GetElementBounds(child);

                    var childElements = ExtractElements(child, depth + 1);

                    // Filter: only include meaningful elements
                    if (!string.IsNullOrEmpty(name) || !string.IsNullOrEmpty(value) ||
                        role.Contains("Button") || role.Contains("Edit") || role.Contains("Text"))
                    {
                        results.Add(new AccessibilityElement
                        {
                            Role = role,
                            Title = name,
                            Value = value,
                            Frame = bounds,
                            Children = childElements.Count > 0 ? childElements : null
                        });
                    }
                    else if (childElements.Count > 0)
                    {
                        // Promote children if parent has no content
                        results.AddRange(childElements);
                    }
                }
                catch
                {
                    // Ignore inaccessible elements
                }
            }
        }
        catch
        {
            // Ignore inaccessible subtrees
        }

        return results;
    }

    private string? GetElementValue(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern))
            {
                return ((ValuePattern)pattern).Current.Value;
            }
            if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
            {
                var text = ((TextPattern)pattern).DocumentRange.GetText(1000);
                return string.IsNullOrWhiteSpace(text) ? null : text;
            }
        }
        catch
        {
            // Ignore
        }
        return null;
    }

    private Models.WindowBounds? GetElementBounds(AutomationElement element)
    {
        try
        {
            var rect = element.Current.BoundingRectangle;
            if (!rect.IsEmpty && !double.IsInfinity(rect.Width) && !double.IsInfinity(rect.Height))
            {
                return new Models.WindowBounds(rect.X, rect.Y, rect.Width, rect.Height);
            }
        }
        catch
        {
            // Ignore
        }
        return null;
    }

    private string? GetProcessName(int processId)
    {
        try
        {
            return Process.GetProcessById(processId).ProcessName;
        }
        catch
        {
            return null;
        }
    }
}
