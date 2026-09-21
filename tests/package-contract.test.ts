import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  name?: unknown;
  bin?: unknown;
}

function readPackageManifest(): PackageManifest {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageManifest;
}

describe('package compatibility contract', () => {
  /**
   * @id TEST-M5-COMPAT-006
   * @verifies REQ-M5-COMPAT-006
   */
  it('TEST-M5-COMPAT-006 publishes only the musubix5 executable', () => {
    const manifest = readPackageManifest();

    expect(manifest.name).toBe('musubix5');
    expect(manifest.bin).toEqual({
      musubix5: 'dist/packages/cli/src/main.js',
    });
  });
});
