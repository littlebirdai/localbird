using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace LocalbirdCapture.Utilities;

public static class ImageProcessor
{
    private const int MaxWidth = 1440;
    private const long JpegQuality = 70;

    public static byte[] ProcessBitmap(Bitmap source)
    {
        using var resized = ResizeIfNeeded(source);
        return EncodeJpeg(resized);
    }

    private static Bitmap ResizeIfNeeded(Bitmap source)
    {
        if (source.Width <= MaxWidth)
        {
            return (Bitmap)source.Clone();
        }

        var scale = (double)MaxWidth / source.Width;
        var newHeight = (int)(source.Height * scale);

        var resized = new Bitmap(MaxWidth, newHeight, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(resized);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.CompositingQuality = CompositingQuality.HighQuality;
        g.SmoothingMode = SmoothingMode.HighQuality;
        g.DrawImage(source, 0, 0, MaxWidth, newHeight);

        return resized;
    }

    private static byte[] EncodeJpeg(Bitmap bitmap)
    {
        using var ms = new System.IO.MemoryStream();
        var encoder = GetJpegEncoder();
        if (encoder == null)
        {
            // Fallback to PNG if JPEG encoder not found
            bitmap.Save(ms, ImageFormat.Png);
            return ms.ToArray();
        }

        var encoderParams = new EncoderParameters(1)
        {
            Param = { [0] = new EncoderParameter(Encoder.Quality, JpegQuality) }
        };
        bitmap.Save(ms, encoder, encoderParams);
        return ms.ToArray();
    }

    private static ImageCodecInfo? GetJpegEncoder()
    {
        return ImageCodecInfo.GetImageEncoders()
            .FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);
    }
}
