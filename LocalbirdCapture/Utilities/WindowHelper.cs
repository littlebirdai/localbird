using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace LocalbirdCapture.Utilities;

public static class WindowHelper
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    public const uint MONITOR_DEFAULTTONEAREST = 2;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left, Top, Right, Bottom;
        public int Width => Right - Left;
        public int Height => Bottom - Top;
    }

    public static string? GetWindowTitle(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;
        var sb = new StringBuilder(256);
        return GetWindowText(hwnd, sb, 256) > 0 ? sb.ToString() : null;
    }

    public static string? GetProcessName(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;
        try
        {
            GetWindowThreadProcessId(hwnd, out var pid);
            return Process.GetProcessById((int)pid).ProcessName;
        }
        catch
        {
            return null;
        }
    }

    public static string? GetProcessPath(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;
        try
        {
            GetWindowThreadProcessId(hwnd, out var pid);
            return Process.GetProcessById((int)pid).MainModule?.FileName;
        }
        catch
        {
            return null;
        }
    }

    public static uint GetProcessId(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return 0;
        GetWindowThreadProcessId(hwnd, out var pid);
        return pid;
    }

    public static Models.WindowBounds? GetWindowBounds(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;
        if (GetWindowRect(hwnd, out var rect))
        {
            return new Models.WindowBounds(rect.Left, rect.Top, rect.Width, rect.Height);
        }
        return null;
    }

    public static bool IsValidWindow(IntPtr hwnd)
    {
        return hwnd != IntPtr.Zero && IsWindowVisible(hwnd) && !IsIconic(hwnd);
    }
}
