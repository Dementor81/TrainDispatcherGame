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

    // Signal rendering configuration
    static readonly signalBackgroundColor = 0x333333;
    static readonly signalRedColor = 0xff0000;
    static readonly signalGreenColor = 0x00ff00;
    static readonly signalInactiveColor = 0x444444;
    static readonly signalWidth = 40; // Wider for horizontal layout
    static readonly signalHeight = 20; // Shorter for horizontal layout
    static readonly signalRadius = 3;
    static readonly signalCircleRadius = 5;
    static readonly signalCircleSpacing = 5; // Horizontal spacing between circles
    static readonly signalTrackOffset = 15; // Distance from track centerline to signal

    static readonly curveTransitionZone = 30;
    
    // Station rendering configuration
    static readonly stationTextColor = 0xffffff;
    static readonly stationTextSize = 24;
    static readonly stationTextFont = "Arial";
    static readonly stationTextOffset = 30; // Distance above the layout

     // Exit rendering configuration
     static readonly exitTextColor = 0xffffff;
     static readonly exitTextSize = 12;
     static readonly exitTextFont = "Arial";
     static readonly exitTextOffset = 12; // Vertical distance above the exit arrow
}

export class SimulationConfig {
    static readonly simulationSpeed = 1.0;
    static readonly simulationIntervalSeconds = 0.020;
    static readonly simulationScale = 1000;
    static readonly signalLookaheadDistance = 50; // How far ahead trains look for signals (in pixels/km)
    static readonly safetyGapDistance = 10; // Minimal distance to keep to the next train ahead (in pixels/km)
}