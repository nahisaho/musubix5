import { performance } from 'node:perf_hooks';

// Vitest captures Date.now for hook deadlines at import time. Keep that reference
// steady; the setup file subsequently injects wall-clock jumps into application code.
const epoch = Date.now();
const start = performance.now();
Date.now = () => Math.floor(epoch + performance.now() - start);
