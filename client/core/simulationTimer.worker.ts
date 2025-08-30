// Minimal worker that posts a 'tick' message at a fixed interval.
// Uses setInterval inside the worker context. Browsers may still throttle,
// but workers tend to be less impacted than the main thread.

let intervalId: number | null = null;

type StartMessage = {
  type: 'start';
  intervalMs: number;
};

type ControlMessage = StartMessage | { type: 'stop' };

self.onmessage = (event: MessageEvent<ControlMessage>) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'start') {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    const intervalMs = Math.max(1, Math.floor(data.intervalMs));
    intervalId = setInterval(() => {
      // Post a simple tick; main thread can compute dt if needed
      (self as any).postMessage({ type: 'tick', now: Date.now() });
    }, intervalMs) as unknown as number;
  } else if (data.type === 'stop') {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};

export {};


