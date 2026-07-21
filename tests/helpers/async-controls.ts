import { vi } from "vitest";

export type AsyncBarrier = {
  readonly arrivals: number;
  wait: () => Promise<void>;
};

export function createBarrier(parties: number): AsyncBarrier {
  if (!Number.isInteger(parties) || parties < 1) {
    throw new Error("Barrier parties must be a positive integer");
  }

  let arrivals = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    get arrivals() {
      return arrivals;
    },
    async wait() {
      arrivals += 1;
      if (arrivals > parties) {
        throw new Error(`Barrier expected ${parties} participants`);
      }
      if (arrivals === parties) release();
      await released;
    },
  };
}

export async function withFrozenTime<T>(
  instant: Date | string | number,
  callback: () => Promise<T> | T,
): Promise<T> {
  vi.useFakeTimers();
  vi.setSystemTime(instant);
  try {
    return await callback();
  } finally {
    vi.useRealTimers();
  }
}

export function createFailureController<Point extends string>() {
  const failures = new Map<Point, Error>();

  return {
    failNext(point: Point, error: Error) {
      failures.set(point, error);
    },
    clear(point?: Point) {
      if (point === undefined) failures.clear();
      else failures.delete(point);
    },
    async run<T>(point: Point, operation: () => Promise<T> | T): Promise<T> {
      const failure = failures.get(point);
      failures.delete(point);
      if (failure) throw failure;
      return operation();
    },
    take(point: Point) {
      const failure = failures.get(point) ?? null;
      failures.delete(point);
      return failure;
    },
  };
}
