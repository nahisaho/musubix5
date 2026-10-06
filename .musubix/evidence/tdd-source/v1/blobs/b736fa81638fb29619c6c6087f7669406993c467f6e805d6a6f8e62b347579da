import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** @id CODE-M5-CI-JOB-TIMING-001
 * @implements REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-004
 */
const env = process.env;
const preparationStartedAt = Date.now();
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? '')
  || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('CANDIDATE_JOB_TIMING_INVALID');
const jobs = [];
for (let page = 1; ; page++) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/1/jobs?per_page=100&page=${page}`, {
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('CANDIDATE_JOB_TIMING_UNAVAILABLE');
  const data = await response.json();
  if (!Array.isArray(data.jobs)) throw new Error('CANDIDATE_JOB_TIMING_INVALID');
  jobs.push(...data.jobs);
  if (data.jobs.length < 100) break;
  if (page >= 100) throw new Error('CANDIDATE_JOB_TIMING_INVALID');
}
const matching = jobs.filter((job) => job.name === `${env.MATRIX_OS}-node24` && job.run_attempt === 1);
if (matching.length !== 1) throw new Error('CANDIDATE_JOB_TIMING_INVALID');
const job = matching[0], observedAt = Date.now(), jobStartedAt = Date.parse(job.started_at);
if (!Number.isSafeInteger(jobStartedAt) || observedAt < jobStartedAt || observedAt - jobStartedAt > 180_000) throw new Error('CANDIDATE_JOB_CLOCK_SKEW');
const projection = { jobId: job.id, runId: env.GITHUB_RUN_ID, runAttempt: 1, name: job.name, startedAt: job.started_at, observedAt };
const bytes = `${JSON.stringify(Object.fromEntries(Object.entries(projection).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))))}\n`;
const digest = createHash('sha256').update(bytes).digest('hex');
await writeFile(join(env.RUNNER_TEMP, 'candidate-job-timing.json'), bytes, { flag: 'wx', mode: 0o600 });
await appendFile(env.GITHUB_ENV, `CANDIDATE_JOB_STARTED_AT=${jobStartedAt}\nCANDIDATE_JOB_TIMING_DIGEST=${digest}\nCANDIDATE_PREPARATION_DEADLINE=${preparationStartedAt + 120_000}\n`);
