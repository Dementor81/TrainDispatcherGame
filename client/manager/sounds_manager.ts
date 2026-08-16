import { EventManager } from "./event_manager";
import switchToggleSound from "../assets/sounds/switch_toggle.mp3";
import approvalRequestSound from "../assets/sounds/approval_request.mp3";

type SoundName = "switchToggled" | "incomingTrain" | "approvalRequested";

export class SoundsManager {
   private readonly _eventManager: EventManager;
   private readonly _sounds: Record<SoundName, HTMLAudioElement>;

   constructor(eventManager: EventManager) {
      this._eventManager = eventManager;
      const incomingAudio = this.createAudio(approvalRequestSound);
      this._sounds = {
         switchToggled: this.createAudio(switchToggleSound),
         incomingTrain: incomingAudio,
         approvalRequested: incomingAudio,
      };
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

   private createAudio(src: string): HTMLAudioElement {
      const audio = new Audio(src);
      audio.preload = "auto";
      return audio;
   }

   private play(soundName: SoundName): void {
      const audio = this._sounds[soundName];
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch((error: unknown) => {
         console.warn(`Could not play sound "${soundName}"`, error);
      });
   }
}

export default SoundsManager;
