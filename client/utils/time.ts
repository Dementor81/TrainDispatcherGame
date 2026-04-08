function toDisplayClock(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export const UNSET_TIME_PLACEHOLDER = '';

export function formatTimeFromIso(time: string | null | undefined, emptyValue = ''): string {
  if (!time) {
    return emptyValue;
  }

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return emptyValue;
  }

  return toDisplayClock(parsed.getHours(), parsed.getMinutes());
}
