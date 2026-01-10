using LocalbirdCapture.Models;
using LocalbirdCapture.Utilities;

namespace LocalbirdCapture.Services;

public class CaptureCoordinator : IDisposable
{
    private readonly ILogger<CaptureCoordinator> _logger;
    private readonly ScreenCaptureService _captureService;
    private readonly AccessibilityService _accessibilityService;
    private readonly ForegroundWindowMonitor _windowMonitor;

    private Timer? _captureTimer;
    private Timer? _fullScreenTimer;
    private ServiceConfig _config = new();
    private readonly object _frameLock = new();

    private CapturedFrame? _latestFrame;
    private int _frameCount;
    private DateTime? _lastCaptureTime;
    private string? _lastError;
    private bool _isRunning;

    public CaptureCoordinator(
        ILogger<CaptureCoordinator> logger,
        ScreenCaptureService captureService,
        AccessibilityService accessibilityService,
        ForegroundWindowMonitor windowMonitor)
    {
        _logger = logger;
        _captureService = captureService;
        _accessibilityService = accessibilityService;
        _windowMonitor = windowMonitor;

        _windowMonitor.OnWindowChanged += HandleWindowChanged;
    }

    public void Configure(ServiceConfig config)
    {
        _config = config;
        _logger.LogInformation("Configured with interval={Interval}s, fullScreen={FullScreen}, fullScreenInterval={FSInterval}s",
            config.CaptureInterval, config.EnableFullScreenCaptures, config.FullScreenCaptureInterval);

        if (_isRunning)
        {
            StartTimers();
        }
    }

    public async Task StartCaptureAsync()
    {
        if (_isRunning)
        {
            _logger.LogWarning("Capture already running");
            return;
        }

        _isRunning = true;
        _lastError = null;

        _windowMonitor.StartMonitoring();
        StartTimers();

        _logger.LogInformation("Capture started");

        // Capture immediately
        await CaptureFrameAsync(CaptureTrigger.Manual);
    }

    public void StopCapture()
    {
        if (!_isRunning)
        {
            _logger.LogWarning("Capture not running");
            return;
        }

        _isRunning = false;
        _captureTimer?.Dispose();
        _captureTimer = null;
        _fullScreenTimer?.Dispose();
        _fullScreenTimer = null;
        _windowMonitor.StopMonitoring();

        _logger.LogInformation("Capture stopped");
    }

    public ServiceStatus GetStatus() => new()
    {
        IsRunning = _isRunning,
        FrameCount = _frameCount,
        LastCaptureTime = _lastCaptureTime.HasValue
            ? new DateTimeOffset(_lastCaptureTime.Value).ToUnixTimeMilliseconds() / 1000.0
            : null,
        LastError = _lastError
    };

    public CapturedFrame? GetLatestFrame()
    {
        lock (_frameLock)
        {
            return _latestFrame;
        }
    }

    private void StartTimers()
    {
        _captureTimer?.Dispose();
        _captureTimer = new Timer(
            async _ => await CaptureFrameAsync(CaptureTrigger.Timer),
            null,
            TimeSpan.FromSeconds(_config.CaptureInterval),
            TimeSpan.FromSeconds(_config.CaptureInterval));

        if (_config.EnableFullScreenCaptures)
        {
            _fullScreenTimer?.Dispose();
            _fullScreenTimer = new Timer(
                async _ => await CaptureFullScreenAsync(),
                null,
                TimeSpan.FromSeconds(_config.FullScreenCaptureInterval),
                TimeSpan.FromSeconds(_config.FullScreenCaptureInterval));
        }
    }

    private async void HandleWindowChanged(IntPtr newHwnd, IntPtr oldHwnd)
    {
        if (_isRunning)
        {
            await CaptureFrameAsync(CaptureTrigger.AppChanged);
        }
    }

    private async Task CaptureFrameAsync(CaptureTrigger trigger)
    {
        try
        {
            var hwnd = _windowMonitor.CurrentWindow;
            if (!WindowHelper.IsValidWindow(hwnd))
            {
                _logger.LogDebug("No valid window to capture");
                return;
            }

            // Capture screenshot
            var imageData = await _captureService.CaptureWindowAsync(hwnd);
            if (imageData == null)
            {
                _logger.LogWarning("Failed to capture window image");
                return;
            }

            // Capture accessibility
            var accessibilityData = _accessibilityService.CaptureSnapshot(hwnd);

            // Build frame
            var frame = new CapturedFrame
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                ImageData = imageData,
                AccessibilityData = accessibilityData,
                Metadata = new CaptureMetadata
                {
                    Trigger = trigger,
                    AppName = _windowMonitor.CurrentAppName,
                    AppBundleId = _windowMonitor.CurrentProcessPath,
                    WindowTitle = _windowMonitor.CurrentWindowTitle,
                    WindowBounds = WindowHelper.GetWindowBounds(hwnd)
                }
            };

            lock (_frameLock)
            {
                _latestFrame = frame;
            }
            _frameCount++;
            _lastCaptureTime = frame.Timestamp;
            _lastError = null;

            _logger.LogInformation("[{Trigger}] Frame {Count}: {App} - {Title} ({Size} bytes)",
                trigger, _frameCount, frame.Metadata.AppName, frame.Metadata.WindowTitle, imageData.Length);
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            _logger.LogError(ex, "Failed to capture frame");
        }
    }

    private async Task CaptureFullScreenAsync()
    {
        try
        {
            var hwnd = _windowMonitor.CurrentWindow;
            var hMonitor = WindowHelper.MonitorFromWindow(hwnd, WindowHelper.MONITOR_DEFAULTTONEAREST);

            var imageData = await _captureService.CaptureMonitorAsync(hMonitor);
            if (imageData == null)
            {
                _logger.LogWarning("Failed to capture full screen");
                return;
            }

            var accessibilityData = _accessibilityService.CaptureSnapshot(hwnd);

            var frame = new CapturedFrame
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                ImageData = imageData,
                AccessibilityData = accessibilityData,
                Metadata = new CaptureMetadata
                {
                    Trigger = CaptureTrigger.FullScreen,
                    AppName = "Full Screen",
                    WindowTitle = null,
                    WindowBounds = null
                }
            };

            lock (_frameLock)
            {
                _latestFrame = frame;
            }
            _frameCount++;
            _lastCaptureTime = frame.Timestamp;
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            _logger.LogError(ex, "Failed to capture full screen");
        }
    }

    public void Dispose()
    {
        StopCapture();
        _captureService.Dispose();
        _windowMonitor.Dispose();
    }
}
