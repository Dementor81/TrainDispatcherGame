export class Tools {
  public static generateGuid(): string {
    // RFC4122 version 4 compliant GUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xf) >> 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  public static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  public static between(value: number, min: number, max: number): boolean {
    return value >= min && value <= max || value <= min && value >= max;
  }

  public static isQueryParamTrue(paramName: string): boolean {
    try {
      const value = new URLSearchParams(window.location.search).get(paramName);
      if (!value) return false;
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
    } catch {
      return false;
    }
  }

  public static is(value: any, values: any[]): boolean {
    return values.includes(value);
  }
}

export default Tools;
