export {
  countedExecFileSync as execFileSync, countedSpawnSync as spawnSync, countedExecSync as execSync,
  countedSpawn as spawn, countedExecFile as execFile, countedExec as exec,
} from '../../packages/analysis/src/process.js';
export type { ChildProcess, SpawnOptions, ExecFileOptions, ExecFileSyncOptions, SpawnSyncOptions } from 'node:child_process';
