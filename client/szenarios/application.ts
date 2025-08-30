import * as PIXI from "pixi.js";
import { fetchScenarios, fetchScenario, fetchNetwork } from "../network/api";
import type { ScenarioDto, NetworkDto } from "../network/dto";

export default class SzenariosApplication {
   private readonly container: HTMLElement;
   private app!: PIXI.Application;
   private currentScenarioId: string = "timetable";
   private isDraggingTrain: boolean = false;
   private draggingTrainIdx: number | null = null;
   private dragStartPointerY: number = 0;
   private dragSnapshot?: { arrivals: (number | null)[]; departures: (number | null)[] };
   private isDraggingHandle: boolean = false;
   private handleTrainIdx: number | null = null;
   private handleEntryIdx: number | null = null;
   private handleField: "arrival" | "departure" | null = null;
   private handleStartPointerY: number = 0;
   private handleStartMinutes: number = 0;
   private handleSnapshot?: { arrivals: (number | null)[]; departures: (number | null)[] };
   private scenario?: ScenarioDto;
   private network?: NetworkDto;
   private stationOrder: string[] = [];
   private stationIndex: Map<string, number> = new Map();
   private singleTrackBg?: PIXI.Graphics;
   private grid?: PIXI.Graphics;
   private lines?: PIXI.Graphics;
   private labels?: PIXI.Container;
   private trainLabels?: PIXI.Container;
   private timeHandles?: PIXI.Container;
   private hoverOverlay?: PIXI.Graphics;
   private hoverLeftLabel?: PIXI.Text;
   private hoverRightLabel?: PIXI.Text;
   private lastHoverClientY: number | null = null;
   private padding: number = 40;
   private viewStartMinutes: number = 0;
   private viewDurationMinutes: number = 60;
   private isPanning: boolean = false;
   private lastPointerY: number = 0;
   private selectedTrainIdx: number | null = null;
   private modalSubmit?: (ev: Event) => void;

   constructor(container: HTMLElement) {
      this.container = container;
   }

   public async init(): Promise<void> {
      this.app = new PIXI.Application();
      await this.app.init({
         resizeTo: this.container,
         background: 0x101214 as any,
         antialias: true,
      });
      this.container.appendChild(this.app.canvas);

      // Choose scenario by URL (?scenario=ID) or first in list; fallback 'timetable'
      let scenarioId = "timetable";
      let list: Array<{ id: string }> = [];
      try {
         list = await fetchScenarios();
      } catch {}
      const urlScenario = new URLSearchParams(window.location.search).get("scenario");
      if (urlScenario) {
         scenarioId = urlScenario;
      } else if (list && list.length > 0) {
         scenarioId = list[0].id;
      }
      console.log("[Graph] Using scenario:", scenarioId);

      this.currentScenarioId = scenarioId;
      const [scenario, network] = await Promise.all([fetchScenario(this.currentScenarioId), fetchNetwork()]);
      await this.renderScenario(scenario, network);

      // populate selector and hook change
      this.setupScenarioSelector(list, this.currentScenarioId);
   }

   private async renderScenario(scenario: ScenarioDto, network: NetworkDto): Promise<void> {
      this.scenario = scenario;
      this.network = network;
      this.viewStartMinutes = toMinutes(scenario.start_time);
      this.viewDurationMinutes = 60;

      // Compute station order and index
      this.stationOrder = deriveOrderedStations(network);
      if (this.stationOrder.length === 0) {
         this.stationOrder = network.stations && network.stations.length > 0 ? network.stations.slice() : [];
      }
      if (this.stationOrder.length === 0) {
         const set = new Set<string>();
         for (const t of scenario.trains) for (const s of t.timetable || []) set.add(s.station);
         this.stationOrder = Array.from(set);
      }
      this.stationIndex = new Map(this.stationOrder.map((s, i) => [s, i] as [string, number]));

      // Create layers
      this.singleTrackBg = new PIXI.Graphics();
      this.grid = new PIXI.Graphics();
      this.lines = new PIXI.Graphics();
      this.labels = new PIXI.Container();
      this.trainLabels = new PIXI.Container();
      this.timeHandles = new PIXI.Container();
      this.app.stage.addChild(this.singleTrackBg);
      this.app.stage.addChild(this.grid);
      this.app.stage.addChild(this.lines);
      this.app.stage.addChild(this.labels);
      this.app.stage.addChild(this.trainLabels);
      this.app.stage.addChild(this.timeHandles);
      // Hover overlay (dashed line + edge minute labels)
      this.hoverOverlay = new PIXI.Graphics();
      this.hoverLeftLabel = new PIXI.Text({
         text: "",
         style: {
            fontSize: 11,
            fill: 0x8b93a1,
            align: "right",
            fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
         },
      });
      this.hoverRightLabel = new PIXI.Text({
         text: "",
         style: {
            fontSize: 11,
            fill: 0x8b93a1,
            align: "left",
            fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
         },
      });
      this.hoverLeftLabel.anchor.set(1, 0.5);
      this.hoverRightLabel.anchor.set(0, 0.5);
      this.app.stage.addChild(this.hoverOverlay);
      this.app.stage.addChild(this.hoverLeftLabel);
      this.app.stage.addChild(this.hoverRightLabel);
      this.hideHover();

      this.drawScene();
      this.setupInteractions();
   }

   private drawScene() {
      if (!this.scenario || !this.network || !this.grid || !this.lines || !this.labels || !this.trainLabels) return;
      const padding = this.padding;
      const width = this.app.renderer.width - padding * 2;
      const height = this.app.renderer.height - padding * 2;
      const denom = Math.max(1, this.stationOrder.length - 1);
      const xForStation = (station: string): number => {
         const idx = this.stationIndex.get(station) ?? 0;
         return padding + (idx / denom) * width;
      };
      const yForMinutes = (m: number): number => {
         return padding + ((m - this.viewStartMinutes) / this.viewDurationMinutes) * height;
      };
      const yForTime = (timeStr: string): number => yForMinutes(toMinutes(timeStr));

      if (this.singleTrackBg) this.singleTrackBg.clear();
      this.grid.clear();
      this.labels.removeChildren();
      this.lines.clear();
      this.trainLabels.removeChildren();
      if (this.timeHandles) this.timeHandles.removeChildren();

      // time labels every 10 minutes at left and right edges
      {
         const viewStart = this.viewStartMinutes;
         const viewEnd = this.viewStartMinutes + this.viewDurationMinutes;
         const step = 10; // minutes
         let t = Math.floor(viewStart / step) * step;
         while (t <= viewEnd) {
            const y = yForMinutes(t);
            const minutesOnly = Math.floor(t) % 60;
            const label = String(minutesOnly).padStart(2, "0");
            const leftText = new PIXI.Text({
               text: label,
               style: {
                  fontSize: 11,
                  fill: 0x8b93a1,
                  align: "right",
                  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
               },
            });
            leftText.anchor.set(1, 0.5);
            leftText.x = padding - 8;
            leftText.y = y;
            this.labels.addChild(leftText);

            const rightText = new PIXI.Text({
               text: label,
               style: {
                  fontSize: 11,
                  fill: 0x8b93a1,
                  align: "left",
                  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
               },
            });
            rightText.anchor.set(0, 0.5);
            rightText.x = padding + width + 8;
            rightText.y = y;
            this.labels.addChild(rightText);

            t += step;
         }
      }

      // single-track background bands
      if (this.singleTrackBg && this.network && this.stationOrder.length > 1) {
         for (let i = 0; i < this.stationOrder.length - 1; i++) {
            const s1 = this.stationOrder[i];
            const s2 = this.stationOrder[i + 1];
            if (isSingleTrackSection(this.network, s1, s2)) {
               const x1 = xForStation(s1);
               const x2 = xForStation(s2);
               const left = Math.min(x1, x2);
               const w = Math.max(2, Math.abs(x2 - x1));
               this.singleTrackBg
                  .rect(left, padding, w, height)
                  .fill({ color: 0x4c0d0d, alpha: 0.18 });
            }
         }
      }

      // horizontal time grid aligned to time ticks
      {
         const viewStart = this.viewStartMinutes;
         const viewEnd = this.viewStartMinutes + this.viewDurationMinutes;
         const step = 10; // minutes
         let t = Math.floor(viewStart / step) * step;
         while (t <= viewEnd) {
            const y = yForMinutes(t);
            this.grid
               .moveTo(padding, y)
               .lineTo(padding + width, y)
               .stroke({ width: 1, color: 0x2a2f36, alpha: 1, cap: "butt" });
            t += step;
         }
      }
      // vertical station lines + labels
      for (const station of this.stationOrder) {
         const x = xForStation(station);
         this.grid
            .moveTo(x, padding)
            .lineTo(x, padding + height)
            .stroke({ width: 1, color: 0x394049, alpha: 1, cap: "butt" });
         const text = new PIXI.Text({
            text: station,
            style: {
               fontSize: 12,
               fill: 0xb0b8c0,
               align: "center",
               fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
            },
         });
         text.anchor.set(0.5, 1);
         text.x = x;
         text.y = padding - 6;
         this.labels.addChild(text);
      }

      // Draw trains
      for (let idx = 0; idx < this.scenario.trains.length; idx++) {
         const train = this.scenario.trains[idx];
         const color = palette[idx % palette.length];
         const entries = train.timetable;
         if (!entries || entries.length === 0) continue;
         for (let i = 0; i < entries.length - 1; i++) {
            const a = entries[i];
            const b = entries[i + 1];
            const depA = a.departure ? toMinutes(a.departure) : null;
            const arrB = b.arrival ? toMinutes(b.arrival) : null;
            const distMeters = getDistanceMeters(this.network, a.station, b.station);
            const speedKmh = Math.max(1, train.speed || 1);
            const travelMinutes = (distMeters * 60) / (1000 * speedKmh);
            let depMinutes = depA;
            let arrMinutes = arrB;
            if (depMinutes == null && arrMinutes != null) depMinutes = arrMinutes - travelMinutes;
            else if (depMinutes != null && arrMinutes == null) arrMinutes = depMinutes + travelMinutes;
            if (depMinutes != null && arrMinutes != null) {
               const viewStart = this.viewStartMinutes;
               const viewEnd = this.viewStartMinutes + this.viewDurationMinutes;
               if (arrMinutes < viewStart || depMinutes > viewEnd) {
                  // completely outside, skip
               } else {
                  // clip to current view on time axis
                  const x1 = xForStation(a.station);
                  const x2 = xForStation(b.station);
                  const t1 = depMinutes;
                  const t2 = arrMinutes;
                  const tt1 = Math.max(t1, viewStart);
                  const tt2 = Math.min(t2, viewEnd);
                  const denomSeg = t2 - t1 || 1e-6;
                  const f1 = (tt1 - t1) / denomSeg;
                  const f2 = (tt2 - t1) / denomSeg;
                  const dxFull = x2 - x1;
                  const x1c = x1 + dxFull * f1;
                  const x2c = x1 + dxFull * f2;
                  const y1c = yForMinutes(tt1);
                  const y2c = yForMinutes(tt2);
                  this.lines.moveTo(x1c, y1c).lineTo(x2c, y2c);

                  const ddx = x2c - x1c;
                  const ddy = y2c - y1c;
                  const segLen = Math.hypot(ddx, ddy);
                  if (segLen > 4) {
                     const midx = x1c + ddx * 0.5;
                     const midy = y1c + ddy * 0.5;
                     const angle = Math.atan2(ddy, ddx);
                     const nx = -ddy / segLen;
                     const ny = ddx / segLen;
                     const off = 6;
                     const lx = midx + nx * off;
                     const ly = midy + ny * off;
                     const label = new PIXI.Text({
                        text: train.number,
                        style: {
                           fontSize: 11,
                           fill: color,
                           align: "center",
                           fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                        },
                     });
                     label.anchor.set(0.5);
                     let rotation = angle;
                     if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
                     label.rotation = rotation;
                     label.x = lx;
                     label.y = ly;
                     this.trainLabels.addChild(label);
                     label.on("pointertap", () => {
                        this.setSelectedTrain(idx);
                     });
                     // pointer handlers to drag whole train
                     label.eventMode = "static";
                     (label as any).cursor = "grab";
                     label.on("pointerdown", (ev: PIXI.FederatedPointerEvent) => {
                        (label as any).cursor = "grabbing";
                        this.beginTrainDrag(idx, ev.clientY);
                     });
                     label.on("pointerup", () => {
                        (label as any).cursor = "grab";
                        this.endTrainDrag();
                     });
                     label.on("pointerupoutside", () => {
                        (label as any).cursor = "grab";
                        this.endTrainDrag();
                     });
                  }
               }
            }
         }
         // dwell
         for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const x = xForStation(e.station);
            // dwell if both times present
            if (e.arrival && e.departure) {
               const viewStart = this.viewStartMinutes;
               const viewEnd = this.viewStartMinutes + this.viewDurationMinutes;
               let t1 = toMinutes(e.arrival);
               let t2 = toMinutes(e.departure);
               if (!(t2 < viewStart || t1 > viewEnd)) {
                  const tt1 = Math.max(t1, viewStart);
                  const tt2 = Math.min(t2, viewEnd);
                  const yA = yForMinutes(tt1);
                  const yD = yForMinutes(tt2);
                  this.lines.moveTo(x, yA).lineTo(x, yD);
               }
            }
            // handle only for departure (arrival adjustment is not needed)
            this.drawTimeHandle(train, idx, i, "departure", e.departure, x, yForTime);
         }
         this.lines.stroke({ width: 2, color, alpha: 1, cap: "round" });
      }
      // Keep hover overlay in sync with new transforms
      if (this.lastHoverClientY !== null) {
         this.updateHoverFromClientY(this.lastHoverClientY);
      }
   }

   private setupInteractions() {
      const onWheel = (ev: WheelEvent) => {
         ev.preventDefault();
         const rect = this.container.getBoundingClientRect();
         const padding = this.padding;
         const height = this.app.renderer.height - padding * 2;
         const y = ev.clientY - rect.top - padding;
         const norm = Math.max(0, Math.min(1, y / Math.max(1, height)));
         const zoomFactor = ev.deltaY > 0 ? 1.05 : 0.95;
         const newDuration = Math.max(5, Math.min(360, this.viewDurationMinutes * zoomFactor));
         const focusMin = this.viewStartMinutes + norm * this.viewDurationMinutes;
         this.viewStartMinutes = focusMin - norm * newDuration;
         this.viewDurationMinutes = newDuration;
         this.drawScene();
      };
      this.container.addEventListener("wheel", onWheel, { passive: false });

      const onPointerDown = (ev: PointerEvent) => {
         this.isPanning = true;
         this.lastPointerY = ev.clientY;
         const target = ev.target as any;
         const isText = target && target.constructor && target.constructor.name === "Text";
         if (!isText) this.setSelectedTrain(null);
      };
      const onPointerMove = (ev: PointerEvent) => {
         const minutesPerPixel = this.getMinutesPerPixel();
         if (this.isDraggingHandle && this.handleTrainIdx !== null && this.handleEntryIdx !== null && this.handleField) {
            const dy = ev.clientY - this.handleStartPointerY;
            const deltaMinutes = dy * minutesPerPixel; // down -> later
            const newMinutes = Math.max(0, this.handleStartMinutes + deltaMinutes);
            const train = this.scenario!.trains[this.handleTrainIdx];
            const entries = train.timetable as any[];
            // Build snapshot if missing (safety)
            if (!this.handleSnapshot) {
               const arrivals: (number | null)[] = [];
               const departures: (number | null)[] = [];
               for (const e of entries) {
                  arrivals.push(e.arrival ? toMinutes(e.arrival) : null);
                  departures.push(e.departure ? toMinutes(e.departure) : null);
               }
               this.handleSnapshot = { arrivals, departures };
            }
            const snap = this.handleSnapshot!;
            const baseIdx = this.handleEntryIdx;
            const baseMinutes = this.handleStartMinutes;
            const totalDelta = newMinutes - baseMinutes;

            if (this.handleField === "departure") {
               // Update only current departure, then shift all subsequent stops by totalDelta
               const cur = entries[baseIdx];
               cur.departure = minutesToString(newMinutes);
               if (cur.arrival) {
                  const aMin = toMinutes(cur.arrival);
                  if (toMinutes(cur.departure) < aMin) cur.departure = minutesToString(aMin);
               }
               for (let j = baseIdx + 1; j < entries.length; j++) {
                  const e = entries[j];
                  const a0 = snap.arrivals[j];
                  const d0 = snap.departures[j];
                  if (a0 != null) e.arrival = minutesToString(Math.max(0, a0 + totalDelta));
                  if (d0 != null) e.departure = minutesToString(Math.max(0, d0 + totalDelta));
                  if (e.arrival && e.departure) {
                     const aMin = toMinutes(e.arrival);
                     const dMin = toMinutes(e.departure);
                     if (dMin < aMin) e.departure = minutesToString(aMin);
                  }
               }
            } else {
               // Arrival edit: only change arrival at current stop; do not cascade
               const cur = entries[baseIdx];
               cur.arrival = minutesToString(newMinutes);
               if (cur.departure) {
                  const dMin = toMinutes(cur.departure);
                  if (toMinutes(cur.arrival) > dMin) cur.arrival = minutesToString(dMin);
               }
            }
            this.drawScene();
            return;
         }
         if (this.isDraggingTrain && this.draggingTrainIdx !== null && this.dragSnapshot) {
            const dy = ev.clientY - this.dragStartPointerY;
            const deltaMinutes = dy * minutesPerPixel; // dragging down -> later, up -> earlier
            this.applyTrainDragDelta(this.draggingTrainIdx, deltaMinutes);
            this.drawScene();
            return;
         }
         if (!this.isPanning) return;
         const dy = ev.clientY - this.lastPointerY;
         this.lastPointerY = ev.clientY;
         this.viewStartMinutes -= dy * minutesPerPixel; // invert to match natural drag direction
         this.drawScene();
      };
      const onPointerUp = () => {
         this.isPanning = false;
         this.endTrainDrag();
         this.endHandleDrag();
      };
      this.container.addEventListener("pointerdown", onPointerDown);
      this.container.addEventListener("pointermove", (ev: PointerEvent) => {
         this.updateHoverFromClientY(ev.clientY);
      });
      this.container.addEventListener("pointerleave", () => this.hideHover());
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("blur", onPointerUp as any);

      window.addEventListener("resize", () => this.drawScene());
   }

   private updateHoverFromClientY(clientY: number) {
      if (!this.scenario || !this.network || !this.hoverOverlay || !this.hoverLeftLabel || !this.hoverRightLabel) return;
      this.lastHoverClientY = clientY;
      const rect = this.container.getBoundingClientRect();
      const padding = this.padding;
      const width = this.app.renderer.width - padding * 2;
      const height = this.app.renderer.height - padding * 2;
      let y = clientY - rect.top;
      // clamp to content area
      if (y < padding || y > padding + height) {
         this.hideHover();
         return;
      }
      // draw dashed horizontal line across content width
      this.hoverOverlay.clear();
      const xStart = padding;
      const xEnd = padding + width;
      const dash = 6;
      const gap = 4;
      for (let x = xStart; x < xEnd; x += dash + gap) {
         const xx2 = Math.min(x + dash, xEnd);
         this.hoverOverlay.moveTo(x, y).lineTo(xx2, y);
      }
      this.hoverOverlay.stroke({ width: 1, color: 0x8b93a1, alpha: 0.8, cap: "butt" });

      // compute minutes at this y and update labels
      const viewMinutes = this.viewStartMinutes + ((y - padding) / Math.max(1, height)) * this.viewDurationMinutes;
      const totalSeconds = Math.round(viewMinutes * 60);
      const minuteOnly = ((Math.floor(totalSeconds / 60) % 60) + 60) % 60;
      const secondOnly = ((totalSeconds % 60) + 60) % 60;
      const label = `${String(minuteOnly).padStart(2, "0")}:${String(secondOnly).padStart(2, "0")}`;
      this.hoverLeftLabel.text = label;
      this.hoverRightLabel.text = label;
      this.hoverLeftLabel.x = padding - 8;
      this.hoverRightLabel.x = padding + width + 8;
      this.hoverLeftLabel.y = y;
      this.hoverRightLabel.y = y;
      this.hoverOverlay.visible = true;
      this.hoverLeftLabel.visible = true;
      this.hoverRightLabel.visible = true;
   }

   private hideHover() {
      if (this.hoverOverlay) {
         this.hoverOverlay.clear();
         this.hoverOverlay.visible = false;
      }
      if (this.hoverLeftLabel) this.hoverLeftLabel.visible = false;
      if (this.hoverRightLabel) this.hoverRightLabel.visible = false;
   }

   private drawTimeHandle(
      train: any,
      trainIdx: number,
      entryIdx: number,
      field: "arrival" | "departure",
      timeStr: string | undefined,
      x: number,
      yForTime: (t: string) => number
   ) {
      if (!timeStr || !this.timeHandles) return;
      if (field === "arrival") return; // no arrival handles
      const y = yForTime(timeStr);
      const g = new PIXI.Graphics();
      g.circle(x, y, 3).fill({ color: 0xffffff, alpha: 1 }).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
      g.eventMode = "static";
      (g as any).cursor = "ns-resize";
      g.on("pointerdown", (ev: PIXI.FederatedPointerEvent) => {
         this.isDraggingHandle = true;
         this.handleTrainIdx = trainIdx;
         this.handleEntryIdx = entryIdx;
         this.handleField = field;
         this.handleStartPointerY = ev.clientY;
         this.handleStartMinutes = toMinutes(timeStr);
         // snapshot all original times for cascading delta
         const tr = this.scenario!.trains[trainIdx];
         const arrivals: (number | null)[] = [];
         const departures: (number | null)[] = [];
         for (const te of tr.timetable as any[]) {
            arrivals.push(te.arrival ? toMinutes(te.arrival) : null);
            departures.push(te.departure ? toMinutes(te.departure) : null);
         }
         this.handleSnapshot = { arrivals, departures };
      });
      g.on("pointerup", () => this.endHandleDrag());
      g.on("pointerupoutside", () => this.endHandleDrag());
      g.on("pointercancel", () => this.endHandleDrag());
      this.timeHandles.addChild(g);
   }

   private endHandleDrag() {
      this.isDraggingHandle = false;
      this.handleTrainIdx = null;
      this.handleEntryIdx = null;
      this.handleField = null;
      this.handleSnapshot = undefined;
   }

   private beginTrainDrag(trainIdx: number, clientY: number) {
      this.isDraggingTrain = true;
      this.draggingTrainIdx = trainIdx;
      this.dragStartPointerY = clientY;
      const train = this.scenario!.trains[trainIdx];
      const arrivals: (number | null)[] = [];
      const departures: (number | null)[] = [];
      for (const e of train.timetable) {
         arrivals.push(e.arrival ? toMinutes(e.arrival) : null);
         departures.push(e.departure ? toMinutes(e.departure) : null);
      }
      this.dragSnapshot = { arrivals, departures };
   }

   private endTrainDrag() {
      if (!this.isDraggingTrain) return;
      this.isDraggingTrain = false;
      this.draggingTrainIdx = null;
      this.dragSnapshot = undefined;
   }

   private applyTrainDragDelta(trainIdx: number, deltaMinutes: number) {
      if (!this.dragSnapshot) return;
      const train = this.scenario!.trains[trainIdx];
      for (let i = 0; i < train.timetable.length; i++) {
         const e = train.timetable[i] as any;
         const a = this.dragSnapshot.arrivals[i];
         const d = this.dragSnapshot.departures[i];
         if (a != null) e.arrival = minutesToString(Math.max(0, a + deltaMinutes));
         if (d != null) e.departure = minutesToString(Math.max(0, d + deltaMinutes));
         if (e.arrival && e.departure) {
            const aMin = toMinutes(e.arrival);
            const dMin = toMinutes(e.departure);
            if (dMin < aMin) e.departure = minutesToString(aMin);
         }
      }
   }

   private setupScenarioSelector(list: Array<{ id: string }>, selectedId: string) {
      const select = document.getElementById("scenario-select") as HTMLSelectElement | null;
      if (!select) return;
      select.innerHTML = "";
      for (const s of list) {
         const opt = document.createElement("option");
         opt.value = s.id;
         opt.textContent = s.id;
         if (s.id === selectedId) opt.selected = true;
         select.appendChild(opt);
      }
      select.addEventListener("change", async () => {
         const id = select.value;
         this.currentScenarioId = id;
         console.log("[Graph] Switching to scenario:", id);
         const [scenario, network] = await Promise.all([fetchScenario(id), fetchNetwork()]);
         this.clearStage();
         await this.renderScenario(scenario, network);
         const url = new URL(window.location.href);
         url.searchParams.set("scenario", id);
         window.history.replaceState({}, "", url.toString());
      });

      const exportBtn = document.getElementById("export-btn");
      if (exportBtn) {
         exportBtn.addEventListener("click", () => this.exportScenarioJson());
      }

      const addBtn = document.getElementById("add-train-btn");
      if (addBtn) {
         addBtn.addEventListener("click", () => this.openAddTrainModal());
      }

      const copyBtn = document.getElementById("train-copy-btn") as HTMLButtonElement | null;
      const deleteBtn = document.getElementById("train-delete-btn") as HTMLButtonElement | null;
      const editBtn = document.getElementById("train-edit-btn") as HTMLButtonElement | null;
      const recalculateBtn = document.getElementById("train-recalculate-btn") as HTMLButtonElement | null;
      if (copyBtn) copyBtn.addEventListener("click", () => this.copySelectedTrain());
      if (deleteBtn) deleteBtn.addEventListener("click", () => this.deleteSelectedTrain());
      if (editBtn) editBtn.addEventListener("click", () => this.editSelectedTrain());
      if (recalculateBtn) recalculateBtn.addEventListener("click", () => this.recalculateTrain());
   }

   private clearStage() {
      this.app.stage.removeChildren();
   }

   private getMinutesPerPixel(): number {
      const padding = this.padding;
      const height = this.app.renderer.height - padding * 2;
      return this.viewDurationMinutes / Math.max(1, height);
   }

   private setSelectedTrain(idx: number | null) {
      this.selectedTrainIdx = idx;
      const copyBtn = document.getElementById("train-copy-btn") as HTMLButtonElement | null;
      const deleteBtn = document.getElementById("train-delete-btn") as HTMLButtonElement | null;
      const editBtn = document.getElementById("train-edit-btn") as HTMLButtonElement | null;
      const recalculateBtn = document.getElementById("train-recalculate-btn") as HTMLButtonElement | null;
      const enabled = idx !== null;
      if (copyBtn) copyBtn.disabled = !enabled;
      if (deleteBtn) deleteBtn.disabled = !enabled;
      if (editBtn) editBtn.disabled = !enabled;
      if (recalculateBtn) recalculateBtn.disabled = !enabled;
   }

   private copySelectedTrain() {
      if (this.selectedTrainIdx === null || !this.scenario) return;
      const src = this.scenario.trains[this.selectedTrainIdx];
      const clone = JSON.parse(JSON.stringify(src));
      clone.number = `${src.number}-copy`;
      // offset all times by +5 minutes
      for (const e of clone.timetable) {
         if (e.arrival) e.arrival = minutesToString(toMinutes(e.arrival) + 5);
         if (e.departure) e.departure = minutesToString(toMinutes(e.departure) + 5);
      }
      this.scenario.trains.push(clone);
      this.drawScene();
   }

   private deleteSelectedTrain() {
      if (this.selectedTrainIdx === null || !this.scenario) return;
      this.scenario.trains.splice(this.selectedTrainIdx, 1);
      this.setSelectedTrain(null);
      this.drawScene();
   }

   private editSelectedTrain() {
      if (this.selectedTrainIdx === null || !this.scenario) return;
      const train = this.scenario.trains[this.selectedTrainIdx];
      // open modal pre-filled
      const numEl = document.getElementById("train-number") as HTMLInputElement | null;
      const speedEl = document.getElementById("train-speed") as HTMLInputElement | null;
      const carsEl = document.getElementById("train-cars") as HTMLInputElement | null;
      const startSel = document.getElementById("train-start") as HTMLSelectElement | null;
      const endSel = document.getElementById("train-end") as HTMLSelectElement | null;
      if (!numEl || !speedEl || !carsEl || !startSel || !endSel) {
         this.openAddTrainModal();
         return;
      }
      // populate start/end options
      startSel.innerHTML = "";
      endSel.innerHTML = "";
      for (const s of this.stationOrder) {
         const o1 = document.createElement("option");
         o1.value = s;
         o1.textContent = s;
         startSel.appendChild(o1);
         const o2 = document.createElement("option");
         o2.value = s;
         o2.textContent = s;
         endSel.appendChild(o2);
      }
      // set values
      numEl.value = train.number;
      speedEl.value = String(train.speed);
      carsEl.value = String(train.cars);
      startSel.value = train.timetable?.[0]?.station || this.stationOrder[0];
      endSel.value = train.timetable?.[train.timetable.length - 1]?.station || this.stationOrder[this.stationOrder.length - 1];

      const modalEl = document.getElementById("add-train-modal") as any;
      const Modal = (window as any).bootstrap?.Modal;
      const modal = Modal ? new Modal(modalEl) : null;
      // configure for edit mode (hide start/end; only basic fields editable)
      const title = document.getElementById("addTrainModalLabel");
      if (title) title.textContent = "Edit Train";
      const startEndRow = document.getElementById("train-start-end-row");
      if (startEndRow) startEndRow.classList.add("d-none");
      // ensure selects are not required in edit mode
      startSel.required = false;
      endSel.required = false;
      const submitBtn = document.getElementById("train-submit-btn");
      if (submitBtn) submitBtn.textContent = "Save";
      modal?.show();

      const form = document.getElementById("add-train-form") as HTMLFormElement | null;
      if (!form) return;
      const onSubmit = (ev: Event) => {
         ev.preventDefault();
         // edit mode: update only number, speed, cars
         this.applyEditToTrain(this.selectedTrainIdx!);
         modal?.hide();
         form.removeEventListener("submit", onSubmit);
      };
      form.addEventListener("submit", onSubmit);
   }

   private applyEditToTrain(idx: number) {
      if (!this.scenario || !this.network) return;
      const train = this.scenario.trains[idx];
      const num = (document.getElementById("train-number") as HTMLInputElement)?.value?.trim() || train.number;
      const speed =
         parseInt((document.getElementById("train-speed") as HTMLInputElement)?.value || String(train.speed), 10) || train.speed;
      const cars =
         parseInt((document.getElementById("train-cars") as HTMLInputElement)?.value || String(train.cars), 10) || train.cars;

      // update simple fields
      train.number = num;
      train.speed = speed;
      train.cars = cars;

      this.drawScene();
   }

   private exportScenarioJson() {
      if (!this.scenario) return;
      // Build the SzenarioDTO shape as the server expects (title, start_time, trains with timetable)
      const exported = {
         title: this.scenario.title,
         start_time: this.scenario.start_time,
         trains: this.scenario.trains.map((t) => ({
            number: t.number,
            type: t.type,
            speed: t.speed,
            cars: t.cars,
            timetable: t.timetable.map((e) => {
               const entry: any = { station: e.station };
               if (e.arrival && e.arrival.trim().length > 0) entry.arrival = e.arrival;
               if (e.departure && e.departure.trim().length > 0) entry.departure = e.departure;
               return entry;
            }),
         })),
      };
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${this.currentScenarioId}-edited.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   }

   private openAddTrainModal() {
      const startSel = document.getElementById("train-start") as HTMLSelectElement | null;
      const endSel = document.getElementById("train-end") as HTMLSelectElement | null;
      const numEl = document.getElementById("train-number") as HTMLInputElement | null;
      const speedEl = document.getElementById("train-speed") as HTMLInputElement | null;
      const carsEl = document.getElementById("train-cars") as HTMLInputElement | null;
      if (!this.stationOrder.length || !startSel || !endSel || !numEl || !speedEl || !carsEl) return;
      numEl.value = "";
      speedEl.value = "120";
      carsEl.value = "6";
      startSel.innerHTML = "";
      endSel.innerHTML = "";
      for (const s of this.stationOrder) {
         const opt1 = document.createElement("option");
         opt1.value = s;
         opt1.textContent = s;
         startSel.appendChild(opt1);
         const opt2 = document.createElement("option");
         opt2.value = s;
         opt2.textContent = s;
         endSel.appendChild(opt2);
      }
      startSel.selectedIndex = 0;
      endSel.selectedIndex = this.stationOrder.length - 1;

      const modalEl = document.getElementById("add-train-modal") as any;
      if (!modalEl) return;
      // Bootstrap modal
      const Modal = (window as any).bootstrap?.Modal;
      const modal = Modal ? new Modal(modalEl) : null;
      // configure for create mode (show start/end)
      const title = document.getElementById("addTrainModalLabel");
      if (title) title.textContent = "Add Train";
      const startEndRow = document.getElementById("train-start-end-row");
      if (startEndRow) startEndRow.classList.remove("d-none");
      // ensure selects are required in create mode
      startSel.required = true;
      endSel.required = true;
      const submitBtn = document.getElementById("train-submit-btn");
      if (submitBtn) submitBtn.textContent = "Create";
      modal?.show();

      const form = document.getElementById("add-train-form") as HTMLFormElement | null;
      if (!form) return;
      const onSubmit = (ev: Event) => {
         ev.preventDefault();
         this.createTrainFromForm();
         modal?.hide();
         form.removeEventListener("submit", onSubmit);
      };
      form.addEventListener("submit", onSubmit);
   }

   private buildTimetable(
      startIndex: number,
      endIndex: number,
      speed: number,
      startTimeMinutes: number
   ): Array<{ station: string; arrival?: string; departure?: string }> {
      if (!this.network) return [];

      const path: string[] = [];
      for (let i = startIndex; i !== endIndex + (startIndex < endIndex ? 1 : -1); i += startIndex < endIndex ? 1 : -1) {
         path.push(this.stationOrder[i]);
      }

      let cur = startTimeMinutes;
      const timetable: Array<{ station: string; arrival?: string; departure?: string }> = [];

      for (let i = 0; i < path.length; i++) {
         const st = path[i];
         if (i === 0) {
            timetable.push({ station: st, departure: minutesToString(cur) });
         } else {
            const prev = path[i - 1];
            const dist = getDistanceMeters(this.network, prev, st);
            const travel = (dist * 60) / (1000 * Math.max(1, speed));
            cur += travel;
            const arr = cur;
            const dep = arr + 1; // 1-minute dwell
            timetable.push({
               station: st,
               arrival: minutesToString(arr),
               departure: i === path.length - 1 ? undefined : minutesToString(dep),
            });
            if (i !== path.length - 1) cur = dep;
         }
      }

      return timetable;
   }

   private createTrainFromForm() {
      if (!this.scenario || !this.network) return;
      const num = (document.getElementById("train-number") as HTMLInputElement)?.value?.trim() || "NEW";
      const speed = parseInt((document.getElementById("train-speed") as HTMLInputElement)?.value || "120", 10) || 120;
      const cars = parseInt((document.getElementById("train-cars") as HTMLInputElement)?.value || "6", 10) || 6;
      const start = (document.getElementById("train-start") as HTMLSelectElement)?.value;
      const end = (document.getElementById("train-end") as HTMLSelectElement)?.value;
      if (!start || !end) return;

      // Determine path along stationOrder from start to end
      const startIdx = this.stationOrder.indexOf(start);
      const endIdx = this.stationOrder.indexOf(end);
      if (startIdx < 0 || endIdx < 0 || startIdx === endIdx) return;
      const step = startIdx < endIdx ? 1 : -1;

      // Build timetable using scenario start time as initial departure, 1 min dwell, travel by network distance and speed
      const t0 = toMinutes(this.scenario.start_time);
      const timetable = this.buildTimetable(startIdx, endIdx, speed, t0);

      const train = {
         number: num,
         type: "Passenger",
         speed,
         cars,
         timetable: timetable as any,
      };
      this.scenario.trains.push(train as any);
      this.drawScene();
   }

   private recalculateTrain() {
      if (this.selectedTrainIdx === null || !this.scenario || !this.network) return;

      const train = this.scenario.trains[this.selectedTrainIdx];

      // Get the first departure time as the starting point
      const firstEntry = train.timetable[0];
      if (!firstEntry) return;

      const startIdx = this.stationOrder.indexOf(firstEntry.station);
      const endIdx = this.stationOrder.indexOf(train.timetable[train.timetable.length - 1].station);
      if (startIdx < 0 || endIdx < 0 || startIdx === endIdx) return;

      let t0 = 0;
      if (firstEntry.departure) t0 = toMinutes(firstEntry.departure);
      else {
         const secondEntry = train.timetable[1];
         if (!secondEntry) return;
         const dist = getDistanceMeters(this.network, firstEntry.station, secondEntry.station);
         const travel = (dist * 60) / (1000 * Math.max(1, train.speed));
         t0 = toMinutes(secondEntry.arrival) - travel;
      }
      const timetable = this.buildTimetable(startIdx, endIdx, train.speed, t0);

      // Update the train's timetable
      train.timetable = timetable as any;

      // Redraw the scene to show the updated times
      this.drawScene();
   }
}

const palette = [
   0x3b82f6, // blue
   0x22c55e, // green
   0xef4444, // red
   0xf59e0b, // amber
   0xa855f7, // purple
];

function toMinutes(time: string): number {
   // supports HH:mm[:ss] or ISO time -> minutes with fractional seconds
   const d = new Date(time);
   if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
   }
   const parts = time.split(":");
   const h = parseInt(parts[0] || "0", 10);
   const m = parseInt(parts[1] || "0", 10);
   const s = parseInt(parts[2] || "0", 10);
   return h * 60 + m + s / 60;
}

function minutesToString(mins: number): string {
   const totalSeconds = Math.max(0, Math.round(mins * 60));
   const h = Math.floor(totalSeconds / 3600);
   const m = Math.floor((totalSeconds % 3600) / 60);
   const s = totalSeconds % 60;
   return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function findConnection(network: NetworkDto, a: string, b: string) {
   return network.connections.find((c) => c.from === a && c.to === b);
}

function getDistanceMeters(network: NetworkDto, a: string, b: string): number {
   const conn = findConnection(network, a, b) || findConnection(network, b, a);
   return conn ? conn.distance : 0;
}

function deriveOrderedStations(network: NetworkDto): string[] {
   // Build adjacency and in-degree counts to find a path-like order across the network.
   const adj = new Map<string, string[]>();
   const indeg = new Map<string, number>();
   const stations = new Set<string>();
   for (const c of network.connections) {
      stations.add(c.from);
      stations.add(c.to);
      if (!adj.has(c.from)) adj.set(c.from, []);
      adj.get(c.from)!.push(c.to);
      indeg.set(c.to, (indeg.get(c.to) || 0) + 1);
      if (!indeg.has(c.from)) indeg.set(c.from, indeg.get(c.from) || 0);
   }

   if (stations.size === 0) return [];

   // Prefer endpoints with indegree 0 as start; else pick an arbitrary station
   let start: string | null = null;
   for (const s of Array.from(stations)) {
      if ((indeg.get(s) || 0) === 0) {
         start = s;
         break;
      }
   }
   if (!start) start = Array.from(stations)[0] ?? null;
   if (!start) return [];

   // Walk forward greedily following single outgoing edges to construct an ordered chain
   const order: string[] = [];
   const visited = new Set<string>();
   let current: string | null = start;
   while (current && !visited.has(current)) {
      order.push(current);
      visited.add(current);
      const outs: string[] = adj.get(current) || [];
      if (outs.length >= 1) {
         current = outs[0];
      } else {
         current = null;
      }
   }

   // Ensure any remaining stations are appended (in case of branches)
   for (const s of Array.from(stations)) {
      if (!visited.has(s)) order.push(s);
   }
   return order;
}

function isSingleTrackSection(network: NetworkDto, a: string, b: string): boolean {
   const pairCount = network.connections.filter(
      (c) => (c.from === a && c.to === b) || (c.from === b && c.to === a)
   ).length;
   if (pairCount === 1) return true;
   // fallback to mode flag if provided by server
   return network.connections.some(
      (c) => ((c.from === a && c.to === b) || (c.from === b && c.to === a)) && (c as any).mode === "SingleTrack"
   );
}
