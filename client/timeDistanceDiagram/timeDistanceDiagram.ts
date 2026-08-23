import * as PIXI from "pixi.js";
import type { ScenarioDto, NetworkDto } from "../network/dto";
import { toMinutes, minutesToString } from "../scenarioEditor/utils/timeUtils";
import { precomputeExitSpans, getDistanceMeters, isSingleTrackSection, deriveOrderedStations } from "../scenarioEditor/utils/railNetworkUtils";
import { getCategoryColor } from "../scenarioEditor/utils/constants";
import { detectCollisions } from "../scenarioEditor/utils/collisionDetection";

export type DirectionFilter = 'both' | 'leftToRight' | 'rightToLeft';
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

export type TimeDistanceDiagramOptions = {
   editable?: boolean;
   routeSelect?: HTMLSelectElement | null;
   directionFilterButton?: HTMLButtonElement | null;
   onTrainSelected?: (index: number | null) => void;
   onTrainEditRequested?: (index: number) => void;
};

export class TimeDistanceDiagram {
   private readonly container: HTMLElement;
   private readonly fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
   private readonly editable: boolean;
   private readonly routeSelect: HTMLSelectElement | null;
   private readonly directionFilterButton: HTMLButtonElement | null;
   private readonly onTrainSelected?: (index: number | null) => void;
   private readonly onTrainEditRequested?: (index: number) => void;
   private app!: PIXI.Application;
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
   private stationGrid?: PIXI.Graphics;
   private stationLabels?: PIXI.Container;
   private content?: PIXI.Container;
   private timeGrid?: PIXI.Graphics;
   private conflictBg?: PIXI.Graphics;
   private trainsLayer?: PIXI.Container;
   private timeLabels?: PIXI.Container;
   private trainLayers: PIXI.Container[] = [];
   private hoverOverlay?: PIXI.Graphics;
   private hoverLeftLabel?: PIXI.BitmapText;
   private hoverRightLabel?: PIXI.BitmapText;
   private hoverLineWidth: number = 0;
   private lastHoverClientY: number | null = null;
   private padding: number = 40;
   private viewStartMinutes: number = 0;
   private viewDurationMinutes: number = 60;
   private isPanning: boolean = false;
   private lastPointerY: number = 0;
   private pointerDownY: number = 0;
   private pointerDownOnTrain: boolean = false;
   private dragLastClientY: number = 0;
   private selectedTrainIdx: number | null = null;
   private lastTrainLabelTap?: { trainIdx: number; atMs: number };
   private directionFilter: DirectionFilter = 'both';
   private interactionsBound: boolean = false;
   private pendingDraw: boolean = false;

   constructor(container: HTMLElement, options: TimeDistanceDiagramOptions = {}) {
      this.container = container;
      this.editable = options.editable === true;
      this.routeSelect = options.routeSelect ?? null;
      this.directionFilterButton = options.directionFilterButton ?? null;
      this.onTrainSelected = options.onTrainSelected;
      this.onTrainEditRequested = options.onTrainEditRequested;
   }

   public async init(): Promise<void> {
      this.app = new PIXI.Application();
      await this.app.init({
         resizeTo: this.container,
         background: 0x101214 as any,
         antialias: true,
         autoStart: false,
      });
      this.app.ticker.stop();
      this.app.canvas.style.display = "block";
      this.container.appendChild(this.app.canvas);
      PIXI.BitmapFont.install({
         name: "scenario-ui",
         resolution: Math.max(1, window.devicePixelRatio || 1),
         chars: [["a", "z"], ["A", "Z"], ["0", "9"], " :.-_/"],
         style: { fontFamily: this.fontFamily, fontSize: 12, fill: 0xffffff },
      });
      if (this.directionFilterButton) {
         this.directionFilterButton.onclick = () => this.cycleDirectionFilter();
      }
   }

   public async show(scenario: ScenarioDto, network: NetworkDto): Promise<void> {
      await this.renderScenario(scenario, network);
   }

   public redraw(): void {
      this.drawScene();
   }

   public get selectedTrainIndex(): number | null {
      return this.selectedTrainIdx;
   }

   public getStationOrder(): string[] {
      return this.stationOrder;
   }

   public resetRoute(): void {
      this.selectedRoute = null;
   }

   public get currentScenario(): ScenarioDto | undefined {
      return this.scenario;
   }

   public get currentNetwork(): NetworkDto | undefined {
      return this.network;
   }

   public travelMinutes(fromStation: string, toStation: string, speed: number): number {
      return this.getTravelMinutes(fromStation, toStation, speed);
   }

   public selectTrain(idx: number | null): void {
      this.setSelectedTrain(idx);
   }

   /**
    * Find all valid routes through the network using DFS.
    * Rules:
    * 1. Each station can only be visited once per route
    * 2. Within a station, arrival and departure exits must have opposite parity
    *    (odd↔even). Same-parity transit (odd→odd or even→even) is invalid.
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

      const sameParity = (a: number, b: number): boolean => (a % 2) === (b % 2);

      // DFS to explore routes. arrivalExitId is the exit used to enter currentStation
      // (null at the route start, where any departure is allowed).
      const dfs = (
         currentStation: string,
         visited: Set<string>,
         path: string[],
         arrivalExitId: number | null
      ) => {
         path.push(currentStation);
         visited.add(currentStation);

         const neighbors = adjacency.get(currentStation) || [];
         for (const neighbor of neighbors) {
            if (visited.has(neighbor.to)) {
               continue;
            }

            // Through-station rule: leave via opposite parity of the arrival exit
            if (arrivalExitId !== null && sameParity(arrivalExitId, neighbor.fromExitId)) {
               continue;
            }

            dfs(neighbor.to, new Set(visited), [...path], neighbor.toExitId);
         }

         if (path.length >= 2) {
            routes.push([...path]);
         }
      };

      const allStations = new Set<string>();
      for (const conn of network.connections) {
         allStations.add(conn.from);
         allStations.add(conn.to);
      }

      for (const startStation of allStations) {
         dfs(startStation, new Set(), [], null);
      }

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
            ? network.stations.map((s) => s.id)
            : Array.from(new Set(scenario.trains.flatMap((train) => (train.timetable || []).map((entry) => entry.station))));
      this.stationIndex = new Map(this.stationOrder.map((station, index) => [station, index] as [string, number]));
   }

   private createSceneLayers() {
      this.clearStage();
      this.singleTrackBg = new PIXI.Graphics();
      this.stationGrid = new PIXI.Graphics();
      this.stationLabels = new PIXI.Container();
      this.content = new PIXI.Container();
      this.timeGrid = new PIXI.Graphics();
      this.conflictBg = new PIXI.Graphics();
      this.trainsLayer = new PIXI.Container();
      this.content.addChild(this.timeGrid, this.conflictBg, this.trainsLayer);
      this.timeLabels = new PIXI.Container();
      this.hoverOverlay = new PIXI.Graphics();
      this.hoverLeftLabel = this.createText("", 11, 0x8b93a1, "right");
      this.hoverRightLabel = this.createText("", 11, 0x8b93a1, "left");
      this.hoverLeftLabel.anchor.set(1, 0.5);
      this.hoverRightLabel.anchor.set(0, 0.5);
      this.app.stage.addChild(
         this.singleTrackBg,
         this.stationGrid,
         this.content,
         this.stationLabels,
         this.timeLabels,
         this.hoverOverlay,
         this.hoverLeftLabel,
         this.hoverRightLabel
      );
      this.hideHover();
   }

   private setupRouteSelector() {
      const select = this.routeSelect;
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

   private getPixelsPerMinute(): number {
      const height = this.app.renderer.height - this.padding * 2;
      return height / this.viewDurationMinutes;
   }

   private getViewMetrics(): ViewMetrics {
      const padding = this.padding;
      const width = this.app.renderer.width - padding * 2;
      const height = this.app.renderer.height - padding * 2;
      const ppm = this.getPixelsPerMinute();
      const denom = Math.max(1, this.stationOrder.length - 1);
      return {
         padding,
         width,
         height,
         viewStart: this.viewStartMinutes,
         viewEnd: this.viewEndMinutes,
         xForStation: (station: string) => padding + ((this.stationIndex.get(station) ?? 0) / denom) * width,
         yForMinutes: (minutes: number) => minutes * ppm,
         yForTime: (time: string) => toMinutes(time) * ppm,
      };
   }

   private createText(text: string, fontSize: number, fill: number, align: "left" | "right" | "center" = "left") {
      const label = new PIXI.BitmapText({
         text,
         style: { fontSize, align, fontFamily: "scenario-ui", fill: 0xffffff },
      });
      label.tint = fill;
      label.anchor.set(align === "right" ? 1 : align === "center" ? 0.5 : 0, 0.5);
      return label;
   }

   private destroyContainerChildren(container?: PIXI.Container) {
      if (!container) return;
      for (const child of container.removeChildren()) {
         child.destroy({ children: true });
      }
   }

   private replaceGraphics(current: PIXI.Graphics | undefined, parent: PIXI.Container): PIXI.Graphics {
      const index = current?.parent === parent ? parent.getChildIndex(current) : parent.children.length;
      if (current) {
         parent.removeChild(current);
         current.destroy();
      }
      const next = new PIXI.Graphics();
      parent.addChildAt(next, Math.min(index, parent.children.length));
      return next;
   }

   private scheduleDrawScene() {
      if (this.pendingDraw) return;
      this.pendingDraw = true;
      requestAnimationFrame(() => {
         this.pendingDraw = false;
         this.drawScene();
      });
   }

   private renderNow() {
      this.app.render();
   }

   private applyViewTransform() {
      const y = this.padding - this.viewStartMinutes * this.getPixelsPerMinute();
      if (this.content) this.content.y = y;
      if (this.timeLabels) this.timeLabels.y = y;
      this.renderNow();
   }

   private syncHoverLine(metrics: ViewMetrics) {
      if (!this.hoverOverlay) return;
      if (this.hoverLineWidth === metrics.width) return;
      this.hoverLineWidth = metrics.width;
      const parent = this.hoverOverlay.parent;
      const index = parent ? parent.getChildIndex(this.hoverOverlay) : 0;
      this.hoverOverlay.destroy();
      const g = new PIXI.Graphics();
      const xStart = metrics.padding;
      const xEnd = metrics.padding + metrics.width;
      for (let x = xStart; x < xEnd; x += 10) {
         g.moveTo(x, 0).lineTo(Math.min(x + 6, xEnd), 0);
      }
      g.stroke({ width: 1, color: 0x8b93a1, alpha: 0.8, cap: "butt" });
      this.hoverOverlay = g;
      parent?.addChildAt(g, index);
   }

   private getSceneTimeRange(): { start: number; end: number } {
      let start = this.viewStartMinutes;
      let end = this.viewEndMinutes;
      for (const train of this.scenario?.trains ?? []) {
         for (const entry of train.timetable || []) {
            if (entry.arrival) {
               const minutes = toMinutes(entry.arrival);
               start = Math.min(start, minutes);
               end = Math.max(end, minutes);
            }
            if (entry.departure) {
               const minutes = toMinutes(entry.departure);
               start = Math.min(start, minutes);
               end = Math.max(end, minutes);
            }
         }
      }
      return { start: start - this.viewDurationMinutes, end: end + this.viewDurationMinutes };
   }

   private forEachTimeTick(metrics: ViewMetrics, step: number, cb: (minutes: number) => void) {
      for (let tick = Math.floor(metrics.viewStart / step) * step; tick <= metrics.viewEnd; tick += step) cb(tick);
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
      if (!this.scenario || !this.network || !this.content || !this.trainsLayer || !this.stationLabels || !this.timeLabels) return;
      const metrics = this.getViewMetrics();
      this.singleTrackBg = this.replaceGraphics(this.singleTrackBg, this.app.stage);
      this.stationGrid = this.replaceGraphics(this.stationGrid, this.app.stage);
      this.timeGrid = this.replaceGraphics(this.timeGrid, this.content);
      this.conflictBg = this.replaceGraphics(this.conflictBg, this.content);
      this.destroyContainerChildren(this.stationLabels);
      this.destroyContainerChildren(this.timeLabels);
      this.destroyContainerChildren(this.trainsLayer);
      this.trainLayers = [];
      this.drawTimeAxis(metrics);
      this.drawTrackOverlays(metrics);
      this.drawStations(metrics);
      this.scenario.trains.forEach((train, idx) => this.drawTrain(train, idx, metrics));
      this.syncHoverLine(metrics);
      this.applyViewTransform();
      if (this.lastHoverClientY !== null) this.updateHoverFromClientY(this.lastHoverClientY);
   }

   private drawTimeAxis(metrics: ViewMetrics) {
      const range = this.getSceneTimeRange();
      this.forEachTimeTick({ ...metrics, viewStart: range.start, viewEnd: range.end }, 10, (minutes) => {
         const y = metrics.yForMinutes(minutes);
         const label = String(Math.floor(minutes) % 60).padStart(2, "0");
         const left = this.createText(label, 11, 0x8b93a1, "right");
         const right = this.createText(label, 11, 0x8b93a1, "left");
         left.position.set(metrics.padding - 8, y);
         right.position.set(metrics.padding + metrics.width + 8, y);
         this.timeLabels!.addChild(left, right);
         this.timeGrid!
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
         this.conflictBg
            .poly([
               metrics.xForStation(conflict.fromStation), metrics.yForMinutes(conflict.startTimeMinutes),
               metrics.xForStation(conflict.toStation), metrics.yForMinutes(conflict.startTimeMinutes),
               metrics.xForStation(conflict.toStation), metrics.yForMinutes(conflict.endTimeMinutes),
               metrics.xForStation(conflict.fromStation), metrics.yForMinutes(conflict.endTimeMinutes),
            ])
            .fill({ color: 0xff0000, alpha: 0.35 });
      }
   }

   private drawStations(metrics: ViewMetrics) {
      for (const station of this.stationOrder) {
         const x = metrics.xForStation(station);
         this.stationGrid!
            .moveTo(x, metrics.padding)
            .lineTo(x, metrics.padding + metrics.height)
            .stroke({ width: 1, color: 0x394049, alpha: 1, cap: "butt" });
         const label = this.createText(station, 12, 0xb0b8c0, "center");
         label.anchor.set(0.5, 1);
         label.position.set(x, metrics.padding - 6);
         this.stationLabels!.addChild(label);
      }
   }

   private drawTrain(train: any, idx: number, metrics: ViewMetrics) {
      if (!this.shouldShowTrain(train) || !train.timetable?.length || !this.trainsLayer) return;
      const color = getCategoryColor(train.category, train.type);
      const lineWidth = idx === this.selectedTrainIdx ? 4 : 2;
      const entries = train.timetable;
      const layer = new PIXI.Container();
      const lines = new PIXI.Graphics();
      layer.addChild(lines);
      this.trainsLayer.addChild(layer);
      this.trainLayers[idx] = layer;

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

         const x1 = metrics.xForStation(a.station);
         const x2 = metrics.xForStation(b.station);
         const y1 = metrics.yForMinutes(depMinutes);
         const y2 = metrics.yForMinutes(arrMinutes);
         lines.moveTo(x1, y1).lineTo(x2, y2);
         this.drawTrainLabel(layer, train, idx, i, color, x1, y1, x2, y2);
      }

      for (let i = 0; i < entries.length; i++) {
         const entry = entries[i];
         if (!this.stationIndex.has(entry.station)) continue;
         const x = metrics.xForStation(entry.station);
         if (entry.arrival && entry.departure) {
            lines.moveTo(x, metrics.yForMinutes(toMinutes(entry.arrival))).lineTo(x, metrics.yForMinutes(toMinutes(entry.departure)));
         }
         this.drawTimeHandle(layer, idx, i, entry.departure, x, metrics.yForTime);
      }

      lines.stroke({ width: lineWidth, color, alpha: 1, cap: "round" });
   }

   private redrawTrain(idx: number) {
      const old = this.trainLayers[idx];
      if (old) {
         old.parent?.removeChild(old);
         old.destroy({ children: true });
      }
      const train = this.scenario?.trains[idx];
      if (train) this.drawTrain(train, idx, this.getViewMetrics());
      this.renderNow();
   }

   private drawTrainLabel(layer: PIXI.Container, train: any, trainIdx: number, segmentIdx: number, color: number, x1: number, y1: number, x2: number, y2: number) {
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
      layer.addChild(label);
   }

   private bindTrainLabelInteractions(label: PIXI.BitmapText, trainIdx: number) {
      label.eventMode = "static";
      label.cursor = this.editable ? "grab" : "pointer";
      if (this.editable) {
         label.on("pointertap", (ev: PIXI.FederatedPointerEvent) => {
            const detail = (ev as any)?.detail;
            if ((typeof detail === "number" && detail >= 2) || this.isTrainLabelDoubleTap(trainIdx)) {
               this.onTrainEditRequested?.(trainIdx);
            }
         });
      }
      label.on("pointerdown", (ev: PIXI.FederatedPointerEvent) => {
         ev.stopPropagation();
         this.isPanning = false;
         this.pointerDownOnTrain = true;
         this.setSelectedTrain(trainIdx, !this.editable);
         if (!this.editable) return;
         label.cursor = "grabbing";
         this.beginTrainDrag(trainIdx, ev.clientY);
      });
      if (this.editable) {
         label.on("pointerup", () => {
            label.cursor = "grab";
            this.endTrainDrag();
         });
         label.on("pointerupoutside", () => {
            label.cursor = "grab";
            this.endTrainDrag();
         });
      }
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
      const onPointerUp = (ev: PointerEvent) => {
         const panMoved = Math.abs(ev.clientY - this.pointerDownY) >= 3;
         this.endTrainDrag();
         this.endHandleDrag();
         if (!this.pointerDownOnTrain && !panMoved) this.setSelectedTrain(null);
         this.pointerDownOnTrain = false;
         this.isPanning = false;
      };
      this.container.addEventListener("wheel", (ev) => this.handleWheel(ev), { passive: false });
      this.container.addEventListener("pointerdown", (ev) => this.handleCanvasPointerDown(ev), { capture: true });
      this.container.addEventListener("pointermove", (ev) => this.updateHoverFromClientY(ev.clientY));
      this.container.addEventListener("pointerleave", () => this.hideHover());
      window.addEventListener("pointermove", (ev) => this.handleGlobalPointerMove(ev));
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("blur", onPointerUp as any);
      window.addEventListener("resize", () => this.scheduleDrawScene());
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
      this.scheduleDrawScene();
   }

   private handleCanvasPointerDown(ev: PointerEvent) {
      this.isPanning = true;
      this.pointerDownOnTrain = false;
      this.lastPointerY = ev.clientY;
      this.pointerDownY = ev.clientY;
   }

   private handleGlobalPointerMove(ev: PointerEvent) {
      const minutesPerPixel = this.getMinutesPerPixel();
      if (this.updateHandleDrag(ev.clientY, minutesPerPixel) || this.updateTrainDrag(ev.clientY, minutesPerPixel) || !this.isPanning) return;
      const dy = ev.clientY - this.lastPointerY;
      this.lastPointerY = ev.clientY;
      this.viewStartMinutes -= dy * minutesPerPixel;
      this.applyViewTransform();
      if (this.lastHoverClientY !== null) this.updateHoverFromClientY(this.lastHoverClientY);
   }

   private updateHandleDrag(clientY: number, minutesPerPixel: number) {
      if (!this.isDraggingHandle || this.handleTrainIdx === null || this.handleEntryIdx === null) return false;
      const entries = this.scenario!.trains[this.handleTrainIdx].timetable as any[];
      const snapshot = this.handleSnapshot ?? (this.handleSnapshot = this.buildTimetableSnapshot(entries));
      const deltaMinutes = (clientY - this.handleStartPointerY) * minutesPerPixel;
      const newMinutes = Math.max(snapshot.arrivals[this.handleEntryIdx] ?? 0, this.handleStartMinutes + deltaMinutes);
      entries[this.handleEntryIdx].departure = minutesToString(newMinutes);
      this.applySnapshotDelta(entries, snapshot, newMinutes - this.handleStartMinutes, this.handleEntryIdx + 1);
      this.redrawTrain(this.handleTrainIdx);
      return true;
   }

   private updateTrainDrag(clientY: number, minutesPerPixel: number) {
      if (!this.isDraggingTrain || this.draggingTrainIdx === null || !this.dragSnapshot) return false;
      this.dragLastClientY = clientY;
      const layer = this.trainLayers[this.draggingTrainIdx];
      if (layer) layer.y = clientY - this.dragStartPointerY;
      this.renderNow();
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
      this.hoverOverlay.y = y;
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
      this.renderNow();
   }

   private hideHover() {
      this.lastHoverClientY = null;
      if (this.hoverOverlay) this.hoverOverlay.visible = false;
      if (this.hoverLeftLabel) this.hoverLeftLabel.visible = false;
      if (this.hoverRightLabel) this.hoverRightLabel.visible = false;
      if (this.app) this.renderNow();
   }

   private drawTimeHandle(
      layer: PIXI.Container,
      trainIdx: number,
      entryIdx: number,
      timeStr: string | undefined,
      x: number,
      yForTime: (t: string) => number
   ) {
      if (!timeStr) return;
      const y = yForTime(timeStr);
      const g = new PIXI.Graphics();
      g.circle(x, y, 3).fill({ color: 0xffffff, alpha: 1 }).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
      if (!this.editable) {
         layer.addChild(g);
         return;
      }
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
      layer.addChild(g);
   }

   private endHandleDrag() {
      const wasDragging = this.isDraggingHandle;
      this.isDraggingHandle = false;
      this.handleTrainIdx = null;
      this.handleEntryIdx = null;
      this.handleSnapshot = undefined;
      if (wasDragging) this.drawScene();
   }

   private beginTrainDrag(trainIdx: number, clientY: number) {
      this.isDraggingTrain = true;
      this.draggingTrainIdx = trainIdx;
      this.dragStartPointerY = clientY;
      this.dragLastClientY = clientY;
      this.dragSnapshot = this.buildTimetableSnapshot(this.scenario!.trains[trainIdx].timetable);
   }

   private endTrainDrag() {
      if (!this.isDraggingTrain) return;
      const idx = this.draggingTrainIdx;
      const moved = Math.abs(this.dragLastClientY - this.dragStartPointerY) >= 3;
      if (moved && idx !== null && this.dragSnapshot) {
         this.applyTrainDragDelta(idx, (this.dragLastClientY - this.dragStartPointerY) * this.getMinutesPerPixel());
      }
      this.isDraggingTrain = false;
      this.draggingTrainIdx = null;
      this.dragSnapshot = undefined;
      if (moved) {
         this.drawScene();
         return;
      }
      const layer = idx !== null ? this.trainLayers[idx] : undefined;
      if (layer) layer.y = 0;
      this.scheduleDrawScene();
   }

   private applyTrainDragDelta(trainIdx: number, deltaMinutes: number) {
      if (!this.dragSnapshot) return;
      this.applySnapshotDelta(this.scenario!.trains[trainIdx].timetable, this.dragSnapshot, deltaMinutes);
   }

   private clearStage() {
      for (const child of this.app.stage.removeChildren()) {
         child.destroy({ children: true });
      }
      this.singleTrackBg = undefined;
      this.stationGrid = undefined;
      this.stationLabels = undefined;
      this.content = undefined;
      this.timeGrid = undefined;
      this.conflictBg = undefined;
      this.trainsLayer = undefined;
      this.timeLabels = undefined;
      this.trainLayers = [];
      this.hoverOverlay = undefined;
      this.hoverLeftLabel = undefined;
      this.hoverRightLabel = undefined;
      this.hoverLineWidth = 0;
   }

   private getMinutesPerPixel(): number {
      return 1 / this.getPixelsPerMinute();
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
      const btn = this.directionFilterButton;
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


   private setSelectedTrain(idx: number | null, redraw: boolean = true) {
      const changed = this.selectedTrainIdx !== idx;
      this.selectedTrainIdx = idx;
      this.onTrainSelected?.(idx);
      if (changed && redraw) this.scheduleDrawScene();
   }
}
