import { basename } from 'node:path';
import {
  error, validateConstitution, validateDesign, validateRequirements, type Diagnostic,
} from '../../domain/src/index.js';
import type { ApprovalConfig } from './config.js';
import { loadApprovalProjectionConfig } from './config.js';
import { canonicalBytes, sha256 } from './canonical.js';
import { exists, files, readText, snapshot, within } from './files.js';
import {
  domainOwning, domainsConfigured, featureOwningDesignFile, featureOwningRequirement, resolveDomains,
  type ResolvedDomain,
} from './approval-domains.js';
import {
  buildReleaseCandidateContent, releaseExclusionIdentity, type ReleaseExclusion,
} from './release-manifest.js';
import {
  resolveNormativeArtifacts, snapshotNormativeArtifacts,
} from './approval-normative.js';

export {
  domainsConfigured, domainOwning, featureOwningDesignFile, featureOwningRequirement, resolveDomains,
  type ResolvedDomain,
} from './approval-domains.js';

export const approvalStages = ['requirements', 'design', 'release'] as const;
export type ApprovalStage = typeof approvalStages[number];
export type ApprovalStatus = 'approved' | 'missing' | 'stale';

export interface ApprovalManifest {
  schemaVersion: 1;
  stage: ApprovalStage;
  domain?: string;
  features?: string[];
  changeId?: string;
  artifacts: Record<string, string>;
  projection: unknown;
  exclusions: ReleaseExclusion[];
  artifactSha256: string;
}

export interface ApprovalEvidence extends ApprovalManifest {
  schemaVersion: 1;
  approver: string;
  approvedAt: string;
}

export interface ApprovalStageValidation {
  stage: ApprovalStage;
  domain?: string;
  required: boolean;
  present: boolean;
  status: ApprovalStatus;
  evidence: ApprovalEvidence | null;
  currentArtifactSha256: string;
  diagnostics: Diagnostic[];
}

export interface DomainApprovalValidation {
  name: string;
  stages: ApprovalStageValidation[];
}

export interface ApprovalValidation {
  schemaVersion: 1;
  mode: ApprovalConfig['mode'];
  present: boolean;
  valid: boolean;
  stages: ApprovalStageValidation[];
  domain?: string;
  domains?: DomainApprovalValidation[];
  release?: ApprovalStageValidation;
  diagnostics: Diagnostic[];
}

export function approvalPath(stage: ApprovalStage, domain?: string): string {
  return domain ? `.musubix/evidence/approvals/domains/${domain}/${stage}.json` : `.musubix/evidence/approvals/${stage}.json`;
}

const featureRequirementsPattern = /^\.musubix\/features\/([^/]+)\/requirements\.md$/;
const featureDesignPattern = /^\.musubix\/features\/([^/]+)\/design\.md$/;

export async function approvalManifest(
  root: string,
  stage: ApprovalStage,
  domain?: ResolvedDomain,
  releaseChangeId?: string,
): Promise<ApprovalManifest> {
  if (stage === 'release' && domain) {
    throw new Error('APPROVAL_DOMAIN_MISMATCH: release approval is repository-wide.');
  }
  let projection: unknown = null;
  if (stage !== 'release') {
    const config = await loadApprovalProjectionConfig(root);
    projection = stage === 'requirements'
      ? { schemaVersion: config.schemaVersion, approval: config.approval }
      : Object.fromEntries([
        'schemaVersion',
        'commands',
        'requiredChecks',
        'thresholds',
        'architecture',
        'codeGraph',
        'formal',
        'mutation',
        'tdd',
        'workflow',
        'attestation',
      ].map((key) => [key, config[key as keyof typeof config]]));
  }
  if (domain && stage !== 'release') {
    const artifacts = await snapshotNormativeArtifacts(
      root,
      await resolveNormativeArtifacts(root, stage, domain.features),
    );
    const identity = {
      schemaVersion: 1 as const,
      stage,
      domain: domain.name,
      artifacts,
      projection,
      exclusions: [],
    };
    return {
      ...identity,
      features: domain.features,
      artifactSha256: sha256(canonicalBytes(identity)),
    };
  }
  if (stage === 'release') {
    const content = await buildReleaseCandidateContent(root, releaseChangeId);
    const identity = {
      schemaVersion: 1 as const,
      stage,
      changeId: content.changeId,
      artifacts: content.artifacts,
      projection: null,
      exclusions: releaseExclusionIdentity(content.exclusions),
    };
    return {
      ...identity,
      exclusions: content.exclusions,
      artifactSha256: sha256(canonicalBytes(identity)),
    };
  }
  const artifacts = await snapshotNormativeArtifacts(
    root,
    await resolveNormativeArtifacts(root, stage),
  );
  const identity = {
    schemaVersion: 1 as const,
    stage,
    artifacts,
    projection,
    exclusions: [],
  };
  return { ...identity, artifactSha256: sha256(canonicalBytes(identity)) };
}

export function formatApprovalManifestText(manifest: ApprovalManifest): string {
  const lines = [
    `${manifest.stage} artifact manifest: ${manifest.artifactSha256}`,
    ...Object.entries(manifest.artifacts).map(([path, sha256]) => `INCLUDED ${path} ${sha256}`),
    ...(manifest.exclusions ?? []).map((entry) =>
      `EXCLUDED ${entry.path} ${entry.sha256} ${entry.reason}`),
  ];
  return lines.join('\n');
}

export async function loadApproval(root: string, stage: ApprovalStage, domain?: string): Promise<ApprovalEvidence | null> {
  const path = approvalPath(stage, domain);
  if (!await exists(within(root, path))) return null;
  const value = JSON.parse(await readText(root, path)) as Partial<ApprovalEvidence>;
  if (value.schemaVersion !== 1 || value.stage !== stage
    || typeof value.approver !== 'string' || !value.approver.trim()
    || typeof value.approvedAt !== 'string' || !Number.isFinite(Date.parse(value.approvedAt))
    || typeof value.artifactSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.artifactSha256)
    || !value.artifacts || typeof value.artifacts !== 'object' || Array.isArray(value.artifacts)
    || Object.entries(value.artifacts).some(([path, sha256]) => !path || path.startsWith('/')
      || path.includes('\0') || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256))
    || (value.exclusions !== undefined && (!Array.isArray(value.exclusions)
      || value.exclusions.some((entry) => !entry || typeof entry !== 'object'
        || typeof entry.path !== 'string' || !entry.path || entry.path.startsWith('/')
        || entry.path.includes('\0') || typeof entry.reason !== 'string' || !entry.reason
        || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))))
    || (stage === 'release' && (typeof value.changeId !== 'string' || !/^CHANGE-\d+$/.test(value.changeId)))
    || (domain !== undefined && (value.domain !== domain || !Array.isArray(value.features) || value.features.some((f) => typeof f !== 'string')))) {
    throw new Error(`Invalid ${stage} approval evidence.`);
  }
  return value as ApprovalEvidence;
}

export async function validateApprovalStage(
  root: string,
  stage: ApprovalStage,
  config: ApprovalConfig,
  domain?: ResolvedDomain,
): Promise<ApprovalStageValidation> {
  const path = approvalPath(stage, domain?.name);
  const present = await exists(within(root, path));
  let evidence: ApprovalEvidence | null;
  try {
    evidence = await loadApproval(root, stage, domain?.name);
  } catch (cause) {
    const required = config.mode === 'required';
    const diagnostics = [error(
      'APPROVAL_SCHEMA',
      cause instanceof Error ? cause.message : String(cause),
      path,
    )];
    try {
      const current = await approvalManifest(root, stage, domain);
      return { stage, ...(domain ? { domain: domain.name } : {}), required, present, status: 'stale', evidence: null, currentArtifactSha256: current.artifactSha256, diagnostics };
    } catch (manifestCause) {
      const message = manifestCause instanceof Error ? manifestCause.message : String(manifestCause);
      if (stage !== 'release' || !message.startsWith('APPROVAL_CANDIDATE_UNAVAILABLE:')) {
        throw manifestCause;
      }
      diagnostics.push(error('APPROVAL_CANDIDATE_UNAVAILABLE', message, path));
      return {
        stage,
        ...(domain ? { domain: domain.name } : {}),
        required,
        present,
        status: 'stale',
        evidence: null,
        currentArtifactSha256: sha256(canonicalBytes({
          schemaVersion: 1,
          stage,
          diagnostic: 'APPROVAL_CANDIDATE_UNAVAILABLE',
        })),
        diagnostics,
      };
    }
  }
  const required = config.mode === 'required';
  let current: ApprovalManifest;
  try {
    current = await approvalManifest(root, stage, domain, stage === 'release' ? evidence?.changeId : undefined);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (stage !== 'release' || !message.startsWith('APPROVAL_CANDIDATE_UNAVAILABLE:')) throw cause;
    const diagnostics = [error('APPROVAL_CANDIDATE_UNAVAILABLE', message, path)];
    const diagnosticSha256 = sha256(canonicalBytes({
      schemaVersion: 1,
      stage,
      diagnostic: 'APPROVAL_CANDIDATE_UNAVAILABLE',
    }));
    return {
      stage,
      ...(domain ? { domain: domain.name } : {}),
      required,
      present,
      status: evidence ? 'stale' : 'missing',
      evidence,
      currentArtifactSha256: diagnosticSha256,
      diagnostics,
    };
  }
  if (!evidence) {
    const diagnostics = required
      ? [error('APPROVAL_MISSING', `Current ${stage} approval is required.`, path)]
      : [];
    return { stage, ...(domain ? { domain: domain.name } : {}), required, present: false, status: 'missing', evidence: null, currentArtifactSha256: current.artifactSha256, diagnostics };
  }
  const stale = evidence.artifactSha256 !== current.artifactSha256
    || JSON.stringify(evidence.artifacts) !== JSON.stringify(current.artifacts)
    || JSON.stringify(releaseExclusionIdentity(evidence.exclusions ?? []))
      !== JSON.stringify(releaseExclusionIdentity(current.exclusions ?? []));
  const diagnostics = stale
    ? [error('APPROVAL_STALE', `${stage} approval does not match the current artifact manifest.`, path)]
    : [];
  return {
    stage,
    ...(domain ? { domain: domain.name } : {}),
    required,
    present: true,
    status: stale ? 'stale' : 'approved',
    evidence,
    currentArtifactSha256: current.artifactSha256,
    diagnostics,
  };
}

export async function validateApprovals(root: string, config: ApprovalConfig): Promise<ApprovalValidation> {
  if (!domainsConfigured(config)) {
    const stages = await Promise.all(approvalStages.map((stage) => validateApprovalStage(root, stage, config)));
    const diagnostics = stages.flatMap((stage) => stage.diagnostics);
    return {
      schemaVersion: 1,
      mode: config.mode,
      present: stages.some((stage) => stage.present),
      valid: diagnostics.length === 0,
      stages,
      diagnostics,
    };
  }
  const resolved = await resolveDomains(root, config);
  const domains = await Promise.all(resolved.map(async (domain): Promise<DomainApprovalValidation> => ({
    name: domain.name,
    stages: await Promise.all((['requirements', 'design'] as const).map((stage) => validateApprovalStage(root, stage, config, domain))),
  })));
  const release = await validateApprovalStage(root, 'release', config);
  const diagnostics = [...domains.flatMap((d) => d.stages.flatMap((s) => s.diagnostics)), ...release.diagnostics];
  return {
    schemaVersion: 1,
    mode: config.mode,
    present: domains.some((d) => d.stages.some((s) => s.present)) || release.present,
    valid: diagnostics.length === 0,
    stages: [],
    domains,
    release,
    diagnostics,
  };
}

export async function validateApprovalsForDomain(root: string, config: ApprovalConfig, domainName: string): Promise<ApprovalValidation> {
  const resolved = await resolveDomains(root, config);
  const domain = resolved.find((d) => d.name === domainName);
  if (!domain) {
    throw new Error(`Unknown approval domain "${domainName}"; configured domains: ${config.domains.map((d) => d.name).join(', ')}.`);
  }
  const stages = await Promise.all((['requirements', 'design'] as const).map((stage) => validateApprovalStage(root, stage, config, domain)));
  const diagnostics = stages.flatMap((s) => s.diagnostics);
  return {
    schemaVersion: 1,
    mode: config.mode,
    present: stages.some((s) => s.present),
    valid: diagnostics.length === 0,
    stages: [],
    domain: domainName,
    domains: [{ name: domainName, stages }],
    diagnostics,
  };
}

export async function validateApprovalsForFeatureGate(root: string, config: ApprovalConfig, domainName: string): Promise<ApprovalValidation> {
  const base = await validateApprovalsForDomain(root, config, domainName);
  const release = await validateApprovalStage(root, 'release', config);
  const diagnostics = [...base.diagnostics, ...release.diagnostics];
  return { ...base, release, diagnostics, valid: diagnostics.length === 0 };
}

export function requireDomainOption(config: ApprovalConfig, stage: ApprovalStage, domain: string | undefined): void {
  if (stage === 'release') {
    if (domain !== undefined) throw new Error('The release stage is always repository-wide; --domain is not accepted for release.');
    return;
  }
  if (domainsConfigured(config)) {
    if (domain === undefined) {
      throw new Error(`--domain is required for the ${stage} stage because approval.domains is configured; configured domains: ${config.domains.map((d) => d.name).join(', ')}.`);
    }
    if (!config.domains.some((d) => d.name === domain)) {
      throw new Error(`Unknown approval domain "${domain}"; configured domains: ${config.domains.map((d) => d.name).join(', ')}.`);
    }
  } else if (domain !== undefined) {
    throw new Error('--domain is not accepted because approval.domains is not configured.');
  }
}

export function requireValidateDomainOption(config: ApprovalConfig, domain: string | undefined): void {
  if (!domainsConfigured(config)) {
    if (domain !== undefined) throw new Error('--domain is not accepted because approval.domains is not configured.');
    return;
  }
  if (domain !== undefined && !config.domains.some((d) => d.name === domain)) {
    throw new Error(`Unknown approval domain "${domain}"; configured domains: ${config.domains.map((d) => d.name).join(', ')}.`);
  }
}

export async function requireApproval(root: string, stage: ApprovalStage, config: ApprovalConfig, domain?: ResolvedDomain): Promise<void> {
  if (config.mode !== 'required') return;
  const result = await validateApprovalStage(root, stage, config, domain);
  if (result.status !== 'approved') {
    const scope = domain ? ` for domain "${domain.name}"` : '';
    throw new Error(`${stage} approval${scope} is ${result.status}; record explicit current approval before continuing. Run \`musubix3 approval validate\` for a full per-stage status.`);
  }
}

export async function resolveOwningDomainOrThrow(root: string, config: ApprovalConfig, slug: string): Promise<ResolvedDomain | undefined> {
  if (!domainsConfigured(config)) return undefined;
  const resolved = await resolveDomains(root, config);
  const name = domainOwning(resolved, slug);
  if (!name) {
    throw new Error(`Feature "${slug}" is not owned by any configured approval domain.`);
  }
  return resolved.find((d) => d.name === name);
}

export async function resolveNamedDomain(root: string, config: ApprovalConfig, domainName: string): Promise<ResolvedDomain> {
  const resolved = await resolveDomains(root, config);
  const domain = resolved.find((d) => d.name === domainName);
  if (!domain) {
    throw new Error(`Unknown approval domain "${domainName}"; configured domains: ${config.domains.map((d) => d.name).join(', ')}.`);
  }
  return domain;
}

export async function resolveDesignFileDomain(root: string, config: ApprovalConfig, file: string): Promise<ResolvedDomain | undefined> {
  if (!domainsConfigured(config)) return undefined;
  const slug = featureOwningDesignFile(file);
  if (!slug) throw new Error(`${file} is outside every configured approval domain; design validate/c4 requires a path of the form .musubix/features/<slug>/design.md.`);
  return resolveOwningDomainOrThrow(root, config, slug);
}

export async function resolveRequirementDomain(root: string, config: ApprovalConfig, requirementId: string): Promise<ResolvedDomain | undefined> {
  if (!domainsConfigured(config)) return undefined;
  const slug = await featureOwningRequirement(root, requirementId);
  return resolveOwningDomainOrThrow(root, config, slug);
}

export async function validateStageArtifacts(root: string, stage: ApprovalStage, domain?: ResolvedDomain): Promise<void> {
  const paths = await files(root);
  const owns = (slug: string): boolean => !domain || domain.features.includes(slug);
  const requirementPaths = paths.filter((path) => {
    const slug = featureRequirementsPattern.exec(path)?.[1];
    return slug !== undefined && owns(slug);
  });
  if (!requirementPaths.length) throw new Error('Approval requires at least one requirements artifact.');
  const requirementResults = await Promise.all(requirementPaths.map(async (path) =>
    validateRequirements(await readText(root, path), path)));
  const requirementError = requirementResults.flatMap((result) => result.diagnostics)
    .find((diagnostic) => diagnostic.severity === 'error');
  if (requirementError) throw new Error(`Approval requires valid requirements: ${requirementError.message}`);
  if (paths.includes('.musubix/constitution.md')) {
    const constitutionError = validateConstitution(
      await readText(root, '.musubix/constitution.md'),
      '.musubix/constitution.md',
    ).diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (constitutionError) throw new Error(`Approval requires a valid constitution: ${constitutionError.message}`);
  }
  if (stage === 'requirements') return;
  const requirementIds = new Set(requirementResults.flatMap((result) => result.value.map((requirement) => requirement.id)));
  const designPaths = paths.filter((path) => {
    const slug = featureDesignPattern.exec(path)?.[1];
    return slug !== undefined && owns(slug);
  });
  if (!designPaths.length) throw new Error('Design approval requires at least one design artifact.');
  const designIds = new Set<string>();
  for (const path of designPaths) {
    for (const component of validateDesign(await readText(root, path), path).value) designIds.add(component.id);
  }
  const adrIds = new Set(paths.filter((path) => /^\.musubix\/decisions\/ADR-\d+\.md$/.test(path))
    .map((path) => basename(path, '.md')));
  for (const path of designPaths) {
    const designError = validateDesign(await readText(root, path), path, { requirementIds, designIds, adrIds })
      .diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (designError) throw new Error(`Approval requires valid design: ${designError.message}`);
  }
}
