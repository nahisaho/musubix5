import ts from 'typescript';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
import { error, type Diagnostic } from '../../domain/src/index.js';
import type { Config } from './config.js';
import { FILE_READ_CONCURRENCY, digest, exists, files, isSource, isTraceSource, mapWithConcurrency, portable, readText, snapshot, within, writeJson } from './files.js';
import { runProcess, type Runner } from './process.js';

export interface ImportEdge {
  from: string;
  to: string;
  specifier: string;
  kind: 'import' | 'export' | 'dynamic' | 'require' | 'use' | 'mod' | 'include' | 'using';
  line: number;
  external: boolean;
}

export interface CodeSymbol {
  id: string;
  name: string;
  path: string;
  line: number;
  kind: string;
  container?: string;
}

export interface CodeGraph {
  schemaVersion: 1;
  generatedAt: string;
  files: string[];
  unsupportedFiles: string[];
  imports: ImportEdge[];
  entrypoints: Array<{ manifest: string; field: string; path: string }>;
  symbols: CodeSymbol[];
  calls: { path: string; line: number; expression: string; target: string | null }[];
  diagnostics: Diagnostic[];
  fingerprints: Record<string, string>;
}

export type CodeGraphFullRebuildReason =
  | 'FULL_REQUESTED'
  | 'CACHE_MISSING'
  | 'CACHE_INVALID'
  | 'ANALYSIS_VERSION_MISMATCH'
  | 'CONFIG_CHANGED'
  | 'DECLARATION_CHANGED'
  | 'DELETED_FILES'
  | 'ADDED_FILES';

export interface CodeGraphIndexResult {
  graph: CodeGraph;
  indexing: {
    mode: 'incremental' | 'full';
    changedInputs: string[];
    analyzedSourcePaths: string[];
    reusedSourcePaths: string[];
    fullRebuildReason?: CodeGraphFullRebuildReason;
  };
  operations: {
    analyzedSourceFiles: number;
    reusedSourceFiles: number;
  };
}

export interface CodeGraphIndexOptions {
  persist?: boolean;
  refresh?: boolean;
  runner?: Runner;
  writer?: (root: string, path: string, value: unknown) => Promise<void>;
  onSourceExtraction?: (event: {
    path: string;
    language: string;
    phase: 'symbols' | 'relations';
  }) => void;
}

export interface GraphOperationCounters {
  forwardAdjacencyVisits: number;
  reverseAdjacencyVisits: number;
  completeImportScans: number;
}

export interface GraphAdjacency {
  forward: Map<string, string[]>;
  reverse: Map<string, string[]>;
}

interface CodeGraphPhaseUnit {
  path: string;
  language: string;
  symbolsPhase: {
    symbols: CodeGraph['symbols'];
    diagnostics: Diagnostic[];
    consultedManifests: string[];
    declarations: Array<[string, string]>;
  };
  relationsPhase: {
    imports: ImportEdge[];
    calls: CodeGraph['calls'];
    diagnostics: Diagnostic[];
    consultedManifests: string[];
  };
}

interface CodeGraphCache extends CodeGraph {
  analysisVersion: string;
  cacheContentHash: string;
  declarationFingerprints: Record<string, string>;
  resolutionEnvironment: {
    typescriptVersion: string;
    lockfiles: Record<string, string>;
    manifests: Record<string, string>;
  };
  phaseUnits: CodeGraphPhaseUnit[];
}

interface ResolutionEnvironmentResult {
  environment: CodeGraphCache['resolutionEnvironment'];
  unreadableManifestPaths: string[];
}

interface GraphBuildResult {
  graph: CodeGraph;
  phaseUnits: CodeGraphPhaseUnit[];
  analyzedSourcePaths: string[];
  reusedSourcePaths: string[];
}

interface GraphBuildOptions {
  prior?: CodeGraphCache;
  analyzedSourcePaths?: string[];
  onSourceExtraction?: CodeGraphIndexOptions['onSourceExtraction'];
}

const CODEGRAPH_ANALYZER_REVISION = 'm5-graph-001-phase-units-3';
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'] as const;
const ANALYSIS_VERSION = `${CODEGRAPH_ANALYZER_REVISION}:typescript-${ts.version}`;

export async function graphInputs(root: string): Promise<string[]> {
  return (await files(root)).filter((p) => isTraceSource(p) || /(?:^|\/)(?:tsconfig[^/]*\.json|package\.json|go\.mod|pubspec\.yaml)$/.test(p));
}

export async function declarationInputs(root: string): Promise<string[]> {
  return (await files(root)).filter((path) => /\.d\.(?:ts|cts|mts)$/.test(path));
}

export async function informationalChangedFiles(
  root: string,
  runner: Runner = runProcess,
): Promise<string[] | null> {
  const location = await runner('git', ['rev-parse', '--show-prefix'], { cwd: root, timeoutMs: 10_000 });
  if (location.status !== 'completed' || location.exitCode !== 0) return null;
  const prefix = location.stdout.replace(/\r?\n$/, '');
  const result = await runner('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], {
    cwd: root,
    timeoutMs: 10_000,
  });
  if (result.status !== 'completed' || result.exitCode !== 0) return null;
  const entries = result.stdout.split('\0');
  const paths = new Set<string>();
  const add = (path: string): void => {
    if (path.startsWith(prefix)) paths.add(path.slice(prefix.length));
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    add(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      const previous = entries[++index];
      if (previous) add(previous);
    }
  }
  return [...paths].sort();
}

async function resolutionEnvironment(
  root: string,
  priorManifestPaths: string[] = [],
): Promise<ResolutionEnvironmentResult> {
  const lockfiles: Record<string, string> = {};
  for (const path of LOCKFILES) {
    const absolute = within(root, path);
    if (await exists(absolute)) lockfiles[path] = digest(await import('node:fs/promises').then(({ readFile }) => readFile(absolute)));
  }
  const manifests: Record<string, string> = {};
  const unreadableManifestPaths: string[] = [];
  for (const path of [...new Set(priorManifestPaths)].sort()) {
    try {
      const absolute = resolve(root, path);
      manifests[path] = digest(await import('node:fs/promises').then(({ readFile }) => readFile(absolute)));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') manifests[path] = 'absent';
      else unreadableManifestPaths.push(path);
    }
  }
  return {
    environment: { typescriptVersion: ts.version, lockfiles, manifests },
    unreadableManifestPaths,
  };
}

function semanticGraph(cache: CodeGraph | CodeGraphCache): CodeGraph {
  return {
    schemaVersion: cache.schemaVersion,
    generatedAt: cache.generatedAt,
    files: cache.files,
    unsupportedFiles: cache.unsupportedFiles,
    imports: cache.imports,
    entrypoints: cache.entrypoints,
    symbols: cache.symbols,
    calls: cache.calls,
    diagnostics: cache.diagnostics,
    fingerprints: cache.fingerprints,
  };
}

function cacheContentHash(
  cache: Omit<CodeGraphCache, 'cacheContentHash'> | CodeGraphCache,
): string {
  return digest(JSON.stringify({
    semantic: {
      schemaVersion: cache.schemaVersion,
      files: cache.files,
      unsupportedFiles: cache.unsupportedFiles,
      imports: cache.imports,
      entrypoints: cache.entrypoints,
      symbols: cache.symbols,
      calls: cache.calls,
      diagnostics: cache.diagnostics,
      fingerprints: cache.fingerprints,
    },
    analysisVersion: cache.analysisVersion,
    declarationFingerprints: cache.declarationFingerprints,
    resolutionEnvironment: cache.resolutionEnvironment,
    phaseUnits: cache.phaseUnits,
  }));
}

async function consultedPackageManifests(root: string, path: string, imports: ImportEdge[]): Promise<string[]> {
  const result = new Set<string>();
  for (const edge of imports) {
    if (!edge.external || !edge.to.startsWith('npm:')) continue;
    const specifier = edge.to.slice(4);
    const segments = specifier.split('/');
    const packageName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]!;
    let directory = dirname(path);
    let logical = `node_modules/${packageName}/package.json`;
    while (true) {
      logical = directory === '.'
        ? `node_modules/${packageName}/package.json`
        : `${directory}/node_modules/${packageName}/package.json`;
      try {
        if (await exists(resolve(root, logical))) {
          result.add(logical);
          break;
        }
      } catch {
        result.add(logical);
        break;
      }
      if (directory === '.') {
        result.add(logical);
        break;
      }
      directory = dirname(directory);
    }
  }
  return [...result].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validDiagnostic(value: unknown): value is Diagnostic {
  if (!isRecord(value)) return false;
  return typeof value.code === 'string'
    && ['error', 'warning'].includes(String(value.severity))
    && typeof value.message === 'string'
    && (value.path === undefined || typeof value.path === 'string')
    && (value.line === undefined || Number.isSafeInteger(value.line));
}

function validImportEdge(value: unknown): value is ImportEdge {
  if (!isRecord(value)) return false;
  return typeof value.from === 'string'
    && typeof value.to === 'string'
    && typeof value.specifier === 'string'
    && ['import', 'export', 'dynamic', 'require', 'use', 'mod', 'include', 'using'].includes(String(value.kind))
    && Number.isSafeInteger(value.line)
    && typeof value.external === 'boolean';
}

function validSymbol(value: unknown): value is CodeSymbol {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && Number.isSafeInteger(value.line)
    && typeof value.kind === 'string'
    && (value.container === undefined || typeof value.container === 'string');
}

function validCall(value: unknown): value is CodeGraph['calls'][number] {
  if (!isRecord(value)) return false;
  return typeof value.path === 'string'
    && Number.isSafeInteger(value.line)
    && typeof value.expression === 'string'
    && (value.target === null || typeof value.target === 'string');
}

function validEntrypoint(value: unknown): value is CodeGraph['entrypoints'][number] {
  if (!isRecord(value)) return false;
  return typeof value.manifest === 'string'
    && typeof value.field === 'string'
    && typeof value.path === 'string';
}

function validFingerprintRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((fingerprint) => typeof fingerprint === 'string');
}

function validSemanticGraph(value: unknown): value is CodeGraph {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const graph = value as Partial<CodeGraph>;
  return graph.schemaVersion === 1
    && typeof graph.generatedAt === 'string'
    && Array.isArray(graph.files) && graph.files.every((path) => typeof path === 'string')
    && Array.isArray(graph.unsupportedFiles) && graph.unsupportedFiles.every((path) => typeof path === 'string')
    && Array.isArray(graph.imports) && graph.imports.every(validImportEdge)
    && Array.isArray(graph.entrypoints) && graph.entrypoints.every(validEntrypoint)
    && Array.isArray(graph.symbols) && graph.symbols.every(validSymbol)
    && Array.isArray(graph.calls) && graph.calls.every(validCall)
    && Array.isArray(graph.diagnostics) && graph.diagnostics.every(validDiagnostic)
    && validFingerprintRecord(graph.fingerprints);
}

function validCurrentCache(value: unknown): value is CodeGraphCache {
  if (!validSemanticGraph(value)) return false;
  const cache = value as Partial<CodeGraphCache>;
  if (!(typeof cache.analysisVersion === 'string'
    && typeof cache.cacheContentHash === 'string'
    && validFingerprintRecord(cache.declarationFingerprints)
    && !!cache.resolutionEnvironment
    && typeof cache.resolutionEnvironment.typescriptVersion === 'string'
    && validFingerprintRecord(cache.resolutionEnvironment.lockfiles)
    && validFingerprintRecord(cache.resolutionEnvironment.manifests)
    && Array.isArray(cache.phaseUnits)
    && cache.phaseUnits.every((unit) => !!unit
      && typeof unit.path === 'string'
      && typeof unit.language === 'string'
      && !!unit.symbolsPhase
      && Array.isArray(unit.symbolsPhase.symbols) && unit.symbolsPhase.symbols.every(validSymbol)
      && Array.isArray(unit.symbolsPhase.diagnostics) && unit.symbolsPhase.diagnostics.every(validDiagnostic)
      && Array.isArray(unit.symbolsPhase.consultedManifests)
      && unit.symbolsPhase.consultedManifests.every((path) => typeof path === 'string')
      && Array.isArray(unit.symbolsPhase.declarations)
      && unit.symbolsPhase.declarations.every((entry) =>
        Array.isArray(entry) && entry.length === 2
        && typeof entry[0] === 'string' && typeof entry[1] === 'string')
      && !!unit.relationsPhase
      && Array.isArray(unit.relationsPhase.imports) && unit.relationsPhase.imports.every(validImportEdge)
      && Array.isArray(unit.relationsPhase.calls) && unit.relationsPhase.calls.every(validCall)
      && Array.isArray(unit.relationsPhase.diagnostics) && unit.relationsPhase.diagnostics.every(validDiagnostic)
      && Array.isArray(unit.relationsPhase.consultedManifests)
      && unit.relationsPhase.consultedManifests.every((path) => typeof path === 'string')))) return false;
  const typed = cache as CodeGraphCache;
  const unitKeys = typed.phaseUnits.map((unit) => `${unit.language}\0${unit.path}`);
  const unitPaths = new Set(typed.phaseUnits.map((unit) => unit.path));
  return new Set(unitKeys).size === unitKeys.length
    && typed.phaseUnits.every((unit) => typed.files.includes(unit.path))
    && typed.files.every((path) => unitPaths.has(path) && typeof typed.fingerprints[path] === 'string')
    && cacheContentHash(typed) === typed.cacheContentHash;
}

function changedKeys(
  previous: Record<string, string>,
  current: Record<string, string>,
): { added: string[]; deleted: string[]; modified: string[] } {
  const added = Object.keys(current).filter((path) => !(path in previous)).sort();
  const deleted = Object.keys(previous).filter((path) => !(path in current)).sort();
  const modified = Object.keys(current).filter((path) => path in previous && current[path] !== previous[path]).sort();
  return { added, deleted, modified };
}

function isGraphSourcePath(path: string): boolean {
  return isSource(path) || /\.(?:rs|py|go|java|c|cc|cpp|h|hh|hpp|m|mm|cs|php|r|R|jl|kt|kts|rb|swift|dart|scala|ex|exs|hs|lua|zig|sol|fs|fsx|vb)$/.test(path);
}

function importerClosure(graph: CodeGraph, changed: string[]): string[] {
  const reverse = new Map(graph.files.map((path) => [path, [] as string[]]));
  for (const edge of graph.imports) {
    if (!edge.external && reverse.has(edge.to)) reverse.get(edge.to)!.push(edge.from);
  }
  const result = new Set(changed);
  const queue = [...changed];
  for (let index = 0; index < queue.length; index += 1) {
    for (const importer of reverse.get(queue[index]!) ?? []) {
      if (result.has(importer)) continue;
      result.add(importer);
      queue.push(importer);
    }
  }
  return [...result].sort();
}

function relationDependentPaths(graph: CodeGraph, changed: string[]): string[] {
  const changedPaths = new Set(changed);
  return [...new Set(graph.calls.flatMap((call) => {
    if (!call.target) return [];
    const separator = call.target.indexOf('#');
    const targetPath = separator === -1 ? call.target : call.target.slice(0, separator);
    return changedPaths.has(targetPath) ? [call.path] : [];
  }))].sort();
}

async function requiresDeclarationFallback(
  root: string,
  paths: string[],
  prior: CodeGraphCache,
): Promise<boolean> {
  for (const path of paths) {
    const text = await readText(root, path);
    if (/\.[cm]?[jt]sx?$/.test(path)) {
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      if (!ts.isExternalModule(source) || /\bdeclare\s+global\b/.test(source.text)) return true;
      continue;
    }
    const declarationProbe = declarationMapProbe(path, text);
    if (!declarationProbe) continue;
    const previous = prior.phaseUnits
      .filter((unit) => unit.path === path && unit.language === declarationProbe.language)
      .flatMap((unit) => unit.symbolsPhase.declarations)
      .sort(([left], [right]) => left.localeCompare(right));
    const current = declarationProbe.declarations.sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(previous) !== JSON.stringify(current)) return true;
  }
  return false;
}

function declarationMapProbe(
  path: string,
  text: string,
): { language: string; declarations: Array<[string, string]> } | null {
  const graph: CodeGraph = {
    schemaVersion: 1,
    generatedAt: '',
    files: [path],
    unsupportedFiles: [],
    imports: [],
    entrypoints: [],
    symbols: [],
    calls: [],
    diagnostics: [],
    fingerprints: {},
  };
  const declarations = new Map<string, string>();
  let language: string | null = null;
  if (path.endsWith('.java')) {
    language = 'java';
    indexJavaSymbols(path, text, graph, declarations);
  } else if (path.endsWith('.cs')) {
    language = 'csharp';
    indexCsharpSymbols(path, text, graph, declarations);
  } else if (path.endsWith('.php')) {
    language = 'php';
    indexPhpSymbols(path, text, graph, declarations);
  } else if (path.endsWith('.jl')) {
    language = 'julia';
    indexJuliaSymbols(path, text, graph, declarations);
  } else if (/\.(?:kt|kts)$/.test(path)) {
    language = 'kotlin';
    indexKotlinSymbols(path, text, graph, declarations);
  } else if (path.endsWith('.scala')) {
    language = 'scala';
    indexScalaSymbols(path, text, graph, declarations);
  } else if (/\.(?:ex|exs)$/.test(path)) {
    language = 'elixir';
    indexElixirSymbols(path, text, graph, declarations);
  } else if (path.endsWith('.hs')) {
    language = 'haskell';
    indexHaskellSymbols(path, text, graph, declarations);
  } else if (/\.(?:fs|fsx)$/.test(path)) {
    language = 'fsharp';
    indexFsharpSymbols(path, text, graph, declarations);
  } else if (path.endsWith('.vb')) {
    language = 'vb';
    indexVbSymbols(path, text, graph, declarations);
  }
  return language ? { language, declarations: [...declarations] } : null;
}

function symbolNamesProbe(path: string, text: string): string[] {
  const graph: CodeGraph = {
    schemaVersion: 1,
    generatedAt: '',
    files: [path],
    unsupportedFiles: [],
    imports: [],
    entrypoints: [],
    symbols: [],
    calls: [],
    diagnostics: [],
    fingerprints: {},
  };
  const declarations = new Map<string, string>();
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
        || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
        || ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node)
        || ts.isMethodDeclaration(node)) && node.name) {
        graph.symbols.push({
          id: '',
          name: node.name.getText(source),
          path,
          line: 0,
          kind: ts.SyntaxKind[node.kind],
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  } else if (path.endsWith('.rs')) indexRustSymbols(path, text, graph);
  else if (path.endsWith('.py')) indexPythonSymbols(path, text, graph);
  else if (path.endsWith('.go')) indexGoSymbols(path, text, graph);
  else if (path.endsWith('.java')) indexJavaSymbols(path, text, graph, declarations);
  else if (/\.(?:c|cc|cpp|h|hh|hpp|m|mm)$/.test(path)) {
    indexCppSymbols(path, text, graph);
    indexObjectiveCSymbols(path, text, graph);
  } else if (path.endsWith('.cs')) indexCsharpSymbols(path, text, graph, declarations);
  else if (path.endsWith('.php')) indexPhpSymbols(path, text, graph, declarations);
  else if (/\.(?:r|R)$/.test(path)) indexRSymbols(path, text, graph);
  else if (path.endsWith('.jl')) indexJuliaSymbols(path, text, graph, declarations);
  else if (/\.(?:kt|kts)$/.test(path)) indexKotlinSymbols(path, text, graph, declarations);
  else if (path.endsWith('.rb')) indexRubySymbols(path, text, graph);
  else if (path.endsWith('.swift')) indexSwiftSymbols(path, text, graph);
  else if (path.endsWith('.dart')) indexDartSymbols(path, text, graph);
  else if (path.endsWith('.scala')) indexScalaSymbols(path, text, graph, declarations);
  else if (/\.(?:ex|exs)$/.test(path)) indexElixirSymbols(path, text, graph, declarations);
  else if (path.endsWith('.hs')) indexHaskellSymbols(path, text, graph, declarations);
  else if (path.endsWith('.lua')) indexLuaSymbols(path, text, graph);
  else if (path.endsWith('.zig')) indexZigSymbols(path, text, graph);
  else if (path.endsWith('.sol')) indexSoliditySymbols(path, text, graph);
  else if (/\.(?:fs|fsx)$/.test(path)) indexFsharpSymbols(path, text, graph, declarations);
  else if (path.endsWith('.vb')) indexVbSymbols(path, text, graph, declarations);
  return graph.symbols.map((symbol) => symbol.name).sort();
}

async function changedGlobalSymbolNames(
  root: string,
  changedSources: string[],
  prior: CodeGraphCache,
): Promise<boolean> {
  for (const path of changedSources) {
    const previous = prior.phaseUnits
      .filter((unit) => unit.path === path)
      .flatMap((unit) => unit.symbolsPhase.symbols.map((symbol) => symbol.name))
      .sort();
    const current = symbolNamesProbe(path, await readText(root, path));
    if (JSON.stringify(previous) !== JSON.stringify(current)) return true;
  }
  return false;
}

/** @id CODE-M5-GRAPH-INCREMENTAL-001
 * @implements REQ-M5-GRAPH-001
 * @design DES-M5-GRAPH-001 DES-M5-GRAPH-002
 */
export function indexGraph(root: string): Promise<CodeGraph>;
export function indexGraph(root: string, persist: boolean): Promise<CodeGraph>;
export function indexGraph(root: string, options: CodeGraphIndexOptions): Promise<CodeGraphIndexResult>;
export async function indexGraph(
  root: string,
  options: CodeGraphIndexOptions | boolean = {},
): Promise<CodeGraph | CodeGraphIndexResult> {
  const legacyResult = typeof options === 'boolean' || arguments.length === 1;
  const normalized: CodeGraphIndexOptions = typeof options === 'boolean'
    ? { persist: options, refresh: false }
    : options;
  const persist = normalized.persist ?? true;
  const refresh = normalized.refresh ?? false;
  const writer = normalized.writer ?? writeJson;
  const inputs = await graphInputs(root);
  const inputFingerprints = await snapshot(root, inputs);
  const declarations = await snapshot(root, await declarationInputs(root));
  let prior: CodeGraphCache | null = null;
  let reason: CodeGraphFullRebuildReason | undefined = refresh ? undefined : 'FULL_REQUESTED';
  if (refresh) {
    try {
      const parsed = JSON.parse(await readText(root, '.musubix/cache/codegraph.json')) as unknown;
      if (!validSemanticGraph(parsed)) reason = 'CACHE_INVALID';
      else if ((parsed as Partial<CodeGraphCache>).analysisVersion !== ANALYSIS_VERSION
        || (parsed as Partial<CodeGraphCache>).declarationFingerprints === undefined
        || (parsed as Partial<CodeGraphCache>).resolutionEnvironment === undefined) reason = 'ANALYSIS_VERSION_MISMATCH';
      else if (!validCurrentCache(parsed)) reason = 'CACHE_INVALID';
      else prior = parsed;
    } catch (cause) {
      reason = (cause as NodeJS.ErrnoException).code === 'ENOENT' ? 'CACHE_MISSING' : 'CACHE_INVALID';
    }
  }
  const priorManifests = prior?.phaseUnits.flatMap((unit) => [
    ...unit.symbolsPhase.consultedManifests,
    ...unit.relationsPhase.consultedManifests,
  ]) ?? [];
  const environmentResult = await resolutionEnvironment(root, priorManifests);
  const environment = environmentResult.environment;
  const inputChanges = changedKeys(prior?.fingerprints ?? {}, inputFingerprints);
  const declarationChanges = changedKeys(prior?.declarationFingerprints ?? {}, declarations);
  const lockChanges = changedKeys(prior?.resolutionEnvironment.lockfiles ?? {}, environment.lockfiles);
  const manifestChanges = changedKeys(prior?.resolutionEnvironment.manifests ?? {}, environment.manifests);
  const changedSources = inputChanges.modified.filter((path) => prior?.files.includes(path) || isGraphSourcePath(path));
  const changedConfig = [
    ...inputChanges.added,
    ...inputChanges.deleted,
    ...inputChanges.modified,
  ].filter((path) => !isGraphSourcePath(path) && !prior?.files.includes(path));
  const changedInputs = [...new Set([
    ...inputChanges.added,
    ...inputChanges.deleted,
    ...inputChanges.modified,
    ...declarationChanges.added,
    ...declarationChanges.deleted,
    ...declarationChanges.modified,
    ...lockChanges.added,
    ...lockChanges.deleted,
    ...lockChanges.modified,
    ...manifestChanges.added,
    ...manifestChanges.deleted,
    ...manifestChanges.modified,
    ...environmentResult.unreadableManifestPaths,
    ...(prior && prior.resolutionEnvironment.typescriptVersion !== environment.typescriptVersion ? ['@resolution/typescript'] : []),
  ])].sort();
  if (!reason && prior) {
    if (environmentResult.unreadableManifestPaths.length
      || changedConfig.length || lockChanges.added.length || lockChanges.deleted.length || lockChanges.modified.length
      || manifestChanges.added.length || manifestChanges.deleted.length || manifestChanges.modified.length
      || prior.resolutionEnvironment.typescriptVersion !== environment.typescriptVersion) reason = 'CONFIG_CHANGED';
    else if (declarationChanges.added.length || declarationChanges.deleted.length || declarationChanges.modified.length
      || await requiresDeclarationFallback(root, changedSources, prior)) reason = 'DECLARATION_CHANGED';
    else if (inputChanges.deleted.some((path) => prior!.files.includes(path))) reason = 'DELETED_FILES';
    else if (inputChanges.added.some(isGraphSourcePath)) reason = 'ADDED_FILES';
  }
  if (!reason && prior && changedInputs.length === 0) {
    const result: CodeGraphIndexResult = {
      graph: semanticGraph(prior),
      indexing: {
        mode: 'incremental',
        changedInputs: [],
        analyzedSourcePaths: [],
        reusedSourcePaths: [...prior.files].sort(),
      },
      operations: { analyzedSourceFiles: 0, reusedSourceFiles: prior.files.length },
    };
    return legacyResult ? result.graph : result;
  }
  const globalSymbolNamesChanged = !reason && prior
    ? await changedGlobalSymbolNames(root, changedSources, prior)
    : false;
  const plannedAnalyzedSourcePaths = !reason && prior
    ? importerClosure(prior, [...new Set([
      ...changedSources,
      ...relationDependentPaths(prior, changedSources),
      ...(globalSymbolNamesChanged
        ? prior.files.filter((path) => !/\.[cm]?[jt]sx?$/.test(path))
        : []),
    ])]).filter((path) => prior.files.includes(path))
    : undefined;
  const built = await fullIndexGraph(root, {
    ...(!reason && prior ? { prior } : {}),
    ...(plannedAnalyzedSourcePaths ? { analyzedSourcePaths: plannedAnalyzedSourcePaths } : {}),
    ...(normalized.onSourceExtraction ? { onSourceExtraction: normalized.onSourceExtraction } : {}),
  });
  const { graph, phaseUnits: units, analyzedSourcePaths, reusedSourcePaths } = built;
  const emittedManifestPaths = units.flatMap((unit) => [
    ...unit.symbolsPhase.consultedManifests,
    ...unit.relationsPhase.consultedManifests,
  ]);
  const emittedEnvironment = (await resolutionEnvironment(root, emittedManifestPaths)).environment;
  const cacheWithoutHash: Omit<CodeGraphCache, 'cacheContentHash'> = {
    ...graph,
    analysisVersion: ANALYSIS_VERSION,
    declarationFingerprints: declarations,
    resolutionEnvironment: emittedEnvironment,
    phaseUnits: units,
  };
  const cache: CodeGraphCache = {
    ...cacheWithoutHash,
    cacheContentHash: cacheContentHash(cacheWithoutHash),
  };
  if (persist) {
    try {
      await writer(root, '.musubix/cache/codegraph.json', cache);
    } catch {
      throw new Error('CACHE_WRITE_FAILED: Failed to atomically replace the CodeGraph cache.');
    }
  }
  const result: CodeGraphIndexResult = {
    graph,
    indexing: {
      mode: reason ? 'full' : 'incremental',
      changedInputs: refresh ? changedInputs : [],
      analyzedSourcePaths,
      reusedSourcePaths,
      ...(reason ? { fullRebuildReason: reason } : {}),
    },
    operations: {
      analyzedSourceFiles: analyzedSourcePaths.length,
      reusedSourceFiles: reusedSourcePaths.length,
    },
  };
  return legacyResult ? result.graph : result;
}

async function fullIndexGraph(root: string, buildOptions: GraphBuildOptions = {}): Promise<GraphBuildResult> {
  const paths = await graphInputs(root);
  const typedSources = paths.filter(isSource);
  const rustSources = paths.filter((path) => path.endsWith('.rs'));
  const pythonSources = paths.filter((path) => path.endsWith('.py'));
  const goSources = paths.filter((path) => path.endsWith('.go'));
  const javaSources = paths.filter((path) => path.endsWith('.java'));
  const cppSources = paths.filter((path) => /\.(?:c|cc|cpp|h|hh|hpp|m|mm)$/.test(path));
  const csharpSources = paths.filter((path) => path.endsWith('.cs'));
  const phpSources = paths.filter((path) => path.endsWith('.php'));
  const rSources = paths.filter((path) => /\.(?:r|R)$/.test(path));
  const juliaSources = paths.filter((path) => path.endsWith('.jl'));
  const kotlinSources = paths.filter((path) => /\.(?:kt|kts)$/.test(path));
  const rubySources = paths.filter((path) => path.endsWith('.rb'));
  const swiftSources = paths.filter((path) => path.endsWith('.swift'));
  const dartSources = paths.filter((path) => path.endsWith('.dart'));
  const scalaSources = paths.filter((path) => path.endsWith('.scala'));
  const elixirSources = paths.filter((path) => /\.(?:ex|exs)$/.test(path));
  const haskellSources = paths.filter((path) => path.endsWith('.hs'));
  const luaSources = paths.filter((path) => path.endsWith('.lua'));
  const zigSources = paths.filter((path) => path.endsWith('.zig'));
  const soliditySources = paths.filter((path) => path.endsWith('.sol'));
  const objectiveCSources = paths.filter((path) => /\.(?:m|mm)$/.test(path));
  const fsharpSources = paths.filter((path) => /\.(?:fs|fsx)$/.test(path));
  const vbSources = paths.filter((path) => path.endsWith('.vb'));
  const sources = [
    ...typedSources, ...rustSources, ...pythonSources, ...goSources, ...javaSources,
    ...cppSources, ...csharpSources, ...phpSources, ...rSources, ...juliaSources,
    ...kotlinSources, ...rubySources, ...swiftSources, ...dartSources, ...scalaSources,
    ...elixirSources, ...haskellSources, ...luaSources, ...zigSources, ...soliditySources,
    ...fsharpSources, ...vbSources,
  ].sort();
  const supported = new Set(sources);
  const unsupportedFiles = paths.filter((path) => isTraceSource(path) && !supported.has(path));
  const known = new Set(sources);
  const diagnostics: Diagnostic[] = [];
  if (unsupportedFiles.length) {
    diagnostics.push({
      code: 'GRAPH_UNSUPPORTED_LANGUAGE',
      severity: 'warning',
      message: `Dependency and call graph analysis is unavailable for ${unsupportedFiles.length} source file(s) in unsupported languages.`,
      path: unsupportedFiles[0]!,
    });
  }
  const configPaths = new Set(paths.filter((p) => /(?:^|\/)tsconfig\.json$/.test(p)));
  const optionsCache = new Map<string, ts.CompilerOptions>();
  function optionsFor(path: string): ts.CompilerOptions {
    let directory = dirname(path);
    let config: string | undefined;
    while (true) {
      const candidate = directory === '.' ? 'tsconfig.json' : `${directory}/tsconfig.json`;
      if (configPaths.has(candidate)) { config = candidate; break; }
      if (directory === '.') break;
      directory = dirname(directory);
    }
    const key = config ?? '<default>';
    const cached = optionsCache.get(key);
    if (cached) return cached;
    let options: ts.CompilerOptions = { allowJs: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, noEmit: true };
    if (config) {
      const loaded = ts.readConfigFile(resolve(root, config), ts.sys.readFile);
      if (loaded.error) diagnostics.push(error('GRAPH_TSCONFIG', ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'), config));
      else {
        const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, resolve(root, dirname(config)));
        for (const d of parsed.errors.filter((d) => d.code !== 18003)) diagnostics.push(error('GRAPH_TSCONFIG', ts.flattenDiagnosticMessageText(d.messageText, '\n'), config));
        options = { ...options, ...parsed.options, noEmit: true };
      }
    }
    optionsCache.set(key, options);
    return options;
  }
  const program = ts.createProgram(typedSources.map((p) => resolve(root, p)), optionsFor('index.ts'));
  const checker = program.getTypeChecker();
  const graph: CodeGraph = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    files: sources,
    unsupportedFiles,
    imports: [],
    entrypoints: [],
    symbols: [],
    calls: [],
    diagnostics,
    fingerprints: await snapshot(root, paths),
  };
  const plannedAnalyzed = new Set(buildOptions.analyzedSourcePaths ?? sources);
  const actuallyAnalyzed = new Set<string>();
  const actuallyReused = new Set<string>();
  const priorUnits = new Map(
    (buildOptions.prior?.phaseUnits ?? []).map((unit) => [`${unit.language}\0${unit.path}`, unit]),
  );
  const phaseUnits: CodeGraphPhaseUnit[] = [];
  const relationTasks: Array<() => void> = [];
  const unitFor = (language: string, path: string): CodeGraphPhaseUnit => {
    const unit: CodeGraphPhaseUnit = {
      path,
      language,
      symbolsPhase: {
        symbols: [],
        diagnostics: [],
        consultedManifests: [],
        declarations: [],
      },
      relationsPhase: {
        imports: [],
        calls: [],
        diagnostics: [],
        consultedManifests: [],
      },
    };
    phaseUnits.push(unit);
    return unit;
  };
  const extractSymbols = (
    language: string,
    path: string,
    extraction: () => void,
    declarations?: Map<string, string>,
  ): void => {
    const unit = unitFor(language, path);
    const priorUnit = priorUnits.get(`${language}\0${path}`);
    if (!plannedAnalyzed.has(path) && priorUnit) {
      actuallyReused.add(path);
      unit.symbolsPhase = {
        ...priorUnit.symbolsPhase,
        symbols: [...priorUnit.symbolsPhase.symbols],
        diagnostics: [...priorUnit.symbolsPhase.diagnostics],
        consultedManifests: [...priorUnit.symbolsPhase.consultedManifests],
        declarations: [...priorUnit.symbolsPhase.declarations],
      };
      graph.symbols.push(...unit.symbolsPhase.symbols);
      graph.diagnostics.push(...unit.symbolsPhase.diagnostics);
      for (const [name, target] of unit.symbolsPhase.declarations) declarations?.set(name, target);
      return;
    }
    actuallyAnalyzed.add(path);
    buildOptions.onSourceExtraction?.({ path, language, phase: 'symbols' });
    const symbolStart = graph.symbols.length;
    const diagnosticStart = graph.diagnostics.length;
    const previousDeclarations = declarations ? new Map(declarations) : undefined;
    extraction();
    unit.symbolsPhase.symbols = graph.symbols.slice(symbolStart);
    unit.symbolsPhase.diagnostics = graph.diagnostics.slice(diagnosticStart);
    if (declarations && previousDeclarations) {
      unit.symbolsPhase.declarations = [...declarations]
        .filter(([name, target]) => previousDeclarations.get(name) !== target)
        .map(([name, target]) => [name, target]);
    }
  };
  const queueRelations = (
    language: string,
    path: string,
    extraction: () => void,
  ): void => {
    relationTasks.push(() => {
      const unit = phaseUnits.find((candidate) => candidate.language === language && candidate.path === path)
        ?? unitFor(language, path);
      const priorUnit = priorUnits.get(`${language}\0${path}`);
      if (!plannedAnalyzed.has(path) && priorUnit) {
        actuallyReused.add(path);
        unit.relationsPhase = {
          ...priorUnit.relationsPhase,
          imports: [...priorUnit.relationsPhase.imports],
          calls: [...priorUnit.relationsPhase.calls],
          diagnostics: [...priorUnit.relationsPhase.diagnostics],
          consultedManifests: [...priorUnit.relationsPhase.consultedManifests],
        };
        graph.imports.push(...unit.relationsPhase.imports);
        graph.calls.push(...unit.relationsPhase.calls);
        graph.diagnostics.push(...unit.relationsPhase.diagnostics);
        return;
      }
      actuallyAnalyzed.add(path);
      buildOptions.onSourceExtraction?.({ path, language, phase: 'relations' });
      const importStart = graph.imports.length;
      const callStart = graph.calls.length;
      const diagnosticStart = graph.diagnostics.length;
      extraction();
      unit.relationsPhase.imports = graph.imports.slice(importStart);
      unit.relationsPhase.calls = graph.calls.slice(callStart);
      unit.relationsPhase.diagnostics = graph.diagnostics.slice(diagnosticStart);
    });
  };
  for (const manifest of paths.filter((candidate) => candidate.endsWith('package.json'))) {
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(await readText(root, manifest)) as Record<string, unknown>;
    } catch {
      diagnostics.push(error('GRAPH_MANIFEST', 'package.json is not valid JSON.', manifest));
      continue;
    }
    const entries: Array<{ field: string; value: string }> = [];
    const collect = (field: string, candidate: unknown): void => {
      if (typeof candidate === 'string') entries.push({ field, value: candidate });
      else if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        for (const [key, nested] of Object.entries(candidate as Record<string, unknown>)) collect(`${field}.${key}`, nested);
      }
    };
    for (const field of ['main', 'module', 'types', 'bin', 'exports'] as const) collect(field, value[field]);
    for (const entry of entries) {
      if (!entry.value.startsWith('.')) continue;
      const base = portable(relative(root, resolve(root, dirname(manifest), entry.value)));
      const candidates = [
        base,
        base.replace(/\.[cm]?js$/, '.ts'),
        base.replace(/\.[cm]?js$/, '.tsx'),
        `${base}/index.ts`,
        `${base}/index.js`,
      ];
      const target = candidates.find((candidate) => known.has(candidate));
      if (target && !graph.entrypoints.some((candidate) => candidate.manifest === manifest && candidate.field === entry.field && candidate.path === target)) {
        graph.entrypoints.push({ manifest, field: entry.field, path: target });
      }
    }
  }
  for (const path of typedSources) {
    const source = program.getSourceFile(resolve(root, path));
    if (!source) continue;
    const options = optionsFor(path);
    const lineOf = (node: ts.Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    function staticSpecifier(expression: ts.Expression, seen = new Set<ts.Node>(), allowIdentifier = false): string | null {
      if (seen.has(expression)) return null;
      seen.add(expression);
      if (ts.isStringLiteralLike(expression)) return expression.text;
      if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'href') return staticSpecifier(expression.expression, seen, allowIdentifier);
      if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'URL') {
        const first = expression.arguments?.[0];
        const second = expression.arguments?.[1];
        if (first && ts.isStringLiteralLike(first) && second?.getText(source) === 'import.meta.url') return first.text;
      }
      if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
        && ['pathToFileURL', 'fileURLToPath'].includes(expression.expression.text) && expression.arguments[0]) {
        return staticSpecifier(expression.arguments[0], seen, allowIdentifier);
      }
      if (allowIdentifier && ts.isIdentifier(expression)) {
        let symbol = checker.getSymbolAtLocation(expression);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) return staticSpecifier(declaration.initializer, seen, true);
      }
      if (ts.isTemplateExpression(expression)) {
        if (expression.head.text && /^[./]/.test(expression.head.text)) {
          const query = expression.head.text.search(/[?#]/);
          if (query > 0) return expression.head.text.slice(0, query);
        }
        if (!expression.head.text && expression.templateSpans.length) {
          const first = expression.templateSpans[0]!;
          const base = staticSpecifier(first.expression, seen, true);
          if (base && /^[?#]/.test(first.literal.text)) return base;
        }
      }
      return null;
    }
    function addImport(expression: ts.Expression, kind: ImportEdge['kind']): void {
      const staticValue = staticSpecifier(expression);
      if (staticValue === null) {
        diagnostics.push({ code: 'GRAPH_DYNAMIC', severity: 'warning', message: 'Nonliteral module loading is not statically resolved.', path, line: lineOf(expression) });
        return;
      }
      const suffix = staticValue.search(/[?#]/);
      const specifier = suffix > 0 ? staticValue.slice(0, suffix) : staticValue;
      const mode = kind === 'require' ? ts.ModuleKind.CommonJS
        : kind === 'dynamic' || !ts.isStringLiteralLike(expression) ? ts.ModuleKind.ESNext
          : ts.getModeForUsageLocation(source!, expression, options);
      const resolved = ts.resolveModuleName(specifier, source!.fileName, options, ts.sys, undefined, undefined, mode).resolvedModule;
      const target = resolved ? portable(relative(root, resolved.resolvedFileName)) : '';
      const local = target && !target.startsWith('../') && !isAbsolute(target) && !target.includes('node_modules/');
      const external = !local;
      if (!resolved && (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#') ||
        Object.keys(options.paths ?? {}).some((pattern) => matchGlob(specifier, pattern.replace(/\*/g, '**'))))) {
        diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local import ${specifier}.`, path, lineOf(expression)));
      } else if (!resolved && !specifier.startsWith('node:')) {
        diagnostics.push({ code: 'GRAPH_EXTERNAL_UNRESOLVED', severity: 'warning', message: `Unresolved package ${specifier}; treated as external.`, path, line: lineOf(expression) });
      }
      if (local && !known.has(target) && !/\.d\.[cm]?ts$/.test(target)) {
        diagnostics.push(error('GRAPH_OUTSIDE_INDEX', `Local import ${specifier} resolves outside indexed sources (${target}).`, path, lineOf(expression)));
      }
      graph.imports.push({ from: path, to: local ? target : `npm:${specifier}`, specifier, kind, line: lineOf(expression), external });
    }
    function visitRelations(node: ts.Node): void {
      if (ts.isImportDeclaration(node)) addImport(node.moduleSpecifier, 'import');
      else if (ts.isExportDeclaration(node) && node.moduleSpecifier) addImport(node.moduleSpecifier, 'export');
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) addImport(node.moduleReference.expression, 'require');
      else if (ts.isCallExpression(node)) {
        const argument = node.arguments[0];
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword && argument) addImport(argument, 'dynamic');
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && argument) addImport(argument, 'require');
        else {
          let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression);
          if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
          const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
          const file = declaration?.getSourceFile();
          const targetPath = file ? portable(relative(root, file.fileName)) : '';
          const target = file && declaration && known.has(targetPath) ? `${targetPath}#${symbol?.name}@${file.getLineAndCharacterOfPosition(declaration.getStart(file)).line + 1}` : null;
          graph.calls.push({ path, line: lineOf(node), expression: node.expression.getText(source), target });
        }
      }
      ts.forEachChild(node, visitRelations);
    }
    function visitSymbols(node: ts.Node): void {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
        const name = node.name.getText(source);
        graph.symbols.push({ id: `${path}#${name}@${lineOf(node)}`, name, path, line: lineOf(node), kind: ts.SyntaxKind[node.kind] });
      }
      ts.forEachChild(node, visitSymbols);
    }
    extractSymbols('typescript', path, () => visitSymbols(source));
    queueRelations('typescript', path, () => visitRelations(source));
  }
  const rustTexts = new Map(await mapWithConcurrency(rustSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of rustTexts) extractSymbols('rust', path, () => indexRustSymbols(path, text, graph));
  for (const [path, text] of rustTexts) queueRelations('rust', path, () => indexRustRelations(path, text, known, graph));
  const pythonTexts = new Map(await mapWithConcurrency(pythonSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of pythonTexts) extractSymbols('python', path, () => indexPythonSymbols(path, text, graph));
  for (const [path, text] of pythonTexts) queueRelations('python', path, () => indexPythonRelations(path, text, known, graph));
  const goTexts = new Map(await mapWithConcurrency(goSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of goTexts) extractSymbols('go', path, () => indexGoSymbols(path, text, graph));
  const goModule = paths.includes('go.mod') ? /^module\s+(\S+)/m.exec(await readText(root, 'go.mod'))?.[1] ?? null : null;
  for (const [path, text] of goTexts) queueRelations('go', path, () => indexGoRelations(path, text, known, graph, goModule));
  const javaTexts = new Map(await mapWithConcurrency(javaSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const javaTypes = new Map<string, string>();
  for (const [path, text] of javaTexts) extractSymbols('java', path, () => indexJavaSymbols(path, text, graph, javaTypes), javaTypes);
  for (const [path, text] of javaTexts) queueRelations('java', path, () => indexJavaRelations(path, text, graph, javaTypes));
  const cppTexts = new Map(await mapWithConcurrency(cppSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of cppTexts) extractSymbols('cpp', path, () => indexCppSymbols(path, text, graph));
  for (const [path, text] of cppTexts) queueRelations('cpp', path, () => indexCppRelations(path, text, known, graph));
  const csharpTexts = new Map(await mapWithConcurrency(csharpSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const csharpTypes = new Map<string, string>();
  for (const [path, text] of csharpTexts) extractSymbols('csharp', path, () => indexCsharpSymbols(path, text, graph, csharpTypes), csharpTypes);
  for (const [path, text] of csharpTexts) queueRelations('csharp', path, () => indexCsharpRelations(path, text, graph, csharpTypes));
  const phpTexts = new Map(await mapWithConcurrency(phpSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const phpTypes = new Map<string, string>();
  for (const [path, text] of phpTexts) extractSymbols('php', path, () => indexPhpSymbols(path, text, graph, phpTypes), phpTypes);
  for (const [path, text] of phpTexts) queueRelations('php', path, () => indexPhpRelations(path, text, known, graph, phpTypes));
  const rTexts = new Map(await mapWithConcurrency(rSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of rTexts) extractSymbols('r', path, () => indexRSymbols(path, text, graph));
  for (const [path, text] of rTexts) queueRelations('r', path, () => indexRRelations(path, text, known, graph));
  const juliaTexts = new Map(await mapWithConcurrency(juliaSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const juliaModules = new Map<string, string>();
  for (const [path, text] of juliaTexts) extractSymbols('julia', path, () => indexJuliaSymbols(path, text, graph, juliaModules), juliaModules);
  for (const [path, text] of juliaTexts) queueRelations('julia', path, () => indexJuliaRelations(path, text, known, graph, juliaModules));
  const kotlinTexts = new Map(await mapWithConcurrency(kotlinSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const kotlinDeclarations = new Map<string, string>();
  for (const [path, text] of kotlinTexts) extractSymbols('kotlin', path, () => indexKotlinSymbols(path, text, graph, kotlinDeclarations), kotlinDeclarations);
  for (const [path, text] of kotlinTexts) queueRelations('kotlin', path, () => indexKotlinRelations(path, text, known, graph, kotlinDeclarations));
  const rubyTexts = new Map(await mapWithConcurrency(rubySources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of rubyTexts) extractSymbols('ruby', path, () => indexRubySymbols(path, text, graph));
  for (const [path, text] of rubyTexts) queueRelations('ruby', path, () => indexRubyRelations(path, text, known, graph));
  const swiftTexts = new Map(await mapWithConcurrency(swiftSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of swiftTexts) extractSymbols('swift', path, () => indexSwiftSymbols(path, text, graph));
  for (const [path, text] of swiftTexts) queueRelations('swift', path, () => indexSwiftRelations(path, text, graph));
  const dartTexts = new Map(await mapWithConcurrency(dartSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const dartPackages = new Map<string, string>();
  for (const manifest of paths.filter((path) => path.endsWith('pubspec.yaml'))) {
    const name = /^\s*name\s*:\s*([A-Za-z_]\w*)\s*$/m.exec(await readText(root, manifest))?.[1];
    if (name) dartPackages.set(dirname(manifest), name);
  }
  for (const [path, text] of dartTexts) extractSymbols('dart', path, () => indexDartSymbols(path, text, graph));
  for (const [path, text] of dartTexts) {
    let directory = dirname(path);
    let packageInfo: { directory: string; name: string } | null = null;
    while (true) {
      const name = dartPackages.get(directory);
      if (name) {
        packageInfo = { directory, name };
        break;
      }
      if (directory === '.') break;
      directory = dirname(directory);
    }
    queueRelations('dart', path, () => indexDartRelations(path, text, known, graph, packageInfo));
  }
  const scalaTexts = new Map(await mapWithConcurrency(scalaSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const scalaDeclarations = new Map<string, string>();
  for (const [path, text] of scalaTexts) extractSymbols('scala', path, () => indexScalaSymbols(path, text, graph, scalaDeclarations), scalaDeclarations);
  for (const [path, text] of scalaTexts) queueRelations('scala', path, () => indexScalaRelations(path, text, graph, scalaDeclarations));
  const elixirTexts = new Map(await mapWithConcurrency(elixirSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const elixirModules = new Map<string, string>();
  for (const [path, text] of elixirTexts) extractSymbols('elixir', path, () => indexElixirSymbols(path, text, graph, elixirModules), elixirModules);
  for (const [path, text] of elixirTexts) queueRelations('elixir', path, () => indexElixirRelations(path, text, known, graph, elixirModules));
  const haskellTexts = new Map(await mapWithConcurrency(haskellSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const haskellModules = new Map<string, string>();
  for (const [path, text] of haskellTexts) extractSymbols('haskell', path, () => indexHaskellSymbols(path, text, graph, haskellModules), haskellModules);
  for (const [path, text] of haskellTexts) queueRelations('haskell', path, () => indexHaskellRelations(path, text, graph, haskellModules));
  const luaTexts = new Map(await mapWithConcurrency(luaSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of luaTexts) extractSymbols('lua', path, () => indexLuaSymbols(path, text, graph));
  for (const [path, text] of luaTexts) queueRelations('lua', path, () => indexLuaRelations(path, text, known, graph));
  const zigTexts = new Map(await mapWithConcurrency(zigSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of zigTexts) extractSymbols('zig', path, () => indexZigSymbols(path, text, graph));
  for (const [path, text] of zigTexts) queueRelations('zig', path, () => indexZigRelations(path, text, known, graph));
  const solidityTexts = new Map(await mapWithConcurrency(soliditySources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  for (const [path, text] of solidityTexts) extractSymbols('solidity', path, () => indexSoliditySymbols(path, text, graph));
  for (const [path, text] of solidityTexts) queueRelations('solidity', path, () => indexSolidityRelations(path, text, known, graph));
  for (const [path, text] of cppTexts) extractSymbols('objective-c', path, () => indexObjectiveCSymbols(path, text, graph));
  for (const [path, text] of objectiveCSources.map((path) => [path, cppTexts.get(path)!] as const)) {
    queueRelations('objective-c', path, () => indexObjectiveCRelations(path, text, graph));
  }
  const fsharpTexts = new Map(await mapWithConcurrency(fsharpSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const fsharpDeclarations = new Map<string, string>();
  for (const [path, text] of fsharpTexts) extractSymbols('fsharp', path, () => indexFsharpSymbols(path, text, graph, fsharpDeclarations), fsharpDeclarations);
  for (const [path, text] of fsharpTexts) queueRelations('fsharp', path, () => indexFsharpRelations(path, text, graph, fsharpDeclarations));
  const vbTexts = new Map(await mapWithConcurrency(vbSources, FILE_READ_CONCURRENCY, async (path) => [path, await readText(root, path)] as const));
  const vbDeclarations = new Map<string, string>();
  for (const [path, text] of vbTexts) extractSymbols('vb', path, () => indexVbSymbols(path, text, graph, vbDeclarations), vbDeclarations);
  for (const [path, text] of vbTexts) queueRelations('vb', path, () => indexVbRelations(path, text, graph, vbDeclarations));
  for (const task of relationTasks) task();
  await Promise.all(phaseUnits.map(async (unit) => {
    unit.relationsPhase.consultedManifests = await consultedPackageManifests(root, unit.path, unit.relationsPhase.imports);
  }));
  phaseUnits.sort((left, right) => left.path.localeCompare(right.path) || left.language.localeCompare(right.language));
  const analyzedSourcePaths = [...actuallyAnalyzed].sort();
  const reusedSourcePaths = [...actuallyReused].filter((path) => !actuallyAnalyzed.has(path)).sort();
  return { graph, phaseUnits, analyzedSourcePaths, reusedSourcePaths };
}

function maskedRust(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"/g, (value) => value.replace(/[^\r\n]/g, ' '));
}

function rustTarget(from: string, specifier: string, known: Set<string>): string | null {
  const directory = dirname(from);
  const segments = specifier.split('::').filter(Boolean);
  let base = directory;
  if (segments[0] === 'crate') {
    base = 'src';
    segments.shift();
  } else {
    while (segments[0] === 'super') {
      base = dirname(base);
      segments.shift();
    }
    if (segments[0] === 'self') segments.shift();
  }
  for (let length = segments.length; length > 0; length -= 1) {
    const modulePath = segments.slice(0, length).join('/');
    for (const candidate of [`${base}/${modulePath}.rs`, `${base}/${modulePath}/mod.rs`]) {
      if (known.has(candidate)) return candidate;
    }
  }
  return null;
}

function indexRustSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskedRust(text);
  const lineOf = (index: number): number => searchable.slice(0, index).split(/\r?\n/).length;
  for (const match of searchable.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(fn|struct|enum|trait|type|const|static)\s+([A-Za-z_]\w*)/gm)) {
    const kind = match[1]!;
    const name = match[2]!;
    const line = lineOf(match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Rust${kind[0]!.toUpperCase()}${kind.slice(1)}` });
  }
}

function indexRustRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const searchable = maskedRust(text);
  const sourceLine = (index: number): number => lineOf(searchable, index);
  for (const match of searchable.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm)) {
    const specifier = match[1]!;
    const target = rustTarget(path, `self::${specifier}`, known);
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved Rust module ${specifier}.`, path, sourceLine(match.index)));
    graph.imports.push({ from: path, to: target ?? `crate:${specifier}`, specifier, kind: 'mod', line: sourceLine(match.index), external: !target });
  }
  for (const match of searchable.matchAll(/^\s*use\s+([^;{]+)(?:\{[^;]*\})?\s*;/gm)) {
    const specifier = match[1]!.trim().replace(/::$/, '');
    const target = /^(?:crate|self|super)::/.test(specifier) ? rustTarget(path, specifier, known) : null;
    graph.imports.push({ from: path, to: target ?? `crate:${specifier}`, specifier, kind: 'use', line: sourceLine(match.index), external: !target });
  }
  const symbolsByName = new Map<string, CodeSymbol[]>();
  for (const symbol of graph.symbols) {
    const entries = symbolsByName.get(symbol.name) ?? [];
    entries.push(symbol);
    symbolsByName.set(symbol.name, entries);
  }
  for (const match of searchable.matchAll(/\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*\(/g)) {
    const expression = match[1]!;
    const prefix = searchable.slice(Math.max(0, match.index - 5), match.index);
    if (/\bfn\s+$/.test(prefix) || ['if', 'while', 'for', 'match', 'loop'].includes(expression)) continue;
    const name = expression.split('::').at(-1)!;
    const candidates = symbolsByName.get(name) ?? [];
    const target = candidates.length === 1 ? candidates[0]!.id : null;
    graph.calls.push({ path, line: sourceLine(match.index), expression, target });
  }
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

function maskWithPatterns(text: string, patterns: RegExp[]): string {
  let masked = text;
  for (const pattern of patterns) masked = masked.replace(pattern, (value) => value.replace(/[^\r\n]/g, ' '));
  return masked;
}

function addCalls(path: string, searchable: string, graph: CodeGraph, ignored: Set<string>, skipAnnotations = false): void {
  const symbols = new Map<string, CodeSymbol[]>();
  for (const symbol of graph.symbols) {
    const values = symbols.get(symbol.name) ?? [];
    values.push(symbol);
    symbols.set(symbol.name, values);
  }
  for (const match of searchable.matchAll(/\b([A-Za-z_]\w*!?(?:[.:]{1,2}[A-Za-z_]\w*!?)*)\s*\(/g)) {
    const expression = match[1]!;
    const name = expression.split(/::|\./).at(-1)!;
    const prefix = searchable.slice(Math.max(0, match.index - 24), match.index);
    if (ignored.has(name) || /\b(?:def|class|func|function|fn|fun|let|sub|new)\s+$/i.test(prefix)) continue;
    if (skipAnnotations && prefix.endsWith('@')) continue;
    const candidates = symbols.get(expression) ?? symbols.get(name) ?? [];
    graph.calls.push({ path, line: lineOf(searchable, match.index), expression, target: candidates.length === 1 ? candidates[0]!.id : null });
  }
}

function pythonTarget(from: string, specifier: string, known: Set<string>): string | null {
  let module = specifier;
  let base = '';
  if (module.startsWith('.')) {
    const dots = module.match(/^\.+/)![0].length;
    base = dirname(from);
    for (let index = 1; index < dots; index += 1) base = dirname(base);
    module = module.slice(dots);
  }
  const relativeModule = module.replace(/\./g, '/');
  return [
    `${base ? `${base}/` : ''}${relativeModule}.py`,
    `${base ? `${base}/` : ''}${relativeModule}/__init__.py`,
    `src/${relativeModule}.py`,
    `src/${relativeModule}/__init__.py`,
  ].find((candidate) => known.has(candidate)) ?? null;
}

function indexPythonSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/'''[\s\S]*?'''|"""[\s\S]*?"""/g, /#[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/gm)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: match[1] === 'class' ? 'PythonClass' : 'PythonFunction' });
  }
}

function indexPythonRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/'''[\s\S]*?'''|"""[\s\S]*?"""/g, /#[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const addImport = (specifier: string, index: number): void => {
    const target = pythonTarget(path, specifier, known);
    graph.imports.push({ from: path, to: target ?? `python:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, index), external: !target });
  };
  for (const match of searchable.matchAll(/^\s*import\s+([^\r\n]+)/gm)) {
    for (const entry of match[1]!.split(',')) addImport(entry.trim().split(/\s+as\s+/)[0]!, match.index);
  }
  for (const match of searchable.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gm)) addImport(match[1]!, match.index);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'def', 'class', 'return']));
}

function goTarget(specifier: string, moduleName: string | null, known: Set<string>): string | null {
  if (!moduleName || (specifier !== moduleName && !specifier.startsWith(`${moduleName}/`))) return null;
  const directory = specifier === moduleName ? '.' : specifier.slice(moduleName.length + 1);
  return [...known].filter((path) => path.endsWith('.go') && dirname(path) === directory).sort()[0] ?? null;
}

function indexGoSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"(?:\\.|[^"\\])*"|`[\s\S]*?`/g]);
  for (const match of searchable.matchAll(/^\s*(?:func\s+(?:\([^)]*\)\s*)?|type\s+|var\s+|const\s+)([A-Za-z_]\w*)/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    const prefix = match[0]!.trimStart();
    const kind = prefix.startsWith('func') ? 'GoFunction' : prefix.startsWith('type') ? 'GoType' : prefix.startsWith('const') ? 'GoConst' : 'GoVar';
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind });
  }
}

function indexGoRelations(path: string, text: string, known: Set<string>, graph: CodeGraph, moduleName: string | null): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  const imports: { specifier: string; index: number }[] = [];
  for (const match of searchable.matchAll(/^\s*import\s+(?:[A-Za-z_]\w*\s+)?["]([^"]+)["]/gm)) imports.push({ specifier: match[1]!, index: match.index });
  for (const block of searchable.matchAll(/^\s*import\s*\(([\s\S]*?)^\s*\)/gm)) {
    for (const match of block[1]!.matchAll(/(?:^|\n)\s*(?:[A-Za-z_]\w*\s+)?["]([^"]+)["]/g)) {
      imports.push({ specifier: match[1]!, index: block.index + match.index });
    }
  }
  for (const { specifier, index } of imports) {
    const target = goTarget(specifier, moduleName, known);
    graph.imports.push({ from: path, to: target ?? `go:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, index), external: !target });
  }
  addCalls(path, maskWithPatterns(searchable, [/"(?:\\.|[^"\\])*"|`[\s\S]*?`/g]), graph, new Set(['if', 'for', 'switch', 'select', 'func', 'go', 'defer']));
}

function indexJavaSymbols(path: string, text: string, graph: CodeGraph, types: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Java${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
    types.set(packageName ? `${packageName}.${name}` : name, path);
  }
  for (const match of searchable.matchAll(/\b(?:(?:public|protected|private|static|final|abstract|synchronized|native)\s+)*[\w<>\[\], ?]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:throws[^{]+)?\{/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'JavaMethod' });
  }
}

function indexJavaRelations(path: string, text: string, graph: CodeGraph, types: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+?)(?:\.\*)?\s*;/gm)) {
    const specifier = match[1]!;
    const target = types.get(specifier) ?? null;
    graph.imports.push({ from: path, to: target ?? `java:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, match.index), external: !target });
  }
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'return', 'new']), true);
}

function relativeTarget(from: string, specifier: string, known: Set<string>): string | null {
  const target = posix.normalize(posix.join(posix.dirname(from), specifier.replaceAll('\\', '/')));
  return known.has(target) ? target : null;
}

function indexCppSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/\b(class|struct|enum|union)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Cpp${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
  }
  for (const match of searchable.matchAll(/(?:^|[;}]\s*)(?:template\s*<[^;{}]+>\s*)?(?:[\w:<>]+\s+)+[*&\s]*([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?\{/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'CppFunction' });
  }
}

function indexCppRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const commentsMasked = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/^\s*#\s*(?:include|import)\s*([<"])([^>"]+)[>"]/gm)) {
    const specifier = match[2]!;
    const quoted = match[1] === '"';
    const target = quoted ? relativeTarget(path, specifier, known) : null;
    if (quoted && !target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local include ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `cpp:${specifier}`, specifier, kind: 'include', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'switch', 'catch', 'sizeof', 'alignof', 'decltype']));
}

function indexCsharpSymbols(path: string, text: string, graph: CodeGraph, types: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const namespace = /^\s*namespace\s+([\w.]+)\s*[;{]/m.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/\b(class|interface|enum|record|struct)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Csharp${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
    types.set(namespace ? `${namespace}.${name}` : name, path);
  }
  for (const match of searchable.matchAll(/\b(?:(?:public|protected|private|internal|static|virtual|override|abstract|async|sealed|partial)\s+)+[\w<>\[\],.?]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:where[^{]+)?\{/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'CsharpMethod' });
  }
}

function indexCsharpRelations(path: string, text: string, graph: CodeGraph, types: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*using\s+(?:static\s+)?(?:[A-Za-z_]\w*\s*=\s*)?([\w.]+)\s*;/gm)) {
    const specifier = match[1]!;
    const target = types.get(specifier) ?? [...types].find(([name]) => name.startsWith(`${specifier}.`))?.[1] ?? null;
    graph.imports.push({ from: path, to: target ?? `csharp:${specifier}`, specifier, kind: 'using', line: lineOf(searchable, match.index), external: !target });
  }
  addCalls(path, searchable, graph, new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'lock', 'using', 'nameof', 'typeof', 'checked', 'unchecked']));
}

function indexPhpSymbols(path: string, text: string, graph: CodeGraph, types: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*|#[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const namespace = /^\s*namespace\s+([A-Za-z_][\w\\]*)\s*;/m.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/\b(class|interface|trait|enum)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Php${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
    types.set(namespace ? `${namespace}\\${name}` : name, path);
  }
  for (const match of searchable.matchAll(/\bfunction\s+&?\s*([A-Za-z_]\w*)\s*\(/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'PhpFunction' });
  }
}

function indexPhpRelations(path: string, text: string, known: Set<string>, graph: CodeGraph, types: Map<string, string>): void {
  const commentsMasked = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*|#[^\r\n]*/g]);
  const searchable = maskWithPatterns(commentsMasked, [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/\b(?:require_once|require|include_once|include)\b/g)) {
    const remainder = commentsMasked.slice(match.index + match[0].length);
    let expression = /^\s*(\([^;\r\n]*\)|[^;\r\n]*)/.exec(remainder)?.[1]?.trim() ?? '';
    if (expression.startsWith('(') && expression.endsWith(')')) expression = expression.slice(1, -1).trim();
    const quote = expression[0];
    let end = -1;
    if (quote === '"' || quote === "'") {
      for (let index = 1; index < expression.length; index += 1) {
        if (expression[index] === '\\') {
          index += 1;
          continue;
        }
        if (expression[index] === quote) {
          end = index;
          break;
        }
      }
    }
    const staticLiteral = end > 0 && expression.slice(end + 1).trim() === ''
      && !(quote === '"' && /(^|[^\\])\$/.test(expression.slice(1, end)));
    if (!staticLiteral) {
      graph.diagnostics.push({
        code: 'GRAPH_DYNAMIC',
        severity: 'warning',
        message: 'Nonliteral PHP module loading is not statically resolved.',
        path,
        line: lineOf(commentsMasked, match.index),
      });
      continue;
    }
    const specifier = expression.slice(1, end);
    const target = relativeTarget(path, specifier, known);
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local PHP include ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `php:${specifier}`, specifier, kind: 'include', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const namespace = /^\s*namespace\s+([A-Za-z_][\w\\]*)\s*;/m.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/^[ \t]*use\s+([A-Za-z_][\w\\]*(?:\s+as\s+\w+)?(?:\s*,\s*[A-Za-z_][\w\\]*(?:\s+as\s+\w+)?)*)\s*;/gm)) {
    const line = lineOf(searchable, match.index);
    for (const entry of match[1]!.split(',')) {
      const specifier = entry.trim().split(/\s+as\s+/i)[0]!.trim();
      if (!specifier) continue;
      const target = types.get(specifier)
        ?? (namespace ? types.get(`${namespace}\\${specifier}`) ?? null : null);
      if (target === path) continue;
      graph.imports.push({ from: path, to: target ?? `php:${specifier}`, specifier, kind: 'use', line, external: !target });
    }
  }
  addCalls(path, searchable, graph, new Set([
    'if', 'for', 'foreach', 'while', 'switch', 'catch', 'isset', 'empty', 'echo',
    'function', 'declare', 'fn', 'use', 'exit', 'die',
    'include', 'include_once', 'require', 'require_once',
  ]));
}

function indexRSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/#[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*([A-Za-z.][\w.]*)\s*(?:<-|=)\s*function\s*\(/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'RFunction' });
  }
}

function indexRRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const commentsMasked = maskWithPatterns(text, [/#[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/\bsource\s*\(\s*["']([^"']+)["']/g)) {
    const specifier = match[1]!;
    const target = relativeTarget(path, specifier, known);
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local R source ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `r:${specifier}`, specifier, kind: 'include', line: lineOf(commentsMasked, match.index), external: !target });
  }
  for (const match of commentsMasked.matchAll(/\b(?:library|require)\s*\(\s*(?:package\s*=\s*)?["']?([A-Za-z][\w.]*)/g)) {
    const specifier = match[1]!;
    graph.imports.push({ from: path, to: `r:${specifier}`, specifier, kind: 'import', line: lineOf(commentsMasked, match.index), external: true });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'function', 'library', 'require', 'source']));
}

function indexJuliaSymbols(path: string, text: string, graph: CodeGraph, modules: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/#=[\s\S]*?=#/g, /#[^\r\n]*/g, /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*(?:baremodule|module)\s+([A-Za-z_]\w*)/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'JuliaModule' });
    modules.set(name, path);
  }
  for (const match of searchable.matchAll(/^\s*(?:(mutable)\s+)?(struct|abstract\s+type|primitive\s+type)\s+([A-Za-z_]\w*)/gm)) {
    const name = match[3]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'JuliaType' });
  }
  for (const match of searchable.matchAll(/^\s*function\s+([A-Za-z_]\w*!?)/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'JuliaFunction' });
  }
  for (const match of searchable.matchAll(/^\s*([A-Za-z_]\w*!?)\s*\([^=\r\n]*\)\s*=/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    if (!graph.symbols.some((symbol) => symbol.path === path && symbol.name === name && symbol.line === line)) {
      graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'JuliaFunction' });
    }
  }
}

function indexJuliaRelations(path: string, text: string, known: Set<string>, graph: CodeGraph, modules: Map<string, string>): void {
  const commentsMasked = maskWithPatterns(text, [/#=[\s\S]*?=#/g, /#[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/\binclude\s*\(\s*["']([^"']+)["']/g)) {
    const specifier = match[1]!;
    const target = relativeTarget(path, specifier, known);
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Julia include ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `julia:${specifier}`, specifier, kind: 'include', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*(?:using|import)\s+([^\r\n]+)/gm)) {
    const clause = match[1]!.trim();
    const entries = clause.includes(':') ? [clause.split(':', 1)[0]!] : clause.split(',');
    for (const entry of entries) {
      const specifier = entry.trim().replace(/^\.+/, '').split('.')[0]!;
      const target = modules.get(specifier) ?? null;
      graph.imports.push({ from: path, to: target ?? `julia:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, match.index), external: !target });
    }
  }
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'function', 'macro', 'include', 'using', 'import']));
}

function declarationTargets(specifier: string, declarations: Map<string, string>): string[] {
  const exact = declarations.get(specifier);
  if (exact) return [exact];
  return [...new Set([...declarations]
    .filter(([name]) => name.startsWith(`${specifier}.`))
    .map(([, path]) => path))].sort();
}

function splitTopLevel(value: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ('{(['.includes(character!)) depth += 1;
    else if ('})]'.includes(character!)) depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      entries.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  entries.push(value.slice(start).trim());
  return entries.filter(Boolean);
}

function relativeFileTarget(from: string, specifier: string, known: Set<string>, suffixes: string[]): string | null {
  const normalized = specifier.replaceAll('\\', '/');
  const candidates = suffixes.map((suffix) => normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`);
  for (const candidate of candidates) {
    const target = relativeTarget(from, candidate, known);
    if (target) return target;
  }
  return null;
}

function projectFileTarget(specifier: string, known: Set<string>, suffixes: string[]): string | null {
  const normalized = posix.normalize(specifier.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || posix.isAbsolute(normalized)) return null;
  return suffixes.map((suffix) => normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`)
    .find((candidate) => known.has(candidate)) ?? null;
}

function indexKotlinSymbols(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const packageName = /^\s*package\s+([\w.]+)/m.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/\b(?:(?:data|sealed|enum|annotation|value)\s+)?(class|interface|object|typealias)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Kotlin${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
    declarations.set(packageName ? `${packageName}.${name}` : name, path);
  }
  for (const match of searchable.matchAll(/\bfun\s+(?:<[^>]+>\s*)?(?:[\w?.<>]+\.)?([A-Za-z_]\w*)\s*\(/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'KotlinFunction' });
    declarations.set(packageName ? `${packageName}.${name}` : name, path);
  }
}

function indexKotlinRelations(path: string, text: string, known: Set<string>, graph: CodeGraph, declarations: Map<string, string>): void {
  const commentsMasked = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/@file:Import\s*\(\s*"([^"]+)"\s*\)/g)) {
    const specifier = match[1]!;
    const target = relativeFileTarget(path, specifier, known, ['', '.kt', '.kts']);
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Kotlin script import ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `kotlin:${specifier}`, specifier, kind: 'import', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*import\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\.\*)?(?:\s+as\s+\w+)?/gm)) {
    const specifier = match[1]!;
    const allTargets = declarationTargets(specifier, declarations);
    const targets = allTargets.filter((target) => target !== path);
    if (allTargets.length && !targets.length) continue;
    for (const target of targets.length ? targets : [null]) {
      graph.imports.push({ from: path, to: target ?? `kotlin:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, match.index), external: !target });
    }
  }
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'when', 'catch', 'fun', 'class', 'interface', 'object']), true);
}

function indexRubySymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/^=begin\b[\s\S]*?^=end\b[^\r\n]*/gm, /#[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*(class|module)\s+([A-Z]\w*(?:::[A-Z]\w*)*)/gm)) {
    const name = match[2]!.split('::').at(-1)!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: match[1] === 'class' ? 'RubyClass' : 'RubyModule' });
  }
  for (const match of searchable.matchAll(/^\s*def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'RubyMethod' });
  }
}

function indexRubyRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const commentsMasked = maskWithPatterns(text, [/^=begin\b[\s\S]*?^=end\b[^\r\n]*/gm, /#[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/^\s*(require_relative|require|load)\s*(?:\(\s*)?["']([^"']+)["']/gm)) {
    const directive = match[1]!;
    const specifier = match[2]!;
    const explicitlyLocal = directive === 'require_relative' || directive === 'load' || specifier.startsWith('.');
    const target = directive === 'require_relative'
      ? relativeFileTarget(path, specifier, known, ['', '.rb', '/init.rb'])
      : explicitlyLocal ? projectFileTarget(specifier, known, ['', '.rb', '/init.rb']) : null;
    if (explicitlyLocal && !target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Ruby dependency ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `ruby:${specifier}`, specifier, kind: directive === 'load' ? 'include' : 'require', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'unless', 'while', 'until', 'for', 'def', 'class', 'module', 'require', 'require_relative', 'load']));
}

function indexSwiftSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"/g]);
  for (const match of searchable.matchAll(/\b(class|struct|enum|protocol|actor|typealias)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Swift${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
  }
  for (const match of searchable.matchAll(/\bfunc\s+([A-Za-z_]\w*)\s*\(/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'SwiftFunction' });
  }
}

function indexSwiftRelations(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"/g]);
  for (const match of searchable.matchAll(/^\s*(?:@\w+(?:\([^)]*\))?\s+)?import\s+(?:(?:class|struct|enum|protocol|func|var|let|typealias)\s+)?([\w.]+)/gm)) {
    const specifier = match[1]!;
    graph.imports.push({ from: path, to: `swift:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, match.index), external: true });
  }
  addCalls(path, searchable, graph, new Set([
    'if', 'for', 'while', 'switch', 'catch', 'func', 'init', 'deinit',
    'private', 'fileprivate', 'internal', 'package',
  ]));
}

function indexDartSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const reserved = new Set([
    'assert', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'do',
    'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if', 'in', 'is',
    'new', 'null', 'rethrow', 'return', 'super', 'switch', 'this', 'throw', 'true',
    'try', 'var', 'void', 'while', 'with', 'yield',
  ]);
  for (const match of searchable.matchAll(/\b(class|enum|mixin|extension|typedef)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Dart${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
  }
  for (const match of searchable.matchAll(/^\s*(?:[\w<>,?[\] ]+\s+)([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:async\*?|sync\*)?\s*(?:=>|\{)/gm)) {
    const name = match[1]!;
    if (reserved.has(name)) continue;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'DartFunction' });
  }
}

function indexDartRelations(
  path: string,
  text: string,
  known: Set<string>,
  graph: CodeGraph,
  packageInfo: { directory: string; name: string } | null,
): void {
  const commentsMasked = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/^\s*(import|export|part)\s+([^;]+);/gm)) {
    const directive = match[1]!;
    for (const uri of match[2]!.matchAll(/["']([^"']+)["']/g)) {
      const specifier = uri[1]!;
      const packageMatch = /^package:([^/]+)\/(.+)$/.exec(specifier);
      const ownPackage = Boolean(packageMatch && packageInfo && packageMatch[1] === packageInfo.name);
      const ownPackagePath = ownPackage ? packageMatch![2]! : null;
      const explicitlyLocal = ownPackage || !/^(?:dart|package):/.test(specifier);
      const packageRoot = packageInfo?.directory === '.' ? '' : `${packageInfo?.directory}/`;
      const target = ownPackage
        ? [`${packageRoot}lib/${ownPackagePath}`, `${packageRoot}lib/${ownPackagePath}.dart`].find((candidate) => known.has(candidate)) ?? null
        : explicitlyLocal ? relativeFileTarget(path, specifier, known, ['', '.dart']) : null;
      if (explicitlyLocal && !target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Dart ${directive} ${specifier}.`, path, lineOf(commentsMasked, match.index)));
      graph.imports.push({ from: path, to: target ?? `dart:${specifier}`, specifier, kind: directive === 'part' ? 'include' : directive as 'import' | 'export', line: lineOf(commentsMasked, match.index), external: !target });
    }
  }
  const searchable = maskWithPatterns(commentsMasked, [/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'switch', 'catch', 'assert', 'throw']));
}

function indexScalaSymbols(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const packageName = /^\s*package\s+([\w.]+)/m.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/\b(class|object|trait|enum|type)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Scala${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
    declarations.set(packageName ? `${packageName}.${name}` : name, path);
  }
  for (const match of searchable.matchAll(/\bdef\s+([A-Za-z_]\w*)\s*(?:\[|[(])/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'ScalaMethod' });
    declarations.set(packageName ? `${packageName}.${name}` : name, path);
  }
}

function indexScalaRelations(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*import\s+([^\r\n]+)/gm)) {
    const addedTargets = new Set<string>();
    for (const raw of splitTopLevel(match[1]!)) {
      const grouped = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.\{([^}]+)\}/.exec(raw);
      const wildcard = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.(?:_|\*)(?:\s|$)/.exec(raw);
      const specifiers = grouped
        ? grouped[2]!.split(',').map((entry) => entry.trim().split(/\s*(?:=>|\bas\b)\s*/)[0]!)
          .map((entry) => entry === '_' || entry === '*' ? grouped[1]! : `${grouped[1]}.${entry}`)
        : [wildcard?.[1] ?? /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/.exec(raw)?.[1]].filter((entry): entry is string => Boolean(entry));
      for (const specifier of specifiers) {
        const allTargets = declarationTargets(specifier, declarations);
        const targets = allTargets.filter((target) => target !== path);
        if (allTargets.length && !targets.length) continue;
        for (const target of targets.length ? targets : [null]) {
          if (target && addedTargets.has(target)) continue;
          if (target) addedTargets.add(target);
          graph.imports.push({ from: path, to: target ?? `scala:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, match.index), external: !target });
        }
      }
    }
  }
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'match', 'catch', 'def', 'class', 'object', 'trait']), true);
}

function indexElixirSymbols(path: string, text: string, graph: CodeGraph, modules: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/~[A-Z]?[a-z]?(?:\/(?:\\.|[^\/\\])*\/|"(?:\\.|[^"\\])*")/g, /#[^\r\n]*/g, /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*defmodule\s+([A-Z]\w*(?:\.[A-Z]\w*)*)/gm)) {
    const fullName = match[1]!;
    const name = fullName.split('.').at(-1)!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'ElixirModule' });
    modules.set(fullName, path);
  }
  for (const match of searchable.matchAll(/^\s*(def|defp|defmacro|defmacrop)\s+([a-z_]\w*[!?]?)/gm)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    const kind = match[1]!.includes('macro') ? 'ElixirMacro' : 'ElixirFunction';
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind });
  }
}

function indexElixirRelations(path: string, text: string, known: Set<string>, graph: CodeGraph, modules: Map<string, string>): void {
  const commentsMasked = maskWithPatterns(text, [/#[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/\bCode\.(?:require_file|compile_file)\s*\(\s*"([^"]+)"\s*(?:,\s*__DIR__\s*)?\)/g)) {
    const specifier = match[1]!;
    const target = match[0].includes('__DIR__') || /^[.]/.test(specifier)
      ? relativeFileTarget(path, specifier, known, ['', '.ex', '.exs'])
      : [specifier, `${specifier}.ex`, `${specifier}.exs`].find((candidate) => known.has(candidate)) ?? null;
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Elixir file dependency ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `elixir:${specifier}`, specifier, kind: 'require', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/~[A-Z]?[a-z]?(?:\/(?:\\.|[^\/\\])*\/|"(?:\\.|[^"\\])*")/g, /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*(alias|import|require|use)\s+([A-Z]\w*(?:\.[A-Z]\w*)*)(?:\.\{([^}]+)\})?/gm)) {
    const directive = match[1]!;
    const prefix = match[2]!;
    const specifiers = match[3]
      ? match[3].split(',').map((entry) => `${prefix}.${entry.trim()}`).filter((entry) => /(?:^|\.)[A-Z]\w*$/.test(entry))
      : [prefix];
    for (const specifier of specifiers) {
      const target = modules.get(specifier) ?? null;
      graph.imports.push({ from: path, to: target ?? `elixir:${specifier}`, specifier, kind: directive === 'use' ? 'use' : directive === 'require' ? 'require' : 'import', line: lineOf(searchable, match.index), external: !target });
    }
  }
  addCalls(path, searchable, graph, new Set(['if', 'unless', 'case', 'cond', 'for', 'with', 'def', 'defp', 'defmodule', 'alias', 'import', 'require', 'use']));
}

function indexHaskellSymbols(path: string, text: string, graph: CodeGraph, modules: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\{-[\s\S]*?-\}/g, /--[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const reserved = new Set([
    'as', 'case', 'class', 'data', 'default', 'deriving', 'do', 'else', 'foreign',
    'hiding', 'if', 'import', 'in', 'infix', 'infixl', 'infixr', 'instance', 'let',
    'module', 'newtype', 'of', 'qualified', 'then', 'type', 'where',
  ]);
  const moduleMatch = /^\s*module\s+([A-Z]\w*(?:\.[A-Z]\w*)*)/m.exec(searchable);
  if (moduleMatch) {
    const fullName = moduleMatch[1]!;
    const name = fullName.split('.').at(-1)!;
    const line = lineOf(searchable, moduleMatch.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'HaskellModule' });
    modules.set(fullName, path);
  }
  for (const match of searchable.matchAll(/^\s*(data|newtype|type|class)\s+(?:\([^)]*\)\s*=>\s*)?([A-Z]\w*)/gm)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Haskell${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
  }
  for (const match of searchable.matchAll(/^\s*([a-z_]\w*)\s+[^:=\r\n]*=/gm)) {
    const name = match[1]!;
    if (reserved.has(name)) continue;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'HaskellFunction' });
  }
}

function indexHaskellRelations(path: string, text: string, graph: CodeGraph, modules: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\{-[\s\S]*?-\}/g, /--[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*import\s+(?:qualified\s+)?([A-Z]\w*(?:\.[A-Z]\w*)*)/gm)) {
    const specifier = match[1]!;
    const target = modules.get(specifier) ?? null;
    graph.imports.push({ from: path, to: target ?? `haskell:${specifier}`, specifier, kind: 'import', line: lineOf(searchable, match.index), external: !target });
  }
  addCalls(path, searchable, graph, new Set(['if', 'then', 'else', 'case', 'of', 'let', 'where', 'module', 'import']));
}

function luaTarget(specifier: string, known: Set<string>): string | null {
  const modulePath = specifier.replace(/\./g, '/');
  return projectFileTarget(modulePath, known, ['.lua', '/init.lua']);
}

function indexLuaSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/--\[(=*)\[[\s\S]*?\]\1\]/g, /--[^\r\n]*/g, /\[(=*)\[[\s\S]*?\]\1\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*(?:local\s+)?function\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(/gm)) {
    const name = match[1]!.split(/[.:]/).at(-1)!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'LuaFunction' });
  }
  for (const match of searchable.matchAll(/^\s*(?:local\s+)?([A-Za-z_]\w*)\s*=\s*function\s*\(/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'LuaFunction' });
  }
}

function indexLuaRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const commentsMasked = maskWithPatterns(text, [/--\[(=*)\[[\s\S]*?\]\1\]/g, /--[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/\b(require|dofile|loadfile)\s*(?:\(\s*)?["']([^"']+)["']/g)) {
    const directive = match[1]!;
    const specifier = match[2]!;
    const target = directive === 'require'
      ? luaTarget(specifier, known)
      : projectFileTarget(specifier, known, ['', '.lua']);
    const explicitlyLocal = directive !== 'require' || /^[./]/.test(specifier) || specifier.endsWith('.lua');
    if (explicitlyLocal && !target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Lua dependency ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `lua:${specifier}`, specifier, kind: directive === 'require' ? 'require' : 'include', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/\[(=*)\[[\s\S]*?\]\1\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'function', 'require', 'dofile', 'loadfile', 'type']));
}

function indexZigSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/\b(?:pub\s+|export\s+|extern\s+|inline\s+|noinline\s+)*fn\s+([A-Za-z_]\w*)\s*\(/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'ZigFunction' });
  }
  for (const match of searchable.matchAll(/\b(?:pub\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(struct|enum|union|opaque)\b/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Zig${match[2]![0]!.toUpperCase()}${match[2]!.slice(1)}` });
  }
}

function indexZigRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const commentsMasked = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/@import\s*\(\s*"([^"]+)"\s*\)/g)) {
    const specifier = match[1]!;
    const explicitlyLocal = /^[./]/.test(specifier) || specifier.endsWith('.zig');
    const target = explicitlyLocal ? relativeFileTarget(path, specifier, known, ['', '.zig']) : null;
    if (explicitlyLocal && !target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Zig import ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `zig:${specifier}`, specifier, kind: 'import', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'switch', 'catch', 'fn', 'asm', 'comptime']));
}

function indexSoliditySymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/\b(contract|library|interface|struct|enum)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Solidity${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
  }
  for (const match of searchable.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(/g)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'SolidityFunction' });
  }
}

function indexSolidityRelations(path: string, text: string, known: Set<string>, graph: CodeGraph): void {
  const commentsMasked = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/\bimport\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']\s*;/g)) {
    const specifier = match[1]!;
    const directProjectTarget = known.has(specifier) ? specifier : null;
    const explicitlyLocal = /^[.]/.test(specifier) || directProjectTarget !== null;
    const target = directProjectTarget ?? (explicitlyLocal ? relativeFileTarget(path, specifier, known, ['', '.sol']) : null);
    if (explicitlyLocal && !target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local Solidity import ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `solidity:${specifier}`, specifier, kind: 'import', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'require', 'assert', 'revert', 'function', 'modifier', 'constructor']));
}

function indexObjectiveCSymbols(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /@"(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/@(interface|implementation|protocol)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    if (!graph.symbols.some((symbol) => symbol.path === path && symbol.name === name && symbol.line === line)) {
      graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `ObjectiveC${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}` });
    }
  }
  for (const match of searchable.matchAll(/^\s*[-+]\s*\([^)]*\)\s*([^;{\r\n]+)/gm)) {
    const signature = match[1]!;
    const components = [...signature.matchAll(/\b([A-Za-z_]\w*)\s*:/g)].map((component) => component[1]!);
    const name = components.length
      ? `${components.join(':')}:`
      : /^([A-Za-z_]\w*)/.exec(signature)?.[1];
    if (!name) continue;
    const line = lineOf(searchable, match.index);
    const preceding = searchable.slice(0, match.index);
    const ownerMatch = [...preceding.matchAll(/@(interface|implementation|protocol)\s+([A-Za-z_]\w*)|@end/g)].at(-1);
    const container = ownerMatch?.[2];
    graph.symbols.push({
      id: `${path}#${name}@${line}`,
      name,
      path,
      line,
      kind: 'ObjectiveCMethod',
      ...(container ? { container } : {}),
    });
  }
}

function indexObjectiveCRelations(path: string, text: string, graph: CodeGraph): void {
  const searchable = maskWithPatterns(text, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g, /@"(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/\[\s*([A-Za-z_]\w*)\s+([^\]\r\n]+)\]/g)) {
    const receiver = match[1]!;
    const message = match[2]!;
    const components = [...message.matchAll(/\b([A-Za-z_]\w*)\s*:/g)].map((component) => component[1]!);
    const selector = components.length
      ? `${components.join(':')}:`
      : /^([A-Za-z_]\w*)/.exec(message)?.[1];
    if (!selector) continue;
    const candidates = graph.symbols.filter((symbol) =>
      symbol.name === selector && symbol.kind === 'ObjectiveCMethod' && symbol.container === receiver);
    const implementation = candidates.find((candidate) =>
      graph.symbols.some((symbol) => symbol.path === candidate.path
        && symbol.name === receiver && symbol.kind === 'ObjectiveCImplementation'));
    const target = implementation?.id ?? (candidates.length === 1 ? candidates[0]!.id : null);
    graph.calls.push({ path, line: lineOf(searchable, match.index), expression: `${receiver}.${selector}`, target });
  }
}

function indexFsharpSymbols(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/\(\*[\s\S]*?\*\)/g, /\/\/[^\r\n]*/g, /@"(?:""|[^"])*"|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  const namespaceName = /^\s*namespace\s+([\w.]+)/m.exec(searchable)?.[1] ?? '';
  const moduleMatches = [...searchable.matchAll(/^\s*module\s+(?:rec\s+)?([\w.]+)/gm)];
  for (const moduleMatch of moduleMatches) {
    const declaredName = moduleMatch[1]!;
    const fullName = namespaceName && !declaredName.includes('.') ? `${namespaceName}.${declaredName}` : declaredName;
    const name = declaredName.split('.').at(-1)!;
    const line = lineOf(searchable, moduleMatch.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'FsharpModule' });
    declarations.set(fullName, path);
  }
  const firstModule = moduleMatches[0]?.[1];
  const scope = firstModule
    ? namespaceName && !firstModule.includes('.') ? `${namespaceName}.${firstModule}` : firstModule
    : namespaceName;
  for (const match of searchable.matchAll(/^\s*type\s+([A-Za-z_]\w*)/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'FsharpType' });
    declarations.set(scope ? `${scope}.${name}` : name, path);
  }
  for (const match of searchable.matchAll(/^\s*let\s+(?:inline\s+|rec\s+|private\s+|internal\s+)*([A-Za-z_]\w*)\b/gm)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'FsharpValue' });
    declarations.set(scope ? `${scope}.${name}` : name, path);
  }
}

function indexFsharpRelations(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const commentsMasked = maskWithPatterns(text, [/\(\*[\s\S]*?\*\)/g, /\/\/[^\r\n]*/g]);
  for (const match of commentsMasked.matchAll(/^\s*#load\s+@"([^"]+)"|^\s*#load\s+"([^"]+)"/gm)) {
    const specifier = match[1] ?? match[2]!;
    const target = relativeFileTarget(path, specifier, new Set(graph.files), ['', '.fs', '.fsx']);
    if (!target) graph.diagnostics.push(error('GRAPH_UNRESOLVED', `Unresolved local F# load ${specifier}.`, path, lineOf(commentsMasked, match.index)));
    graph.imports.push({ from: path, to: target ?? `fsharp:${specifier}`, specifier, kind: 'include', line: lineOf(commentsMasked, match.index), external: !target });
  }
  const searchable = maskWithPatterns(commentsMasked, [/@"(?:""|[^"])*"|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g]);
  for (const match of searchable.matchAll(/^\s*open\s+(?:type\s+)?([\w.]+)/gm)) {
    const specifier = match[1]!;
    const allTargets = declarationTargets(specifier, declarations);
    const targets = allTargets.filter((target) => target !== path);
    if (allTargets.length && !targets.length) continue;
    for (const target of targets.length ? targets : [null]) {
      graph.imports.push({ from: path, to: target ?? `fsharp:${specifier}`, specifier, kind: 'using', line: lineOf(searchable, match.index), external: !target });
    }
  }
  addCalls(path, searchable, graph, new Set(['if', 'for', 'while', 'match', 'function', 'fun', 'let', 'use', 'open', 'type']));
}

function indexVbSymbols(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/'[^\r\n]*/g, /"(?:[^"]|"")*"/g]);
  const namespaceName = /^\s*Namespace\s+([\w.]+)/im.exec(searchable)?.[1] ?? '';
  for (const match of searchable.matchAll(/^\s*(?:(?:Public|Private|Friend|Protected|Partial|MustInherit|NotInheritable)\s+)*(Class|Module|Interface|Structure|Enum)\s+([A-Za-z_]\w*)/gim)) {
    const name = match[2]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: `Vb${match[1]![0]!.toUpperCase()}${match[1]!.slice(1).toLowerCase()}` });
    declarations.set(namespaceName ? `${namespaceName}.${name}` : name, path);
  }
  for (const match of searchable.matchAll(/^\s*(?:(?:Public|Private|Friend|Protected|Shared|Overrides|Overridable|MustOverride|Async|Iterator|Partial)\s+)*(?:Sub|Function)\s+([A-Za-z_]\w*)\s*\(/gim)) {
    const name = match[1]!;
    const line = lineOf(searchable, match.index);
    graph.symbols.push({ id: `${path}#${name}@${line}`, name, path, line, kind: 'VbMethod' });
    declarations.set(namespaceName ? `${namespaceName}.${name}` : name, path);
  }
}

function indexVbRelations(path: string, text: string, graph: CodeGraph, declarations: Map<string, string>): void {
  const searchable = maskWithPatterns(text, [/'[^\r\n]*/g, /"(?:[^"]|"")*"/g]);
  for (const match of searchable.matchAll(/^\s*Imports\s+([^\r\n]+)/gim)) {
    for (const clause of splitTopLevel(match[1]!)) {
      const parsed = /^(?:([A-Za-z_]\w*)\s*=\s*)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/.exec(clause);
      if (!parsed) continue;
      const alias = parsed[1];
      const targetSpecifier = parsed[2]!;
      const specifier = alias ? `${alias}=${targetSpecifier}` : targetSpecifier;
      const allTargets = declarationTargets(targetSpecifier, declarations);
      const targets = allTargets.filter((target) => target !== path);
      if (allTargets.length && !targets.length) continue;
      for (const target of targets.length ? targets : [null]) {
        graph.imports.push({ from: path, to: target ?? `vb:${targetSpecifier}`, specifier, kind: 'using', line: lineOf(searchable, match.index), external: !target });
      }
    }
  }
  addCalls(path, searchable, graph, new Set(['If', 'For', 'While', 'Select', 'Catch', 'SyncLock', 'Sub', 'Function', 'GetType', 'NameOf']));
}

export async function loadGraph(root: string): Promise<CodeGraph> {
  const cached = JSON.parse(await readText(root, '.musubix/cache/codegraph.json')) as unknown;
  if (!validSemanticGraph(cached)) throw new Error('Invalid graph cache; run graph index.');
  const graph = semanticGraph(cached);
  const current = await snapshot(root, await graphInputs(root));
  if (JSON.stringify(current) !== JSON.stringify(graph.fingerprints)) throw new Error('Code graph is stale; run graph index.');
  return graph;
}

/** @id CODE-M5-GRAPH-TRAVERSAL-001
 * @implements REQ-M5-GRAPH-002
 * @design DES-M5-GRAPH-003
 */
export function prepareGraphAdjacency(
  graph: Pick<CodeGraph, 'files' | 'imports'>,
  operations?: GraphOperationCounters,
): GraphAdjacency {
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const file of graph.files) {
    forward.set(file, []);
    reverse.set(file, []);
    if (operations) {
      operations.forwardAdjacencyVisits += 1;
      operations.reverseAdjacencyVisits += 1;
    }
  }
  for (const edge of graph.imports) {
    if (edge.external) continue;
    forward.get(edge.from)?.push(edge.to);
    reverse.get(edge.to)?.push(edge.from);
    if (operations) {
      operations.forwardAdjacencyVisits += 1;
      operations.reverseAdjacencyVisits += 1;
    }
  }
  return { forward, reverse };
}

function completeImportScan(
  graph: Pick<CodeGraph, 'imports'>,
  operations?: GraphOperationCounters,
): ImportEdge[] {
  if (operations) operations.completeImportScans += 1;
  return graph.imports;
}

export function graphImpact(
  graph: CodeGraph,
  query: string,
  operations?: GraphOperationCounters,
): { path: string; via: string[] }[] {
  const roots = graph.files.includes(query) ? [query] : [...new Set(graph.symbols.filter((s) => s.name === query || s.id === query || `${s.path}#${s.name}` === query).map((s) => s.path))];
  if (!roots.length) throw new Error(`Code symbol or path not found: ${query}`);
  const adjacency = prepareGraphAdjacency(graph, operations);
  const results = new Map(roots.map((path) => [path, { path, via: [path] }]));
  const queue = [...results.values()];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const importer of adjacency.reverse.get(current.path) ?? []) {
      if (results.has(importer)) continue;
      const impact = { path: importer, via: [...current.via, importer] };
      results.set(importer, impact);
      queue.push(impact);
    }
  }
  return [...results.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function cycles(
  graph: Pick<CodeGraph, 'files' | 'imports'>,
  operations?: GraphOperationCounters,
): string[][] {
  const adjacency = prepareGraphAdjacency(graph, operations).forward;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  let count = 0;
  function visit(node: string): void {
    index.set(node, count);
    low.set(node, count++);
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!));
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let next: string;
      do {
        next = stack.pop()!;
        onStack.delete(next);
        component.push(next);
      } while (next !== node);
      if (component.length > 1 || adjacency.get(node)?.includes(node)) result.push(component.sort());
    }
  }
  for (const file of graph.files) if (!index.has(file)) visit(file);
  return result.sort((a, b) => a.join().localeCompare(b.join()));
}

export function matchGlob(path: string, glob: string): boolean {
  let expression = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; expression += '(?:.*/)?'; }
      else expression += '.*';
    } else if (c === '*') expression += '[^/]*';
    else if (c === '?') expression += '[^/]';
    else expression += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${expression}$`).test(path);
}

export function graphGate(
  graph: CodeGraph,
  config: Config['architecture'],
  codeGraph: Config['codeGraph'] = { mode: 'compatible' },
  operations?: GraphOperationCounters,
): { valid: boolean; diagnostics: Diagnostic[]; cycles: string[][] } {
  const diagnostics = graph.diagnostics.map((diagnostic) =>
    codeGraph.mode === 'strict' && diagnostic.code === 'GRAPH_DYNAMIC'
      ? {
          ...diagnostic,
          severity: 'error' as const,
          message: `${diagnostic.message} Strict Code Graph mode requires statically resolvable module loading.`,
        }
      : diagnostic);
  const components = cycles(graph, operations);
  if (config.forbidCycles) {
    for (const component of components) diagnostics.push(error('GRAPH_CYCLE', `Dependency cycle: ${component.join(' ↔ ')}.`));
  }
  for (const rule of config.rules) {
    for (const edge of completeImportScan(graph, operations)) {
      if (matchGlob(edge.from, rule.from) && rule.disallow.some((pattern) => matchGlob(edge.to, pattern))) diagnostics.push(error('GRAPH_ARCHITECTURE', `${rule.name}: ${edge.from} must not depend on ${edge.to}.`, edge.from, edge.line));
    }
  }
  return { valid: !diagnostics.some((d) => d.severity === 'error'), diagnostics, cycles: components };
}
