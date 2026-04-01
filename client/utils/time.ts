function toDisplayClock(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export const UNSET_TIME_PLACEHOLDER = '';

export function formatTimeFromSeconds(seconds?: number | null, emptyValue = ''): string {
  if (seconds === null || seconds === undefined) {
    return emptyValue;
  }

  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600) % 24;
  const minutes = Math.floor((clamped % 3600) / 60);
  return toDisplayClock(hours, minutes);
}

export function formatTimeFromIso(time: string | null | undefined, emptyValue = ''): string {
  if (!time) {
    return emptyValue;
  }

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return emptyValue;
  }

  // DateTime.MinValue from backend means "not set".
  if (parsed.getUTCFullYear() <= 1) {
    return emptyValue;
  }

  return toDisplayClock(parsed.getHours(), parsed.getMinutes());
}
