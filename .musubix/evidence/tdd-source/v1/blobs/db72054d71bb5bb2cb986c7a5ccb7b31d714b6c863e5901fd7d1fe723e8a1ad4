import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('candidate gate checkout bytes', () => {
  /**
   * @id TEST-M5-RELEASE-002-EOL-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-002-EOL-001 preserves LF text bytes on every matrix runner', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const attributes = readFileSync(`${root}/.gitattributes`, 'utf8');

    expect(attributes.split(/\r?\n/)).toContain('* text=auto eol=lf');
  });
});
