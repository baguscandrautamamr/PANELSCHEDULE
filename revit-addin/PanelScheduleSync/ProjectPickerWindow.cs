using System.Windows;
using System.Windows.Controls;

namespace PanelScheduleSync;

/// <summary>
/// Dialog pilih project tujuan push: pilih dari daftar project di Supabase
/// atau ketik nama baru (project baru dibuat otomatis saat push).
/// </summary>
public class ProjectPickerWindow : Window
{
    private readonly ComboBox _combo = new()
    {
        IsEditable = true,
        Margin = new Thickness(0, 8, 0, 16),
    };

    public string SelectedProject => (_combo.Text ?? "").Trim();

    public ProjectPickerWindow(IEnumerable<string> existingProjects, string defaultName, string panelSummary)
    {
        Title = "Panel Schedule Sync — Push to Website";
        Width = 460;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ResizeMode = ResizeMode.NoResize;

        var root = new StackPanel { Margin = new Thickness(16) };

        root.Children.Add(new TextBlock
        {
            Text = "Panel yang akan di-push:",
            FontWeight = FontWeights.Bold,
        });
        root.Children.Add(new TextBlock
        {
            Text = panelSummary,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 4, 0, 12),
        });

        root.Children.Add(new TextBlock
        {
            Text = "Project tujuan (pilih yang ada, atau ketik nama project baru):",
            TextWrapping = TextWrapping.Wrap,
        });

        foreach (string name in existingProjects.Distinct().OrderBy(n => n))
            _combo.Items.Add(name);
        _combo.Text = defaultName;
        root.Children.Add(_combo);

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        var ok = new Button { Content = "Push", Width = 90, Margin = new Thickness(0, 0, 8, 0), IsDefault = true };
        ok.Click += (_, _) =>
        {
            if (string.IsNullOrWhiteSpace(SelectedProject))
            {
                MessageBox.Show(this, "Nama project tidak boleh kosong.", Title,
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            DialogResult = true;
        };
        var cancel = new Button { Content = "Batal", Width = 90, IsCancel = true };
        buttons.Children.Add(ok);
        buttons.Children.Add(cancel);
        root.Children.Add(buttons);

        Content = root;
    }
}
