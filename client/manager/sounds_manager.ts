import { EventManager } from "./event_manager";
import switchToggleSound from "../assets/sounds/switch_toggle.mp3";
import approvalRequestSound from "../assets/sounds/approval_request.mp3";

type SoundName = "switchToggled" | "incomingTrain" | "approvalRequested";

export class SoundsManager {
   private static readonly STORAGE_KEY = "soundEnabled";

   private readonly _eventManager: EventManager;
   private readonly _sounds: Record<SoundName, HTMLAudioElement>;
   private _enabled: boolean;

   constructor(eventManager: EventManager) {
      this._eventManager = eventManager;
      this._enabled = SoundsManager.loadEnabled();
      const incomingAudio = this.createAudio(approvalRequestSound);
      this._sounds = {
         switchToggled: this.createAudio(switchToggleSound),
         incomingTrain: incomingAudio,
         approvalRequested: incomingAudio,
      };
   }

   public get enabled(): boolean {
      return this._enabled;
   }

   public setEnabled(enabled: boolean): void {
      this._enabled = enabled;
      try {
         localStorage.setItem(SoundsManager.STORAGE_KEY, enabled ? "true" : "false");
      } catch {
         // Ignore storage failures and keep the in-memory flag.
      }
   }

   init(): void {
      this._eventManager.on("switchClicked", () => {
         this.play("switchToggled");
      });

      this._eventManager.on("exitBlockStatusChanged", (_exitId: number, blocked: boolean, trainNumber?: string) => {
         if (blocked && trainNumber) {
            this.play("incomingTrain");
         }
      });

      this._eventManager.on("approvalRequested", () => {
         this.play("approvalRequested");
      });
   }

   private static loadEnabled(): boolean {
      try {
         return localStorage.getItem(SoundsManager.STORAGE_KEY) !== "false";
      } catch {
         return true;
      }
   }

   private createAudio(src: string): HTMLAudioElement {
      const audio = new Audio(src);
      audio.preload = "auto";
      return audio;
   }

   private play(soundName: SoundName): void {
      if (!this._enabled) {
         return;
      }

      const audio = this._sounds[soundName];
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch((error: unknown) => {
         console.warn(`Could not play sound "${soundName}"`, error);
      });
   }
}

export default SoundsManager;
