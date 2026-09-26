#!/usr/bin/env node
/**
 * @id CODE-M5-NPM-REGISTRY-DEADLINE-001
 * @implements REQ-M5-WAVE1-PUBLISH-001
 * @design DES-M5-WAVE1-PUBLISH-001
 */

import { appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyNpmRegistryQuery } from '../dist/packages/analysis/src/release-workflow.js';

export const DEFAULT_REGISTRY_INTEGRITY_POLICY = Object.freeze({
  registryQueryTimeoutSeconds: 15,
  registryQueryKillAfterSeconds: 2,
  registryInnerDeadlineSeconds: 240,
  registryBackoffSeconds: Object.freeze([5, 10, 15, 20, 25]),
});

const SRI_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

function failure(reason, registryVisible = false) {
  return {
    published: true,
    registryVisible,
    integrityMatched: false,
    manualReconciliationRequired: true,
    reason,
  };
}

function isValidPolicy(policy) {
  return policy
    && Number.isFinite(policy.registryQueryTimeoutSeconds)
    && policy.registryQueryTimeoutSeconds > 0
    && Number.isFinite(policy.registryQueryKillAfterSeconds)
    && policy.registryQueryKillAfterSeconds > 0
    && Number.isFinite(policy.registryInnerDeadlineSeconds)
    && policy.registryInnerDeadlineSeconds > 0
    && Array.isArray(policy.registryBackoffSeconds)
    && policy.registryBackoffSeconds.length > 0
    && policy.registryBackoffSeconds.every(
      (seconds) => Number.isFinite(seconds) && seconds > 0,
    );
}

export async function runRegistryIntegrityVerification({
  packageSpec,
  localSri,
  policy,
  now,
  query,
  sleep,
}) {
  if (!packageSpec || !SRI_PATTERN.test(localSri) || !isValidPolicy(policy)) {
    return failure('invalid-input');
  }
  const startedAt = now();
  const deadline =
    startedAt + policy.registryInnerDeadlineSeconds * 1_000;
  const queryBudget =
    (policy.registryQueryTimeoutSeconds + policy.registryQueryKillAfterSeconds) * 1_000;
  let completedMissingQueries = 0;

  while (now() + queryBudget <= deadline) {
    let raw;
    try {
      raw = await query({
        packageSpec,
        timeoutSeconds: policy.registryQueryTimeoutSeconds,
        killAfterSeconds: policy.registryQueryKillAfterSeconds,
      });
    } catch {
      return failure('query-failed');
    }
    if (now() > deadline) return failure('deadline-exhausted');

    let classified;
    try {
      classified = classifyNpmRegistryQuery(raw.exitCode, raw.stdout);
    } catch {
      return failure('query-failed');
    }
    if (classified.status === 'found') {
      if (typeof classified.value !== 'string' || !SRI_PATTERN.test(classified.value)) {
        return failure('invalid-registry-sri', true);
      }
      if (classified.value !== localSri) {
        return failure('integrity-mismatch', true);
      }
      return {
        published: true,
        registryVisible: true,
        integrityMatched: true,
        manualReconciliationRequired: false,
        registrySri: classified.value,
      };
    }

    completedMissingQueries += 1;
    const latestNextQueryStart = deadline - queryBudget;
    const remainingSleep = Math.max(0, latestNextQueryStart - now());
    if (remainingSleep === 0) break;
    const backoffIndex = Math.min(
      completedMissingQueries - 1,
      policy.registryBackoffSeconds.length - 1,
    );
    const requestedSleep = policy.registryBackoffSeconds[backoffIndex] * 1_000;
    await sleep(Math.min(requestedSleep, remainingSleep));
  }

  return failure('deadline-exhausted');
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error('invalid command arguments');
    }
    values.set(name.slice(2), value);
  }
  const number = (name) => {
    const value = Number(values.get(name));
    if (!Number.isFinite(value) || value <= 0) throw new Error(`invalid --${name}`);
    return value;
  };
  const backoffSeconds = (values.get('backoff-seconds') ?? '')
    .split(',')
    .map(Number);
  if (backoffSeconds.length === 0 || backoffSeconds.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('invalid --backoff-seconds');
  }
  return {
    packageSpec: values.get('package-spec'),
    localSri: values.get('local-sri'),
    policy: {
      registryQueryTimeoutSeconds: number('query-timeout-seconds'),
      registryQueryKillAfterSeconds: number('query-kill-after-seconds'),
      registryInnerDeadlineSeconds: number('inner-deadline-seconds'),
      registryBackoffSeconds: backoffSeconds,
    },
  };
}

function queryRegistry({ packageSpec, timeoutSeconds, killAfterSeconds }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'timeout',
      [
        '--signal=TERM',
        `--kill-after=${killAfterSeconds}s`,
        `${timeoutSeconds}s`,
        'npm',
        'view',
        packageSpec,
        'dist.integrity',
        '--json',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (stderr) process.stderr.write(stderr);
      resolve({ exitCode: code ?? (signal ? 1 : 0), stdout });
    });
  });
}

async function emitOutputs(result) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error('GITHUB_OUTPUT is required');
  const lines = [
    `registry_visible=${result.registryVisible}`,
    `integrity_matched=${result.integrityMatched}`,
  ];
  if (result.integrityMatched) lines.push(`registry_sri=${result.registrySri}`);
  await appendFile(output, `${lines.join('\n')}\n`);
}

function diagnostic(reason) {
  const detail = {
    'deadline-exhausted': 'registry visibility deadline expired',
    'invalid-registry-sri': 'registry integrity is not valid SRI',
    'integrity-mismatch': 'visible registry integrity differs',
    'query-failed': 'registry query failed without explicit E404',
    'invalid-input': 'registry verification input is invalid',
  }[reason] ?? 'registry verification failed';
  return `RELEASE_PUBLISH_INTEGRITY_MISMATCH: ${detail}`;
}

async function main() {
  let result;
  try {
    const input = parseArguments(process.argv.slice(2));
    result = await runRegistryIntegrityVerification({
      ...input,
      now: () => performance.now(),
      query: queryRegistry,
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    });
  } catch {
    result = failure('invalid-input');
  }
  await emitOutputs(result);
  if (!result.integrityMatched) {
    console.error(diagnostic(result.reason));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
