import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import * as lfs from '../packages/analysis/src/tdd-source-lfs.js';
import { publishSourceFile } from '../packages/analysis/src/tdd-source-storage.js';

/** @id TEST-M5-CI-WINDOWS-DURABILITY-001
 * @verifies REQ-M5-CI-005
 */
it('TEST-M5-CI-WINDOWS-DURABILITY-001 tolerates only closed phase-specific directory failures and preserves publication diagnostics',async () => {
  const api=lfs as unknown as Record<string,(...args: unknown[]) => Promise<unknown>>;
  const allCodes=['EISDIR','EPERM','EINVAL','ENOTSUP','EBADF','ENOENT','EACCES','EIO','EEXIST'];
  const windows=['EISDIR','EPERM','EINVAL','ENOTSUP','EBADF'];
  const posix=['EINVAL','ENOTSUP','EISDIR','EBADF'];
  for(const platform of ['win32','linux','darwin']) {
    for(const phase of ['open','sync']) {
      for(const code of allCodes) {
        let closed=false;
        const failure=Object.assign(new Error(`${phase}:${code}`),{ code });
        const operations={
          open: async () => {
            if(phase==='open') throw failure;
            return {
              sync: async () => { throw failure; },
              close: async () => { closed=true; },
            };
          },
        };
        const result=api.flushDirectory!('published-parent',platform,operations);
        const tolerated=platform==='win32'? windows.includes(code):phase==='sync'&&posix.includes(code);
        if(tolerated) await expect(result).resolves.toBeUndefined();
        else await expect(result).rejects.toBe(failure);
        expect(closed).toBe(phase==='sync');
      }
    }
  }
  const root=mkdtempSync(join(tmpdir(),'durability-'));
  try {
    const path='.musubix/evidence/tdd-source/v1/blobs/'+'a'.repeat(64);
    await publishSourceFile(root,path,Buffer.from('durable\n'));
    expect(readFileSync(join(root,path),'utf8')).toBe('durable\n');
    await expect(publishSourceFile(root,path,Buffer.from('collision\n'))).rejects.toThrow(/TDD_SOURCE_REPLAY_INVALID/);
    for(const code of allCodes) {
      await expect(publishSourceFile(root,path,Buffer.from('durable\n'),async () => {
        throw Object.assign(new Error(`authorization:${code}`),{ code });
      })).rejects.toThrow(`authorization:${code}`);
    }
  } finally {
    rmSync(root,{ recursive: true,force: true });
  }
});
