import { fetchGameMasterSnapshot } from "../network/api";
import { GameMasterSnapshotDto } from "../network/dto";

export type GmSnapshotListener = (snapshot: GameMasterSnapshotDto) => void;

export class GmSnapshotPoller {
  static readonly INTERVAL_MS = 5000;

  private timerId: number | null = null;
  private listeners = new Set<GmSnapshotListener>();
  private lastSnapshot: GameMasterSnapshotDto | null = null;
  private inFlight: Promise<void> | null = null;

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) {
      void this.tick();
    }
  };

  start(): void {
    if (this.timerId !== null) return;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    void this.tick();
    this.timerId = window.setInterval(() => void this.tick(), GmSnapshotPoller.INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  subscribe(listener: GmSnapshotListener): () => void {
    this.listeners.add(listener);
    if (this.lastSnapshot) {
      listener(this.lastSnapshot);
    }
    return () => this.listeners.delete(listener);
  }

  refresh(): void {
    void this.tick();
  }

  getLast(): GameMasterSnapshotDto | null {
    return this.lastSnapshot;
  }

  private async tick(): Promise<void> {
    if (document.hidden) return;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchAndNotify().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchAndNotify(): Promise<void> {
    try {
      const snapshot = await fetchGameMasterSnapshot();
      this.lastSnapshot = snapshot;
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    } catch (err) {
      console.error("GmSnapshotPoller: failed to fetch snapshot", err);
    }
  }
}
