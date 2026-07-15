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
    public int CircuitNo { get; set; }
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

public class FixtureData
{
    public string FixtureType { get; set; } = "";
    public string? FixtureLabel { get; set; }
    public int Quantity { get; set; }
    public double? WattPerUnit { get; set; }
}
