export interface PorcelainV1Record {
  status: string;
  path: string;
  originalPath?: string;
}

/** @id CODE-M5-WAVE0-HANDOFF-PORCELAIN-001
 * @implements REQ-M5-WAVE0-HANDOFF-001
 */
export function parsePorcelainV1Z(output: string): PorcelainV1Record[] {
  const entries = output.split('\0');
  const records: PorcelainV1Record[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const record: PorcelainV1Record = {
      status,
      path: entry.slice(3),
    };
    if (/[RC]/.test(status)) {
      const originalPath = entries[index + 1];
      if (originalPath) {
        record.originalPath = originalPath;
        index += 1;
      }
    }
    records.push(record);
  }
  return records;
}
