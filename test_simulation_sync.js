// Simple test script to verify simulation state synchronization
const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:5070/api';

async function testSimulationSync() {
    console.log('Testing simulation state synchronization...');
    
    try {
        // 1. Start the simulation
        console.log('1. Starting simulation...');
        const startResponse = await fetch(`${API_BASE_URL}/simulation/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Start response:', await startResponse.json());
        
        // 2. Check initial status
        console.log('2. Checking initial status...');
        const statusResponse = await fetch(`${API_BASE_URL}/simulation/status`);
        const status = await statusResponse.json();
        console.log('Status:', status);
        
        // 3. Pause the simulation
        console.log('3. Pausing simulation...');
        const pauseResponse = await fetch(`${API_BASE_URL}/simulation/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Pause response:', await pauseResponse.json());
        
        // 4. Check status after pause
        console.log('4. Checking status after pause...');
        const statusAfterPause = await fetch(`${API_BASE_URL}/simulation/status`);
        const pauseStatus = await statusAfterPause.json();
        console.log('Status after pause:', pauseStatus);
        
        // 5. Resume the simulation
        console.log('5. Resuming simulation...');
        const resumeResponse = await fetch(`${API_BASE_URL}/simulation/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Resume response:', await resumeResponse.json());
        
        // 6. Check final status
        console.log('6. Checking final status...');
        const finalStatusResponse = await fetch(`${API_BASE_URL}/simulation/status`);
        const finalStatus = await finalStatusResponse.json();
        console.log('Final status:', finalStatus);
        
        console.log('✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testSimulationSync(); 