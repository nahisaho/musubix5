import { execFileSync } from 'node:child_process';
import { mkdirSync,mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { expect,it } from 'vitest';

/** @id TEST-M5-CI-WINDOWS-FILENAME-001
 * @verifies REQ-M5-CI-007
 */
it('TEST-M5-CI-WINDOWS-FILENAME-001 rejects every nonportable name class and retains a 7001-entry over-1MB ordered tree',async () => {
  const url=new URL('./fixtures/portable-path.js',import.meta.url);
  const api: unknown=await import(url.href);
  if(!api||typeof api!=='object'||!('assertPortableFixturePath' in api)||typeof api.assertPortableFixturePath!=='function') {
    throw new Error('Missing portable fixture validator');
  }
  const validator=api.assertPortableFixturePath;
  const validate=(root: string,path: string,seen?: Set<string>): void => { validator(root,path,seen); };
  const root=mkdtempSync(join(tmpdir(),'portable-'));
  try {
    for(const invalid of [
      '','.','..','../escape','/absolute','a//b','control\nname','tab\tname','nul\0name',
      ...['<','>',':','"','|','?','*','\\'].map((value) => 'invalid'+value),
      'trailing.','trailing ',...['CON','PRN','AUX','NUL',
        ...Array.from({ length: 9 },(_,i) => `COM${i+1}`),
        ...Array.from({ length: 9 },(_,i) => `LPT${i+1}`)],
      'e\u0301','a'.repeat(121),'雪'.repeat(41),
    ]) {
      expect(() => validate(root,invalid),JSON.stringify(invalid)).toThrow(/PORTABLE_FIXTURE_PATH_INVALID/);
    }
    expect(() => validate(root+'/'.repeat(1)+'x'.repeat(230),'small')).toThrow(/PORTABLE_FIXTURE_PATH_INVALID/);
    const seen=new Set<string>();
    validate(root,'Case/Name',seen);
    expect(() => validate(root,'case/name',seen)).toThrow(/PORTABLE_FIXTURE_PATH_INVALID/);
    const unicodeSeen=new Set<string>();
    validate(root,'É',unicodeSeen);
    expect(() => validate(root,'é',unicodeSeen)).toThrow(/PORTABLE_FIXTURE_PATH_INVALID/);
    const paths=[
      ...Array.from({ length: 7000 },(_,index) => `archive/${String(index).padStart(5,'0')}-${'a'.repeat(110)}`),
      'archive/space 雪 file',
    ];
    const names=new Set<string>();
    for(const path of paths) {
      validate(root,path,names);
      mkdirSync(dirname(join(root,path)),{ recursive: true });
      writeFileSync(join(root,path),'raw\n');
    }
    execFileSync('git',['-C',root,'init','--quiet']);
    execFileSync('git',['-C',root,'config','core.autocrlf','false']);
    execFileSync('git',['-C',root,'add','archive']);
    const tree=execFileSync('git',['-C',root,'write-tree'],{ encoding: 'utf8' }).trim();
    const raw=execFileSync('git',['-C',root,'ls-tree','-r','-z',tree],{ maxBuffer: 16*1024*1024 });
    expect(raw.byteLength).toBeGreaterThan(1_000_000);
    const entries=raw.toString('utf8').split('\0').filter(Boolean).map((row) => row.slice(row.indexOf('\t')+1));
    expect(entries).toHaveLength(7001);
    expect(entries).toEqual([...paths].sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b))));
  } finally { rmSync(root,{ recursive: true,force: true }); }
});
