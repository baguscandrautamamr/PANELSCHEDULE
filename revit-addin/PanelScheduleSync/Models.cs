namespace PanelScheduleSync;

public class PanelData
{
    public string PanelCode { get; set; } = "";
    public string? Location { get; set; }
    public string? IpRating { get; set; }
    public string? BoxType { get; set; }
    public string? SymbolTag { get; set; }
    public string? SourcePanel { get; set; }
    public string? MainBreakerType { get; set; }
    public string? MainBreakerRating { get; set; }
    public string? FuseRating { get; set; }
    public string? IncomingCable { get; set; }
    public string Voltage { get; set; } = "400V";
    public string Phase { get; set; } = "3PH";
    public string Wire { get; set; } = "4W";
    public string Freq { get; set; } = "50Hz";
    public double PowerFactor { get; set; } = 0.8;
    public List<CircuitData> Circuits { get; set; } = [];
}

public class CircuitData
{
    /// <summary>Nomor urut tampilan di schedule (1..N, rapat tanpa loncatan).</summary>
    public int CircuitNo { get; set; }

    /// <summary>
    /// "Circuit Number" Revit apa adanya, termasuk prefix panel — "(D)/4",
    /// "DB-FG/42", "1,3,5". Jadi kunci pencocokan waktu Pull, dan ikut dipakai
    /// di FUNCTION ("LIGHTING (D)/4").
    /// </summary>
    public string? RevitCircuitNumber { get; set; }

    public string FunctionName { get; set; } = "";
    public string? BreakerType { get; set; }
    public string? BreakerRating { get; set; }
    public string? OutgoingCable { get; set; }
    public double PhaseR { get; set; }
    public double PhaseS { get; set; }
    public double PhaseT { get; set; }
    public string? Remarks { get; set; }
    public bool IsSpare { get; set; }
    public List<FixtureData> Fixtures { get; set; } = [];
}

/// <summary>
/// Baris tombstone: circuit Revit yang dihapus lewat website dan menunggu
/// di-disconnect saat Pull. RevitCircuitNumber bisa null untuk baris lama
/// (dibuat sebelum kolomnya ada) — pencocokannya jatuh ke No.
/// </summary>
public class DeletedCircuit(string id, int no, string? revitCircuitNumber)
{
    public string Id { get; } = id;
    public int No { get; } = no;
    public string? RevitCircuitNumber { get; } = revitCircuitNumber;
}

public class FixtureData
{
    public string FixtureType { get; set; } = "";
    public string? FixtureLabel { get; set; }
    public int Quantity { get; set; }
    public double? WattPerUnit { get; set; }
}
