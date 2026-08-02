using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace PanelScheduleSync;

/// <summary>
/// Icon ribbon digambar sebagai vektor lalu di-render ke bitmap 32px/16px.
/// Sengaja tidak memakai file PNG embedded: satu sumber gambar dipakai untuk
/// kedua ukuran, tidak ada aset biner di repo, dan hasilnya tetap tajam
/// karena tiap ukuran dirender ulang (bukan hasil resize).
/// </summary>
internal static class RibbonIcons
{
    private static readonly Brush PanelFill = Frozen(new SolidColorBrush(Color.FromRgb(0xEC, 0xEF, 0xF1)));
    private static readonly Brush BreakerFill = Frozen(new SolidColorBrush(Color.FromRgb(0x54, 0x6E, 0x7A)));
    private static readonly Pen PanelPen = Frozen(new Pen(
        Frozen(new SolidColorBrush(Color.FromRgb(0x37, 0x47, 0x4F))), 1.6));
    private static readonly Brush PushArrow = Frozen(new SolidColorBrush(Color.FromRgb(0x2E, 0x7D, 0x32)));
    private static readonly Brush PullArrow = Frozen(new SolidColorBrush(Color.FromRgb(0x15, 0x65, 0xC0)));
    private static readonly Pen GlobePen = Frozen(new Pen(
        Frozen(new SolidColorBrush(Color.FromRgb(0x15, 0x65, 0xC0))), 1.8));

    private static readonly Lazy<ImageSource> _push32 = new(() => Render(DrawPush, 32));
    private static readonly Lazy<ImageSource> _push16 = new(() => Render(DrawPush, 16));
    private static readonly Lazy<ImageSource> _pull32 = new(() => Render(DrawPull, 32));
    private static readonly Lazy<ImageSource> _pull16 = new(() => Render(DrawPull, 16));
    private static readonly Lazy<ImageSource> _lang32 = new(() => Render(DrawGlobe, 32));
    private static readonly Lazy<ImageSource> _lang16 = new(() => Render(DrawGlobe, 16));

    public static ImageSource Push32 => _push32.Value;
    public static ImageSource Push16 => _push16.Value;
    public static ImageSource Pull32 => _pull32.Value;
    public static ImageSource Pull16 => _pull16.Value;
    public static ImageSource Language32 => _lang32.Value;
    public static ImageSource Language16 => _lang16.Value;

    /// <summary>Panel listrik + panah keluar (ke website).</summary>
    private static void DrawPush(DrawingContext dc, bool detail)
    {
        DrawPanelBox(dc, detail);
        dc.DrawGeometry(PushArrow, null, Poly(
            24, 3.5, 30.5, 12, 26.5, 12, 26.5, 27, 21.5, 27, 21.5, 12, 17.5, 12));
    }

    /// <summary>Panel listrik + panah masuk (dari website).</summary>
    private static void DrawPull(DrawingContext dc, bool detail)
    {
        DrawPanelBox(dc, detail);
        dc.DrawGeometry(PullArrow, null, Poly(
            24, 28.5, 17.5, 20, 21.5, 20, 21.5, 5, 26.5, 5, 26.5, 20, 30.5, 20));
    }

    /// <summary>Globe — tombol ganti bahasa (Indonesia / English).</summary>
    private static void DrawGlobe(DrawingContext dc, bool detail)
    {
        var center = new Point(16, 16);
        dc.DrawEllipse(Brushes.White, GlobePen, center, 12, 12);
        // meridian + khatulistiwa tetap digambar di 16px — tanpa itu icon-nya
        // cuma jadi lingkaran kosong dan tidak kebaca sebagai globe
        dc.DrawEllipse(null, GlobePen, center, 5.5, 12);
        dc.DrawLine(GlobePen, new Point(4, 16), new Point(28, 16));
        if (!detail) return;

        dc.DrawLine(GlobePen, new Point(6.7, 9), new Point(25.3, 9));
        dc.DrawLine(GlobePen, new Point(6.7, 23), new Point(25.3, 23));
    }

    /// <summary>Kotak panel + rel breaker di dalamnya.</summary>
    private static void DrawPanelBox(DrawingContext dc, bool detail)
    {
        dc.DrawRoundedRectangle(PanelFill, PanelPen, new Rect(2.5, 4.5, 14, 23), 1.5, 1.5);
        if (!detail) return;

        for (int i = 0; i < 3; i++)
            dc.DrawRectangle(BreakerFill, null, new Rect(5, 8.5 + i * 6, 9, 3));
    }

    /// <summary>
    /// Render gambar 32x32 ke bitmap berukuran <paramref name="size"/>.
    /// Di 16px detail halus (rel breaker, garis meridian) dimatikan supaya
    /// tidak jadi bubur — hanya siluetnya yang tersisa.
    /// </summary>
    private static ImageSource Render(Action<DrawingContext, bool> draw, int size)
    {
        var visual = new DrawingVisual();
        using (DrawingContext dc = visual.RenderOpen())
        {
            dc.PushTransform(new ScaleTransform(size / 32.0, size / 32.0));
            draw(dc, size >= 32);
            dc.Pop();
        }

        var bmp = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
        bmp.Render(visual);
        bmp.Freeze();
        return bmp;
    }

    /// <summary>Poligon tertutup dari pasangan koordinat x,y.</summary>
    private static Geometry Poly(params double[] xy)
    {
        var geometry = new StreamGeometry();
        using (StreamGeometryContext ctx = geometry.Open())
        {
            ctx.BeginFigure(new Point(xy[0], xy[1]), true, true);
            var points = new List<Point>();
            for (int i = 2; i + 1 < xy.Length; i += 2)
                points.Add(new Point(xy[i], xy[i + 1]));
            ctx.PolyLineTo(points, true, true);
        }
        geometry.Freeze();
        return geometry;
    }

    private static T Frozen<T>(T freezable) where T : Freezable
    {
        freezable.Freeze();
        return freezable;
    }
}
