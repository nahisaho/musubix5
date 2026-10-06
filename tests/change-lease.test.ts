import { execFileSync } from './fixtures/counted-process.js';
import { mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { afterEach,describe,expect,it } from 'vitest';

const temporaryDirectories: string[]=[];

afterEach(() => {
  for(const directory of temporaryDirectories.splice(0)) {
    rmSync(directory,{ recursive: true,force: true });
  }
});

describe('CHANGE writer lease',() => {
  /** @id TEST-M5-CHECKPOINT-NONGIT-ORDER-001
   * @verifies REQ-M5-LIFECYCLE-006
   * @design DES-M5-004
   */
  it('TEST-M5-CHECKPOINT-NONGIT-ORDER-001 preserves serialized evidence recording in initialized non-Git consumer projects', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-nongit-order-'));
    temporaryDirectories.push(root);
    const { appendEvidenceOrder, inspectEvidenceOrder } = await import('../packages/analysis/src/order.js');
    const records = await Promise.all([1, 2].map((index) => appendEvidenceOrder(root, {
      kind: 'tdd', entityId: `cycle-${index}`, phase: 'red',
    })));
    expect(records.map((record) => record.sequence).sort()).toEqual([1, 2]);
    expect((await inspectEvidenceOrder(root)).valid).toBe(true);
  });

  /** @id TEST-M5-CHECKPOINT-ORDER-001
   * @verifies REQ-M5-LIFECYCLE-006
   * @design DES-M5-004
   */
  it('TEST-M5-CHECKPOINT-ORDER-001 serializes evidence orders and reuses a supplied append session',async () => {
    mkdirSync(resolve('.musubix/cache'),{ recursive: true });
    const root=mkdtempSync(resolve('.musubix/cache/checkpoint-order-'));
    temporaryDirectories.push(root);
    execFileSync('git',['init','--quiet',root]);
    const journal=await import('../packages/analysis/src/journal.js');
    const order=await import('../packages/analysis/src/order.js');
    const records=await Promise.all(Array.from({ length: 6 },(_,index) =>
      order.appendEvidenceOrder(root,{ kind: 'change',entityId: `CHANGE-${index}`,phase: 'g5:impact' })));
    expect(records.map((record) => record.sequence).sort()).toEqual([1,2,3,4,5,6]);
    const append=order.appendEvidenceOrder as unknown as (
      root: string,input: { kind: 'change'; entityId: string; phase: string },
      session: import('../packages/analysis/src/journal.js').ChangeLease,
    ) => Promise<{ sequence: number }>;
    await journal.withOrderLease(root,async (session) => {
      expect((await append(root,{ kind: 'change',entityId: 'CHANGE-0017',phase: 'g5:red' },session)).sequence).toBe(7);
      const owner=JSON.parse(readFileSync(join(session.path,'owner.json'),'utf8'));
      writeFileSync(join(session.path,'owner.json'),JSON.stringify({ ...owner,expiresAt: 0 }));
      await expect(append(root,{ kind: 'change',entityId: 'CHANGE-0017',phase: 'g5:green' },session))
        .rejects.toThrow('LEASE_FENCED');
    });
    expect((await order.inspectEvidenceOrder(root)).valid).toBe(true);
    expect((await order.loadEvidenceOrder(root))!.records).toHaveLength(7);
  });

  /** @id TEST-M5-CHECKPOINT-SESSION-001
   * @verifies REQ-M5-LIFECYCLE-006
   * @design DES-M5-004
   */
  it('TEST-M5-CHECKPOINT-SESSION-001 serializes four same-CHANGE and two cross-CHANGE writers and fences supplied sessions',async () => {
    mkdirSync(resolve('.musubix/cache'),{ recursive: true });
    const root=mkdtempSync(resolve('.musubix/cache/checkpoint-session-'));
    temporaryDirectories.push(root);
    execFileSync('git',['init','--quiet',root]);
    type Lease=import('../packages/analysis/src/journal.js').ChangeLease;
    type Set={ changeLeases: Lease[]; projectionLease: Lease; appendSession?: Lease };
    const journal=await import('../packages/analysis/src/journal.js');
    const api=journal as unknown as {
      withChangeProjectionLeases<T>(root: string,ids: string[],operation: (leases: Set) => Promise<T>): Promise<T>;
      withOrderLease<T>(root: string,operation: (session: Lease) => Promise<T>): Promise<T>;
      writeChangeProjection(root: string,leases: Set,value: unknown): Promise<void>;
      renewLease(lease: Lease): Promise<void>;
      appendJournalRecord(root: string,input: import('../packages/analysis/src/journal.js').JournalRecordInput,session: Lease): Promise<unknown>;
    };
    const projection=join(root,'.musubix/evidence/changes.json');
    const started=performance.now();
    await Promise.all(['CHANGE-0001','CHANGE-0001','CHANGE-0001','CHANGE-0001','CHANGE-0002','CHANGE-0003']
      .map((id) => api.withChangeProjectionLeases(root,[id],async (leases) => {
        let state: Record<string,number>={};
        try { state=JSON.parse(readFileSync(projection,'utf8')); } catch { /* initially absent */ }
        await new Promise((done) => setTimeout(done,50));
        state[id]=(state[id]??0)+1;
        await api.writeChangeProjection(root,leases,state);
      })));
    expect(JSON.parse(readFileSync(projection,'utf8'))).toEqual({
      'CHANGE-0001': 4,'CHANGE-0002': 1,'CHANGE-0003': 1,
    });
    expect(performance.now()-started).toBeLessThan(10_000);
    await api.withChangeProjectionLeases(root,['CHANGE-0002','CHANGE-0001'],async (leases) => {
      expect(leases.changeLeases.map((lease) => lease.path.split('/').at(-1)))
        .toEqual(['change-CHANGE-0001','change-CHANGE-0002']);
      const oldOwner=JSON.parse(readFileSync(join(leases.projectionLease.path,'owner.json'),'utf8'));
      await api.renewLease(leases.projectionLease);
      expect(JSON.parse(readFileSync(join(leases.projectionLease.path,'owner.json'),'utf8')).expiresAt)
        .toBeGreaterThanOrEqual(oldOwner.expiresAt);
      await api.withOrderLease(root,async (session) => {
        const input={ stream: 'normal' as const,changeId: 'CHANGE-0001',kind: 'fixture',idempotencyKey: 'one',payload: {} };
        await api.appendJournalRecord(root,input,session);
        const owner=JSON.parse(readFileSync(join(session.path,'owner.json'),'utf8'));
        writeFileSync(join(session.path,'owner.json'),JSON.stringify({ ...owner,expiresAt: 0 }));
        await expect(api.renewLease(session)).rejects.toThrow('LEASE_FENCED');
        await expect(api.appendJournalRecord(root,{ ...input,idempotencyKey: 'two' },session))
          .rejects.toThrow('LEASE_FENCED');
        await expect(api.writeChangeProjection(root,{ ...leases,appendSession: session },{}))
          .rejects.toThrow('LEASE_FENCED');
      });
    });
    expect((await journal.loadJournalRecords(root)).length).toBe(1);
    expect(JSON.parse(readFileSync(projection,'utf8'))['CHANGE-0001']).toBe(4);
  },20_000);

  /** @id TEST-M5-CHECKPOINT-LEASE-001
   * @verifies REQ-M5-LIFECYCLE-006
   * @design DES-M5-004
   */
  it('TEST-M5-CHECKPOINT-LEASE-001 fences durable-counter loss before journal or projection persistence',async () => {
    mkdirSync(resolve('.musubix/cache'),{ recursive: true });
    const root=mkdtempSync(resolve('.musubix/cache/checkpoint-lease-'));
    temporaryDirectories.push(root);
    execFileSync('git',['init','--quiet',root]);
    const journal=await import('../packages/analysis/src/journal.js');
    const lease=await journal.acquireChangeLease(root,'CHANGE-0002');
    const counter=join(dirname(lease.path),'fencing','change-CHANGE-0002.json');
    writeFileSync(counter,JSON.stringify({ fencingToken: lease.fencingToken+1 }));
    await expect(journal.assertChangeLeaseCurrent(lease)).rejects.toThrow('LEASE_FENCED');
    await journal.releaseChangeLease(lease);
  });

  /**
   * @id TEST-M5-LIFECYCLE-004
   * @verifies REQ-M5-LIFECYCLE-004
   * @supersededBy TEST-M5-LIFECYCLE-LEASE-SHARING-001
   */
  it('TEST-M5-LIFECYCLE-004 excludes concurrent writers and fences expired holders',async () => {
    const root=mkdtempSync(join(tmpdir(),'musubix5-change-lease-'));
    temporaryDirectories.push(root);
    execFileSync('git',['init','--quiet',root]);
    const {
      acquireChangeLease,
      assertChangeLeaseCurrent,
      releaseChangeLease,
      tryAcquireChangeLease,
    }=await import('../packages/analysis/src/journal.js');

    const first=await acquireChangeLease(root,'CHANGE-0002');
    expect(await tryAcquireChangeLease(root,'CHANGE-0002')).toBeNull();

    const owner=JSON.parse(readFileSync(join(first.path,'owner.json'),'utf8')) as {
      expiresAt: number;
    };
    writeFileSync(join(first.path,'owner.json'),JSON.stringify({ ...owner,expiresAt: 0 }));

    const second=await acquireChangeLease(root,'CHANGE-0002');
    expect(second.fencingToken).toBe(first.fencingToken+1);
    await expect(assertChangeLeaseCurrent(first)).rejects.toThrow('LEASE_FENCED');
    await expect(assertChangeLeaseCurrent(second)).resolves.toBeUndefined();
    await releaseChangeLease(second);
  });
});
