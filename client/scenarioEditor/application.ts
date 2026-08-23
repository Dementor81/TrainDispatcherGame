import { fetchScenarios, fetchScenario, fetchNetwork, saveScenario } from "../network/api";
import type { ScenarioDto, NetworkDto } from "../network/dto";
import { toMinutes, minutesToString } from "./utils/timeUtils";
import { TrainEditorPanel } from "./trainEditorPanel";
import { validateTrains } from "./utils/trainValidation";
import Toast from "../ui/toast";
import { TimeDistanceDiagram } from "../timeDistanceDiagram/timeDistanceDiagram";

export default class SzenariosApplication {
   private readonly trainEditorPanel = new TrainEditorPanel();
   private readonly diagram: TimeDistanceDiagram;
   private currentScenarioId: string = "timetable";
   private currentLayoutId: string = "";
   private network?: NetworkDto;

   constructor(container: HTMLElement) {
      this.diagram = new TimeDistanceDiagram(container, {
         editable: true,
         routeSelect: document.getElementById("route-select") as HTMLSelectElement | null,
         directionFilterButton: document.getElementById("direction-filter-btn") as HTMLButtonElement | null,
         onTrainSelected: (idx) => this.setTrainActionButtonsDisabled(idx === null),
         onTrainEditRequested: (idx) => {
            this.diagram.selectTrain(idx);
            void this.editSelectedTrain();
         },
      });
   }

   public async init(): Promise<void> {
      await this.diagram.init();

      let list: Array<{ id: string }> = [];
      try {
         list = await fetchScenarios();
      } catch {}
      this.currentScenarioId = this.resolveInitialScenarioId(list);
      const { scenario, network } = await this.loadScenarioBundle(this.currentScenarioId);
      this.network = network;
      await this.diagram.show(scenario, network);
      this.setupScenarioSelector(list, this.currentScenarioId);
      this.setTrainActionButtonsDisabled(true);
   }

   private resolveInitialScenarioId(list: Array<{ id: string }>): string {
      return new URLSearchParams(window.location.search).get("scenario") || list[0]?.id || "timetable";
   }

   private async loadScenarioBundle(id: string): Promise<{ scenario: ScenarioDto; network: NetworkDto; layoutChanged: boolean }> {
      const scenario = await fetchScenario(id);
      const layoutId = scenario.layout || "";
      const layoutChanged = !this.network || layoutId !== this.currentLayoutId;
      this.currentLayoutId = layoutId;
      return {
         scenario,
         network: layoutChanged ? await fetchNetwork(layoutId) : this.network!,
         layoutChanged,
      };
   }

   private setupScenarioSelector(list: Array<{ id: string }>, selectedId: string) {
      const select = document.getElementById("scenario-select") as HTMLSelectElement | null;
      if (select) {
         select.innerHTML = "";
         for (const { id } of list) {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = id;
            opt.selected = id === selectedId;
            select.appendChild(opt);
         }
         select.onchange = () => void this.switchScenario(select.value);
      }
      this.bindClick("export-btn", () => this.exportScenarioJson());
      this.bindClick("validate-trains-btn", () => this.showTrainValidation());
      this.bindClick("save-btn", () => this.saveScenarioToServer());
      this.bindClick("add-train-btn", () => this.handleCreateTrain());
      this.bindClick("train-copy-btn", () => this.copySelectedTrain());
      this.bindClick("train-delete-btn", () => this.deleteSelectedTrain());
      this.bindClick("train-edit-btn", () => this.editSelectedTrain());
      this.bindClick("train-recalculate-btn", () => this.recalculateTrain());
   }

   private bindClick(id: string, handler: () => void | Promise<void>) {
      const element = document.getElementById(id) as HTMLButtonElement | null;
      if (element) element.onclick = () => void handler();
   }

   private async switchScenario(id: string) {
      this.currentScenarioId = id;
      const { scenario, network, layoutChanged } = await this.loadScenarioBundle(id);
      this.network = network;
      if (layoutChanged) this.diagram.resetRoute();
      await this.diagram.show(scenario, network);
      this.setTrainActionButtonsDisabled(true);
      const url = new URL(window.location.href);
      url.searchParams.set("scenario", id);
      window.history.replaceState({}, "", url.toString());
   }

   private setTrainActionButtonsDisabled(disabled: boolean) {
      for (const id of ["train-copy-btn", "train-delete-btn", "train-edit-btn", "train-recalculate-btn"]) {
         const button = document.getElementById(id) as HTMLButtonElement | null;
         if (button) button.disabled = disabled;
      }
   }

   private copySelectedTrain() {
      const scenario = this.diagram.currentScenario;
      const idx = this.diagram.selectedTrainIndex;
      if (idx === null || !scenario) return;
      const src = scenario.trains[idx];
      const clone = JSON.parse(JSON.stringify(src));
      clone.number = `${src.number}-copy`;
      for (const e of clone.timetable) {
         if (e.arrival) e.arrival = minutesToString(toMinutes(e.arrival) + 5);
         if (e.departure) e.departure = minutesToString(toMinutes(e.departure) + 5);
      }
      scenario.trains.push(clone);
      this.diagram.redraw();
   }

   private deleteSelectedTrain() {
      const scenario = this.diagram.currentScenario;
      const idx = this.diagram.selectedTrainIndex;
      if (idx === null || !scenario) return;
      scenario.trains.splice(idx, 1);
      this.diagram.selectTrain(null);
      this.diagram.redraw();
   }

   private async editSelectedTrain() {
      const scenario = this.diagram.currentScenario;
      const idx = this.diagram.selectedTrainIndex;
      if (idx === null || !scenario) return;
      const train = scenario.trains[idx];
      const res = await this.trainEditorPanel.showEdit(train as any, scenario.trains);
      if (!res) return;
      train.number = res.number;
      (train as any).type = res.type;
      (train as any).category = res.category;
      train.speedMax = res.speedMax;
      train.cars = res.cars;
      (train as any).followingTrainNumber = res.followingTrainNumber;
      this.diagram.redraw();
   }

   private buildScenarioPayload() {
      const scenario = this.diagram.currentScenario;
      if (!scenario) return null;
      return {
         title: scenario.title,
         layout: scenario.layout,
         start_time: scenario.start_time,
         trains: scenario.trains.map((train) => ({
            number: train.number,
            type: train.type,
            category: train.category,
            speedMax: train.speedMax,
            cars: train.cars,
            followingTrainNumber: (train as any).followingTrainNumber,
            timetable: train.timetable.map(({ station, arrival, departure }) => ({
               station,
               ...(arrival?.trim() ? { arrival } : {}),
               ...(departure?.trim() ? { departure } : {}),
            })),
         })),
      };
   }

   private showTrainValidation() {
      const scenario = this.diagram.currentScenario;
      const network = this.diagram.currentNetwork;
      if (!scenario || !network) {
         alert("No scenario loaded");
         return;
      }

      const errors = validateTrains(
         scenario.trains,
         (network.stations || []).map((s) => s.id)
      );
      const list = document.getElementById("validate-trains-list");
      if (list) {
         list.replaceChildren();
         if (errors.length === 0) {
            const li = document.createElement("li");
            li.textContent = "No errors found";
            list.appendChild(li);
         } else {
            for (const error of errors) {
               const li = document.createElement("li");
               li.textContent = error;
               list.appendChild(li);
            }
         }
      }

      const modalEl = document.getElementById("validate-trains-modal") as any;
      const Modal = (window as any).bootstrap?.Modal;
      if (modalEl && Modal) {
         const modal = new Modal(modalEl);
         modal.show();
      }
   }

   private exportScenarioJson() {
      const payload = this.buildScenarioPayload();
      if (!payload) return;
      const json = JSON.stringify(payload, null, 2);
      const textarea = document.getElementById("export-json-text") as HTMLTextAreaElement | null;
      if (textarea) {
         textarea.value = json;
         textarea.selectionStart = 0;
         textarea.selectionEnd = 0;
      }

      const copyBtn = document.getElementById("export-copy-btn");
      if (copyBtn) {
         copyBtn.onclick = async () => {
            try {
               await navigator.clipboard.writeText(json);
               const original = copyBtn.textContent || "Copy to Clipboard";
               copyBtn.textContent = "Copied!";
               setTimeout(() => (copyBtn.textContent = original), 1200);
            } catch {
               if (textarea) {
                  textarea.focus();
                  textarea.select();
               }
            }
         };
      }

      const modalEl = document.getElementById("export-json-modal") as any;
      const Modal = (window as any).bootstrap?.Modal;
      if (modalEl && Modal) {
         const modal = new Modal(modalEl);
         modal.show();
      }
   }

   private async saveScenarioToServer() {
      const scenarioData = this.buildScenarioPayload();
      if (!scenarioData) {
         alert("No scenario loaded");
         return;
      }

      try {
         await saveScenario(this.currentScenarioId, scenarioData as any);
         Toast.show("Scenario saved successfully!", "success");
      } catch (error) {
         const message = error instanceof Error ? error.message : "Unknown error";
         alert(`Failed to save scenario: ${message}`);
         console.error("Error saving scenario:", error);
      }
   }

   private async handleCreateTrain() {
      const scenario = this.diagram.currentScenario;
      const network = this.diagram.currentNetwork;
      const res = await this.trainEditorPanel.showCreate(this.diagram.getStationOrder(), scenario?.trains ?? []);
      if (!res || !scenario || !network) return;
      const range = this.getStationRange(res.startStation, res.endStation);
      if (!range) return;
      scenario.trains.push({
         number: res.number,
         type: res.type,
         category: res.category,
         speedMax: res.speedMax,
         cars: res.cars,
         followingTrainNumber: res.followingTrainNumber,
         timetable: this.buildTimetable(range.startIdx, range.endIdx, res.speedMax, toMinutes(scenario.start_time)) as any,
      } as any);
      this.diagram.redraw();
   }

   private getStationRange(startStation: string, endStation: string) {
      const stationOrder = this.diagram.getStationOrder();
      const startIdx = stationOrder.indexOf(startStation);
      const endIdx = stationOrder.indexOf(endStation);
      return startIdx < 0 || endIdx < 0 || startIdx === endIdx ? null : { startIdx, endIdx };
   }

   private buildTimetable(
      startIndex: number,
      endIndex: number,
      speed: number,
      startTimeMinutes: number
   ): Array<{ station: string; arrival?: string; departure?: string }> {
      const stationOrder = this.diagram.getStationOrder();
      const step = startIndex < endIndex ? 1 : -1;
      const path: string[] = [];
      for (let i = startIndex; i !== endIndex + step; i += step) path.push(stationOrder[i]);

      let current = startTimeMinutes;
      return path.map((station, index) => {
         if (index === 0) return { station, departure: minutesToString(current) };
         current += this.diagram.travelMinutes(path[index - 1], station, speed);
         const arrival = current;
         const departure = index === path.length - 1 ? undefined : minutesToString(arrival + 1);
         if (departure) current = arrival + 1;
         return { station, arrival: minutesToString(arrival), departure };
      });
   }

   private getTrainStartMinutes(train: any) {
      const [firstEntry, secondEntry] = train.timetable;
      if (!firstEntry) return null;
      if (firstEntry.departure) return toMinutes(firstEntry.departure);
      if (!secondEntry?.arrival) return null;
      return toMinutes(secondEntry.arrival) - this.diagram.travelMinutes(firstEntry.station, secondEntry.station, train.speedMax);
   }

   private recalculateTrain() {
      const scenario = this.diagram.currentScenario;
      const idx = this.diagram.selectedTrainIndex;
      if (idx === null || !scenario) return;
      const train = scenario.trains[idx];
      const firstEntry = train.timetable[0];
      const lastEntry = train.timetable[train.timetable.length - 1];
      if (!firstEntry || !lastEntry) return;
      const range = this.getStationRange(firstEntry.station, lastEntry.station);
      const startMinutes = this.getTrainStartMinutes(train);
      if (!range || startMinutes === null) return;
      train.timetable = this.buildTimetable(range.startIdx, range.endIdx, train.speedMax, startMinutes) as any;
      this.diagram.redraw();
   }
}
