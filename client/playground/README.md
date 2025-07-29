# Train Simulator Playground

A comprehensive testing environment for the Train Simulator client components without requiring the server.

## Features

### 🎮 **Layout Management**
- Load different track layouts (A Stadt, B Stadt)
- Visual rendering of tracks, switches, and exits
- Real-time layout updates

### 🚂 **Movement Testing**
- Test the `calculateMovement` function with custom parameters
- Visualize movement paths through the rail network
- Test different directions (forward/backward)
- Handle switch routing and exit detection

### 🔀 **Switch Control**
- Manual toggle of individual switches
- Random switch toggling for testing
- Visual feedback of switch states
- Test routing scenarios

### 🚄 **Train Management**
- Add trains to specific tracks and positions
- Clear all trains
- Visual representation of trains on the canvas

### 🐛 **Debug Tools**
- Toggle debug mode for additional information
- Comprehensive logging system
- Minimizable test results panel
- Console output for debugging

## Getting Started

### Prerequisites
- Node.js and npm installed
- The main application dependencies installed

### Installation
1. Navigate to the playground directory:
   ```bash
   cd client/playground
   ```

2. Install playground-specific dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open your browser to `http://localhost:8081`

### Alternative: Direct File Access
If you prefer not to use the webpack dev server, you can also:
1. Open `client/playground/main.html` directly in your browser
2. Note: Some features may require a local server due to CORS restrictions

## Usage Guide

### 1. Loading a Layout
1. Select a layout from the dropdown (A Stadt or B Stadt)
2. Click "Load" to load the layout
3. The canvas will render the track layout
4. Track and switch controls will be populated

### 2. Testing Movement
1. Set the starting kilometer position
2. Choose the distance to move
3. Select direction (→ for forward, ← for backward)
4. Choose the starting track
5. Click "Test" to see the movement result

### 3. Controlling Switches
1. **Manual Control**: Use the checkboxes in the Switches section
2. **Random Toggle**: Click "Random" to toggle a random switch
3. **Visual Feedback**: Switch states are reflected in the rendering

### 4. Adding Trains
1. Set the train parameters (track, position, direction)
2. Click "Add Train" to place a train
3. Use "Clear" to remove all trains

### 5. Debug Mode
1. Click "Debug" to enable debug mode
2. Additional information will be logged
3. Click again to disable

## Architecture

The playground reuses most components from the main application:

### Core Components
- `TrackLayoutManager`: Manages track layouts and movement calculations
- `EventManager`: Handles events and communication
- `TrainManager`: Manages train entities
- `Renderer`: Handles canvas rendering
- `UIManager`: Manages UI components

### Mock Components
- `LayoutApi`: Loads actual layout JSON files from the playground folder
- `PlaygroundApplication`: Main playground application class

### File Structure
```
playground/
├── main.html          # Main HTML file
├── main.js            # Main JavaScript application
├── playground.css     # Playground-specific styles
├── webpack.config.js  # Webpack configuration
├── package.json       # Dependencies and scripts
├── README.md          # This file
├── a_stadt.json       # A-Stadt layout file
├── b_stadt.json       # B-Stadt layout file
└── dist/              # Built files (generated)
```

## Testing Scenarios

### Basic Movement
- Test movement within a single track
- Verify kilometer calculations
- Test direction changes

### Switch Routing
- Test movement through switches
- Verify switch state affects routing
- Test different switch configurations

### Exit Handling
- Test movement that hits exits
- Verify movement blocking at exits
- Test exit detection

### Complex Scenarios
- Test movement across multiple tracks
- Test switch toggling during movement
- Test train placement and visualization

## Troubleshooting

### Common Issues
1. **Module not found errors**: Ensure all dependencies are installed
2. **Canvas not rendering**: Check browser console for errors
3. **Movement not working**: Verify layout is loaded first
4. **Switches not responding**: Check if layout has switches

### Debug Tips
1. Enable debug mode for more detailed logging
2. Check browser console for error messages
3. Verify track and switch IDs match the layout
4. Use the test results panel to track operations

## Contributing

When adding new features to the playground:
1. Reuse existing components when possible
2. Add appropriate logging for debugging
3. Update this README with new features
4. Test with different layouts and scenarios 