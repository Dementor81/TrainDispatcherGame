import type { ScenarioTrainDto } from "../network/dto";

type TrainType = 'Passenger' | 'Freight';

export type CreateTrainResult = {
  number: string;
  type: TrainType;
  category?: string;
  speed: number;
  cars: number;
  startStation: string;
  endStation: string;
  followingTrainNumber?: string;
};

export type EditTrainResult = {
  number: string;
  type: TrainType;
  category?: string;
  speed: number;
  cars: number;
  followingTrainNumber?: string;
};

export class EditTrainDialog {
  async showCreate(stationOrder: string[]): Promise<CreateTrainResult | null> {
    const modalEl = document.getElementById("add-train-modal") as any;
    const Modal = (window as any).bootstrap?.Modal;
    if (!modalEl || !Modal) return null;

    const numEl = document.getElementById("train-number") as HTMLInputElement | null;
    const typeEl = document.getElementById("train-type") as HTMLSelectElement | null;
    const catEl = document.getElementById("train-category") as HTMLInputElement | null;
    const speedEl = document.getElementById("train-speed") as HTMLInputElement | null;
    const carsEl = document.getElementById("train-cars") as HTMLInputElement | null;
    const followingEl = document.getElementById("train-following-number") as HTMLInputElement | null;
    const startSel = document.getElementById("train-start") as HTMLSelectElement | null;
    const endSel = document.getElementById("train-end") as HTMLSelectElement | null;
    const title = document.getElementById("addTrainModalLabel");
    const startEndRow = document.getElementById("train-start-end-row");
    const submitBtn = document.getElementById("train-submit-btn");
    const form = document.getElementById("add-train-form") as HTMLFormElement | null;

    if (!numEl || !typeEl || !catEl || !speedEl || !carsEl || !followingEl || !startSel || !endSel || !form) return null;

    // Setup for create mode
    if (title) title.textContent = "Add Train";
    if (startEndRow) startEndRow.classList.remove("d-none");
    startSel.required = true;
    endSel.required = true;
    if (submitBtn) submitBtn.textContent = "Create";

    // Defaults
    numEl.value = "";
    typeEl.value = "Passenger";
    catEl.value = "";
    speedEl.value = "120";
    carsEl.value = "6";
    followingEl.value = "";

    // Populate start/end
    startSel.innerHTML = "";
    endSel.innerHTML = "";
    for (const s of stationOrder) {
      const o1 = document.createElement("option");
      o1.value = s; o1.textContent = s; startSel.appendChild(o1);
      const o2 = document.createElement("option");
      o2.value = s; o2.textContent = s; endSel.appendChild(o2);
    }
    startSel.selectedIndex = 0;
    endSel.selectedIndex = Math.max(0, stationOrder.length - 1);

    const modal = new Modal(modalEl);

    return await new Promise<CreateTrainResult | null>((resolve) => {
      const onSubmit = (ev: Event) => {
        ev.preventDefault();
        const number = (numEl.value || "").trim() || "NEW";
        const type = (typeEl.value as TrainType) || 'Passenger';
        const category = (catEl.value || "").trim() || undefined;
        const speed = parseInt(speedEl.value || "120", 10) || 120;
        const cars = parseInt(carsEl.value || "6", 10) || 6;
        const followingTrainNumber = (followingEl.value || "").trim() || undefined;
        const startStation = startSel.value;
        const endStation = endSel.value;
        modal.hide();
        cleanup();
        resolve({ number, type, category, speed, cars, startStation, endStation, followingTrainNumber });
      };
      const onHidden = () => { cleanup(); resolve(null); };
      const cleanup = () => {
        form.removeEventListener("submit", onSubmit);
        modalEl.removeEventListener("hidden.bs.modal", onHidden as any);
      };
      form.addEventListener("submit", onSubmit);
      modalEl.addEventListener("hidden.bs.modal", onHidden as any);
      modal.show();
    });
  }

  async showEdit(train: ScenarioTrainDto, stationOrder: string[]): Promise<EditTrainResult | null> {
    const modalEl = document.getElementById("add-train-modal") as any;
    const Modal = (window as any).bootstrap?.Modal;
    if (!modalEl || !Modal) return null;

    const numEl = document.getElementById("train-number") as HTMLInputElement | null;
    const typeEl = document.getElementById("train-type") as HTMLSelectElement | null;
    const catEl = document.getElementById("train-category") as HTMLInputElement | null;
    const speedEl = document.getElementById("train-speed") as HTMLInputElement | null;
    const carsEl = document.getElementById("train-cars") as HTMLInputElement | null;
    const followingEl = document.getElementById("train-following-number") as HTMLInputElement | null;
    const startSel = document.getElementById("train-start") as HTMLSelectElement | null;
    const endSel = document.getElementById("train-end") as HTMLSelectElement | null;
    const title = document.getElementById("addTrainModalLabel");
    const startEndRow = document.getElementById("train-start-end-row");
    const submitBtn = document.getElementById("train-submit-btn");
    const form = document.getElementById("add-train-form") as HTMLFormElement | null;

    if (!numEl || !typeEl || !catEl || !speedEl || !carsEl || !followingEl || !startSel || !endSel || !form) return null;

    // Setup for edit mode
    if (title) title.textContent = "Edit Train";
    if (startEndRow) startEndRow.classList.add("d-none");
    startSel.required = false;
    endSel.required = false;
    if (submitBtn) submitBtn.textContent = "Save";

    // Populate values
    numEl.value = train.number || "";
    typeEl.value = (train.type as string) || "Passenger";
    catEl.value = (train.category as string) || "";
    speedEl.value = String(train.speed ?? 120);
    carsEl.value = String(train.cars ?? 6);
    followingEl.value = train.followingTrainNumber || "";

    const modal = new Modal(modalEl);

    return await new Promise<EditTrainResult | null>((resolve) => {
      const onSubmit = (ev: Event) => {
        ev.preventDefault();
        const number = (numEl.value || train.number).trim();
        const type = (typeEl.value as TrainType) || (train.type as TrainType) || 'Passenger';
        const category = (catEl.value || "").trim() || undefined;
        const speed = parseInt(speedEl.value || String(train.speed ?? 120), 10) || (train.speed ?? 120);
        const cars = parseInt(carsEl.value || String(train.cars ?? 6), 10) || (train.cars ?? 6);
        const followingTrainNumber = (followingEl.value || "").trim() || undefined;
        modal.hide();
        cleanup();
        resolve({ number, type, category, speed, cars, followingTrainNumber });
      };
      const onHidden = () => { cleanup(); resolve(null); };
      const cleanup = () => {
        form.removeEventListener("submit", onSubmit);
        modalEl.removeEventListener("hidden.bs.modal", onHidden as any);
      };
      form.addEventListener("submit", onSubmit);
      modalEl.addEventListener("hidden.bs.modal", onHidden as any);
      modal.show();
    });
  }
}


