import type { ScenarioTrainDto } from "../network/dto";
import { BasePanel } from "../ui/basePanel";
import type { Application } from "../core/application";
import { UI } from "../utils/ui";

type TrainType = "Passenger" | "Freight";

export type CreateTrainResult = {
   number: string;
   type: TrainType;
   category?: string;
   speedMax: number;
   cars: number;
   startStation: string;
   endStation: string;
   followingTrainNumber?: string;
};

export type EditTrainResult = {
   number: string;
   type: TrainType;
   category?: string;
   speedMax: number;
   cars: number;
   followingTrainNumber?: string;
};

export class TrainEditorPanel extends BasePanel {
   private numEl!: HTMLInputElement;
   private typeEl!: HTMLSelectElement;
   private catEl!: HTMLInputElement;
   private speedEl!: HTMLInputElement;
   private carsEl!: HTMLInputElement;
   private followingEl!: HTMLInputElement;
   private startSel!: HTMLSelectElement;
   private endSel!: HTMLSelectElement;
   private startEndRow!: HTMLDivElement;
   private helperText!: HTMLDivElement;
   private submitBtn!: HTMLButtonElement;
   private pendingResolve: ((value: CreateTrainResult | EditTrainResult | null) => void) | null = null;
   private isClosingProgrammatically = false;

   constructor() {
      // The scenario editor only needs the shared BasePanel chrome, not the full main Application.
      super({} as Application, {
         title: "Train",
         width: 360,
         top: 72,
         right: 16,
         closeable: true,
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
      this.typeEl = this.createSelect("Type", ["Passenger", "Freight"]);
      this.catEl = this.createInput("Category", "text", false, "e.g., ICE, Freight, Regional");
      this.followingEl = this.createInput("Following Train Number", "text", false, "Train number that will use this vehicle");
      this.speedEl = this.createInput("Speed (km/h)", "number", true);
      this.speedEl.min = "10";
      this.speedEl.max = "400";
      this.speedEl.step = "10";
      this.carsEl = this.createInput("Cars", "number", true);
      this.carsEl.min = "1";
      this.carsEl.max = "20";
      this.carsEl.step = "1";

      this.startEndRow = UI.createDiv("row g-2", null);
      const startCol = UI.createDiv("col", null);
      const endCol = UI.createDiv("col", null);
      startCol.appendChild(this.wrapField("Start station", this.startSel = document.createElement("select")));
      endCol.appendChild(this.wrapField("Terminus", this.endSel = document.createElement("select")));
      this.startSel.className = "form-select no-drag";
      this.endSel.className = "form-select no-drag";
      this.startEndRow.append(startCol, endCol);

      const speedCarsRow = UI.createDiv("row g-2", null);
      const speedCol = UI.createDiv("col", null);
      const carsCol = UI.createDiv("col", null);
      speedCol.appendChild(this.wrapField("Speed (km/h)", this.speedEl));
      carsCol.appendChild(this.wrapField("Cars", this.carsEl));
      speedCarsRow.append(speedCol, carsCol);

      this.helperText = UI.createDiv("form-text mt-1", null);
      this.helperText.textContent = "Departure will be set to scenario start time; stops use 1 min dwell.";

      const actions = UI.createDiv("d-flex justify-content-end gap-2 mt-2", null);
      actions.appendChild(UI.createButton("btn-sm btn-outline-secondary", "Cancel", () => this.hide()));
      this.submitBtn = UI.createButton("btn-sm btn-primary", "Save", () => this.submit());
      actions.appendChild(this.submitBtn);

      form.append(
         this.wrapField("Train number", this.numEl),
         this.wrapField("Type", this.typeEl),
         this.wrapField("Category", this.catEl),
         this.wrapField("Following Train Number", this.followingEl),
         speedCarsRow,
         this.startEndRow,
         this.helperText,
         actions
      );
      root.appendChild(form);
      return root;
   }

   public override hide(): void {
      super.hide();
      if (!this.isClosingProgrammatically) this.finish(null);
      this.isClosingProgrammatically = false;
   }

   public async showCreate(stationOrder: string[]): Promise<CreateTrainResult | null> {
      this.prepareCreate(stationOrder);
      return this.open<CreateTrainResult>();
   }

   public async showEdit(train: ScenarioTrainDto): Promise<EditTrainResult | null> {
      this.prepareEdit(train);
      return this.open<EditTrainResult>();
   }

   private open<T extends CreateTrainResult | EditTrainResult>(): Promise<T | null> {
      this.finish(null);
      this.show();
      queueMicrotask(() => this.numEl.focus());
      return new Promise((resolve) => {
         this.pendingResolve = resolve as (value: CreateTrainResult | EditTrainResult | null) => void;
      });
   }

   private prepareCreate(stationOrder: string[]) {
      this.setTitle("Add Train");
      this.submitBtn.textContent = "Create";
      this.startEndRow.classList.remove("d-none");
      this.helperText.classList.remove("d-none");
      this.numEl.value = "";
      this.typeEl.value = "Passenger";
      this.catEl.value = "";
      this.speedEl.value = "120";
      this.carsEl.value = "6";
      this.followingEl.value = "";
      this.populateStations(stationOrder);
      this.startSel.required = true;
      this.endSel.required = true;
   }

   private prepareEdit(train: ScenarioTrainDto) {
      this.setTitle("Edit Train");
      this.submitBtn.textContent = "Save";
      this.startEndRow.classList.add("d-none");
      this.helperText.classList.add("d-none");
      this.numEl.value = train.number || "";
      this.typeEl.value = (train.type as string) || "Passenger";
      this.catEl.value = train.category || "";
      this.speedEl.value = String(train.speedMax ?? 120);
      this.carsEl.value = String(train.cars ?? 6);
      this.followingEl.value = train.followingTrainNumber || "";
      this.startSel.required = false;
      this.endSel.required = false;
   }

   private populateStations(stationOrder: string[]) {
      this.startSel.innerHTML = "";
      this.endSel.innerHTML = "";
      for (const station of stationOrder) {
         this.startSel.appendChild(new Option(station, station));
         this.endSel.appendChild(new Option(station, station));
      }
      this.startSel.selectedIndex = 0;
      this.endSel.selectedIndex = Math.max(0, stationOrder.length - 1);
   }

   private submit() {
      const base = {
         number: this.numEl.value.trim() || "NEW",
         type: (this.typeEl.value as TrainType) || "Passenger",
         category: this.catEl.value.trim() || undefined,
         speedMax: parseInt(this.speedEl.value || "120", 10) || 120,
         cars: parseInt(this.carsEl.value || "6", 10) || 6,
         followingTrainNumber: this.followingEl.value.trim() || undefined,
      };
      this.closeWithResult(this.startEndRow.classList.contains("d-none")
         ? base
         : {
              ...base,
              startStation: this.startSel.value,
              endStation: this.endSel.value,
           });
   }

   private closeWithResult(result: CreateTrainResult | EditTrainResult) {
      this.isClosingProgrammatically = true;
      super.hide();
      this.isClosingProgrammatically = false;
      this.finish(result);
   }

   private finish(value: CreateTrainResult | EditTrainResult | null) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      if (resolve) resolve(value);
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
