export class RendererConfig {
    static readonly backgroundColor = 0x1a1a1a;
    static readonly trackColor = 0x666666;
    static readonly inactiveTrackColor = 0x444444;
    static readonly switchColor = 0x888888;
    static readonly trackWidth = 4;
    static readonly switchWidth = 4;
    static readonly switchHeight = 4;
    static readonly switchCircleRadius = 8;
    static readonly switchTextColor = 0xffffff;
    static readonly switchTextSize = 12;
    static readonly switchTextFont = "Arial";
    static readonly switchTextFontSize = 12;
    static readonly switchTextFontColor = 0xffffff;
    
    // Train rendering configuration
    static readonly locomotiveColor = 0x036ffc;
    static readonly carColor = 0x4391f7;
    static readonly locomotiveWidth = 8;
    static readonly carWidth = 40;
    static readonly trainHeight = 20;
    static readonly locomotiveRadius = 3;
    static readonly carRadius = 1;
    static readonly trainTextColor = 0xffffff;
    static readonly trainTextSize = 10;
    static readonly trainCarSpacing = 4; // Distance between cars in pixels

    static readonly curveTransitionZone = 30;
}

export class SimulationConfig {
    static readonly simulationSpeed = 1.0;
    static readonly simulationIntervalMs = 20;
    static readonly simulationScale = 1000;
}