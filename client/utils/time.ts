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

/** Arrival cell for a station row: hidden when the train does not stop. */
export function formatArrivalTimeForStation(
  arrivalTime: string | null | undefined,
  stops: boolean,
  emptyValue = '',
): string {
  if (!stops) return emptyValue;
  return formatTimeFromIso(arrivalTime, emptyValue);
}
