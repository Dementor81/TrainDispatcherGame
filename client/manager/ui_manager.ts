import { StationSelector } from "../ui/stationSelector";

export class UIManager {
    constructor() {
    }

    init() {
        
    }

    start() {
        this.showStationSelectionScreen();
    }

    showStationSelectionScreen() {
        const modal:StationSelector = new StationSelector();
        modal.showModal((layout: string) => {
            console.log("Selected layout:", layout);
            // TODO: Initialize the simulation with the selected layout
            // You can add your simulation initialization logic here
         });
    }
}

export default UIManager;