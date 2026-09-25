import ts from 'typescript';
import { dirname, basename } from 'node:path';
import { error, ids, validateDesign, validateRequirements, type Diagnostic } from '../../domain/src/index.js';
import { exists, files, isArtifact, isSkillSource, isSource, isTraceSource, readText, snapshot, within, writeJson } from './files.js';

export interface TraceNode {
  id: string;
  kind: 'requirement' | 'design' | 'code' | 'test' | 'adr';
  path: string;
  line: number;
  mandatory?: boolean;
}

export interface TraceEdge {
  from: string;
  to: string;
  relation: 'satisfies' | 'implements' | 'verifies' | 'decides' | 'depends-on';
}

export interface TraceGraph {
  schemaVersion: 1;
  generatedAt: string;
  nodes: TraceNode[];
  edges: TraceEdge[];
  diagnostics: Diagnostic[];
  fingerprints: Record<string, string>;
}

function isRecognizedMusubixSource(manifest: unknown): boolean {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return false;
  const candidate = manifest as { name?: unknown; repository?: unknown };
  if (typeof candidate.name !== 'string'
    || typeof candidate.repository !== 'object'
    || candidate.repository === null
    || Array.isArray(candidate.repository)) return false;
  const repository = candidate.repository as { url?: unknown };
  if (typeof repository.url !== 'string') return false;
  return (candidate.name === 'musubix5'
      && repository.url === 'https://github.com/nahisaho/musubix5.git')
    || (candidate.name === 'musubix3'
      && repository.url === 'https://github.com/nahisaho/musubix3.git');
}

/** @id CODE-M5-TRACE-SKILL-001
 * @implements REQ-M5-EVIDENCE-008
 * @design DES-M5-TRACE-SKILL-001
 */
export async function traceInputs(root: string): Promise<string[]> {
  const projectFiles = await files(root);
  let isMusubixRepository = false;
  try {
    isMusubixRepository = isRecognizedMusubixSource(JSON.parse(await readText(root, 'package.json')));
  } catch {
    // Missing or unreadable consumer manifests do not enable repository Skill inputs.
  }
  return projectFiles.filter((path) => isArtifact(path) || isTraceSource(path) || (isMusubixRepository && isSkillSource(path)));
}

function typedCommentBlocks(text: string, path: string): { text: string; line: number }[] {
  // Parser-aware comment locations avoid treating template tails or regex text as comments.
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  const literals: { start: number; end: number }[] = [];
  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail || node.kind === ts.SyntaxKind.JsxText) {
      literals.push({ start: node.kind === ts.SyntaxKind.JsxText ? node.pos : node.getStart(source), end: node.end });
    }
    for (const range of [
      ...ts.getLeadingCommentRanges(text, node.pos) ?? [],
      ...ts.getTrailingCommentRanges(text, node.end) ?? [],
    ]) ranges.set(range.pos, range);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...ranges.values()].filter((range) => !literals.some((literal) => range.pos >= literal.start && range.pos < literal.end))
    .sort((a, b) => a.pos - b.pos).map((range) => ({
    text: text.slice(range.pos, range.end), line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
  }));
}

function maskGenericStrings(text: string, path: string): string {
  const mask = (value: string): string => value.replace(/[^\r\n]/g, ' ');
  if (path.endsWith('.hs')) {
    return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'/g, mask);
  }
  if (path.endsWith('.lua')) {
    return text.replace(/(?<!--)\[(=*)\[[\s\S]*?\]\1\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, mask);
  }
  if (path.endsWith('.vb')) {
    return text.replace(/"(?:[^"]|"")*"/g, mask);
  }
  const chars = [...text];
  const quotes = path.endsWith('.rs') || /\.(?:fs|fsx)$/.test(path) ? ['"'] : ['"', "'", '`'];
  for (let index = 0; index < chars.length; index += 1) {
    const quote = chars[index]!;
    if (!quotes.includes(quote)) continue;
    const triple = chars[index + 1] === quote && chars[index + 2] === quote;
    const endToken = triple ? quote.repeat(3) : quote;
    const start = index;
    index += endToken.length;
    while (index < chars.length) {
      if (!triple && chars[index] === '\\') {
        chars[index] = ' ';
        if (chars[index + 1] !== '\n' && chars[index + 1] !== '\r') chars[index + 1] = ' ';
        index += 2;
        continue;
      }
      if (text.startsWith(endToken, index)) {
        index += endToken.length - 1;
        break;
      }
      if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
      index += 1;
    }
    for (let cursor = start; cursor <= index && cursor < chars.length; cursor += 1) {
      if (chars[cursor] !== '\n' && chars[cursor] !== '\r') chars[cursor] = ' ';
    }
  }
  return chars.join('');
}

interface MarkdownLine {
  start: number;
  contentEnd: number;
  end: number;
  content: string;
}

function markdownLines(text: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  for (let start = 0; start < text.length;) {
    let contentEnd = start;
    while (contentEnd < text.length && text[contentEnd] !== '\r' && text[contentEnd] !== '\n') contentEnd += 1;
    let end = contentEnd;
    if (text[end] === '\r') end += 1;
    if (text[end] === '\n') end += 1;
    lines.push({ start, contentEnd, end, content: text.slice(start, contentEnd) });
    start = end;
  }
  return lines;
}

function maskMarkdownCodeExamples(text: string): string {
  const chars = text.split('');
  const masked = new Uint8Array(chars.length);
  const lines = markdownLines(text);
  const maskRange = (start: number, end: number): void => {
    for (let index = start; index < end; index += 1) {
      masked[index] = 1;
      if (chars[index] !== '\r' && chars[index] !== '\n' && !(index === 0 && chars[index] === '\uFEFF')) {
        chars[index] = ' ';
      }
    }
  };
  const lineContent = (line: MarkdownLine, index: number): string =>
    index === 0 && line.content.startsWith('\uFEFF') ? line.content.slice(1) : line.content;
  const blank = (line: MarkdownLine, index: number): boolean => /^[ \t]*$/.test(lineContent(line, index));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const opener = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lineContent(line, index));
    if (!opener) continue;
    const marker = opener[1]!;
    const character = marker[0]!;
    const closer = new RegExp(`^ {0,3}\\${character}{${marker.length},}[ \\t]*$`);
    let last = lines.length - 1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (closer.test(lineContent(lines[cursor]!, cursor))) {
        last = cursor;
        break;
      }
    }
    maskRange(line.start, lines[last]!.end);
    index = last;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (masked[line.start] || !/^(?: {4,}|\t)/.test(lineContent(line, index))) continue;
    if (index > 0 && !blank(lines[index - 1]!, index - 1)) continue;
    let previous = index - 1;
    while (previous >= 0 && blank(lines[previous]!, previous)) previous -= 1;
    if (previous >= 0) {
      const preceding = lineContent(lines[previous]!, previous);
      if (/^[ \t]/.test(preceding) || /^(?:[-+*]|\d+[.)])\s/.test(preceding)) continue;
    }
    let cursor = index;
    let lastIndented = index;
    while (cursor < lines.length) {
      const candidate = lines[cursor]!;
      if (/^(?: {4,}|\t)/.test(lineContent(candidate, cursor))) lastIndented = cursor;
      else if (!blank(candidate, cursor)) break;
      cursor += 1;
    }
    maskRange(line.start, lines[lastIndented]!.end);
    index = lastIndented;
  }

  for (let lineIndex = 0; lineIndex < lines.length;) {
    if (blank(lines[lineIndex]!, lineIndex)) {
      lineIndex += 1;
      continue;
    }
    const start = lines[lineIndex]!.start;
    let endLine = lineIndex;
    while (endLine + 1 < lines.length && !blank(lines[endLine + 1]!, endLine + 1)) endLine += 1;
    const end = lines[endLine]!.contentEnd;
    for (let cursor = start; cursor < end;) {
      if (chars[cursor] !== '`' || masked[cursor]) {
        cursor += 1;
        continue;
      }
      let openerEnd = cursor + 1;
      while (openerEnd < end && chars[openerEnd] === '`' && !masked[openerEnd]) openerEnd += 1;
      const length = openerEnd - cursor;
      let closerStart = openerEnd;
      let found = false;
      while (closerStart < end) {
        if (chars[closerStart] !== '`' || masked[closerStart]) {
          closerStart += 1;
          continue;
        }
        let closerEnd = closerStart + 1;
        while (closerEnd < end && chars[closerEnd] === '`' && !masked[closerEnd]) closerEnd += 1;
        if (closerEnd - closerStart === length) {
          maskRange(cursor, closerEnd);
          cursor = closerEnd;
          found = true;
          break;
        }
        closerStart = closerEnd;
      }
      if (!found) cursor = openerEnd;
    }
    lineIndex = endLine + 1;
  }
  return chars.join('');
}

function genericCommentBlocks(text: string, path: string): { text: string; line: number }[] {
  const skillSource = isSkillSource(path);
  const searchable = skillSource ? maskMarkdownCodeExamples(text) : maskGenericStrings(text, path);
  const matches: { text: string; index: number; end: number }[] = [];
  const nestedBlock = path.endsWith('.hs')
    ? { open: '{-', close: '-}' }
    : /\.(?:fs|fsx)$/.test(path)
      ? { open: '(*', close: '*)' }
      : undefined;
  if (nestedBlock) {
    for (let start = searchable.indexOf(nestedBlock.open); start >= 0; start = searchable.indexOf(nestedBlock.open, start + nestedBlock.open.length)) {
      let depth = 1;
      let cursor = start + nestedBlock.open.length;
      while (cursor < searchable.length && depth > 0) {
        if (searchable.startsWith(nestedBlock.open, cursor)) {
          depth += 1;
          cursor += nestedBlock.open.length;
        } else if (searchable.startsWith(nestedBlock.close, cursor)) {
          depth -= 1;
          cursor += nestedBlock.close.length;
        } else {
          cursor += 1;
        }
      }
      if (depth !== 0) break;
      const original = text.slice(start, cursor);
      const candidate = searchable.slice(start, cursor);
      if (/@(id|implements|verifies|design)\b/.test(candidate)) {
        matches.push({ text: skillSource ? candidate : original, index: start, end: cursor });
      }
      start = cursor - nestedBlock.open.length;
    }
  }
  const patterns = path.endsWith('.hs')
    ? [/(?:^[ \t]*--[^\r\n]*(?:\r?\n|$))+/gm]
    : /\.(?:fs|fsx)$/.test(path)
      ? [/(?:^[ \t]*\/\/[^\r\n]*(?:\r?\n|$))+/gm]
    : path.endsWith('.lua')
      ? [/--\[(=*)\[[\s\S]*?\]\1\]/g, /(?:^[ \t]*--(?!\[=*\[)[^\r\n]*(?:\r?\n|$))+/gm]
      : path.endsWith('.vb')
        ? [/(?:^[ \t]*'[^\r\n]*(?:\r?\n|$))+/gm]
        : [
            /\/\*[\s\S]*?\*\//g,
            /(?:^[ \t]*\/\/[^\r\n]*(?:\r?\n|$))+/gm,
            /(?:^[ \t]*#[^\r\n]*(?:\r?\n|$))+/gm,
          ];
  for (const pattern of patterns) {
    for (const match of searchable.matchAll(pattern)) {
      if (match.index !== undefined) {
        const original = text.slice(match.index, match.index + match[0].length);
        const candidate = searchable.slice(match.index, match.index + match[0].length);
        const end = match.index + match[0].length;
        if (/@(id|implements|verifies|design)\b/.test(candidate)
          && !matches.some((existing) => match.index! < existing.end && end > existing.index)) {
          matches.push({ text: skillSource ? candidate : original, index: match.index, end });
        }
      }
    }
  }
  return matches.sort((a, b) => a.index - b.index).map((match) => ({
    text: match.text,
    line: text.slice(0, match.index).split(/\r?\n/).length,
  }));
}

function commentBlocks(text: string, path: string): { text: string; line: number }[] {
  return isSource(path) ? typedCommentBlocks(text, path) : genericCommentBlocks(text, path);
}

export async function buildTrace(root: string, persist = true): Promise<TraceGraph> {
  const paths = await traceInputs(root);
  const graph: TraceGraph = { schemaVersion: 1, generatedAt: new Date().toISOString(), nodes: [], edges: [], diagnostics: [], fingerprints: await snapshot(root, paths) };
  const add = (node: TraceNode): void => {
    if (graph.nodes.some((n) => n.id === node.id)) graph.diagnostics.push(error('TRACE_DUPLICATE', `Duplicate global ID ${node.id}.`, node.path, node.line));
    else graph.nodes.push(node);
  };
  for (const path of paths) {
    const text = await readText(root, path);
    if (isArtifact(path) && path.endsWith('/requirements.md')) {
      const result = validateRequirements(text, path);
      graph.diagnostics.push(...result.diagnostics);
      for (const req of result.value) add({ id: req.id, kind: 'requirement', path, line: req.line, mandatory: req.priority === 'must' });
    } else if (isArtifact(path) && path.endsWith('/design.md')) {
      const result = validateDesign(text, path);
      graph.diagnostics.push(...result.diagnostics);
      for (const component of result.value) {
        add({ id: component.id, kind: 'design', path, line: component.line });
        for (const req of component.requirements) graph.edges.push({ from: component.id, to: req, relation: 'satisfies' });
        for (const adr of component.decisions) graph.edges.push({ from: adr, to: component.id, relation: 'decides' });
        for (const dep of component.dependencies) graph.edges.push({ from: component.id, to: dep, relation: 'depends-on' });
      }
    } else if (path.startsWith('.musubix/decisions/')) {
      add({ id: basename(path, '.md'), kind: 'adr', path, line: 1 });
    } else if (isTraceSource(path) || isSkillSource(path)) {
      if (path.endsWith('.py')) {
        for (const match of text.matchAll(/("""|''')[\s\S]*?\1/g)) {
          if (match.index !== undefined && /@(id|implements|verifies|design)\b/.test(match[0])) {
            graph.diagnostics.push({
              code: 'TRACE_ANNOTATION_IN_PYTHON_DOCSTRING',
              severity: 'warning',
              message: 'Python trace annotations in docstrings are ignored; move them to consecutive # comment lines.',
              path,
              line: text.slice(0, match.index).split(/\r?\n/).length,
            });
          }
        }
      }
      for (const block of commentBlocks(text, path)) {
        const annotations = [...block.text.matchAll(/@(implements|verifies|design)\s+([^\r\n*]+)/g)];
        if (!annotations.length) continue;
        const id = /@id\s+(\S+)/.exec(block.text)?.[1];
        const kind = annotations.some((a) => a[1] === 'verifies') ? 'test' : 'code';
        if (!id || !ids[kind].test(id)) {
          graph.diagnostics.push(error('TRACE_ANNOTATION_ID', `Annotation block requires @id ${kind === 'test' ? 'TEST' : 'CODE'}-FEATURE-001.`, path, block.line));
          continue;
        }
        add({ id, kind, path, line: block.line });
        for (const annotation of annotations) {
          const relation = annotation[1] === 'verifies' ? 'verifies' : 'implements';
          const prefix = annotation[1] === 'design' ? 'DES' : 'REQ';
          const targets = (annotation[2] ?? '').split(/[\s,]+/).filter(Boolean);
          for (const target of targets) {
            if (!target.startsWith(`${prefix}-`) || !(prefix === 'DES' ? ids.design : ids.requirement).test(target)) {
              graph.diagnostics.push(error('TRACE_ANNOTATION_TARGET', `Invalid @${annotation[1]} target ${target}.`, path, block.line));
            }
            graph.edges.push({ from: id, to: target, relation });
          }
        }
      }
    }
  }
  if (persist) {
    await writeJson(root, '.musubix/cache/trace.json', graph);
    const features = new Set(paths.filter((p) => /^\.musubix\/features\/[^/]+\/requirements\.md$/.test(p)).map(dirname));
    for (const feature of features) await writeJson(root, `${feature}/trace.json`, graph);
  }
  return graph;
}

export async function loadTrace(root: string): Promise<TraceGraph> {
  const path = await exists(within(root, '.musubix/cache/trace.json')) ? '.musubix/cache/trace.json' :
    (await files(root)).find((p) => /^\.musubix\/features\/[^/]+\/trace\.json$/.test(p));
  if (!path) throw new Error('Trace graph missing; run musubix3 trace build.');
  const value = JSON.parse(await readText(root, path)) as TraceGraph;
  if (value.schemaVersion !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || !value.fingerprints || !Array.isArray(value.diagnostics)) throw new Error('Invalid trace graph; rebuild it.');
  return value;
}

export interface TraceCheck {
  valid: boolean;
  diagnostics: Diagnostic[];
  coverageKind: 'link-coverage';
  mandatoryRequirements: number;
  coverage: { design: number | null; implementation: number | null; tests: number | null };
}

export async function checkTrace(root: string, graph: TraceGraph, strict = false, thresholds = { design: 1, implementation: 1, tests: 1 }): Promise<TraceCheck> {
  const diagnostics = [...graph.diagnostics];
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) diagnostics.push(error('TRACE_DANGLING', `${edge.from} → ${edge.to} (${edge.relation}) has a missing endpoint.`));
  }
  for (const node of graph.nodes) {
    if (!await exists(within(root, node.path))) diagnostics.push(error('TRACE_STALE_PATH', `Missing source for ${node.id}.`, node.path));
  }
  const current = await snapshot(root, await traceInputs(root));
  const allPaths = new Set([...Object.keys(current), ...Object.keys(graph.fingerprints)]);
  for (const path of allPaths) {
    if (current[path] !== graph.fingerprints[path]) diagnostics.push(error('TRACE_STALE', 'Trace inputs changed; run trace build.', path));
  }
  const mandatory = graph.nodes.filter((n) => n.kind === 'requirement' && n.mandatory);
  const counts = { design: 0, implementation: 0, tests: 0 };
  if (!graph.nodes.some((n) => n.kind === 'requirement')) diagnostics.push(error('TRACE_NO_REQUIREMENTS', 'No requirements in trace graph.'));
  for (const requirement of mandatory) {
    const designs = graph.edges.filter((e) => e.to === requirement.id && e.relation === 'satisfies' && nodes.get(e.from)?.kind === 'design').map((e) => e.from);
    const coverage = {
      design: designs.length > 0,
      implementation: graph.edges.some((e) => e.relation === 'implements' && (e.to === requirement.id || designs.includes(e.to)) && nodes.get(e.from)?.kind === 'code'),
      tests: graph.edges.some((e) => e.to === requirement.id && e.relation === 'verifies' && nodes.get(e.from)?.kind === 'test'),
    };
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
      if (coverage[key]) counts[key]++;
      else diagnostics.push({ code: 'TRACE_UNCOVERED', severity: 'warning', message: `${requirement.id} lacks ${key}.`, path: requirement.path, line: requirement.line });
    }
  }
  const coverage: TraceCheck['coverage'] = { design: null, implementation: null, tests: null };
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
    coverage[key] = mandatory.length ? counts[key] / mandatory.length : null;
    if (coverage[key] !== null && coverage[key] < thresholds[key]) {
      diagnostics.push({ code: 'TRACE_COVERAGE', severity: strict ? 'error' : 'warning', message: `${key} link coverage ${coverage[key]} is below ${thresholds[key]}.` });
    }
  }
  return {
    valid: !diagnostics.some((d) => d.severity === 'error'),
    diagnostics,
    coverageKind: 'link-coverage',
    mandatoryRequirements: mandatory.length,
    coverage,
  };
}

export interface Impact {
  id: string;
  paths: string[][];
}

export function traceImpact(graph: TraceGraph, query: string): Impact[] {
  const starts = graph.nodes.filter((n) => n.id === query || n.path === query).map((n) => n.id);
  if (!starts.length) throw new Error(`Trace ID or path not found: ${query}`);
  const results = new Map<string, string[][]>();
  for (const start of starts) {
    const queue: string[][] = [[start]];
    const seen = new Set([start]);
    for (let i = 0; i < queue.length; i++) {
      const path = queue[i]!;
      const current = path.at(-1)!;
      const neighbors = graph.edges.flatMap((e) => e.from === current ? [e.to] : e.to === current ? [e.from] : []).sort();
      for (const next of neighbors) {
        if (seen.has(next)) continue;
        seen.add(next);
        const chain = [...path, next];
        queue.push(chain);
        results.set(next, [...(results.get(next) ?? []), chain]);
      }
    }
  }
  return [...results.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, paths]) => ({ id, paths }));
}
