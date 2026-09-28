import { readdirSync, readFileSync } from 'node:fs';
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

  /**
   * @id TEST-M5-COMPAT-007
   * @verifies REQ-M5-COMPAT-005 REQ-M5-COMPAT-006
   */
  it('TEST-M5-COMPAT-007 ships musubix5-native skill commands', () => {
    const skillsRoot = new URL('../.github/skills/', import.meta.url);
    const skillSources = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(new URL(`${entry.name}/SKILL.md`, skillsRoot), 'utf8'));

    for (const source of skillSources) {
      expect(source).not.toContain('npx musubix3');
      expect(source).not.toContain("repository's exact `musubix3` CLI");
    }
  });
});
