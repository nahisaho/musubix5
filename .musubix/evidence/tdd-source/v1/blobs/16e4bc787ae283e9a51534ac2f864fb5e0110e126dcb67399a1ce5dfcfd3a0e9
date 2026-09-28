import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { resolvePortableNpmInvocation } from '../packages/analysis/src/process.js';

describe('package archive compatibility', () => {
  /**
   * @id TEST-M5-COMPAT-005
   * @verifies REQ-M5-COMPAT-005
   */
  it('TEST-M5-COMPAT-005 includes the public APIs and installation assets', () => {
     const packCheck = resolvePortableNpmInvocation(['run', 'pack:check']);
     expect(() => execFileSync(packCheck.command, packCheck.args, {
       cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      stdio: 'pipe',
    })).not.toThrow();
  });
});
