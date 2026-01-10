using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using LocalbirdCapture.Utilities;

namespace LocalbirdCapture.Services;

public class ScreenCaptureService : IDisposable
{
    private readonly ILogger<ScreenCaptureService> _logger;
    private readonly SemaphoreSlim _captureLock = new(1, 1);

    public ScreenCaptureService(ILogger<ScreenCaptureService> logger)
    {
        _logger = logger;
    }

    public async Task<byte[]?> CaptureWindowAsync(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;

        await _captureLock.WaitAsync();
        try
        {
            return CaptureWindowGdi(hwnd);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to capture window");
            return null;
        }
        finally
        {
            _captureLock.Release();
        }
    }

    public async Task<byte[]?> CaptureMonitorAsync(IntPtr hMonitor)
    {
        await _captureLock.WaitAsync();
        try
        {
            return CaptureScreen();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to capture monitor");
            return null;
        }
        finally
        {
            _captureLock.Release();
        }
    }

    private byte[]? CaptureWindowGdi(IntPtr hwnd)
    {
        if (!WindowHelper.GetWindowRect(hwnd, out var rect))
        {
            _logger.LogWarning("Could not get window rect");
            return null;
        }

        var width = rect.Width;
        var height = rect.Height;

        if (width <= 0 || height <= 0)
        {
            _logger.LogWarning("Invalid window dimensions: {Width}x{Height}", width, height);
            return null;
        }

        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);

        var hdcBitmap = g.GetHdc();
        try
        {
            var hdcWindow = GetWindowDC(hwnd);
            if (hdcWindow == IntPtr.Zero)
            {
                _logger.LogWarning("Could not get window DC");
                return null;
            }

            try
            {
                BitBlt(hdcBitmap, 0, 0, width, height, hdcWindow, 0, 0, SRCCOPY | CAPTUREBLT);
            }
            finally
            {
                ReleaseDC(hwnd, hdcWindow);
            }
        }
        finally
        {
            g.ReleaseHdc(hdcBitmap);
        }

        return ImageProcessor.ProcessBitmap(bitmap);
    }

    private byte[]? CaptureScreen()
    {
        var screenWidth = GetSystemMetrics(SM_CXSCREEN);
        var screenHeight = GetSystemMetrics(SM_CYSCREEN);

        if (screenWidth <= 0 || screenHeight <= 0)
        {
            _logger.LogWarning("Invalid screen dimensions");
            return null;
        }

        using var bitmap = new Bitmap(screenWidth, screenHeight, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);

        var hdcBitmap = g.GetHdc();
        try
        {
            var hdcScreen = GetDC(IntPtr.Zero);
            if (hdcScreen == IntPtr.Zero)
            {
                _logger.LogWarning("Could not get screen DC");
                return null;
            }

            try
            {
                BitBlt(hdcBitmap, 0, 0, screenWidth, screenHeight, hdcScreen, 0, 0, SRCCOPY | CAPTUREBLT);
            }
            finally
            {
                ReleaseDC(IntPtr.Zero, hdcScreen);
            }
        }
        finally
        {
            g.ReleaseHdc(hdcBitmap);
        }

        return ImageProcessor.ProcessBitmap(bitmap);
    }

    public void Dispose()
    {
        _captureLock.Dispose();
    }

    #region Win32 Interop

    private const int SRCCOPY = 0x00CC0020;
    private const int CAPTUREBLT = 0x40000000;
    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int width, int height,
        IntPtr hdcSrc, int xSrc, int ySrc, int rop);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    #endregion
}
