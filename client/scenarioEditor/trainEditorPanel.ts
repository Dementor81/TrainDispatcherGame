import type { ScenarioTrainDto, TrainType } from "../network/dto";
import { BasePanel } from "../ui/basePanel";
import { UI } from "../utils/ui";

export type StationStop = { station: string; stop: boolean };

export type TrainEditorResult = {
   number: string;
   type: TrainType;
   passengers: boolean;
   category?: string;
   speedMax: number;
   cars: number;
   startStation: string;
   endStation: string;
   stops: StationStop[];
   followingTrainNumber?: string;
};

export class TrainEditorPanel extends BasePanel {
   private numEl!: HTMLInputElement;
   private typeEl!: HTMLSelectElement;
   private passengersEl!: HTMLInputElement;
   private catEl!: HTMLInputElement;
   private speedEl!: HTMLInputElement;
   private carsEl!: HTMLInputElement;
   private followingEl!: HTMLSelectElement;
   private startSel!: HTMLSelectElement;
   private endSel!: HTMLSelectElement;
   private helperText!: HTMLDivElement;
   private stopsListEl!: HTMLDivElement;
   private submitBtn!: HTMLButtonElement;
   private pendingResolve: ((value: TrainEditorResult | null) => void) | null = null;
   private isClosingProgrammatically = false;
   private scenarioTrains: ScenarioTrainDto[] = [];
   private excludeTrainNumber: string | undefined;
   private stationOrder: string[] = [];
   private stopChecks = new Map<string, boolean>();
   private fallbackPath: string[] = [];

   constructor() {
      super(null, {
         title: "Train",
         width: 640,
         top: 72,
         right: 16,
         closeable: true,
         resizable: true,
      });
   }

   protected createContent(): HTMLDivElement {
      const root = UI.createDiv(null, null);
      const form = document.createElement("form");
      form.className = "d-grid gap-2";
      form.onsubmit = (ev) => {
         ev.preventDefault();
         this.submit();
      };

      this.numEl = this.createInput("Train number", "text", true);
      this.typeEl = this.createSelect("Type", ["Passenger", "Freight", "MultipleUnit"]);
      this.typeEl.addEventListener("change", () => this.onTypeChanged());
      this.passengersEl = document.createElement("input");
      this.passengersEl.type = "checkbox";
      this.passengersEl.className = "form-check-input no-drag";
      this.passengersEl.id = "train-passengers";
      this.catEl = this.createInput("Category", "text", false, "e.g., ICE, Freight, Regional");
      this.followingEl = document.createElement("select");
      this.followingEl.className = "form-select no-drag";
      this.followingEl.ariaLabel = "Following Train Number";
      this.speedEl = this.createInput("Speed (km/h)", "number", true);
      this.speedEl.min = "10";
      this.speedEl.max = "400";
      this.speedEl.step = "10";
      this.carsEl = this.createInput("Cars", "number", true);
      this.carsEl.min = "1";
      this.carsEl.max = "20";
      this.carsEl.step = "1";

      const startEndRow = UI.createDiv("row g-2", null);
      const startCol = UI.createDiv("col", null);
      const endCol = UI.createDiv("col", null);
      startCol.appendChild(this.wrapField("Start station", this.startSel = document.createElement("select")));
      endCol.appendChild(this.wrapField("Terminus", this.endSel = document.createElement("select")));
      this.startSel.className = "form-select no-drag";
      this.endSel.className = "form-select no-drag";
      this.startSel.addEventListener("change", () => this.onRouteInputsChanged());
      this.endSel.addEventListener("change", () => this.onRouteInputsChanged());
      startEndRow.append(startCol, endCol);

      const speedCarsRow = UI.createDiv("row g-2", null);
      const speedCol = UI.createDiv("col", null);
      const carsCol = UI.createDiv("col", null);
      speedCol.appendChild(this.wrapField("Speed (km/h)", this.speedEl));
      carsCol.appendChild(this.wrapField("Cars", this.carsEl));
      speedCarsRow.append(speedCol, carsCol);

      const fields = UI.createDiv("d-grid gap-2", null);
      fields.append(
         this.wrapField("Train number", this.numEl),
         this.wrapField("Type", this.typeEl),
         this.wrapPassengersField(),
         this.wrapField("Category", this.catEl),
         this.wrapField("Following Train Number", this.followingEl),
         speedCarsRow,
         startEndRow
      );

      this.stopsListEl = UI.createDiv("d-grid gap-1 overflow-auto no-drag", null);
      this.stopsListEl.style.maxHeight = "280px";
      const stopsCol = this.wrapField("Stops", this.stopsListEl);

      const columns = UI.createDiv("row g-3", null);
      const left = UI.createDiv("col-7", null);
      const right = UI.createDiv("col-5", null);
      left.appendChild(fields);
      right.appendChild(stopsCol);
      columns.append(left, right);

      this.helperText = UI.createDiv("form-text mt-1", null);
      this.helperText.textContent = "Departure is scenario start time. Unchecked stations pass through with no dwell.";

      const actions = UI.createDiv("d-flex justify-content-end gap-2 mt-2", null);
      actions.appendChild(UI.createButton("btn-sm btn-outline-secondary", "Cancel", () => this.hide()));
      this.submitBtn = UI.createButton("btn-sm btn-primary", "Save", () => this.submit());
      actions.appendChild(this.submitBtn);

      form.append(columns, this.helperText, actions);
      root.appendChild(form);
      return root;
   }

   public override hide(): void {
      super.hide();
      if (!this.isClosingProgrammatically) this.finish(null);
      this.isClosingProgrammatically = false;
   }

   public async showCreate(stationOrder: string[], trains: ScenarioTrainDto[]): Promise<TrainEditorResult | null> {
      this.prepareCreate(stationOrder, trains);
      return this.open();
   }

   public async showEdit(train: ScenarioTrainDto, trains: ScenarioTrainDto[], stationOrder: string[]): Promise<TrainEditorResult | null> {
      this.prepareEdit(train, trains, stationOrder);
      return this.open();
   }

   public updateStationOrder(stationOrder: string[]): void {
      if (!this.isVisible) return;
      this.captureStopChecks();
      this.fillStationSelects(stationOrder);
      this.rebuildStopList();
   }

   private open(): Promise<TrainEditorResult | null> {
      this.finish(null);
      this.show();
      queueMicrotask(() => this.numEl.focus());
      return new Promise((resolve) => {
         this.pendingResolve = resolve;
      });
   }

   private prepareCreate(stationOrder: string[], trains: ScenarioTrainDto[]) {
      this.setTitle("Add Train");
      this.submitBtn.textContent = "Create";
      this.numEl.value = "";
      this.typeEl.value = "Passenger";
      this.passengersEl.checked = true;
      this.catEl.value = "";
      this.speedEl.value = "120";
      this.carsEl.value = "6";
      this.scenarioTrains = trains;
      this.excludeTrainNumber = undefined;
      this.stopChecks.clear();
      this.fallbackPath = [];
      this.fillStationSelects(stationOrder);
      this.startSel.selectedIndex = 0;
      this.endSel.selectedIndex = Math.max(0, stationOrder.length - 1);
      this.populateFollowingTrains("");
      this.rebuildStopList();
   }

   private prepareEdit(train: ScenarioTrainDto, trains: ScenarioTrainDto[], stationOrder: string[]) {
      this.setTitle("Edit Train");
      this.submitBtn.textContent = "Save";
      this.numEl.value = train.number || "";
      this.typeEl.value = train.type || "Passenger";
      this.passengersEl.checked = train.passengers ?? train.type !== "Freight";
      this.catEl.value = train.category || "";
      this.speedEl.value = String(train.speedMax ?? 120);
      this.carsEl.value = String(train.cars ?? 6);
      this.scenarioTrains = trains;
      this.excludeTrainNumber = train.number;
      this.stopChecks.clear();
      for (const entry of train.timetable ?? []) {
         this.stopChecks.set(entry.station, entry.stop);
      }
      const first = train.timetable?.[0]?.station;
      const last = train.timetable?.[train.timetable.length - 1]?.station;
      this.fallbackPath = (train.timetable ?? []).map((entry) => entry.station);
      this.fillStationSelects(stationOrder, [first, last]);
      if (first) this.startSel.value = first;
      if (last) this.endSel.value = last;
      this.populateFollowingTrains(train.followingTrainNumber || "");
      this.rebuildStopList();
   }

   private normalizeStation(station?: string | null): string {
      return (station || "").trim().toLowerCase();
   }

   private onRouteInputsChanged() {
      this.captureStopChecks();
      this.rebuildStopList();
      this.populateFollowingTrains();
   }

   private populateFollowingTrains(preferred?: string) {
      const previous = preferred ?? this.followingEl.value;
      const terminus = this.normalizeStation(this.endSel.value);
      this.followingEl.innerHTML = "";
      this.followingEl.appendChild(new Option("", ""));

      const numbers = this.scenarioTrains
         .filter((train) => {
            if (this.excludeTrainNumber && train.number === this.excludeTrainNumber) return false;
            return this.normalizeStation(train.timetable?.[0]?.station) === terminus;
         })
         .map((train) => train.number);

      for (const number of numbers) {
         this.followingEl.appendChild(new Option(number, number));
      }

      if (preferred && !numbers.includes(preferred)) {
         this.followingEl.appendChild(new Option(preferred, preferred));
      }
      this.followingEl.value =
         numbers.includes(previous) || (preferred !== undefined && previous === preferred) ? previous : "";
   }

   private fillStationSelects(stationOrder: string[], extra: Array<string | undefined> = []) {
      this.stationOrder = stationOrder;
      const start = this.startSel.value;
      const end = this.endSel.value;
      const stations = [...stationOrder];
      for (const station of extra) {
         if (station && !stations.includes(station)) stations.push(station);
      }
      this.startSel.innerHTML = "";
      this.endSel.innerHTML = "";
      for (const station of stations) {
         this.startSel.appendChild(new Option(station, station));
         this.endSel.appendChild(new Option(station, station));
      }
      if (stations.includes(start)) this.startSel.value = start;
      else this.startSel.selectedIndex = 0;
      if (stations.includes(end)) this.endSel.value = end;
      else this.endSel.selectedIndex = Math.max(0, stations.length - 1);
   }

   private getPath(): string[] {
      const startIdx = this.stationOrder.indexOf(this.startSel.value);
      const endIdx = this.stationOrder.indexOf(this.endSel.value);
      if (startIdx < 0 || endIdx < 0 || startIdx === endIdx) return this.fallbackPath;
      const step = startIdx < endIdx ? 1 : -1;
      const path: string[] = [];
      for (let i = startIdx; i !== endIdx + step; i += step) path.push(this.stationOrder[i]);
      this.fallbackPath = [];
      return path;
   }

   private captureStopChecks() {
      for (const input of this.stopsListEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
         const station = input.dataset.station;
         if (station) this.stopChecks.set(station, input.checked);
      }
   }

   private rebuildStopList() {
      const path = this.getPath();
      this.stopsListEl.innerHTML = "";
      if (path.length === 0) {
         const hint = UI.createDiv("form-text", null);
         hint.textContent = "Select different start and terminus.";
         this.stopsListEl.appendChild(hint);
         return;
      }
      path.forEach((station, index) => {
         const isEndpoint = index === 0 || index === path.length - 1;
         const checked = isEndpoint ? true : (this.stopChecks.get(station) ?? true);
         this.stopChecks.set(station, checked);

         const row = UI.createDiv("form-check", null);
         const input = document.createElement("input");
         input.type = "checkbox";
         input.className = "form-check-input no-drag";
         input.id = `train-stop-${index}`;
         input.dataset.station = station;
         input.checked = checked;
         input.disabled = isEndpoint;
         input.addEventListener("change", () => this.stopChecks.set(station, input.checked));

         const label = document.createElement("label");
         label.className = "form-check-label";
         label.htmlFor = input.id;
         label.textContent = station;
         row.append(input, label);
         this.stopsListEl.appendChild(row);
      });
   }

   private collectStops(): StationStop[] {
      this.captureStopChecks();
      const path = this.getPath();
      return path.map((station, index) => ({
         station,
         stop: index === 0 || index === path.length - 1 || (this.stopChecks.get(station) ?? true),
      }));
   }

   private submit() {
      this.closeWithResult({
         number: this.numEl.value.trim() || "NEW",
         type: (this.typeEl.value as TrainType) || "Passenger",
         passengers: this.passengersEl.checked,
         category: this.catEl.value.trim() || undefined,
         speedMax: parseInt(this.speedEl.value || "120", 10) || 120,
         cars: parseInt(this.carsEl.value || "6", 10) || 6,
         startStation: this.startSel.value,
         endStation: this.endSel.value,
         stops: this.collectStops(),
         followingTrainNumber: this.followingEl.value.trim() || undefined,
      });
   }

   private closeWithResult(result: TrainEditorResult) {
      this.isClosingProgrammatically = true;
      super.hide();
      this.isClosingProgrammatically = false;
      this.finish(result);
   }

   private finish(value: TrainEditorResult | null) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      if (resolve) resolve(value);
   }

   private onTypeChanged() {
      if (this.typeEl.value === "Freight") this.passengersEl.checked = false;
      else if (this.typeEl.value === "Passenger") this.passengersEl.checked = true;
   }

   private wrapPassengersField() {
      const wrapper = UI.createDiv("form-check mb-0", null);
      const label = document.createElement("label");
      label.className = "form-check-label";
      label.htmlFor = this.passengersEl.id;
      label.textContent = "Passengers";
      wrapper.append(this.passengersEl, label);
      return wrapper;
   }

   private createInput(label: string, type: string, required: boolean, placeholder?: string) {
      const input = document.createElement("input");
      input.type = type;
      input.required = required;
      input.placeholder = placeholder || "";
      input.className = "form-control no-drag";
      input.ariaLabel = label;
      return input;
   }

   private createSelect(label: string, options: string[]) {
      const select = document.createElement("select");
      select.className = "form-select no-drag";
      select.required = true;
      select.ariaLabel = label;
      for (const option of options) select.appendChild(new Option(option, option));
      return select;
   }

   private wrapField(label: string, field: HTMLElement) {
      const wrapper = UI.createDiv(null, null);
      const labelEl = document.createElement("label");
      labelEl.className = "form-label mb-1";
      labelEl.textContent = label;
      wrapper.append(labelEl, field);
      return wrapper;
   }
}
