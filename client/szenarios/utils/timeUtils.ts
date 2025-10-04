/**
 * Time conversion utilities for the scenario editor
 */

/**
 * Converts a time string to minutes (with fractional seconds)
 * @param time - Time string in format HH:mm[:ss] or ISO time
 * @returns Total minutes as a decimal number
 */
export function toMinutes(time: string): number {
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

/**
 * Converts minutes to a time string in HH:mm:ss format
 * @param mins - Total minutes (can be decimal for fractional seconds)
 * @returns Time string in format HH:mm:ss
 */
export function minutesToString(mins: number): string {
   const totalSeconds = Math.max(0, Math.round(mins * 60));
   const h = Math.floor(totalSeconds / 3600);
   const m = Math.floor((totalSeconds % 3600) / 60);
   const s = totalSeconds % 60;
   return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

