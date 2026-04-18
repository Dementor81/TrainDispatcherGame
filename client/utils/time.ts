function toDisplayClock(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export const UNSET_TIME_PLACEHOLDER = '';

/** Pass-through: no station stop; only departure is meaningful. */
export function isPassThroughStop(
  arrivalTime: string | null | undefined,
  departureTime: string | null | undefined,
): boolean {
  if (!arrivalTime || !departureTime) return false;
  const a = new Date(arrivalTime).getTime();
  const d = new Date(departureTime).getTime();
  if (Number.isNaN(a) || Number.isNaN(d)) return false;
  return a === d;
}

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

/** Arrival cell for a station row: hidden when train passes through (arrival === departure). */
export function formatArrivalTimeForStation(
  arrivalTime: string | null | undefined,
  departureTime: string | null | undefined,
  emptyValue = '',
): string {
  if (isPassThroughStop(arrivalTime, departureTime)) return emptyValue;
  return formatTimeFromIso(arrivalTime, emptyValue);
}
