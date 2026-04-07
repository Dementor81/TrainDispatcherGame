import * as PIXI from "pixi.js";
import { fetchScenarios, fetchScenario, fetchNetwork, saveScenario } from "../network/api";
import type { ScenarioDto, NetworkDto } from "../network/dto";
import { toMinutes, minutesToString } from "./utils/timeUtils";
import { precomputeExitSpans, getDistanceMeters, isSingleTrackSection, deriveOrderedStations } from "./utils/railNetworkUtils";
import { getCategoryColor } from "./utils/constants";
import { TrainEditorPanel } from "./trainEditorPanel";
import { detectCollisions } from "./utils/collisionDetection";

type DirectionFilter = 'both' | 'leftToRight' | 'rightToLeft';
type TimetableSnapshot = { arrivals: (number | null)[]; departures: (number | null)[] };
type ViewMetrics = {
   padding: number;
   width: number;
   height: number;
   viewStart: number;
   viewEnd: number;
   xForStation: (station: string) => number;
   yForMinutes: (minutes: number) => number;
   yForTime: (time: string) => number;
};

export default class SzenariosApplication {
   private readonly container: HTMLElement;
   private readonly fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
   private readonly trainEditorPanel = new TrainEditorPanel();
   private app!: PIXI.Application;
   private currentScenarioId: string = "timetable";
   private currentLayoutId: string = "";
   private isDraggingTrain: boolean = false;
   private draggingTrainIdx: number | null = null;
   private dragStartPointerY: number = 0;
   private dragSnapshot?: TimetableSnapshot;
   private isDraggingHandle: boolean = false;
   private handleTrainIdx: number | null = null;
   private handleEntryIdx: number | null = null;
   private handleStartPointerY: number = 0;
   private handleStartMinutes: number = 0;
   private handleSnapshot?: TimetableSnapshot;
   private scenario?: ScenarioDto;
   private network?: NetworkDto;
   private stationOrder: string[] = [];
   private stationIndex: Map<string, number> = new Map();
   private availableRoutes: string[][] = [];
   private selectedRoute: string[] | null = null;
   private singleTrackBg?: PIXI.Graphics;
   private conflictBg?: PIXI.Graphics;
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
   private lastTrainLabelTap?: { trainIdx: number; atMs: number };
   private directionFilter: DirectionFilter = 'both';
   private interactionsBound: boolean = false;

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
      let list: Array<{ id: string }> = [];
      try {
         list = await fetchScenarios();
      } catch {}
      this.currentScenarioId = this.resolveInitialScenarioId(list);
      const { scenario, network } = await this.loadScenarioBundle(this.currentScenarioId);
      await this.renderScenario(scenario, network);
      this.setupScenarioSelector(list, this.currentScenarioId);
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

   /**
    * Find all valid routes through the network using DFS.
    * Rules:
    * 1. Each station can only be visited once per route
    * 2. Exit IDs must maintain parity (all odd or all even) to prevent direction changes
    */
   private findAllRoutes(network: NetworkDto): string[][] {
      const routes: string[][] = [];
      if (!network.connections || network.connections.length === 0) {
         return routes;
      }

      // Build adjacency map: station -> array of {to, fromExitId, toExitId}
      const adjacency = new Map<string, Array<{to: string; fromExitId: number; toExitId: number}>>();
      for (const conn of network.connections) {
         if (!adjacency.has(conn.from)) {
            adjacency.set(conn.from, []);
         }
         adjacency.get(conn.from)!.push({
            to: conn.to,
            fromExitId: conn.fromId,
            toExitId: conn.toId
         });
      }

      // Helper to check if exit ID is odd or even
      const isOdd = (exitId: number): boolean => {
         return exitId % 2 === 1;
      };

      // DFS to explore routes
      const dfs = (
         currentStation: string,
         visited: Set<string>,
         path: string[],
         expectedParity: boolean | null // null = not set yet, true = odd, false = even
      ) => {
         // Add current station to path
         path.push(currentStation);
         visited.add(currentStation);

         // Check if we can extend this route
         let hasExtension = false;
         const neighbors = adjacency.get(currentStation) || [];
         
         for (const neighbor of neighbors) {
            // Skip if already visited
            if (visited.has(neighbor.to)) {
               continue;
            }

            // Check parity rule: fromExitId must match expected parity
            const exitIsOdd = isOdd(neighbor.fromExitId);
            
            // First connection sets the parity
            if (expectedParity === null) {
               dfs(neighbor.to, new Set(visited), [...path], exitIsOdd);
               hasExtension = true;
            } else if (exitIsOdd === expectedParity) {
               // Parity matches, continue on this route
               dfs(neighbor.to, new Set(visited), [...path], expectedParity);
               hasExtension = true;
            }
            // If parity doesn't match, skip this connection
         }

         // If this is a valid endpoint (at least 2 stations and no valid extensions), save the route
         if (path.length >= 2) {
            routes.push([...path]);
         }
      };

      // Try starting from each station
      const allStations = new Set<string>();
      for (const conn of network.connections) {
         allStations.add(conn.from);
         allStations.add(conn.to);
      }

      for (const startStation of allStations) {
         dfs(startStation, new Set(), [], null);
      }

      // Filter out routes that are completely contained within other routes
      return this.filterOverlappingRoutes(routes);
   }

   /**
    * Remove routes that are completely contained as subsequences within other routes.
    * For example, if Route A is [S1, S2, S3, S4] and Route B is [S2, S3], 
    * Route B will be removed as it's completely contained in Route A.
    */
   private filterOverlappingRoutes(routes: string[][]): string[][] {
      const filtered: string[][] = [];

      for (let i = 0; i < routes.length; i++) {
         const routeA = routes[i];
         let isContained = false;

         // Check if routeA is a consecutive subsequence of any other route
         for (let j = 0; j < routes.length; j++) {
            if (i === j) continue;
            const routeB = routes[j];

            // Only check if routeB is longer than routeA
            if (routeB.length > routeA.length) {
               if (this.isConsecutiveSubsequence(routeA, routeB)) {
                  isContained = true;
                  break;
               }
            }
         }

         if (!isContained) {
            filtered.push(routeA);
         }
      }

      return filtered;
   }

   /**
    * Check if needle is a consecutive subsequence of haystack.
    * Example: [2,3] is a consecutive subsequence of [1,2,3,4] but not of [1,2,4,3]
    */
   private isConsecutiveSubsequence(needle: string[], haystack: string[]): boolean {
      if (needle.length > haystack.length) return false;
      if (needle.length === 0) return true;

      // Try to find needle starting at each position in haystack
      for (let i = 0; i <= haystack.length - needle.length; i++) {
         let match = true;
         for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) {
               match = false;
               break;
            }
         }
         if (match) return true;
      }

      return false;
   }

   private async renderScenario(scenario: ScenarioDto, network: NetworkDto): Promise<void> {
      this.scenario = scenario;
      this.network = network;
      this.viewStartMinutes = toMinutes(scenario.start_time);
      this.viewDurationMinutes = 60;
      this.availableRoutes = this.findAllRoutes(network);
      if (!this.selectedRoute && this.availableRoutes.length > 0) {
         this.selectedRoute = this.availableRoutes[0];
      }
      this.updateStationOrder(scenario, network);
      this.createSceneLayers();
      await precomputeExitSpans(network);
      this.setupRouteSelector();
      this.updateDirectionFilterButton();
      this.drawScene();
      this.setupInteractions();
   }

   private updateStationOrder(scenario: ScenarioDto, network: NetworkDto) {
      const derived = this.selectedRoute?.length ? this.selectedRoute : deriveOrderedStations(network);
      this.stationOrder = derived.length
         ? derived
         : network.stations?.length
            ? [...network.stations]
            : Array.from(new Set(scenario.trains.flatMap((train) => (train.timetable || []).map((entry) => entry.station))));
      this.stationIndex = new Map(this.stationOrder.map((station, index) => [station, index] as [string, number]));
   }

   private createSceneLayers() {
      this.singleTrackBg = new PIXI.Graphics();
      this.conflictBg = new PIXI.Graphics();
      this.grid = new PIXI.Graphics();
      this.lines = new PIXI.Graphics();
      this.labels = new PIXI.Container();
      this.trainLabels = new PIXI.Container();
      this.timeHandles = new PIXI.Container();
      this.hoverOverlay = new PIXI.Graphics();
      this.hoverLeftLabel = this.createText("", 11, 0x8b93a1, "right");
      this.hoverRightLabel = this.createText("", 11, 0x8b93a1, "left");
      this.hoverLeftLabel.anchor.set(1, 0.5);
      this.hoverRightLabel.anchor.set(0, 0.5);
      this.app.stage.addChild(
         this.singleTrackBg,
         this.conflictBg,
         this.grid,
         this.lines,
         this.labels,
         this.trainLabels,
         this.timeHandles,
         this.hoverOverlay,
         this.hoverLeftLabel,
         this.hoverRightLabel
      );
      this.hideHover();
   }

   private setupRouteSelector() {
      const select = document.getElementById("route-select") as HTMLSelectElement | null;
      if (!select) return;
      select.innerHTML = '';
      this.availableRoutes.forEach((route, idx) => {
         const opt = document.createElement("option");
         opt.value = String(idx);
         opt.textContent = route.join(' → ');
         select.appendChild(opt);
      });
      const selectedIdx = this.selectedRoute
         ? Math.max(0, this.availableRoutes.findIndex((route) => this.routesMatch(route, this.selectedRoute!)))
         : 0;
      if (this.availableRoutes.length > 0) {
         select.value = String(selectedIdx);
         this.selectedRoute = this.availableRoutes[selectedIdx];
      }
      select.onchange = () => {
         const idx = parseInt(select.value, 10);
         if (idx >= 0 && idx < this.availableRoutes.length) {
            this.selectedRoute = this.availableRoutes[idx];
            this.updateStationOrder(this.scenario!, this.network!);
            this.drawScene();
         }
      };
   }

   private routesMatch(a: string[], b: string[]) {
      return a.length === b.length && a.every((station, index) => station === b[index]);
   }

   private get viewEndMinutes(): number {
      return this.viewStartMinutes + this.viewDurationMinutes;
   }

   private getViewMetrics(): ViewMetrics {
      const padding = this.padding;
      const width = this.app.renderer.width - padding * 2;
      const height = this.app.renderer.height - padding * 2;
      const denom = Math.max(1, this.stationOrder.length - 1);
      return {
         padding,
         width,
         height,
         viewStart: this.viewStartMinutes,
         viewEnd: this.viewEndMinutes,
         xForStation: (station: string) => padding + ((this.stationIndex.get(station) ?? 0) / denom) * width,
         yForMinutes: (minutes: number) => padding + ((minutes - this.viewStartMinutes) / this.viewDurationMinutes) * height,
         yForTime: (time: string) => padding + ((toMinutes(time) - this.viewStartMinutes) / this.viewDurationMinutes) * height,
      };
   }

   private createText(text: string, fontSize: number, fill: number, align: "left" | "right" | "center" = "left") {
      return new PIXI.Text({
         text,
         style: { fontSize, fill, align, fontFamily: this.fontFamily },
      });
   }

   private resetSceneLayers() {
      this.singleTrackBg?.clear();
      this.conflictBg?.clear();
      this.grid?.clear();
      this.lines?.clear();
      this.labels?.removeChildren();
      this.trainLabels?.removeChildren();
      this.timeHandles?.removeChildren();
   }

   private forEachTimeTick(metrics: ViewMetrics, step: number, cb: (minutes: number) => void) {
      for (let tick = Math.floor(metrics.viewStart / step) * step; tick <= metrics.viewEnd; tick += step) cb(tick);
   }

   private clipToView(start: number, end: number) {
      if (end < this.viewStartMinutes || start > this.viewEndMinutes) return null;
      return {
         start: Math.max(start, this.viewStartMinutes),
         end: Math.min(end, this.viewEndMinutes),
      };
   }

   private getTravelMinutes(fromStation: string, toStation: string, speed: number) {
      return (getDistanceMeters(this.network!, fromStation, toStation) * 60) / (1000 * Math.max(1, speed || 1));
   }

   private buildTimetableSnapshot(entries: Array<{ arrival?: string; departure?: string }>): TimetableSnapshot {
      return {
         arrivals: entries.map((entry) => entry.arrival ? toMinutes(entry.arrival) : null),
         departures: entries.map((entry) => entry.departure ? toMinutes(entry.departure) : null),
      };
   }

   private normalizeTimetableEntry(entry: { arrival?: string; departure?: string }) {
      if (!entry.arrival || !entry.departure) return;
      const arrival = toMinutes(entry.arrival);
      const departure = toMinutes(entry.departure);
      if (departure < arrival) entry.departure = minutesToString(arrival);
   }

   private applySnapshotDelta(entries: Array<{ arrival?: string; departure?: string }>, snapshot: TimetableSnapshot, deltaMinutes: number, startIndex: number = 0) {
      for (let i = startIndex; i < entries.length; i++) {
         const entry = entries[i];
         if (snapshot.arrivals[i] != null) entry.arrival = minutesToString(Math.max(0, snapshot.arrivals[i]! + deltaMinutes));
         if (snapshot.departures[i] != null) entry.departure = minutesToString(Math.max(0, snapshot.departures[i]! + deltaMinutes));
         this.normalizeTimetableEntry(entry);
      }
   }

   private drawScene() {
      if (!this.scenario || !this.network || !this.grid || !this.lines || !this.labels || !this.trainLabels) return;
      const metrics = this.getViewMetrics();
      this.resetSceneLayers();
      this.drawTimeAxis(metrics);
      this.drawTrackOverlays(metrics);
      this.drawStations(metrics);
      this.scenario.trains.forEach((train, idx) => this.drawTrain(train, idx, metrics));
      if (this.lastHoverClientY !== null) this.updateHoverFromClientY(this.lastHoverClientY);
   }

   private drawTimeAxis(metrics: ViewMetrics) {
      this.forEachTimeTick(metrics, 10, (minutes) => {
         const y = metrics.yForMinutes(minutes);
         const label = String(Math.floor(minutes) % 60).padStart(2, "0");
         const left = this.createText(label, 11, 0x8b93a1, "right");
         const right = this.createText(label, 11, 0x8b93a1, "left");
         left.anchor.set(1, 0.5);
         right.anchor.set(0, 0.5);
         left.position.set(metrics.padding - 8, y);
         right.position.set(metrics.padding + metrics.width + 8, y);
         this.labels!.addChild(left, right);
         this.grid!
            .moveTo(metrics.padding, y)
            .lineTo(metrics.padding + metrics.width, y)
            .stroke({ width: 1, color: 0x2a2f36, alpha: 1, cap: "butt" });
      });
   }

   private drawTrackOverlays(metrics: ViewMetrics) {
      if (this.singleTrackBg && this.network && this.stationOrder.length > 1) {
         for (let i = 0; i < this.stationOrder.length - 1; i++) {
            const [from, to] = [this.stationOrder[i], this.stationOrder[i + 1]];
            if (!isSingleTrackSection(this.network, from, to)) continue;
            const x1 = metrics.xForStation(from);
            const x2 = metrics.xForStation(to);
            this.singleTrackBg.rect(Math.min(x1, x2), metrics.padding, Math.max(2, Math.abs(x2 - x1)), metrics.height)
               .fill({ color: 0x4c0d0d, alpha: 0.18 });
         }
      }
      if (!this.conflictBg || !this.scenario || !this.network) return;
      for (const conflict of detectCollisions(this.scenario.trains, this.network)) {
         if (!this.stationIndex.has(conflict.fromStation) || !this.stationIndex.has(conflict.toStation)) continue;
         const clipped = this.clipToView(conflict.startTimeMinutes, conflict.endTimeMinutes);
         if (!clipped) continue;
         this.conflictBg
            .poly([
               metrics.xForStation(conflict.fromStation), metrics.yForMinutes(clipped.start),
               metrics.xForStation(conflict.toStation), metrics.yForMinutes(clipped.start),
               metrics.xForStation(conflict.toStation), metrics.yForMinutes(clipped.end),
               metrics.xForStation(conflict.fromStation), metrics.yForMinutes(clipped.end),
            ])
            .fill({ color: 0xff0000, alpha: 0.35 });
      }
   }

   private drawStations(metrics: ViewMetrics) {
      for (const station of this.stationOrder) {
         const x = metrics.xForStation(station);
         this.grid!
            .moveTo(x, metrics.padding)
            .lineTo(x, metrics.padding + metrics.height)
            .stroke({ width: 1, color: 0x394049, alpha: 1, cap: "butt" });
         const label = this.createText(station, 12, 0xb0b8c0, "center");
         label.anchor.set(0.5, 1);
         label.position.set(x, metrics.padding - 6);
         this.labels!.addChild(label);
      }
   }

   private drawTrain(train: any, idx: number, metrics: ViewMetrics) {
      if (!this.shouldShowTrain(train) || !train.timetable?.length) return;
      const color = getCategoryColor(train.category, train.type);
      const lineWidth = idx === this.selectedTrainIdx ? 4 : 2;
      const entries = train.timetable;

      for (let i = 0; i < entries.length - 1; i++) {
         const a = entries[i];
         const b = entries[i + 1];
         if (!this.stationIndex.has(a.station) || !this.stationIndex.has(b.station)) continue;
         const travelMinutes = this.getTravelMinutes(a.station, b.station, train.speedMax);
         let depMinutes = a.departure ? toMinutes(a.departure) : null;
         let arrMinutes = b.arrival ? toMinutes(b.arrival) : null;
         if (depMinutes == null && arrMinutes != null) depMinutes = arrMinutes - travelMinutes;
         else if (depMinutes != null && arrMinutes == null) arrMinutes = depMinutes + travelMinutes;
         if (depMinutes == null || arrMinutes == null) continue;

         const clipped = this.clipToView(depMinutes, arrMinutes);
         if (!clipped) continue;
         const x1 = metrics.xForStation(a.station);
         const x2 = metrics.xForStation(b.station);
         const span = arrMinutes - depMinutes || 1e-6;
         const x1c = x1 + (x2 - x1) * ((clipped.start - depMinutes) / span);
         const x2c = x1 + (x2 - x1) * ((clipped.end - depMinutes) / span);
         const y1c = metrics.yForMinutes(clipped.start);
         const y2c = metrics.yForMinutes(clipped.end);
         this.lines!.moveTo(x1c, y1c).lineTo(x2c, y2c);
         this.drawTrainLabel(train, idx, i, color, x1c, y1c, x2c, y2c);
      }

      for (let i = 0; i < entries.length; i++) {
         const entry = entries[i];
         if (!this.stationIndex.has(entry.station)) continue;
         const x = metrics.xForStation(entry.station);
         if (entry.arrival && entry.departure) {
            const clipped = this.clipToView(toMinutes(entry.arrival), toMinutes(entry.departure));
            if (clipped) this.lines!.moveTo(x, metrics.yForMinutes(clipped.start)).lineTo(x, metrics.yForMinutes(clipped.end));
         }
         this.drawTimeHandle(idx, i, entry.departure, x, metrics.yForTime);
      }

      this.lines!.stroke({ width: lineWidth, color, alpha: 1, cap: "round" });
   }

   private drawTrainLabel(train: any, trainIdx: number, segmentIdx: number, color: number, x1: number, y1: number, x2: number, y2: number) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length <= 4) return;
      const midx = x1 + dx * 0.5;
      const midy = y1 + dy * 0.5;
      const angle = Math.atan2(dy, dx);
      const sign = (trainIdx + segmentIdx) % 2 === 0 ? 1 : -1;
      const label = this.createText(train.category ? `${train.category} ${train.number}` : train.number, 11, color, "center");
      label.anchor.set(0.5);
      label.rotation = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
      label.position.set(
         midx + (-dy / length) * 6 + (dx / length) * 50 * sign,
         midy + (dx / length) * 6 + (dy / length) * 50 * sign
      );
      this.bindTrainLabelInteractions(label, trainIdx);
      this.trainLabels!.addChild(label);
   }

   private bindTrainLabelInteractions(label: PIXI.Text, trainIdx: number) {
      label.eventMode = "static";
      (label as any).cursor = "grab";
      label.on("pointertap", (ev: PIXI.FederatedPointerEvent) => {
         this.setSelectedTrain(trainIdx);
         const detail = (ev as any)?.detail;
         if ((typeof detail === "number" && detail >= 2) || this.isTrainLabelDoubleTap(trainIdx)) this.editSelectedTrain();
      });
      label.on("pointerdown", (ev: PIXI.FederatedPointerEvent) => {
         (label as any).cursor = "grabbing";
         this.beginTrainDrag(trainIdx, ev.clientY);
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

   private isTrainLabelDoubleTap(trainIdx: number) {
      const now = performance?.now?.() ?? Date.now();
      const lastTap = this.lastTrainLabelTap;
      this.lastTrainLabelTap = { trainIdx, atMs: now };
      return !!lastTap && lastTap.trainIdx === trainIdx && now - lastTap.atMs < 1500;
   }

   private setupInteractions() {
      if (this.interactionsBound) return;
      this.interactionsBound = true;
      const onPointerUp = () => {
         this.isPanning = false;
         this.endTrainDrag();
         this.endHandleDrag();
      };
      this.container.addEventListener("wheel", (ev) => this.handleWheel(ev), { passive: false });
      this.container.addEventListener("pointerdown", (ev) => this.handleCanvasPointerDown(ev));
      this.container.addEventListener("pointermove", (ev) => this.updateHoverFromClientY(ev.clientY));
      this.container.addEventListener("pointerleave", () => this.hideHover());
      window.addEventListener("pointermove", (ev) => this.handleGlobalPointerMove(ev));
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("blur", onPointerUp as any);
      window.addEventListener("resize", () => this.drawScene());
   }

   private handleWheel(ev: WheelEvent) {
      ev.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const height = this.app.renderer.height - this.padding * 2;
      const y = ev.clientY - rect.top - this.padding;
      const norm = Math.max(0, Math.min(1, y / Math.max(1, height)));
      const newDuration = Math.max(5, Math.min(360, this.viewDurationMinutes * (ev.deltaY > 0 ? 1.05 : 0.95)));
      const focusMin = this.viewStartMinutes + norm * this.viewDurationMinutes;
      this.viewStartMinutes = focusMin - norm * newDuration;
      this.viewDurationMinutes = newDuration;
      this.drawScene();
   }

   private handleCanvasPointerDown(ev: PointerEvent) {
      this.isPanning = true;
      this.lastPointerY = ev.clientY;
      const target = ev.target as any;
      if (!(target && target.constructor && target.constructor.name === "Text")) this.setSelectedTrain(null);
   }

   private handleGlobalPointerMove(ev: PointerEvent) {
      const minutesPerPixel = this.getMinutesPerPixel();
      if (this.updateHandleDrag(ev.clientY, minutesPerPixel) || this.updateTrainDrag(ev.clientY, minutesPerPixel) || !this.isPanning) return;
      const dy = ev.clientY - this.lastPointerY;
      this.lastPointerY = ev.clientY;
      this.viewStartMinutes -= dy * minutesPerPixel;
      this.drawScene();
   }

   private updateHandleDrag(clientY: number, minutesPerPixel: number) {
      if (!this.isDraggingHandle || this.handleTrainIdx === null || this.handleEntryIdx === null) return false;
      const entries = this.scenario!.trains[this.handleTrainIdx].timetable as any[];
      const snapshot = this.handleSnapshot ?? (this.handleSnapshot = this.buildTimetableSnapshot(entries));
      const deltaMinutes = (clientY - this.handleStartPointerY) * minutesPerPixel;
      const newMinutes = Math.max(snapshot.arrivals[this.handleEntryIdx] ?? 0, this.handleStartMinutes + deltaMinutes);
      entries[this.handleEntryIdx].departure = minutesToString(newMinutes);
      this.applySnapshotDelta(entries, snapshot, newMinutes - this.handleStartMinutes, this.handleEntryIdx + 1);
      this.drawScene();
      return true;
   }

   private updateTrainDrag(clientY: number, minutesPerPixel: number) {
      if (!this.isDraggingTrain || this.draggingTrainIdx === null || !this.dragSnapshot) return false;
      this.applyTrainDragDelta(this.draggingTrainIdx, (clientY - this.dragStartPointerY) * minutesPerPixel);
      this.drawScene();
      return true;
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
      trainIdx: number,
      entryIdx: number,
      timeStr: string | undefined,
      x: number,
      yForTime: (t: string) => number
   ) {
      if (!timeStr || !this.timeHandles) return;
      const y = yForTime(timeStr);
      const g = new PIXI.Graphics();
      g.circle(x, y, 3).fill({ color: 0xffffff, alpha: 1 }).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
      g.eventMode = "static";
      (g as any).cursor = "ns-resize";
      g.on("pointerdown", (ev: PIXI.FederatedPointerEvent) => {
         this.isDraggingHandle = true;
         this.handleTrainIdx = trainIdx;
         this.handleEntryIdx = entryIdx;
         this.handleStartPointerY = ev.clientY;
         this.handleStartMinutes = toMinutes(timeStr);
         this.handleSnapshot = this.buildTimetableSnapshot(this.scenario!.trains[trainIdx].timetable as any[]);
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
      this.handleSnapshot = undefined;
   }

   private beginTrainDrag(trainIdx: number, clientY: number) {
      this.isDraggingTrain = true;
      this.draggingTrainIdx = trainIdx;
      this.dragStartPointerY = clientY;
      this.dragSnapshot = this.buildTimetableSnapshot(this.scenario!.trains[trainIdx].timetable);
   }

   private endTrainDrag() {
      if (!this.isDraggingTrain) return;
      this.isDraggingTrain = false;
      this.draggingTrainIdx = null;
      this.dragSnapshot = undefined;
   }

   private applyTrainDragDelta(trainIdx: number, deltaMinutes: number) {
      if (!this.dragSnapshot) return;
      this.applySnapshotDelta(this.scenario!.trains[trainIdx].timetable, this.dragSnapshot, deltaMinutes);
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
      this.bindClick("save-btn", () => this.saveScenarioToServer());
      this.bindClick("add-train-btn", () => this.handleCreateTrain());
      this.bindClick("train-copy-btn", () => this.copySelectedTrain());
      this.bindClick("train-delete-btn", () => this.deleteSelectedTrain());
      this.bindClick("train-edit-btn", () => this.editSelectedTrain());
      this.bindClick("train-recalculate-btn", () => this.recalculateTrain());
      this.bindClick("direction-filter-btn", () => this.cycleDirectionFilter());
   }

   private bindClick(id: string, handler: () => void | Promise<void>) {
      const element = document.getElementById(id) as HTMLButtonElement | null;
      if (element) element.onclick = () => void handler();
   }

   private async switchScenario(id: string) {
      this.currentScenarioId = id;
      const { scenario, network, layoutChanged } = await this.loadScenarioBundle(id);
      if (layoutChanged) this.selectedRoute = null;
      this.clearStage();
      await this.renderScenario(scenario, network);
      const url = new URL(window.location.href);
      url.searchParams.set("scenario", id);
      window.history.replaceState({}, "", url.toString());
   }

   private clearStage() {
      this.app.stage.removeChildren();
   }

   private getMinutesPerPixel(): number {
      const padding = this.padding;
      const height = this.app.renderer.height - padding * 2;
      return this.viewDurationMinutes / Math.max(1, height);
   }

   private getTrainDirection(train: any): 'leftToRight' | 'rightToLeft' | 'unknown' {
      const visibleEntries = (train.timetable || []).filter((entry: any) => this.stationIndex.has(entry.station));
      if (visibleEntries.length < 2) return 'unknown';

      const firstIndex = this.stationIndex.get(visibleEntries[0].station);
      const lastIndex = this.stationIndex.get(visibleEntries[visibleEntries.length - 1].station);

      if (firstIndex === undefined || lastIndex === undefined) return 'unknown';
      if (firstIndex < lastIndex) return 'leftToRight';
      if (firstIndex > lastIndex) return 'rightToLeft';

      return 'unknown';
   }

   private shouldShowTrain(train: any): boolean {
      if (this.directionFilter === 'both') return true;
      
      const direction = this.getTrainDirection(train);
      if (direction === 'unknown') return true; // Show trains with unknown direction
      
      return direction === this.directionFilter;
   }

   private cycleDirectionFilter() {
      const filters: DirectionFilter[] = ["both", "leftToRight", "rightToLeft"];
      this.directionFilter = filters[(filters.indexOf(this.directionFilter) + 1) % filters.length];
      this.updateDirectionFilterButton();
      this.drawScene();
   }

   private updateDirectionFilterButton() {
      const btn = document.getElementById("direction-filter-btn");
      if (!btn) return;
      
      const icon = btn.querySelector("i");
      if (!icon) return;
      
      // Update icon based on current filter
      icon.className = ''; // Clear all classes
      if (this.directionFilter === 'both') {
         icon.className = 'bi bi-arrow-left-right';
         btn.title = 'Showing all trains (click to filter left-to-right)';
      } else if (this.directionFilter === 'leftToRight') {
         icon.className = 'bi bi-arrow-right';
         btn.title = 'Showing left-to-right trains (click to filter right-to-left)';
      } else {
         icon.className = 'bi bi-arrow-left';
         btn.title = 'Showing right-to-left trains (click to show all)';
      }
   }

   private setSelectedTrain(idx: number | null) {
      const changed = this.selectedTrainIdx !== idx;
      this.selectedTrainIdx = idx;
      this.setTrainActionButtonsDisabled(idx === null);
      if (changed) requestAnimationFrame(() => this.drawScene());
   }

   private setTrainActionButtonsDisabled(disabled: boolean) {
      for (const id of ["train-copy-btn", "train-delete-btn", "train-edit-btn", "train-recalculate-btn"]) {
         const button = document.getElementById(id) as HTMLButtonElement | null;
         if (button) button.disabled = disabled;
      }
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

   private async editSelectedTrain() {
      if (this.selectedTrainIdx === null || !this.scenario) return;
      const train = this.scenario.trains[this.selectedTrainIdx];
      const res = await this.trainEditorPanel.showEdit(train as any);
      if (!res) return;
      train.number = res.number;
      (train as any).type = res.type;
      (train as any).category = res.category;
      train.speedMax = res.speedMax;
      train.cars = res.cars;
      (train as any).followingTrainNumber = res.followingTrainNumber;
      this.drawScene();
   }

   private buildScenarioPayload() {
      if (!this.scenario) return null;
      return {
         title: this.scenario.title,
         layout: this.scenario.layout,
         start_time: this.scenario.start_time,
         trains: this.scenario.trains.map((train) => ({
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

      // wire copy button
      const copyBtn = document.getElementById("export-copy-btn");
      if (copyBtn) {
         copyBtn.onclick = async () => {
            try {
               await navigator.clipboard.writeText(json);
               // brief visual feedback
               const original = copyBtn.textContent || "Copy to Clipboard";
               copyBtn.textContent = "Copied!";
               setTimeout(() => (copyBtn.textContent = original), 1200);
            } catch {
               // fallback: select text so user can copy manually
               if (textarea) {
                  textarea.focus();
                  textarea.select();
               }
            }
         };
      }

      // show modal
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
         alert("Scenario saved successfully!");
      } catch (error) {
         const message = error instanceof Error ? error.message : "Unknown error";
         alert(`Failed to save scenario: ${message}`);
         console.error("Error saving scenario:", error);
      }
   }

   private async handleCreateTrain() {
      const res = await this.trainEditorPanel.showCreate(this.stationOrder);
      if (!res || !this.scenario || !this.network) return;
      const range = this.getStationRange(res.startStation, res.endStation);
      if (!range) return;
      this.scenario.trains.push({
         number: res.number,
         type: res.type,
         category: res.category,
         speedMax: res.speedMax,
         cars: res.cars,
         followingTrainNumber: res.followingTrainNumber,
         timetable: this.buildTimetable(range.startIdx, range.endIdx, res.speedMax, toMinutes(this.scenario.start_time)) as any,
      } as any);
      this.drawScene();
   }

   private getStationRange(startStation: string, endStation: string) {
      const startIdx = this.stationOrder.indexOf(startStation);
      const endIdx = this.stationOrder.indexOf(endStation);
      return startIdx < 0 || endIdx < 0 || startIdx === endIdx ? null : { startIdx, endIdx };
   }

   private buildTimetable(
      startIndex: number,
      endIndex: number,
      speed: number,
      startTimeMinutes: number
   ): Array<{ station: string; arrival?: string; departure?: string }> {
      if (!this.network) return [];
      const step = startIndex < endIndex ? 1 : -1;
      const path: string[] = [];
      for (let i = startIndex; i !== endIndex + step; i += step) path.push(this.stationOrder[i]);

      let current = startTimeMinutes;
      return path.map((station, index) => {
         if (index === 0) return { station, departure: minutesToString(current) };
         current += this.getTravelMinutes(path[index - 1], station, speed);
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
      return toMinutes(secondEntry.arrival) - this.getTravelMinutes(firstEntry.station, secondEntry.station, train.speedMax);
   }

   private recalculateTrain() {
      if (this.selectedTrainIdx === null || !this.scenario || !this.network) return;
      const train = this.scenario.trains[this.selectedTrainIdx];
      const firstEntry = train.timetable[0];
      const lastEntry = train.timetable[train.timetable.length - 1];
      if (!firstEntry || !lastEntry) return;
      const range = this.getStationRange(firstEntry.station, lastEntry.station);
      const startMinutes = this.getTrainStartMinutes(train);
      if (!range || startMinutes === null) return;
      train.timetable = this.buildTimetable(range.startIdx, range.endIdx, train.speedMax, startMinutes) as any;
      this.drawScene();
   }
}
