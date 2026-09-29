export function createIdentityAuditContract({ H }) {
  const root = '/identityAudits';
  const auditPath = `${root}/g7IdentityLocationClosure`;
  const checkId = 'g7-identity-location-closure';
  const scope = 'REQ-M5-COMPAT-013,REQ-M5-LIFECYCLE-006';
  const phase = (name) => `g7:${name}:${scope}`;
  const counts = { generation: 28, rawPhase: 8, wrappedIdempotency: 2 };
  const fields = ['schemaVersion', 'checkId', 'generation', 'rawPhase', 'wrappedIdempotency', 'counts', 'sha256'];
  const expected = {
    generation: Object.fromEntries([
      ...Array.from({ length: 12 }, (_, i) => `/tddEvidence/cycles/${i}/generation`),
      ...Array.from({ length: 12 }, (_, i) => `/tddEvidence/chain/${i}/generation`),
      '/cycle/generation', '/journal/0/payload/generation', '/journal/1/payload/generation',
      '/green/testRuntime/activation/generation',
    ].map((path) => [path, 7])),
    rawPhase: {
      '/orders/3800/phase': phase('red'), '/orders/3801/phase': phase('implementation'),
      '/journal/0/payload/semanticPhaseKey': phase('red'), '/journal/0/payload/orderPhaseKey': phase('red'),
      '/journal/1/payload/semanticPhaseKey': phase('implementation'), '/journal/1/payload/orderPhaseKey': phase('implementation'),
      '/green/testRuntime/activation/redCheckpoint/orderPhaseKey': phase('red'),
      '/green/testRuntime/activation/implementationCheckpoint/orderPhaseKey': phase('implementation'),
    },
    wrappedIdempotency: {
      '/journal/0/idempotencyKey': `change-batch-checkpoint:CHANGE-0017:${phase('red')}`,
      '/journal/1/idempotencyKey': `change-batch-checkpoint:CHANGE-0017:${phase('implementation')}`,
    },
  };
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const keysEqual = (v, keys) => object(v) && Object.keys(v).sort().join('\0') === [...keys].sort().join('\0');
  const escape = (s) => s.replaceAll('~', '~0').replaceAll('/', '~1');
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  function reject(pointer, reason) {
    const detail = { pointer, reason };
    const error = new Error(`PREFLIGHT_ASSERTION_FAILED:${checkId} ${JSON.stringify(detail)}`);
    error.detail = detail;
    throw error;
  }
  function unwrap(identityAudits) {
    if (!object(identityAudits) || Object.keys(identityAudits).some((k) => k !== 'g7IdentityLocationClosure')) {
      reject(root, 'identity-audits-envelope');
    }
    if (!Object.hasOwn(identityAudits, 'g7IdentityLocationClosure') || !object(identityAudits.g7IdentityLocationClosure)) {
      reject(auditPath, 'identity-audit-object');
    }
    return identityAudits.g7IdentityLocationClosure;
  }
  function validate(identityAudits) {
    const audit = unwrap(identityAudits);
    const faults = [];
    const fault = (pointer, reason) => faults.push({ pointer, reason });
    const field = (name, reason) => fault(`${auditPath}/${escape(name)}`, reason);
    for (const key of new Set([...fields, ...Object.keys(audit)])) {
      if (!fields.includes(key) || !Object.hasOwn(audit, key)) field(key, 'audit-field-set');
    }
    if (audit.schemaVersion !== 1) field('schemaVersion', 'audit-version');
    if (audit.checkId !== checkId) field('checkId', 'audit-check-id');
    if (!keysEqual(audit.counts, Object.keys(counts))
      || Object.keys(counts).some((k) => audit.counts[k] !== counts[k])) field('counts', 'audit-counts');
    for (const name of Object.keys(counts)) {
      const list = audit[name];
      if (!Array.isArray(list)) { field(name, 'audit-array'); continue; }
      const seen = new Set();
      let previous = null;
      let entrySchemaValid = true;
      for (const item of list) {
        if (!keysEqual(item, ['path', 'value']) || typeof item.path !== 'string') {
          field(name, 'audit-entry-schema'); entrySchemaValid = false; continue;
        }
        if (previous !== null && compare(previous, item.path) >= 0) field(name, 'audit-pointer-order');
        previous = item.path;
        if (seen.has(item.path)) field(name, 'audit-duplicate-pointer');
        seen.add(item.path);
        if (!Object.hasOwn(expected[name], item.path) || item.value !== expected[name][item.path]) {
          fault(item.path, 'observation-path-value');
        }
      }
      for (const path of Object.keys(expected[name])) {
        if (entrySchemaValid && !seen.has(path)) fault(path, 'observation-missing');
      }
    }
    if (typeof audit.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(audit.sha256)) field('sha256', 'audit-hash-schema');
    if (fields.every((k) => Object.hasOwn(audit, k))) {
      const { sha256, ...body } = audit;
      if (sha256 !== H(body)) field('sha256', 'audit-hash');
    }
    faults.sort((a, b) => compare(a.pointer, b.pointer) || compare(a.reason, b.reason));
    if (faults.length) reject(faults[0].pointer, faults[0].reason);
    return audit;
  }
  function create(observed) {
    if (!keysEqual(observed, Object.keys(counts))) reject(auditPath, 'observation-container');
    const body = {
      schemaVersion: 1, checkId,
      generation: observed.generation.map((v) => ({ ...v })),
      rawPhase: observed.rawPhase.map((v) => ({ ...v })),
      wrappedIdempotency: observed.wrappedIdempotency.map((v) => ({ ...v })),
      counts: { ...counts },
    };
    const identityAudits = { g7IdentityLocationClosure: { ...body, sha256: H(body) } };
    validate(identityAudits);
    return identityAudits;
  }
  function parentCopy(checksAudits, parentAudits) {
    validate(checksAudits);
    const parent = unwrap(parentAudits), child = checksAudits.g7IdentityLocationClosure;
    const different = [...new Set([...fields, ...Object.keys(parent)])].filter((key) =>
      !Object.hasOwn(parent, key) || !Object.hasOwn(child, key) || H(parent[key]) !== H(child[key])).sort();
    if (different.length) reject(`${auditPath}/${escape(different[0])}`, 'audit-parent-copy');
    validate(parentAudits);
    return true;
  }
  function summary(identityAudits) {
    validate(identityAudits);
    return { id: checkId, expected: true, observed: true, diagnostic: null };
  }
  return Object.freeze({ create, validate, parentCopy, summary, reject });
}

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { resolve, relative, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const sourcePath = 'tests/test-runtime-evidence.test.ts';
const preparation = 'accb4862f6079c880b3394f6acfabd93380c53b3c3ff88568bfe8d77f4fedbf5';
const cache = `.musubix/cache/g8-freeze-preflight/${preparation}`;
const hex = /^[0-9a-f]{64}$/;
function object(value) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function exactKeys(value, keys) {
  assert.deepEqual(Object.keys(object(value)).sort(), [...keys].sort());
}
function failure(id, detail) {
  throw new Error(`PREFLIGHT_ASSERTION_FAILED:${id} ${JSON.stringify(detail)}`);
}
async function environment(repositoryRoot) {
  assert.equal(typeof repositoryRoot, 'string');
  assert.equal(repositoryRoot, resolve(repositoryRoot));
  assert.equal(fs.realpathSync(repositoryRoot), repositoryRoot);
  const pkg = JSON.parse(fs.readFileSync(resolve(repositoryRoot, 'package.json')));
  assert.equal(pkg.name, 'musubix5');
  const req = createRequire(resolve(repositoryRoot, 'package.json'));
  const ts = req('typescript');
  assert.equal(ts.version, '5.9.3');
  const modules = {};
  for (const name of ['canonical', 'change-evidence', 'order']) {
    modules[name] = await import(pathToFileURL(resolve(repositoryRoot, `dist/packages/analysis/src/${name}.js`)));
  }
  const { canonicalBytes, sha256 } = modules.canonical;
  const H = (value) => sha256(canonicalBytes(value));
  return { repositoryRoot, ts, canonicalBytes, sha256, H, change: modules['change-evidence'], order: modules.order };
}
function native(env, log) {
  const result = env.order.validateEvidenceOrderLog(log);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
}
function decode(env, descriptor, expected) {
  exactKeys(descriptor, ['schemaVersion', 'kind', 'sourcePath', 'sourceByteSha256', 'extractionAlgorithm',
    'extractionVersion', 'prefixLength', 'tipSequence', 'tipRecordSha256', 'recordJson', 'recordStringsSha256', 'extractionSha256']);
  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.kind, 'evidence-order-native-strings-v1');
  assert.equal(descriptor.sourcePath, '.musubix/evidence/order.json');
  assert.equal(descriptor.extractionAlgorithm, 'json-parse-prefix-native-stringify');
  assert.equal(descriptor.extractionVersion, 1);
  for (const key of ['sourceByteSha256', 'tipRecordSha256', 'recordStringsSha256', 'extractionSha256']) assert.match(descriptor[key], hex);
  assert(Number.isSafeInteger(descriptor.prefixLength) && descriptor.prefixLength > 0);
  assert.equal(descriptor.prefixLength, descriptor.tipSequence);
  assert(Array.isArray(descriptor.recordJson));
  const records = descriptor.recordJson.map((text) => {
    assert.equal(typeof text, 'string');
    assert.equal(Buffer.from(text, 'utf8').toString('utf8'), text);
    assert(!text.startsWith('\ufeff'));
    const record = object(JSON.parse(text));
    assert.equal(JSON.stringify(record), text);
    return record;
  });
  assert.equal(env.H(descriptor.recordJson), descriptor.recordStringsSha256);
  const { extractionSha256, ...core } = descriptor;
  assert.equal(env.H(core), extractionSha256);
  assert.equal(records.length, descriptor.prefixLength);
  assert.equal(records.at(-1).sequence, descriptor.tipSequence);
  assert.equal(records.at(-1).recordSha256, descriptor.tipRecordSha256);
  if (expected) assert.equal(env.H(descriptor), env.H(expected));
  native(env, { schemaVersion: 1, records });
  return records;
}
function nativeChecks(env, inputs) {
  const results = {};
  for (const label of ['g7', 'g8']) {
    const d = inputs.fixtureBindings[label].orderPrefix;
    try {
      const records = decode(env, d);
      if (label === 'g7') {
        assert.equal(d.recordStringsSha256, '749a7e4d694338e4e3903a6191bdb71de3bd14000f66c15181c73c2c9c8cc7df');
        assert.equal(d.prefixLength, 3788);
      } else {
        assert.equal(env.H(d.recordJson.slice(0, 3804)), '599d0d1a644d8443eb863efa29164bee5912189176472b9dccd11a0ce4be0af8');
        assert.equal(d.prefixLength, inputs.manifestCore.designCheckpoint.order);
        assert.equal(records.at(-1).phase, 'g8:design:2');
      }
      const mutations = [
        (c) => { c.recordJson[0] = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(c.recordJson[0])).reverse())); },
        (c) => { c.recordJson[0] += ' '; },
        (c) => { const r = JSON.parse(c.recordJson[0]); r.entityId += '-changed'; c.recordJson[0] = JSON.stringify(r); },
        (c) => { [c.recordJson[0], c.recordJson[1]] = [c.recordJson[1], c.recordJson[0]]; },
        (c) => { c.recordJson.push(c.recordJson.at(-1)); },
        (c) => { c.recordJson.pop(); },
        (c) => { c.recordJson[0] = c.recordJson[0].replace('{', '{"sequence":1,'); },
        (c) => { c.recordJson[0] = c.recordJson[0].replace('{', '{"\\u0073equence":1,'); },
        (c) => { c.recordJson[0] = ` ${c.recordJson[0]}`; },
        (c) => { c.recordJson[0] += '{}'; },
        (c) => { c.recordJson[0] += '\ud800'; },
        (c) => { const { recordSha256, ...r } = JSON.parse(c.recordJson[0]); c.recordJson[0] = JSON.stringify({ recordSha256, ...r }); },
      ];
      for (const mutate of mutations) {
        const altered = structuredClone(d);
        mutate(altered);
        assert.throws(() => decode(env, altered, d));
      }
      results[label] = { records, probes: mutations.length };
    } catch (error) {
      failure('native-order-prefix-binding', { prefix: label, message: error.message });
    }
  }
  return results;
}
function extract(env, sourceBytes, inputs) {
  const { ts, sha256, H } = env;
  const text = new TextDecoder('utf8', { fatal: true }).decode(sourceBytes);
  const sf = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
  assert.deepEqual(sf.parseDiagnostics, []);
  const functions = (name) => sf.statements.filter((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.equal(functions('activationCases').length, 1);
  assert.equal(functions('activationFixture').length, 1);
  const fn = functions('activationCases')[0];
  const decl = (name) => {
    const matches = fn.body.statements.filter(ts.isVariableStatement).flatMap((s) => s.declarationList.declarations)
      .filter((d) => d.name.getText(sf) === name);
    assert.equal(matches.length, 1);
    return matches[0];
  };
  const valid = decl('valid').initializer;
  assert(ts.isCallExpression(valid) && valid.expression.getText(sf) === 'activationFixture' && valid.arguments.length === 3);
  const nodes = [functions('activationFixture')[0], decl('changed'), decl('mutations'), valid];
  for (const [i, node] of nodes.entries()) {
    const d = inputs.extractions[i];
    const anchorScope = i === 1 || i === 2 ? fn.getText(sf) : text;
    assert.equal(anchorScope.split(d.startAnchor).length, 2);
    assert.equal(Buffer.byteLength(text.slice(0, node.getStart(sf))), d.startByte);
    assert.equal(Buffer.byteLength(text.slice(0, node.end)), d.endByte);
    assert.equal(sha256(Buffer.from(node.getText(sf))), d.sha256);
  }
  const discovery = inputs.evaluationRecipe.consumerDecoderRecipe.discovery;
  assert.equal(H(discovery), '0d4532bc720e88426873aa2f9f074fc075ca6d0413cb162865ffa3522131a4e5');
  assert.equal(sha256(sourceBytes.subarray(discovery.startByte, discovery.endByte)), discovery.sha256);
  const statements = valid.arguments[2].expression.expression.body.statements.slice(0, 6);
  const tree = (n) => n.getChildren(sf).length
    ? { kind: n.kind, children: n.getChildren(sf).map(tree) } : { kind: n.kind, text: n.getText(sf) };
  assert.equal(H({ schemaVersion: 1, kind: 'typescript-discovery-ast-v1', typescriptVersion: ts.version, statements: statements.map(tree) }), discovery.astSha256);
  assert.equal(H(nodes[2].initializer.elements.map((n) => n.getText(sf))), inputs.mutationTable.sourceArraySha256);
  return { text, sf, valid, nodes, discovery };
}
function dependencies(env, extracted) {
  const { ts } = env;
  const { sf, valid, discovery, text } = extracted;
  const offset = (n) => Buffer.byteLength(text.slice(0, n.getStart(sf)));
  const violations = [];
  const bad = (n, reason) => violations.push({ startByte: offset(n), endByte: Buffer.byteLength(text.slice(0, n.end)), reason });
  const discoveryStatements = valid.arguments[2].expression.expression.body.statements.slice(0, 6);
  const discoveryBytes = Buffer.from(text.slice(discoveryStatements[0].getStart(sf), discoveryStatements.at(-1).end));
  if (env.sha256(discoveryBytes) !== discovery.sha256) bad(discoveryStatements[0], 'discovery-subtree-drift');
  const valuePaths = valid.arguments.slice(0, 2).map((n) => n.getText(sf));
  assert.deepEqual(valuePaths, ['value.provenance', 'value.executionBinding.logicalCommandSha256']);
  const forbidden = new Set(['process', 'globalThis', 'require', 'eval', 'Function', 'Date', 'Math', '__g8Debit']);
  const allowedFree = new Set(['Array', 'Buffer', 'Error', 'JSON', 'Number', 'Object', 'Set', 'activationFixture',
    'canonicalBytes', 'expect', 'join', 'readFileSync', 'readdirSync', 'record', 'root', 'sha256', 'value']);
  const host = ts.createCompilerHost({ noLib: true, noResolve: true });
  host.getSourceFile = (name) => name === sourcePath ? sf : undefined;
  const program = ts.createProgram([sourcePath], { noLib: true, noResolve: true }, host);
  const checker = program.getTypeChecker();
  const staticMethods = {
    JSON: ['parse', 'stringify'], Object: ['keys', 'entries', 'fromEntries'],
    Array: ['isArray'], Number: ['isSafeInteger'], Buffer: ['from', 'isBuffer'],
  };
  const instanceMethods = new Set(['map', 'flatMap', 'filter', 'every', 'includes', 'join', 'slice', 'sort',
    'has', 'startsWith', 'endsWith', 'toString', 'test', 'toHaveLength']);
  const taints = new Set(['root', 'base', 'candidates', 'predecessors', 'tips']);
  let values = 0, roots = 0;
  function visit(n) {
    if (ts.isTypeNode(n)) return;
    if (ts.isIdentifier(n)) {
      const propertyName = ts.isPropertyAccessExpression(n.parent) && n.parent.name === n
        || ts.isPropertyAssignment(n.parent) && n.parent.name === n;
      if (!propertyName) {
        if (forbidden.has(n.text)) bad(n, `forbidden-identifier:${n.text}`);
        if (n.text === 'value') {
          values++;
          if (!(n.getStart(sf) >= valid.arguments[0].getStart(sf) && n.end <= valid.arguments[1].end)) bad(n, 'value-use');
        }
        if (n.text === 'root') roots++;
        if (taints.has(n.text) && (offset(n) < discovery.startByte || offset(n) >= discovery.endByte)) bad(n, 'discovery-taint-escape');
        if (['name', 'manifest'].includes(n.text) && offset(n) >= discovery.endByte) bad(n, 'listing-taint-escape');
        const symbol = checker.getSymbolAtLocation(n);
        const declarations = symbol?.declarations ?? [];
        const local = declarations.length > 0 && declarations.every((d) => d.getStart(sf) >= valid.getStart(sf) && d.end <= valid.end);
        if (!local && !allowedFree.has(n.text)) bad(n, `undeclared-dependency:${n.text}`);
        if (local && allowedFree.has(n.text)) bad(n, `capability-shadow:${n.text}`);
      }
    }
    if (ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n)
      || ts.isDoStatement(n) || ts.isTryStatement(n) || ts.isAwaitExpression(n) || ts.isYieldExpression(n)
      || ts.isTaggedTemplateExpression(n) || ts.isFunctionExpression(n) || ts.isClassExpression(n)
      || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isDeleteExpression(n)) bad(n, 'forbidden-effect');
    if (ts.isPropertyAccessExpression(n) && ['constructor', 'prototype', '__proto__'].includes(n.name.text)) bad(n, 'prototype-access');
    if (n.questionDotToken) bad(n, 'optional-access');
    if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) || n.asteriskToken) bad(n, 'deferred-work');
    if (ts.isNewExpression(n) && !['Error', 'Set'].includes(n.expression.getText(sf))) bad(n, 'unlisted-construction');
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const receiver = callee.expression.getText(sf), method = callee.name.text;
        if (Object.hasOwn(staticMethods, receiver)) {
          if (!staticMethods[receiver].includes(method)) bad(n, 'unlisted-static-call');
          if (receiver === 'JSON' && n.arguments.length !== 1) bad(n, 'json-extra-argument');
        } else if (!instanceMethods.has(method)) bad(n, 'unlisted-instance-call');
        if (method === 'test' && (!ts.isRegularExpressionLiteral(callee.expression) || /[gy]$/.test(receiver))) bad(n, 'stateful-regexp');
      } else if (ts.isIdentifier(callee)) {
        const symbol = checker.getSymbolAtLocation(callee);
        const localArrow = symbol?.declarations?.find((d) => ts.isVariableDeclaration(d) && d.initializer && ts.isArrowFunction(d.initializer)
          && d.getStart(sf) >= valid.getStart(sf) && d.end <= valid.end);
        if (!localArrow && !['activationFixture', 'canonicalBytes', 'expect', 'join', 'readFileSync', 'readdirSync', 'record', 'sha256'].includes(callee.text)) {
          bad(n, 'unlisted-function-call');
        }
        if (localArrow && n.getStart(sf) >= localArrow.getStart(sf) && n.end <= localArrow.end) bad(n, 'recursive-call');
      } else if (!(ts.isParenthesizedExpression(callee) && ts.isArrowFunction(callee.expression))) bad(n, 'indirect-call');
    }
    if (ts.isElementAccessExpression(n)) {
      const key = n.argumentExpression;
      const numeric = ts.isNumericLiteral(key) || ts.isBinaryExpression(key)
        && key.operatorToken.kind === ts.SyntaxKind.MinusToken && key.right.getText(sf) === '1'
        && ts.isPropertyAccessExpression(key.left) && key.left.name.text === 'length';
      const fixedMap = n.expression.getText(sf) === 'maps' && key.getText(sf) === 'id';
      if (!numeric && !fixedMap && !(ts.isStringLiteral(key) && ['REQ-M5-COMPAT-013', 'REQ-M5-LIFECYCLE-006'].includes(key.text))) {
        bad(n, 'arbitrary-computed-read');
      }
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && !ts.isIdentifier(n.left)) bad(n, 'external-write');
    ts.forEachChild(n, visit);
  }
  visit(valid);
  if (values !== 2) bad(valid, 'value-reference-count');
  if (roots !== 1) bad(valid, 'root-reference-count');
  violations.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || Buffer.compare(Buffer.from(a.reason), Buffer.from(b.reason)));
  if (violations.length) failure('consumer-decoder-binding', { stage: 'dependency', ...violations[0] });
}
function dependencyProbes(env, original, inputs) {
  const { ts } = env;
  const probes = [
    'const extra = value;', 'const extra = value.provenance;', 'const extra = value.executionBinding;',
    'const extra = value["provenance"];', 'const extra = value?.provenance;', 'const extra = {...value};',
    'const {provenance} = value;', 'if (value.provenance) throw new Error("branch");',
    'const extra = `${value.provenance}`;', 'record(value);', 'const extra = () => value;',
    'const extra = (value) => value;', 'const extra = root;', 'record(root);',
    'const extra = `${root}`;', 'if (root) throw new Error("branch");',
    'const extra = {...root};', 'const extra = () => root;', 'const extra = (root) => root;',
    'join(root, "other");', 'const extra = (root);', 'const extra = value.other;',
    'const extra = value.provenance.other;', 'const extra = value.executionBinding.other;',
    'const extra = value.executionBinding["logicalCommandSha256"];',
    'const extra = value.executionBinding?.logicalCommandSha256;', 'const extra = [root];',
    'const extra = base;', 'record(base);', 'if (base) throw new Error("base");',
    'const extra = `${base}`;', 'const extra = {...base};', 'const extra = () => base;',
    'const extra = candidates;', 'const extra = predecessors;', 'const extra = tips;',
    'const extra = tips[0].name;', 'const extra = [...candidates];',
    'const extra = predecessors.has("other");', 'const extra = join(base,"other");',
    'const extra = readdirSync(base);', 'const {name} = tips[0];',
    'const extra = tips.map(t => t.name);', 'const extra = candidates[0].name;',
  ];
  const marker = "    record(inputs);";
  assert.equal(original.text.split(marker).length, 2);
  for (const insertion of probes) {
    const text = original.text.replace(marker, `${insertion}\n${marker}`);
    const sf = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
    const fn = sf.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'activationCases');
    const valid = fn.body.statements.filter(ts.isVariableStatement).flatMap((n) => n.declarationList.declarations)
      .find((n) => n.name.getText(sf) === 'valid').initializer;
    assert.throws(() => dependencies(env, { ...original, text, sf, valid }), undefined, insertion);
  }
  const altered = original.text.replace("'preflight/inputs.json'", "'preflight', 'inputs.json'");
  const sf = ts.createSourceFile(sourcePath, altered, ts.ScriptTarget.Latest, true);
  const fn = sf.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'activationCases');
  const valid = fn.body.statements.filter(ts.isVariableStatement).flatMap((n) => n.declarationList.declarations)
    .find((n) => n.name.getText(sf) === 'valid').initializer;
  assert.throws(() => dependencies(env, { ...original, text: altered, sf, valid }));
  return probes.length + 1;
}
function instrument(env, extracted) {
  const { ts } = env, { sf } = extracted;
  const f = ts.factory;
  const debit = (kind, n) => f.createCallExpression(f.createIdentifier('__g8Debit'), undefined, [
    f.createStringLiteral(kind), f.createNumericLiteral(1),
    f.createStringLiteral(`${n.kind}:${Buffer.byteLength(extracted.text.slice(0, n.getStart(sf)))}:${Buffer.byteLength(extracted.text.slice(0, n.end))}`),
  ]);
  const transformed = ts.transform(extracted.valid, [(context) => {
    const visitor = (node) => {
      if (ts.isTypeNode(node)) return node;
      if (ts.isArrowFunction(node)) {
        const body = ts.visitNode(node.body, visitor);
        const block = ts.isBlock(body)
          ? f.updateBlock(body, [f.createExpressionStatement(debit('arrowEntries', node)), ...body.statements])
          : f.createBlock([f.createExpressionStatement(debit('arrowEntries', node)), f.createReturnStatement(body)], true);
        return f.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, block);
      }
      if (ts.isBlock(node)) {
        return f.updateBlock(node, node.statements.flatMap((s) => [
          ...(ts.isBlock(s) ? [] : [f.createExpressionStatement(debit('statements', s))]), ts.visitNode(s, visitor),
        ]));
      }
      if (ts.isIfStatement(node)) {
        const branch = (s) => ts.isBlock(s) ? ts.visitNode(s, visitor)
          : f.createBlock([f.createExpressionStatement(debit('statements', s)), ts.visitNode(s, visitor)]);
        return f.updateIfStatement(node, ts.visitNode(node.expression, visitor), branch(node.thenStatement),
          node.elseStatement ? branch(node.elseStatement) : undefined);
      }
      const result = ts.visitEachChild(node, visitor, context);
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        return f.createParenthesizedExpression(f.createCommaListExpression([debit('calls', node), result]));
      }
      return result;
    };
    return (n) => ts.visitNode(n, visitor);
  }]);
  const printed = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printNode(ts.EmitHint.Expression, transformed.transformed[0], sf);
  transformed.dispose();
  const result = ts.transpileModule(`const __consumerResult = ${printed};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, sourceMap: false }, reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  return result.outputText;
}
function jsonCapability(context, discoveryText, debit) {
  const native = vm.runInContext('({parse:JSON.parse,stringify:JSON.stringify,freeze:Object.freeze})', context);
  const log = [];
  const note = (path, operation, key, allowed) => log.push({ ordinal: log.length, path, operation, key: typeof key === 'string' ? key : null, allowed });
  function monitor(target, path) {
    if (path === '' && target.predecessorFreeze !== null) target.predecessorFreeze = monitor(target.predecessorFreeze, '/predecessorFreeze');
    native.freeze(target);
    return new Proxy(target, {
      get(t, key) {
        const allowed = key === (path === '' ? 'predecessorFreeze' : 'manifestSha256');
        note(path, 'get', key, allowed);
        assert(allowed, 'discovery read forbidden');
        return t[key];
      },
      ownKeys() { note(path, 'ownKeys', null, false); throw new Error('discovery enumeration forbidden'); },
      getOwnPropertyDescriptor(t, key) { note(path, 'getOwnPropertyDescriptor', key, false); throw new Error('discovery descriptor forbidden'); },
      getPrototypeOf() { note(path, 'getPrototypeOf', null, false); throw new Error('discovery prototype forbidden'); },
      set(t, key) { note(path, 'set', key, false); throw new Error('discovery write forbidden'); },
      defineProperty(t, key) { note(path, 'defineProperty', key, false); throw new Error('discovery define forbidden'); },
      deleteProperty(t, key) { note(path, 'deleteProperty', key, false); throw new Error('discovery delete forbidden'); },
      setPrototypeOf() { note(path, 'setPrototypeOf', null, false); throw new Error('discovery prototype forbidden'); },
    });
  }
  function freeze(value) {
    debit('freezeNodes', 1, 'JSON.parse');
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) freeze(value[key]);
      native.freeze(value);
    }
    return value;
  }
  function parse(...args) {
    assert.equal(args.length, 1);
    assert.equal(typeof args[0], 'string');
    debit('parseBytes', Buffer.byteLength(args[0]), 'JSON.parse');
    const value = native.parse(args[0]);
    if (args[0] !== discoveryText) return freeze(value);
    const count = (v) => {
      debit('freezeNodes', 1, 'JSON.parse');
      if (v !== null && typeof v === 'object') Object.keys(v).forEach((k) => count(v[k]));
    };
    count(value);
    return monitor(value, '');
  }
  function stringify(...args) {
    assert.equal(args.length, 1);
    const text = native.stringify(args[0]);
    debit('stringifyBytes', text === undefined ? 0 : Buffer.byteLength(text), 'JSON.stringify');
    return text;
  }
  return { capability: Object.freeze({ parse: Object.freeze(parse), stringify: Object.freeze(stringify) }), log };
}
function capabilityProbes(env, recipe) {
  const results = [];
  for (const id of recipe.jsonCapabilityProbes) {
    for (const predecessorFreeze of [null, { manifestSha256: 'a'.repeat(64) }]) {
      const ctx = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
      const discoveryText = env.canonicalBytes({ predecessorFreeze }).toString('utf8');
      const { capability } = jsonCapability(ctx, discoveryText, () => {});
      ctx.cap = capability;
      ctx.discoveryText = discoveryText;
      const run = (code) => vm.runInContext(`"use strict"; ${code}`, ctx);
      switch (id) {
        case 'object-freeze': assert.equal(run('Object.isFrozen(cap.parse(\'{"outer":{"n":1}}\'))'), true); break;
        case 'array-freeze': assert.equal(run('Object.isFrozen(cap.parse(\'[{"n":1}]\'))'), true); break;
        case 'nested-write-reject': assert.throws(() => run('cap.parse(\'{"outer":{"n":1}}\').outer.n=2')); break;
        case 'array-write-reject': assert.throws(() => run('cap.parse(\'[{"n":1}]\')[0]=null')); break;
        case 'discovery-allowed-read': assert.equal(run('const p=cap.parse(discoveryText).predecessorFreeze;p===null?null:p.manifestSha256'), predecessorFreeze?.manifestSha256 ?? null); break;
        case 'discovery-extra-read-reject': assert.throws(() => run('cap.parse(discoveryText).other')); break;
        case 'discovery-enumeration-reject': assert.throws(() => run('Object.keys(cap.parse(discoveryText))')); break;
        case 'discovery-write-reject': assert.throws(() => run('cap.parse(discoveryText).predecessorFreeze=null')); break;
        case 'prototype-change-reject': assert.throws(() => run('Object.setPrototypeOf(cap.parse(discoveryText),null)')); break;
        case 'capability-write-reject': assert.throws(() => run('cap.parse=null')); break;
        case 'invalid-json-reject': assert.throws(() => run('cap.parse("{")')); break;
        case 'native-stringify-equivalence': assert.equal(run('cap.stringify(cap.parse(\'{"z":1,"a":[2]}\'))'), '{"z":1,"a":[2]}'); break;
        default: throw new Error(`Unrecognized probe ${id}`);
      }
    }
    results.push({ id, expected: true, observed: true });
  }
  return results;
}
export async function verifyConsumerDecoder({ repositoryRoot, sourceBytes, inputsBytes }) {
  const env = await environment(repositoryRoot);
  const { H, sha256, canonicalBytes } = env;
  assert.equal(sha256(inputsBytes), preparation);
  const inputs = JSON.parse(inputsBytes);
  assert.equal(inputs.kind, 'change0017-g8-freeze-inputs-v3');
  assert.equal(Buffer.compare(canonicalBytes(inputs), inputsBytes), 0);
  const file = inputs.manifestCore.files.find((f) => f.path === sourcePath);
  assert.equal(sha256(sourceBytes), file.sha256);
  for (const f of inputs.manifestCore.files) assert.equal(sha256(fs.readFileSync(resolve(repositoryRoot, f.path))), f.sha256);
  const nativePrefixes = nativeChecks(env, inputs);
  const extracted = extract(env, sourceBytes, inputs);
  dependencies(env, extracted);
  const recipe = inputs.evaluationRecipe.consumerDecoderRecipe;
  const probeResults = capabilityProbes(env, recipe);
  const code = instrument(env, extracted);
  const counters = Object.fromEntries(recipe.budget.counters.map((key) => [key, 0]));
  let total = 0;
  const debit = (counter, amount, site) => {
    assert(Object.hasOwn(counters, counter) && Number.isSafeInteger(amount) && amount >= 0);
    if (total + amount > recipe.budget.limit) failure('consumer-decoder-binding', {
      stage: 'execution', reason: 'operation-budget-exhausted', site, counter, amount, counters,
    });
    counters[counter] += amount;
    total += amount;
  };
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  const discoveryText = canonicalBytes({ predecessorFreeze: inputs.manifestCore.predecessorFreeze }).toString('utf8');
  const json = jsonCapability(context, discoveryText, debit);
  const base = '@consumer-root/.musubix/evidence/test-file-freeze/CHANGE-0017/g8';
  const reads = [];
  const deepFreeze = (value) => {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  const view = deepFreeze({
    provenance: structuredClone(inputs.fixtureBindings.synthetic.provenance),
    executionBinding: Object.freeze({ logicalCommandSha256: inputs.fixtureBindings.synthetic.logicalCommandSha256 }),
  });
  const token = Object.freeze({});
  let captured, count = 0;
  const cap = {
    Buffer, JSON: json.capability, canonicalBytes, sha256, root: '@consumer-root', value: view, record: object,
    __g8Debit: debit,
    join: (...parts) => {
      assert(parts.every((p) => typeof p === 'string' && !p.split('/').includes('..')));
      const result = posix.join(...parts);
      assert(result === base || result.startsWith(`${base}/`));
      return result;
    },
    readdirSync: (...args) => {
      assert.deepEqual(args, [base]);
      reads.push({ operation: 'readdirSync', path: 'B', sha256: H(['prepared-root']) });
      return ['prepared-root'];
    },
    readFileSync: (...args) => {
      assert.equal(args.length, 2);
      assert.equal(args[1], 'utf8');
      if (args[0] === `${base}/prepared-root/manifest.json`) {
        reads.push({ operation: 'readFileSync', path: 'F/manifest.json#discovery-view', sha256: sha256(Buffer.from(discoveryText)) });
        return discoveryText;
      }
      assert.equal(args[0], `${base}/prepared-root/preflight/inputs.json`);
      reads.push({ operation: 'readFileSync', path: 'F/preflight/inputs.json', sha256: sha256(inputsBytes) });
      return inputsBytes.toString('utf8');
    },
    expect: (value) => Object.freeze({ toHaveLength: (length) => assert.equal(value.length, length) }),
    activationFixture: (provenance, logicalCommand, binding) => {
      assert.equal(++count, 1);
      assert.equal(provenance, view.provenance);
      assert.equal(logicalCommand, view.executionBinding.logicalCommandSha256);
      captured = deepFreeze(binding);
      return token;
    },
  };
  for (const [key, value] of Object.entries(cap)) Object.defineProperty(context, key, { value, writable: false, configurable: false });
  vm.runInContext('for (const value of [Object,Array,String,Number,Boolean,Set,RegExp,Error]) { Object.freeze(value.prototype); Object.freeze(value); }', context);
  vm.runInContext(code, context);
  assert.equal(vm.runInContext('__consumerResult', context), token);
  assert.equal(count, 1);
  assert.deepEqual(reads.map((r) => r.operation), ['readdirSync', 'readFileSync', 'readFileSync']);
  const separate = JSON.parse(inputsBytes);
  const g8 = separate.fixtureBindings.g8;
  const independent = {
    repositoryId: g8.repositoryId, approvals: g8.approvals, phases: g8.phases,
    orderPrefix: { records: decode(env, g8.orderPrefix) },
    implementationPaths: Object.fromEntries(inputs.manifestCore.requirementIds.map((id) => [
      id, separate.fixtureBindings.g7.phases.requirements.fingerprints.requirementImplementations[id].paths,
    ])),
  };
  assert.equal(captured.orderPrefix.records.length, g8.orderPrefix.recordJson.length);
  captured.orderPrefix.records.forEach((record, i) => assert.equal(JSON.stringify(record), g8.orderPrefix.recordJson[i]));
  native(env, { schemaVersion: 1, records: captured.orderPrefix.records });
  assert.equal(H(captured), H(independent));
  assert.equal(g8.approvals.design.artifactSha256, inputs.manifestCore.designApprovalSha256);
  assert.equal(g8.phases.design.order, inputs.manifestCore.designCheckpoint.order);
  const consumerDecoder = {
    extractionSha256: extracted.nodes[3] && inputs.extractions[3].sha256,
    astIdentitySha256: H(inputs.extractions[3].astIdentity), sourceSha256: sha256(sourceBytes),
    inputsSha256: sha256(inputsBytes), recipeSha256: H(recipe), invocationCount: 1, factoryStubCallCount: count, uuidDrawCount: 0,
    reads, discoveryDescriptorSha256: H(recipe.discovery),
    jsonCapability: { version: recipe.jsonCapability, probes: probeResults, accessLog: json.log },
    executionBudget: { ...recipe.budget, instrumentedInitializerSha256: sha256(Buffer.from(code)), counters, total },
    consumerResultSha256: H(captured), independentResultSha256: H(independent),
    binding: {
      repositoryId: g8.repositoryId, requirementsApprovalSha256: g8.approvals.requirements.artifactSha256,
      designApprovalSha256: g8.approvals.design.artifactSha256, requirementsPhaseSha256: H(g8.phases.requirements),
      designPhaseSha256: H(g8.phases.design), requirementsCheckpointOrder: g8.phases.requirements.order,
      designCheckpointOrder: g8.phases.design.order, prefixDescriptorSha256: H(g8.orderPrefix),
      recordCount: captured.orderPrefix.records.length, tipSequence: g8.orderPrefix.tipSequence,
      tipRecordSha256: g8.orderPrefix.tipRecordSha256, recordStringsSha256: H(captured.orderPrefix.records.map((r) => JSON.stringify(r))),
      implementationPathsSha256: H(captured.implementationPaths),
    },
    match: true, nativeDiagnostics: [],
  };
  return { consumerDecoder, structuralCheck: { id: 'consumer-decoder-binding', expected: true, observed: true, diagnostic: null } };
}
function historicalBindings(env, inputs) {
  const { H, sha256, repositoryRoot } = env;
  const g7 = inputs.fixtureBindings.g7;
  for (const stage of ['requirements', 'design']) {
    const binding = g7.approvalSources[stage];
    const bytes = fs.readFileSync(resolve(repositoryRoot, binding.path));
    assert.equal(sha256(bytes), binding.byteSha256);
    assert.equal(H(JSON.parse(bytes)), H(g7.approvals[stage]));
    exactKeys(g7.approvals[stage], ['schemaVersion', 'stage', 'changeId', 'generation', 'artifacts', 'projection',
      'exclusions', 'artifactSha256', 'approver', 'approvedAt']);
    const { artifactSha256, approver, approvedAt, ...identity } = g7.approvals[stage];
    assert.equal(H(identity), artifactSha256);
    assert.equal(approver, 'nahisaho');
    assert.equal(approvedAt, stage === 'requirements' ? '2026-09-28T20:31:54.872Z' : '2026-09-28T21:02:40.460Z');
  }
  for (const [stage, expected] of [
    ['requirements', '184b3220f3dbe42a1489b97c6282e526a49ee4ffe5fd4ba64413e72326601e57'],
    ['design', '18f1a9e1cf247c577bb7b9106530b685e94a9e41646ea721726620163b80b89c'],
  ]) {
    assert.equal(H(g7.phases[stage]), expected);
    const fp = g7.phases[stage].fingerprints;
    exactKeys(fp, ['impact', 'requirements', 'design', 'implementation', 'tests', 'tdd', 'requirementImplementations']);
    for (const k of ['impact', 'requirements', 'design', 'implementation', 'tests', 'tdd']) assert.match(fp[k], hex);
    assert.equal(H(fp.requirementImplementations), 'f7fa1cdb2c28975d649b43a211fabd76281aa9f9bae6d8a1b1cb7a041ead8059');
  }
  for (const [id, expected] of [
    ['REQ-M5-COMPAT-013', '348fe2c8f9885e7d00c5b79d0d5a4b375065923f227e2a9895486beab5bfd01b'],
    ['REQ-M5-LIFECYCLE-006', '6aeb77252ea71c7a9eac504d351640c699414da01f0e0ad54e9304a998acad2f'],
  ]) assert.equal(H(g7.phases.requirements.fingerprints.requirementImplementations[id].paths), expected);
}
function factory(env, extracted, inputs, caseId, binding) {
  const { ts, H, sha256, canonicalBytes } = env;
  const draws = [];
  let counter = 0;
  const randomUUID = () => {
    const bytes = Buffer.from(H(['g8-freeze-fixture', preparation, caseId, counter]), 'hex').subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = bytes.toString('hex');
    const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    draws.push({ counter: counter++, uuid });
    return uuid;
  };
  const context = vm.createContext({
    Buffer, structuredClone, canonicalBytes, sha256, randomUUID, record: object,
    generationOrderPhase: env.change.generationOrderPhase, nextBatchScopeId: env.change.nextBatchScopeId,
    provenance: inputs.fixtureBindings.synthetic.provenance,
    logicalCommandSha256: inputs.fixtureBindings.synthetic.logicalCommandSha256, bindings: binding,
  }, { codeGeneration: { strings: false, wasm: false } });
  const run = (text) => vm.runInContext(ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
  }).outputText, context);
  run(`${extracted.nodes[0].getText(extracted.sf)}\nconst valid=activationFixture(provenance,logicalCommandSha256,bindings);`);
  const valid = vm.runInContext('valid', context);
  const factoryEndCounter = counter;
  assert.equal(factoryEndCounter, 12);
  return {
    valid, mutations: () => {
      run(`const ${extracted.nodes[1].getText(extracted.sf)};\nconst ${extracted.nodes[2].getText(extracted.sf)};`);
      return vm.runInContext('mutations', context);
    },
    audit: (mutationArrayEvaluationCount) => ({
      caseId, initialCounter: 0, factoryCallCount: 1, mutationArrayEvaluationCount, factoryEndCounter, draws, finalCounter: counter,
    }),
  };
}
function validateCandidate(env, inputs, candidate, binding) {
  const { H } = env;
  const R = (v) => env.sha256(Buffer.from(JSON.stringify(v)));
  const c = candidate, a = c.green.testRuntime.activation;
  const result = env.change.validateBatchCheckpointJournal(c.journal);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  native(env, { schemaVersion: 1, records: c.orders });
  assert.equal(env.change.testsUnchangedCondition({ phases: c.phases }, c.batch), false);
  assert.equal(env.change.implementationUnchangedCondition(c.batch), false);
  for (const id of inputs.manifestCore.requirementIds) assert.equal(env.change.relevantImplementationUnchangedCondition(c.batch, id), false);
  assert.equal(c.repositoryId, inputs.manifestCore.repositoryId);
  assert.equal(c.tddEvidence.cycles.length, 12);
  assert.equal(c.tddEvidence.chain.length, 12);
  assert.equal(H(c.approvals), H(binding.approvals));
  assert.equal(H(c.phases), H(binding.phases));
  assert.equal(a.requirementsApprovalSha256, binding.approvals.requirements.artifactSha256);
  assert.equal(a.designApprovalSha256, binding.approvals.design.artifactSha256);
  assert.equal(a.requirementsCheckpointOrder, binding.phases.requirements.order);
  assert.equal(a.designCheckpointOrder, binding.phases.design.order);
  let previous = null;
  c.tddEvidence.cycles.forEach((cycle, i) => {
    const assignment = inputs.fixtureBindings.synthetic.assignments[i];
    assert.equal(cycle.testId, assignment.testId);
    assert.equal(cycle.requirementId, assignment.requirementId);
    assert.equal(cycle.testPath, assignment.path);
    assert(c.phases.design.order < cycle.red.order && cycle.red.order < c.batch.red.order);
    assert.equal(cycle.red.order, c.phases.design.order + i + 1);
    for (const field of ['schemaVersion', 'testRuntime', 'augmentationSha256']) assert(!Object.hasOwn(cycle.red, field));
    const chain = c.tddEvidence.chain[i], { recordSha256, ...payload } = chain;
    assert.equal(chain.previousSha256, previous);
    assert.equal(recordSha256, R(payload));
    assert.equal(chain.phaseEvidenceSha256, R(cycle.red));
    assert.equal(chain.cycleId, cycle.cycleId);
    previous = recordSha256;
  });
  assert(c.batch.red.order < c.batch.implementation.order && c.batch.implementation.order < c.green.order);
  assert.equal(c.cycle.red.testFingerprint, c.green.testFingerprint);
  assert.equal(c.cycle.red.commandSha256, c.green.commandSha256);
  const S = R(c.tddEvidence);
  c.journal.forEach((j, i) => {
    const stage = i === 0 ? 'red' : 'implementation';
    const ref = a[`${stage}Checkpoint`];
    assert.equal(j.payload.tddEvidenceSha256, S);
    assert.equal(H(j.payload.fingerprints), H(c.batch[stage].fingerprints));
    assert.equal(ref.journalRecordSha256, j.recordSha256);
    assert.equal(ref.tddEvidenceSha256, S);
    assert.equal(ref.orderPhaseKey, j.payload.orderPhaseKey);
    assert.equal(ref.order, c.batch[stage].order);
  });
  assert.equal(a.redPhaseEvidenceSha256, R(c.cycle.red));
  return { id: `candidate-structural-${binding.generation}`, expected: true, observed: true, diagnostic: null };
}
function evaluator(env, inputs) {
  const ids = new Set(inputs.fixtureBindings.synthetic.assignments.map((a) => a.testId));
  const R = (v) => env.sha256(Buffer.from(JSON.stringify(v)));
  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const checks = {
    'legacy-envelope-version': (c) => c.tddEvidence.schemaVersion === 1,
    'red-testRuntime-absent': (c) => !Object.hasOwn(c.cycle.red, 'testRuntime'),
    'red-augmentationSha256-absent': (c) => !Object.hasOwn(c.cycle.red, 'augmentationSha256'),
    'red-schemaVersion-absent': (c) => !Object.hasOwn(c.cycle.red, 'schemaVersion'),
    'design-before-red': (c) => c.phases.design.order < c.cycle.red.order,
    'red-before-batch-red': (c) => c.cycle.red.order < c.batch.red.order,
    'batch-red-before-implementation': (c) => isObject(c.batch.implementation) && c.batch.red.order < c.batch.implementation.order,
    'implementation-checkpoint-present': (c) => Object.hasOwn(c.batch, 'implementation') && isObject(c.batch.implementation),
    'closed-test-membership': (c) => ids.has(c.cycle.testId),
    'logical-command-equality': (c) => c.cycle.red.commandSha256 === c.green.commandSha256
      && c.green.commandSha256 === inputs.fixtureBindings.synthetic.logicalCommandSha256,
    'design-approval-reference': (c) => c.green.testRuntime.activation.designApprovalSha256 === inputs.manifestCore.designApprovalSha256,
    'cycle-id-binding': (c) => c.cycle.cycleId === c.green.testRuntime.activation.cycleId,
    'generation-eight': (c) => c.cycle.generation === 8,
    'change-id-binding': (c) => c.cycle.changeId === inputs.manifestCore.changeId,
    'scope-binding': (c) => c.batch.scopeId === inputs.manifestCore.scopeId && c.batch.scopeId === c.green.testRuntime.activation.scopeId,
    'repository-binding': (c) => c.repositoryId === inputs.manifestCore.repositoryId,
    'red-chain-reference': (c) => c.tddEvidence.chain.some((r) => r.cycleId === c.cycle.cycleId && r.phase === 'red' && r.phaseEvidenceSha256 === R(c.cycle.red)),
    'red-checkpoint-reference-present': (c) => Object.hasOwn(c.green.testRuntime.activation, 'redCheckpoint')
      && isObject(c.green.testRuntime.activation.redCheckpoint),
    'implementation-journal-reference': (c) => c.green.testRuntime.activation.implementationCheckpoint?.journalRecordSha256
      === c.journal.find((j) => j.payload.phase === 'implementation' && j.payload.scopeId === c.batch.scopeId)?.recordSha256,
    'implementation-before-green': (c) => isObject(c.batch.implementation) && c.batch.implementation.order < c.green.order,
  };
  assert.deepEqual(Object.keys(checks), inputs.evaluationRecipe.positiveCheckIds);
  return (id, c) => {
    const value = checks[id](c);
    assert.equal(typeof value, 'boolean');
    return value;
  };
}
function rewriteG7(env, inputs, original, prefix) {
  const H = env.H, R = (v) => env.sha256(Buffer.from(JSON.stringify(v)));
  const c = structuredClone(original), g7 = inputs.fixtureBindings.g7;
  const stepResults = [];
  const step = (stepId) => stepResults.push({ stepId, resultSha256: H(c) });
  step('clone-and-pin');
  for (const cycle of c.tddEvidence.cycles) cycle.generation = 7;
  for (const chain of c.tddEvidence.chain) chain.generation = 7;
  for (const j of c.journal) j.payload.generation = 7;
  c.cycle = c.tddEvidence.cycles.find((x) => x.testId === c.cycle.testId);
  c.green.testRuntime.activation.generation = 7;
  c.approvals = structuredClone(g7.approvals);
  c.phases = structuredClone(g7.phases);
  step('retarget-identities');
  const D = 3788;
  c.tddEvidence.cycles.forEach((cycle, i) => { cycle.red.order = D + i + 1; });
  c.batch.red.order = D + 13;
  c.batch.implementation.order = D + 14;
  c.green.order = D + 15;
  const key = (phase) => env.change.generationOrderPhase(7, phase, c.batch.scopeId);
  const entries = [
    ...c.tddEvidence.cycles.map((cycle) => ({ kind: 'tdd', entityId: cycle.cycleId, phase: 'red', testId: cycle.testId })),
    { kind: 'change', entityId: 'CHANGE-0017', phase: key('red') },
    { kind: 'change', entityId: 'CHANGE-0017', phase: key('implementation') },
    { kind: 'tdd', entityId: c.cycle.cycleId, phase: 'green', testId: c.cycle.testId },
  ];
  let previous = prefix.at(-1).recordSha256;
  c.orders = [...prefix, ...entries.map((entry, i) => {
    const payload = { sequence: D + i + 1, ...entry, previousSha256: previous };
    const record = { ...payload, recordSha256: R(payload) };
    previous = record.recordSha256;
    return record;
  })].map((r) => JSON.parse(JSON.stringify(r)));
  native(env, { schemaVersion: 1, records: c.orders });
  step('rebuild-order-suffix');
  previous = null;
  c.tddEvidence.chain = c.tddEvidence.cycles.map((cycle, i) => {
    const payload = {
      sequence: i + 1, cycleId: cycle.cycleId, changeId: cycle.changeId, generation: 7,
      requirementId: cycle.requirementId, testId: cycle.testId, testPath: cycle.testPath,
      commandName: cycle.commandName, phase: 'red', phaseEvidenceSha256: R(cycle.red), previousSha256: previous,
    };
    const record = { ...payload, recordSha256: R(payload) };
    previous = record.recordSha256;
    return record;
  });
  step('rebuild-red-chain');
  const S = R(c.tddEvidence);
  step('hash-tdd-snapshot');
  previous = null;
  c.journal = c.journal.map((old, i) => {
    const phase = i === 0 ? 'red' : 'implementation';
    const payload = { ...old.payload, generation: 7, fingerprints: c.batch[phase].fingerprints,
      tddEvidenceSha256: S, semanticPhaseKey: key(phase), orderPhaseKey: key(phase) };
    const { recordSha256, ...record } = old;
    Object.assign(record, { payload, idempotencyKey: `change-batch-checkpoint:CHANGE-0017:${key(phase)}`, previousSha256: previous });
    const result = { ...record, recordSha256: H(record) };
    previous = result.recordSha256;
    return result;
  });
  step('rebuild-checkpoint-journal');
  const a = c.green.testRuntime.activation;
  Object.assign(a, {
    generation: 7, redOrder: c.cycle.red.order, redPhaseEvidenceSha256: R(c.cycle.red),
    requirementsApprovalSha256: g7.approvals.requirements.artifactSha256,
    designApprovalSha256: g7.approvals.design.artifactSha256,
    requirementsCheckpointOrder: g7.phases.requirements.order, designCheckpointOrder: g7.phases.design.order,
  });
  for (const [i, phase] of ['red', 'implementation'].entries()) a[`${phase}Checkpoint`] = {
    order: c.batch[phase].order, orderPhaseKey: key(phase), journalRecordSha256: c.journal[i].recordSha256, tddEvidenceSha256: S,
  };
  step('rebind-activation');
  const identityClosure = identityG7(env, inputs, c, original);
  validateCandidate(env, inputs, c, g7);
  step('verify-and-evaluate');
  return { candidate: c, stepResults, snapshot: S, identityClosure };
}
function identityG7(env, inputs, c, original) {
  const audit = createIdentityAuditContract(env);
  const requireAt = (condition, pointer, reason) => {
    if (!condition) audit.reject(pointer, reason);
  };
  const skip = new Set([
    ...Array.from({ length: 3788 }, (_, i) => `/orders/${i}`),
    '/approvals/requirements', '/approvals/design', '/phases/requirements', '/phases/design', '/batch/red', '/batch/implementation',
  ]);
  for (const phase of ['red', 'implementation']) {
    exactKeys(c.batch[phase], ['phase', 'order', 'recordedAt', 'fingerprints']);
    assert.equal(env.H(c.batch[phase]), env.H({ ...original.batch[phase], order: phase === 'red' ? 3801 : 3802 }));
  }
  const expectedGeneration = [
    ...Array.from({ length: 12 }, (_, i) => `/tddEvidence/cycles/${i}/generation`),
    ...Array.from({ length: 12 }, (_, i) => `/tddEvidence/chain/${i}/generation`),
    '/cycle/generation', '/journal/0/payload/generation', '/journal/1/payload/generation', '/green/testRuntime/activation/generation',
  ].sort();
  const phase = (name) => env.change.generationOrderPhase(7, name, c.batch.scopeId);
  const raw = {
    '/orders/3800/phase': phase('red'), '/orders/3801/phase': phase('implementation'),
    '/journal/0/payload/semanticPhaseKey': phase('red'), '/journal/0/payload/orderPhaseKey': phase('red'),
    '/journal/1/payload/semanticPhaseKey': phase('implementation'), '/journal/1/payload/orderPhaseKey': phase('implementation'),
    '/green/testRuntime/activation/redCheckpoint/orderPhaseKey': phase('red'),
    '/green/testRuntime/activation/implementationCheckpoint/orderPhaseKey': phase('implementation'),
  };
  const wrapped = {
    '/journal/0/idempotencyKey': `change-batch-checkpoint:CHANGE-0017:${phase('red')}`,
    '/journal/1/idempotencyKey': `change-batch-checkpoint:CHANGE-0017:${phase('implementation')}`,
  };
  const observed = { generation: [], rawPhase: [], wrappedIdempotency: [] };
  const ancestors = new Set();
  function walk(value, path, key) {
    if (skip.has(path)) return;
    if (key === 'generation') { requireAt(value === 7, path, 'observation-generation'); observed.generation.push({ path, value }); }
    if (typeof value === 'string' && /^g\d+:/.test(value)) {
      requireAt(value === raw[path], path, 'observation-phase'); observed.rawPhase.push({ path, value });
    }
    if (typeof value === 'string' && value.startsWith('change-batch-checkpoint:')) {
      requireAt(value === wrapped[path], path, 'observation-idempotency'); observed.wrappedIdempotency.push({ path, value });
    }
    if (value === null || typeof value !== 'object') {
      requireAt(['string', 'boolean', 'number'].includes(typeof value) || value === null, path, 'observation-json-type');
      if (typeof value === 'number') requireAt(Number.isFinite(value), path, 'observation-json-number');
      return;
    }
    requireAt(!ancestors.has(value), path, 'observation-cycle');
    ancestors.add(value);
    requireAt(Object.getOwnPropertySymbols(value).length === 0, path, 'observation-symbols');
    if (Array.isArray(value)) {
      requireAt(Object.getOwnPropertyNames(value).length === value.length + 1
        && Object.keys(value).length === value.length, path, 'observation-array-properties');
      for (let i = 0; i < value.length; i++) {
        requireAt(Object.hasOwn(value, i) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, `${i}`), 'value'),
          `${path}/${i}`, 'observation-array-slot');
        walk(value[i], `${path}/${i}`, `${i}`);
      }
    } else {
      requireAt(Object.getOwnPropertyNames(value).length === Object.keys(value).length, path, 'observation-nonenumerable');
      for (const child of Object.keys(value).sort()) {
        requireAt(Object.hasOwn(Object.getOwnPropertyDescriptor(value, child), 'value'),
          `${path}/${child.replaceAll('~', '~0').replaceAll('/', '~1')}`, 'observation-accessor');
        walk(value[child], `${path}/${child.replaceAll('~', '~0').replaceAll('/', '~1')}`, child);
      }
    }
    ancestors.delete(value);
  }
  walk(c, '', '');
  const missing = [
    ...expectedGeneration.filter((p) => !observed.generation.some((o) => o.path === p)),
    ...Object.keys(raw).filter((p) => !observed.rawPhase.some((o) => o.path === p)),
    ...Object.keys(wrapped).filter((p) => !observed.wrappedIdempotency.some((o) => o.path === p)),
  ].sort();
  if (missing.length) audit.reject(missing[0], 'observation-missing');
  for (const entries of Object.values(observed)) entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return observed;
}
async function staging(repositoryRoot, sourceBytes, inputsBytes) {
  const env = await environment(repositoryRoot);
  const inputs = JSON.parse(inputsBytes);
  historicalBindings(env, inputs);
  const prefixes = nativeChecks(env, inputs);
  const consumer = await verifyConsumerDecoder({ repositoryRoot, sourceBytes, inputsBytes });
  const extracted = extract(env, sourceBytes, inputs);
  const probeCount = dependencyProbes(env, extracted, inputs);
  const binding = (name) => ({
    repositoryId: inputs.fixtureBindings[name].repositoryId, approvals: inputs.fixtureBindings[name].approvals,
    phases: inputs.fixtureBindings[name].phases, orderPrefix: { records: prefixes[name].records },
    implementationPaths: Object.fromEntries(inputs.manifestCore.requirementIds.map((id) => [
      id, inputs.fixtureBindings.g7.phases.requirements.fingerprints.requirementImplementations[id].paths,
    ])),
  });
  const evaluate = evaluator(env, inputs);
  const positive = factory(env, extracted, inputs, 'g8-mutations', binding('g8'));
  validateCandidate(env, inputs, positive.valid, inputs.fixtureBindings.g8);
  const checkCase = (candidate, falseIds) => inputs.evaluationRecipe.positiveCheckIds.map((id) => {
    const expected = !falseIds.includes(id), observed = evaluate(id, candidate);
    if (observed !== expected) failure(id, { expected, observed });
    return { id, expected, observed, diagnostic: observed ? null : `PREFLIGHT_ASSERTION_FAILED:${id}` };
  });
  const positiveChecks = checkCase(positive.valid, []);
  const mutations = positive.mutations();
  assert.equal(mutations.length, 23);
  assert.notEqual(mutations[14].cycle.cycleId, positive.valid.cycle.cycleId);
  const mutationResults = inputs.mutationTable.entries.map((entry, i) => {
    const common = {
      index: entry.index, caseName: entry.caseName, sourceMutationSha256: entry.sourceMutationSha256,
      expectedDisposition: entry.expectedDisposition, checkId: entry.checkId, greenCheck: entry.greenCheck,
    };
    if (entry.expectedDisposition === 'deferred-to-green') return {
      ...common, observedDisposition: 'deferred-to-green', diagnostic: null, executed: false,
    };
    const observed = evaluate(entry.checkId, mutations[i]);
    if (observed !== false) failure(entry.checkId, { index: i, expected: false, observed });
    return { ...common, observedDisposition: 'reject', diagnostic: entry.expectedDiagnostic, executed: true };
  });
  const foreign = factory(env, extracted, inputs, 'g7-foreign', binding('g8'));
  const rewritten = rewriteG7(env, inputs, foreign.valid, prefixes.g7.records);
  const foreignChecks = checkCase(rewritten.candidate, ['design-approval-reference', 'generation-eight']);
  const auditContract = createIdentityAuditContract(env);
  const identityAudits = auditContract.create(rewritten.identityClosure);
  const g7 = rewritten.candidate, R = (v) => env.sha256(Buffer.from(JSON.stringify(v)));
  const g7RewriteResult = {
    recipeSha256: env.H(inputs.evaluationRecipe.g7RewriteRecipe), factoryOutputSha256: env.H(foreign.valid),
    stepResults: rewritten.stepResults,
    phaseContainers: [['/phases/requirements', g7.phases.requirements], ['/phases/design', g7.phases.design],
      ['/batch/red', g7.batch.red], ['/batch/implementation', g7.batch.implementation]]
      .map(([path, value]) => ({ path, objectSha256: env.H(value), fingerprintsSha256: env.H(value.fingerprints) })),
    identities: {
      generation: 7, repositoryId: g7.repositoryId, changeId: 'CHANGE-0017', scopeId: g7.batch.scopeId,
      requirementIds: g7.batch.requirementIds, cycleIds: g7.tddEvidence.cycles.map((x) => x.cycleId),
      selectedCycleId: g7.cycle.cycleId, requirementsApprovalSha256: g7.approvals.requirements.artifactSha256,
      designApprovalSha256: g7.approvals.design.artifactSha256, requirementsCheckpointOrder: g7.phases.requirements.order,
      designCheckpointOrder: g7.phases.design.order, redOrders: g7.tddEvidence.cycles.map((x) => x.red.order),
      redCheckpointOrder: g7.batch.red.order, implementationCheckpointOrder: g7.batch.implementation.order, greenOrder: g7.green.order,
    },
    hashes: {
      orderPrefixSha256: env.H({ schemaVersion: 1, records: prefixes.g7.records }), ordersSha256: env.H(g7.orders),
      redPhaseEvidenceSha256: R(g7.cycle.red), redChainSha256: env.H(g7.tddEvidence.chain), tddEvidenceSha256: rewritten.snapshot,
      redJournalSha256: g7.journal[0].recordSha256, implementationJournalSha256: g7.journal[1].recordSha256, rewrittenFixtureSha256: env.H(g7),
    },
  };
  const uuidContexts = [positive.audit(1), foreign.audit(0)];
  assert.equal(uuidContexts[0].finalCounter, uuidContexts[0].factoryEndCounter + 1);
  assert.equal(uuidContexts[1].finalCounter, uuidContexts[1].factoryEndCounter);
  return {
    consumerDecoder: consumer.consumerDecoder,
    cases: [
      { caseId: 'g8-positive', expected: 'accept', observed: 'accept', checks: positiveChecks },
      { caseId: 'g7-foreign', expected: 'reject', observed: 'reject', checks: foreignChecks },
    ],
    structuralChecks: [
      consumer.structuralCheck, auditContract.summary(identityAudits),
      ...['g7-approval-source-binding', 'g7-phase-container-schema', 'native-order-prefix-binding',
        'consumer-dependency-probes', 'candidate-structural-g8', 'candidate-structural-g7']
        .map((id) => ({ id, expected: true, observed: true, diagnostic: null })),
    ],
    identityAudits,
    mutationResults, uuidContexts, g7RewriteResult,
    nativeOrderReplay: [['g8-positive', 'g8', positive.valid], ['g7-foreign', 'g7', g7]].map(([caseId, name, value]) => ({
      caseId, prefixExtractionSha256: inputs.fixtureBindings[name].orderPrefix.extractionSha256,
      prefixRecordStringsSha256: inputs.fixtureBindings[name].orderPrefix.recordStringsSha256,
      recordCount: value.orders.length, tipSequence: value.orders.at(-1).sequence, tipRecordSha256: value.orders.at(-1).recordSha256,
      recordStringsSha256: env.H(value.orders.map((r) => JSON.stringify(r))),
    })),
  };
}
export function validateSuccessChecks(env, checks, inputs) {
  exactKeys(checks, ['cases', 'structuralChecks', 'identityAudits', 'uuidContexts', 'g7RewriteResult',
    'nativeOrderReplay', 'consumerDecoder', 'mutationResults']);
  const contract = createIdentityAuditContract(env);
  contract.validate(checks.identityAudits);
  assert(Array.isArray(checks.structuralChecks));
  const summaries = checks.structuralChecks.filter((c) => c.id === 'g7-identity-location-closure');
  assert.equal(summaries.length, 1);
  assert.equal(env.H(summaries[0]), env.H(contract.summary(checks.identityAudits)));
  assert.equal(new Set(checks.structuralChecks.map((c) => c.id)).size, checks.structuralChecks.length);
  for (const check of checks.structuralChecks) {
    exactKeys(check, ['id', 'expected', 'observed', 'diagnostic']);
    assert.equal(typeof check.id, 'string');
    assert.equal(check.expected, true); assert.equal(check.observed, true); assert.equal(check.diagnostic, null);
  }
  assert.deepEqual(checks.cases.map((c) => c.caseId), ['g8-positive', 'g7-foreign']);
  for (const c of checks.cases) {
    exactKeys(c, ['caseId', 'expected', 'observed', 'checks']);
    const foreign = c.caseId === 'g7-foreign';
    assert.equal(c.expected, foreign ? 'reject' : 'accept'); assert.equal(c.observed, c.expected);
    assert.deepEqual(c.checks.map((c) => c.id), inputs.evaluationRecipe.positiveCheckIds);
    for (const check of c.checks) {
      exactKeys(check, ['id', 'expected', 'observed', 'diagnostic']);
      const expected = !(foreign && ['design-approval-reference', 'generation-eight'].includes(check.id));
      assert.equal(check.expected, expected); assert.equal(check.observed, expected);
      assert.equal(check.diagnostic, expected ? null : `PREFLIGHT_ASSERTION_FAILED:${check.id}`);
    }
  }
  assert.equal(checks.mutationResults.length, 23);
  checks.mutationResults.forEach((result, i) => {
    exactKeys(result, ['index', 'caseName', 'sourceMutationSha256', 'expectedDisposition',
      'observedDisposition', 'checkId', 'diagnostic', 'executed', 'greenCheck']);
    const expected = inputs.mutationTable.entries[i], deferred = expected.expectedDisposition === 'deferred-to-green';
    for (const key of ['index', 'caseName', 'sourceMutationSha256', 'expectedDisposition', 'checkId', 'greenCheck']) {
      assert.equal(env.H(result[key]), env.H(expected[key]));
    }
    assert.equal(result.observedDisposition, expected.expectedDisposition);
    assert.equal(result.executed, !deferred);
    assert.equal(result.diagnostic, expected.expectedDiagnostic);
  });
  assert.equal(checks.mutationResults.filter((r) => r.executed).length, 20);
  assert.deepEqual(checks.uuidContexts.map((c) => c.caseId), ['g8-mutations', 'g7-foreign']);
  checks.uuidContexts.forEach((c, i) => {
    exactKeys(c, ['caseId', 'initialCounter', 'factoryCallCount', 'mutationArrayEvaluationCount',
      'factoryEndCounter', 'draws', 'finalCounter']);
    assert.equal(c.initialCounter, 0); assert.equal(c.factoryCallCount, 1); assert.equal(c.factoryEndCounter, 12);
    assert.equal(c.mutationArrayEvaluationCount, i === 0 ? 1 : 0);
    assert.equal(c.finalCounter, i === 0 ? 13 : 12);
    assert.equal(c.draws.length, c.finalCounter);
    c.draws.forEach((draw, index) => {
      exactKeys(draw, ['counter', 'uuid']); assert.equal(draw.counter, index);
      const b = Buffer.from(env.H(['g8-freeze-fixture', preparation, c.caseId, index]), 'hex').subarray(0, 16);
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      const h = b.toString('hex');
      assert.equal(draw.uuid, `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`);
    });
  });
  assert.deepEqual(checks.nativeOrderReplay.map((c) => c.caseId), ['g8-positive', 'g7-foreign']);
  checks.nativeOrderReplay.forEach((c, i) => {
    exactKeys(c, ['caseId', 'prefixExtractionSha256', 'prefixRecordStringsSha256', 'recordCount',
      'tipSequence', 'tipRecordSha256', 'recordStringsSha256']);
    const prefix = inputs.fixtureBindings[i === 0 ? 'g8' : 'g7'].orderPrefix;
    assert.equal(c.prefixExtractionSha256, prefix.extractionSha256);
    assert.equal(c.prefixRecordStringsSha256, prefix.recordStringsSha256);
    assert.equal(c.recordCount, prefix.prefixLength + 15); assert.equal(c.tipSequence, c.recordCount);
    assert.match(c.tipRecordSha256, hex); assert.match(c.recordStringsSha256, hex);
  });
  exactKeys(checks.g7RewriteResult, ['recipeSha256', 'factoryOutputSha256', 'stepResults', 'phaseContainers', 'identities', 'hashes']);
  assert.equal(checks.g7RewriteResult.recipeSha256, env.H(inputs.evaluationRecipe.g7RewriteRecipe));
  assert.deepEqual(checks.g7RewriteResult.stepResults.map((s) => s.stepId), inputs.evaluationRecipe.g7RewriteRecipe.steps);
  assert.equal(checks.consumerDecoder.match, true); assert.deepEqual(checks.consumerDecoder.nativeDiagnostics, []);
  assert.equal(checks.consumerDecoder.consumerResultSha256, checks.consumerDecoder.independentResultSha256);
  assert.equal(checks.consumerDecoder.binding.designCheckpointOrder, 3805);
  assert.equal(checks.consumerDecoder.binding.designApprovalSha256, inputs.manifestCore.designApprovalSha256);
  return true;
}
async function cli() {
  const repositoryRoot = process.cwd();
  const env = await environment(repositoryRoot);
  const args = process.argv.slice(2);
  if (args.length) assert.deepEqual(args, ['--inputs', `${cache}/inputs.json`, '--output', `${cache}/checks.json`]);
  const inputsBytes = fs.readFileSync(resolve(repositoryRoot, cache, 'inputs.json'));
  const sourceBytes = fs.readFileSync(resolve(repositoryRoot, cache, 'sources', sourcePath));
  const result = await staging(repositoryRoot, sourceBytes, inputsBytes);
  const bytes = env.canonicalBytes(result);
  if (args.length) {
    validateSuccessChecks(env, result, JSON.parse(inputsBytes));
    const path = resolve(repositoryRoot, args[3]);
    try {
      fs.writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      assert.equal(Buffer.compare(fs.readFileSync(path), bytes), 0);
    }
    process.stdout.write(env.canonicalBytes({ status: 'completed', checksSha256: env.sha256(bytes) }));
  } else process.stdout.write(bytes);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await cli();
