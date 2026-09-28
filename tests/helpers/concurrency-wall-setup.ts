import { afterEach, beforeEach } from 'vitest';
import { vi } from 'vitest';

let restore: () => void;

beforeEach((context) => {
  const origin = Date.now();
  const start = performance.now();
  let offset = 0;
  const jumps: number[] = [];
  const wall = vi.spyOn(Date, 'now').mockImplementation(() => origin + performance.now() - start + offset);
  const timer = setInterval(() => {
    offset = jumps.length % 2 === 0 ? 6_000 : -6_000;
    jumps.push(offset);
  }, 100);
  restore = () => {
    clearInterval(timer);
    wall.mockRestore();
    Object.assign(context.task.meta, {
      clockInjection: { clock: 'performance.now', offsetsMs: [...new Set(jumps)], transitions: jumps.length },
    });
  };
});

afterEach(() => restore());
