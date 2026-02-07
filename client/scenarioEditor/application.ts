import * as PIXI from "pixi.js";
import { fetchScenarios, fetchScenario, fetchNetwork, saveScenario } from "../network/api";
import type { ScenarioDto, NetworkDto } from "../network/dto";
import { toMinutes, minutesToString } from "./utils/timeUtils";
import { precomputeExitSpans, getDistanceMeters, isSingleTrackSection, deriveOrderedStations } from "./utils/railNetworkUtils";
import { getCategoryColor } from "./utils/constants";
import { EditTrainDialog } from "./editTrainDialog";
import { detectCollisions } from "./utils/collisionDetection";

type DirectionFilter = 'both' | 'leftToRight' | 'rightToLeft';

export default class SzenariosApplication {
   private readonly container: HTMLElement;
   private app!: PIXI.Application;
   private currentScenarioId: string = "timetable";
   private currentLayoutId: string = "";
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
   private modalSubmit?: (ev: Event) => void;
   private directionFilter: DirectionFilter = 'both';

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
      const scenario = await fetchScenario(this.currentScenarioId);
      this.currentLayoutId = scenario.layout || "";
      const network = await fetchNetwork(this.currentLayoutId);
      await this.renderScenario(scenario, network);

      // populate selector and hook change
      this.setupScenarioSelector(list, this.currentScenarioId);
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

      // Find all valid routes through the network
      this.availableRoutes = this.findAllRoutes(network);
      console.log(`[Routes] Found ${this.availableRoutes.length} valid routes:`);
      this.availableRoutes.forEach((route, idx) => {
         console.log(`  Route ${idx + 1}: ${route.join(' -> ')}`);
      });

      // If no route is selected yet and we have routes, select the first one
      if (!this.selectedRoute && this.availableRoutes.length > 0) {
         this.selectedRoute = this.availableRoutes[0];
      }

      // Compute station order and index (use selected route if available)
      if (this.selectedRoute && this.selectedRoute.length > 0) {
         this.stationOrder = this.selectedRoute;
      } else {
         this.stationOrder = deriveOrderedStations(network);
         if (this.stationOrder.length === 0) {
            this.stationOrder = network.stations && network.stations.length > 0 ? network.stations.slice() : [];
         }
         if (this.stationOrder.length === 0) {
            const set = new Set<string>();
            for (const t of scenario.trains) for (const s of t.timetable || []) set.add(s.station);
            this.stationOrder = Array.from(set);
         }
      }
      this.stationIndex = new Map(this.stationOrder.map((s, i) => [s, i] as [string, number]));

      // Create layers
      this.singleTrackBg = new PIXI.Graphics();
      this.conflictBg = new PIXI.Graphics();
      this.grid = new PIXI.Graphics();
      this.lines = new PIXI.Graphics();
      this.labels = new PIXI.Container();
      this.trainLabels = new PIXI.Container();
      this.timeHandles = new PIXI.Container();
      this.app.stage.addChild(this.singleTrackBg);
      this.app.stage.addChild(this.conflictBg);
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

      // Precompute station exit spans from server-provided MaxExitDistance
      await precomputeExitSpans(network);
      this.setupRouteSelector();
      this.updateDirectionFilterButton();
      this.drawScene();
      this.setupInteractions();
   }

   private setupRouteSelector() {
      const select = document.getElementById("route-select") as HTMLSelectElement | null;
      if (!select) return;

      // Clear existing options
      select.innerHTML = '';

      // Add route options
      this.availableRoutes.forEach((route, idx) => {
         const opt = document.createElement("option");
         opt.value = String(idx);
         opt.textContent = route.join(' → ');
         select.appendChild(opt);
      });

      // Set selected value if we have a selected route, otherwise select first route
      let selectedIdx = 0;
      if (this.selectedRoute) {
         const idx = this.availableRoutes.findIndex(route => 
            route.length === this.selectedRoute!.length && 
            route.every((station, i) => station === this.selectedRoute![i])
         );
         if (idx >= 0) {
            selectedIdx = idx;
         }
      }
      
      // Select the route (first by default)
      if (this.availableRoutes.length > 0) {
         select.value = String(selectedIdx);
         this.selectedRoute = this.availableRoutes[selectedIdx];
      }

      // Handle route selection changes
      select.onchange = () => {
         const value = select.value;
         const idx = parseInt(value, 10);
         if (idx >= 0 && idx < this.availableRoutes.length) {
            this.selectedRoute = this.availableRoutes[idx];
            this.stationOrder = this.selectedRoute;
            this.stationIndex = new Map(this.stationOrder.map((s, i) => [s, i] as [string, number]));
            this.drawScene();
         }
      };
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
      if (this.conflictBg) this.conflictBg.clear();
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

      // collision/conflict regions
      if (this.conflictBg && this.scenario && this.network) {
         const conflicts = detectCollisions(this.scenario.trains, this.network);
         for (const conflict of conflicts) {
            // Skip if either station is not in the current route
            if (!this.stationIndex.has(conflict.fromStation) || !this.stationIndex.has(conflict.toStation)) {
               continue;
            }
            
            const viewStart = this.viewStartMinutes;
            const viewEnd = this.viewStartMinutes + this.viewDurationMinutes;
            
            // Skip if conflict is completely outside the current time view
            if (conflict.endTimeMinutes < viewStart || conflict.startTimeMinutes > viewEnd) {
               continue;
            }
            
            // Clip conflict time to current view
            const conflictStart = Math.max(conflict.startTimeMinutes, viewStart);
            const conflictEnd = Math.min(conflict.endTimeMinutes, viewEnd);
            
            // Calculate coordinates for the conflict region
            const x1 = xForStation(conflict.fromStation);
            const x2 = xForStation(conflict.toStation);
            const y1 = yForMinutes(conflictStart);
            const y2 = yForMinutes(conflictEnd);
            
            // Draw filled polygon (quadrilateral) for the conflict region
            this.conflictBg
               .poly([
                  x1, y1,  // top-left
                  x2, y1,  // top-right
                  x2, y2,  // bottom-right
                  x1, y2   // bottom-left
               ])
               .fill({ color: 0xff0000, alpha: 0.35 });
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
         
         // Apply direction filter
         if (!this.shouldShowTrain(train)) continue;
         
         const color = getCategoryColor((train as any).category, (train as any).type);
         const entries = train.timetable;
         if (!entries || entries.length === 0) continue;
         
         // Check if this train is selected for thicker line
         const isSelected = idx === this.selectedTrainIdx;
         const lineWidth = isSelected ? 4 : 2;
         
         for (let i = 0; i < entries.length - 1; i++) {
            const a = entries[i];
            const b = entries[i + 1];
            
            // Skip if either station is not in the current route
            if (!this.stationIndex.has(a.station) || !this.stationIndex.has(b.station)) {
               continue;
            }
            
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
                     // Add a deterministic ±50px along-segment offset to reduce clutter
                     const sign = ((idx + i) % 2 === 0) ? 1 : -1;
                     const ux = ddx / segLen;
                     const uy = ddy / segLen;
                     const along = 50 * sign;
                     const lx = midx + nx * off + ux * along;
                     const ly = midy + ny * off + uy * along;
                     const label = new PIXI.Text({
                        text: train.category ? train.category + " " + train.number : train.number,
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
                     label.on("pointertap", (ev: PIXI.FederatedPointerEvent) => {
                        this.setSelectedTrain(idx);
                        const anyEv: any = ev as any;
                        // Prefer native double-click detail when available
                        if (typeof anyEv?.detail === "number" && anyEv.detail >= 2) {
                           this.editSelectedTrain();
                           return;
                        }
                        // Fallback: detect double tap by time threshold
                        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                        const last = (label as any)._lastTapTime || 0;
                        (label as any)._lastTapTime = now;
                        if (now - last < 300) {
                           this.editSelectedTrain();
                        }
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
            
            // Skip if station is not in the current route
            if (!this.stationIndex.has(e.station)) {
               continue;
            }
            
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
         // Stroke each train individually with appropriate line width
         this.lines.stroke({ width: lineWidth, color, alpha: 1, cap: "round" });
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
            
            // Limit movement to at least the arrival time (from snapshot)
            const arrivalMin = snap.arrivals[baseIdx];
            const minAllowedTime = arrivalMin !== null ? arrivalMin : 0;
            const newMinutes = Math.max(minAllowedTime, this.handleStartMinutes + deltaMinutes);
            const totalDelta = newMinutes - baseMinutes;

            // Update only current departure, then shift all subsequent stops by totalDelta
            const cur = entries[baseIdx];
            cur.departure = minutesToString(newMinutes);
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
         
         const scenario = await fetchScenario(id);
         const newLayoutId = scenario.layout || "";
         
         // Check if layout has changed - if so, reload the network
         let network: NetworkDto;
         if (newLayoutId !== this.currentLayoutId) {
            console.log(`[Graph] Layout changed from '${this.currentLayoutId}' to '${newLayoutId}', reloading network`);
            this.currentLayoutId = newLayoutId;
            network = await fetchNetwork(newLayoutId);
            // Reset route selection when layout changes
            this.selectedRoute = null;
         } else {
            // Same layout, can reuse existing network or refetch
            network = this.network!;
         }
         
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

      const saveBtn = document.getElementById("save-btn");
      if (saveBtn) {
         saveBtn.addEventListener("click", () => this.saveScenarioToServer());
      }

      const addBtn = document.getElementById("add-train-btn");
      if (addBtn) addBtn.addEventListener("click", () => this.handleCreateTrain());

      const copyBtn = document.getElementById("train-copy-btn") as HTMLButtonElement | null;
      const deleteBtn = document.getElementById("train-delete-btn") as HTMLButtonElement | null;
      const editBtn = document.getElementById("train-edit-btn") as HTMLButtonElement | null;
      const recalculateBtn = document.getElementById("train-recalculate-btn") as HTMLButtonElement | null;
      if (copyBtn) copyBtn.addEventListener("click", () => this.copySelectedTrain());
      if (deleteBtn) deleteBtn.addEventListener("click", () => this.deleteSelectedTrain());
      if (editBtn) editBtn.addEventListener("click", () => this.editSelectedTrain());
      if (recalculateBtn) recalculateBtn.addEventListener("click", () => this.recalculateTrain());

      const directionBtn = document.getElementById("direction-filter-btn") as HTMLButtonElement | null;
      if (directionBtn) {
         directionBtn.addEventListener("click", () => {
            this.cycleDirectionFilter();
         });
      }
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
      const timetable = train.timetable || [];
      if (timetable.length < 2) return 'unknown';
      
      const firstStation = timetable[0].station;
      const lastStation = timetable[timetable.length - 1].station;
      
      const firstIndex = this.stationIndex.get(firstStation);
      const lastIndex = this.stationIndex.get(lastStation);
      
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
      // Cycle through modes: both -> leftToRight -> rightToLeft -> both
      if (this.directionFilter === 'both') {
         this.directionFilter = 'leftToRight';
      } else if (this.directionFilter === 'leftToRight') {
         this.directionFilter = 'rightToLeft';
      } else {
         this.directionFilter = 'both';
      }
      
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
      const copyBtn = document.getElementById("train-copy-btn") as HTMLButtonElement | null;
      const deleteBtn = document.getElementById("train-delete-btn") as HTMLButtonElement | null;
      const editBtn = document.getElementById("train-edit-btn") as HTMLButtonElement | null;
      const recalculateBtn = document.getElementById("train-recalculate-btn") as HTMLButtonElement | null;
      const enabled = idx !== null;
      if (copyBtn) copyBtn.disabled = !enabled;
      if (deleteBtn) deleteBtn.disabled = !enabled;
      if (editBtn) editBtn.disabled = !enabled;
      if (recalculateBtn) recalculateBtn.disabled = !enabled;
      // Defer redraw to avoid interfering with event handling
      if (changed) {
         requestAnimationFrame(() => this.drawScene());
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
      const dialog = new EditTrainDialog();
      const res = await dialog.showEdit(train as any, this.stationOrder);
      if (!res) return;
      train.number = res.number;
      (train as any).type = res.type;
      (train as any).category = res.category;
      train.speed = res.speed;
      train.cars = res.cars;
      (train as any).followingTrainNumber = res.followingTrainNumber;
      this.drawScene();
   }

  

   private exportScenarioJson() {
      if (!this.scenario) return;
      // Build the SzenarioDTO shape as the server expects (title, layout, start_time, trains with timetable)
      const exported = {
         title: this.scenario.title,
         layout: this.scenario.layout,
         start_time: this.scenario.start_time,
         trains: this.scenario.trains.map((t) => ({
            number: t.number,
            type: t.type,
            category: t.category,
            speed: t.speed,
            cars: t.cars,
            followingTrainNumber: (t as any).followingTrainNumber,
            timetable: t.timetable.map((e) => {
               const entry: any = { station: e.station };
               if (e.arrival && e.arrival.trim().length > 0) entry.arrival = e.arrival;
               if (e.departure && e.departure.trim().length > 0) entry.departure = e.departure;
               return entry;
            }),
         })),
      };
      const json = JSON.stringify(exported, null, 2);
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
      if (!this.scenario) {
         alert("No scenario loaded");
         return;
      }

      // Build the scenario data (same format as export)
      const scenarioData = {
         title: this.scenario.title,
         layout: this.scenario.layout,
         start_time: this.scenario.start_time,
         trains: this.scenario.trains.map((t) => ({
            number: t.number,
            type: t.type,
            category: t.category,
            speed: t.speed,
            cars: t.cars,
            followingTrainNumber: (t as any).followingTrainNumber,
            timetable: t.timetable.map((e) => {
               const entry: any = { station: e.station };
               if (e.arrival && e.arrival.trim().length > 0) entry.arrival = e.arrival;
               if (e.departure && e.departure.trim().length > 0) entry.departure = e.departure;
               return entry;
            }),
         })),
      };

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
     const dialog = new EditTrainDialog();
     const res = await dialog.showCreate(this.stationOrder);
     if (!res || !this.scenario || !this.network) return;
     const startIdx = this.stationOrder.indexOf(res.startStation);
     const endIdx = this.stationOrder.indexOf(res.endStation);
     if (startIdx < 0 || endIdx < 0 || startIdx === endIdx) return;
     const t0 = toMinutes(this.scenario.start_time);
     const timetable = this.buildTimetable(startIdx, endIdx, res.speed, t0);
     const train = {
        number: res.number,
        type: res.type,
        category: res.category,
        speed: res.speed,
        cars: res.cars,
        followingTrainNumber: res.followingTrainNumber,
        timetable: timetable as any,
     };
     this.scenario.trains.push(train as any);
     this.drawScene();
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
            console.log(`Travel time between ${prev} and ${st}: ${travel} minutes`);
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
      const type = ((document.getElementById("train-type") as HTMLSelectElement)?.value as 'Passenger' | 'Freight') || 'Passenger';
      const category = (document.getElementById("train-category") as HTMLInputElement)?.value?.trim() || undefined;
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
         type,
         category,
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
         console.log(`Travel time between ${firstEntry.station} and ${secondEntry.station}: ${travel} minutes`);
         t0 = toMinutes(secondEntry.arrival) - travel;
      }
      const timetable = this.buildTimetable(startIdx, endIdx, train.speed, t0);

      // Update the train's timetable
      train.timetable = timetable as any;

      // Redraw the scene to show the updated times
      this.drawScene();
   }
}
