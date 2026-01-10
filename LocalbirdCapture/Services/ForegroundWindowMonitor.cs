using LocalbirdCapture.Utilities;

namespace LocalbirdCapture.Services;

public class ForegroundWindowMonitor : IDisposable
{
    private readonly ILogger<ForegroundWindowMonitor> _logger;
    private IntPtr _currentHwnd;
    private System.Threading.Timer? _pollTimer;
    private bool _isMonitoring;

    public event Action<IntPtr, IntPtr>? OnWindowChanged;
    public IntPtr CurrentWindow => _currentHwnd;
    public string? CurrentAppName { get; private set; }
    public string? CurrentWindowTitle { get; private set; }
    public string? CurrentProcessPath { get; private set; }

    public ForegroundWindowMonitor(ILogger<ForegroundWindowMonitor> logger)
    {
        _logger = logger;
    }

    public void StartMonitoring()
    {
        if (_isMonitoring) return;

        _isMonitoring = true;
        _currentHwnd = WindowHelper.GetForegroundWindow();
        UpdateWindowInfo();

        // Poll every 250ms
        _pollTimer = new System.Threading.Timer(_ => CheckForegroundWindow(), null, 0, 250);
        _logger.LogInformation("Started foreground window monitoring");
    }

    public void StopMonitoring()
    {
        if (!_isMonitoring) return;

        _isMonitoring = false;
        _pollTimer?.Dispose();
        _pollTimer = null;
        _logger.LogInformation("Stopped foreground window monitoring");
    }

    private void CheckForegroundWindow()
    {
        var hwnd = WindowHelper.GetForegroundWindow();
        if (hwnd != _currentHwnd && WindowHelper.IsValidWindow(hwnd))
        {
            var oldHwnd = _currentHwnd;
            _currentHwnd = hwnd;
            UpdateWindowInfo();

            _logger.LogDebug("Window changed: {OldTitle} -> {NewTitle}",
                WindowHelper.GetWindowTitle(oldHwnd), CurrentWindowTitle);

            OnWindowChanged?.Invoke(hwnd, oldHwnd);
        }
    }

    private void UpdateWindowInfo()
    {
        CurrentWindowTitle = WindowHelper.GetWindowTitle(_currentHwnd);
        CurrentAppName = WindowHelper.GetProcessName(_currentHwnd);
        CurrentProcessPath = WindowHelper.GetProcessPath(_currentHwnd);
    }

    public void Dispose()
    {
        StopMonitoring();
    }
}
