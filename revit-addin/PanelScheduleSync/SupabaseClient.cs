using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace PanelScheduleSync;

/// <summary>
/// Client REST Supabase (PostgREST). Pakai publishable key —
/// RLS Fase 1 masih permisif, jadi add-in bisa langsung write.
/// URL/key bisa dioverride lewat file PanelScheduleSync.config.json
/// di folder yang sama dengan DLL: { "url": "...", "key": "..." }
/// </summary>
public class SupabaseClient
{
    private const string DefaultUrl = "https://ptkhwoabeclqbfemxgnj.supabase.co";
    private const string DefaultKey = "sb_publishable_dBd3RHqKg0AE7RnzRoe8aw_dRq6QDhg";

    private static readonly HttpClient Http = new();
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = false };

    private readonly string _url;
    private readonly string _key;

    public SupabaseClient()
    {
        _url = DefaultUrl;
        _key = DefaultKey;

        string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "";
        string cfgPath = Path.Combine(dir, "PanelScheduleSync.config.json");
        if (File.Exists(cfgPath))
        {
            try
            {
                using JsonDocument cfg = JsonDocument.Parse(File.ReadAllText(cfgPath));
                if (cfg.RootElement.TryGetProperty("url", out JsonElement u)) _url = u.GetString() ?? _url;
                if (cfg.RootElement.TryGetProperty("key", out JsonElement k)) _key = k.GetString() ?? _key;
            }
            catch
            {
                // config rusak — pakai default
            }
        }
    }

    /// <summary>Daftar project yang sudah ada (buat picker di add-in).</summary>
    public async Task<List<string>> GetProjectNamesAsync()
    {
        JsonDocument res = await SendAsync(HttpMethod.Get, "projects?select=name&order=name");
        var names = new List<string>();
        foreach (JsonElement row in res.RootElement.EnumerateArray())
        {
            string? name = row.GetProperty("name").GetString();
            if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
        }
        return names;
    }

    /// <summary>
    /// Ambil circuits panel dari website (match panel_code, panel yang
    /// terakhir di-update) — dipakai tombol "Pull from Website".
    /// Return null kalau panel tidak ada di database.
    /// </summary>
    public async Task<List<CircuitData>?> GetCircuitsByPanelCodeAsync(string panelCode)
    {
        JsonDocument panels = await SendAsync(
            HttpMethod.Get,
            $"panels?panel_code=eq.{Uri.EscapeDataString(panelCode)}&select=id&order=updated_at.desc&limit=1");
        if (panels.RootElement.GetArrayLength() == 0) return null;

        string panelId = panels.RootElement[0].GetProperty("id").GetString()!;
        JsonDocument rows = await SendAsync(
            HttpMethod.Get,
            $"circuits?panel_id=eq.{panelId}&select=circuit_no,function_name,breaker_type,breaker_rating,outgoing_cable&order=circuit_no");

        var list = new List<CircuitData>();
        foreach (JsonElement row in rows.RootElement.EnumerateArray())
        {
            list.Add(new CircuitData
            {
                CircuitNo = row.GetProperty("circuit_no").GetInt32(),
                FunctionName = row.GetProperty("function_name").GetString() ?? "",
                BreakerType = row.GetProperty("breaker_type").GetString(),
                BreakerRating = row.GetProperty("breaker_rating").GetString(),
                OutgoingCable = row.GetProperty("outgoing_cable").GetString(),
            });
        }
        return list;
    }

    /// <summary>Push semua panel. Return ringkasan buat TaskDialog.</summary>
    public async Task<string> PushAsync(string projectName, List<PanelData> panels)
    {
        string projectId = await EnsureProjectAsync(projectName);
        var summary = new StringBuilder();

        foreach (PanelData panel in panels)
        {
            string panelId = await UpsertPanelAsync(projectId, panel);

            // replace-all: hapus circuit lama (fixtures ikut via cascade), insert ulang
            await SendAsync(HttpMethod.Delete, $"circuits?panel_id=eq.{panelId}");

            if (panel.Circuits.Count > 0)
            {
                var circuitRows = panel.Circuits.Select(c => new Dictionary<string, object?>
                {
                    ["panel_id"] = panelId,
                    ["circuit_no"] = c.CircuitNo,
                    ["function_name"] = c.FunctionName,
                    ["breaker_type"] = c.BreakerType,
                    ["breaker_rating"] = c.BreakerRating,
                    ["outgoing_cable"] = c.OutgoingCable,
                    ["phase_r"] = c.PhaseR,
                    ["phase_s"] = c.PhaseS,
                    ["phase_t"] = c.PhaseT,
                    ["remarks"] = c.Remarks,
                    ["is_spare"] = c.IsSpare,
                }).ToList();

                JsonDocument inserted = await SendAsync(
                    HttpMethod.Post, "circuits?select=id,circuit_no", circuitRows, returnRepresentation: true);

                // map circuit_no -> id buat fixtures
                var idByNo = new Dictionary<int, string>();
                foreach (JsonElement row in inserted.RootElement.EnumerateArray())
                    idByNo[row.GetProperty("circuit_no").GetInt32()] = row.GetProperty("id").GetString()!;

                var fixtureRows = new List<Dictionary<string, object?>>();
                foreach (CircuitData c in panel.Circuits)
                {
                    if (!idByNo.TryGetValue(c.CircuitNo, out string? circuitId)) continue;
                    fixtureRows.AddRange(c.Fixtures.Select(f => new Dictionary<string, object?>
                    {
                        ["circuit_id"] = circuitId,
                        ["fixture_type"] = f.FixtureType,
                        ["fixture_label"] = f.FixtureLabel,
                        ["quantity"] = f.Quantity,
                        ["watt_per_unit"] = f.WattPerUnit,
                    }));
                }

                if (fixtureRows.Count > 0)
                    await SendAsync(HttpMethod.Post, "circuit_fixtures", fixtureRows);
            }

            summary.AppendLine($"{panel.PanelCode}: {panel.Circuits.Count} circuit");
        }

        return summary.ToString();
    }

    private async Task<string> EnsureProjectAsync(string name)
    {
        JsonDocument existing = await SendAsync(
            HttpMethod.Get, $"projects?name=eq.{Uri.EscapeDataString(name)}&select=id");
        if (existing.RootElement.GetArrayLength() > 0)
            return existing.RootElement[0].GetProperty("id").GetString()!;

        JsonDocument created = await SendAsync(
            HttpMethod.Post, "projects?select=id",
            new[] { new Dictionary<string, object?> { ["name"] = name } },
            returnRepresentation: true);
        return created.RootElement[0].GetProperty("id").GetString()!;
    }

    private async Task<string> UpsertPanelAsync(string projectId, PanelData p)
    {
        var body = new Dictionary<string, object?>
        {
            ["project_id"] = projectId,
            ["panel_code"] = p.PanelCode,
            ["location"] = p.Location,
            ["ip_rating"] = p.IpRating,
            ["box_type"] = p.BoxType,
            ["symbol_tag"] = p.SymbolTag,
            ["source_panel"] = p.SourcePanel,
            ["main_breaker_type"] = p.MainBreakerType,
            ["main_breaker_rating"] = p.MainBreakerRating,
            ["fuse_rating"] = p.FuseRating,
            ["incoming_cable"] = p.IncomingCable,
            ["voltage"] = p.Voltage,
            ["phase"] = p.Phase,
            ["wire"] = p.Wire,
            ["freq"] = p.Freq,
            ["power_factor"] = p.PowerFactor,
        };

        JsonDocument existing = await SendAsync(
            HttpMethod.Get,
            $"panels?project_id=eq.{projectId}&panel_code=eq.{Uri.EscapeDataString(p.PanelCode)}&select=id");

        if (existing.RootElement.GetArrayLength() > 0)
        {
            string id = existing.RootElement[0].GetProperty("id").GetString()!;
            await SendAsync(HttpMethod.Patch, $"panels?id=eq.{id}", body);
            return id;
        }

        JsonDocument created = await SendAsync(
            HttpMethod.Post, "panels?select=id",
            new[] { body }, returnRepresentation: true);
        return created.RootElement[0].GetProperty("id").GetString()!;
    }

    private async Task<JsonDocument> SendAsync(
        HttpMethod method, string path, object? body = null, bool returnRepresentation = false)
    {
        using var req = new HttpRequestMessage(method, $"{_url}/rest/v1/{path}");
        req.Headers.Add("apikey", _key);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _key);
        if (returnRepresentation)
            req.Headers.Add("Prefer", "return=representation");

        if (body is not null)
        {
            req.Content = new StringContent(
                JsonSerializer.Serialize(body, JsonOpts), Encoding.UTF8, "application/json");
        }

        using HttpResponseMessage res = await Http.SendAsync(req);
        string text = await res.Content.ReadAsStringAsync();

        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Supabase {method} {path} -> {(int)res.StatusCode}: {text}");

        return JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "[]" : text);
    }
}
