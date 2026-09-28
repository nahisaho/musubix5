import ts from 'typescript';
import { SourceOperationError, type SourceReason } from './tdd-source-diagnostics.js';
import { sourceLineStartOffset, testFingerprintFromText, testStatements } from './tdd-test-source.js';

export interface SourceHunkCoordinates {
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
}

export function sourceAdmissionFailure(reason: SourceReason<'TDD_SOURCE_ADMISSION_INVALID'>): never {
  throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', reason);
}

function rawLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** @id CODE-M5-SOURCE-HUNKS-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function sourceReviewHunks(oldText: string, newText: string): SourceHunkCoordinates[] {
  const oldLines = rawLines(oldText);
  const newLines = rawLines(newText);
  const lengths = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lengths[i]![j] = oldLines[i] === newLines[j]
        ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const result: SourceHunkCoordinates[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++; j++; continue;
    }
    const oldStart = i;
    const newStart = j;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) break;
      if (i < oldLines.length && (j === newLines.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) i++;
      else j++;
    }
    result.push({ oldStart, oldLength: i - oldStart, newStart, newLength: j - newStart });
  }
  return result;
}

function tokens(node: ts.Node, source: ts.SourceFile, clockCalls = new Set<ts.Node>()): string {
  if (clockCalls.has(node)) return 'STANDARD_ELAPSED_CLOCK';
  const children = node.getChildren(source);
  return children.length ? children.map((child) => tokens(child, source, clockCalls)).join('|')
    : `${node.kind}:${node.getText(source)}`;
}

function descendants(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (child: ts.Node): void => { result.push(child); ts.forEachChild(child, visit); };
  visit(node);
  return result;
}

function clockCall(node: ts.Node, clock: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.arguments.length === 0
    && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === clock && node.expression.name.text === 'now';
}

function elapsedCalls(statement: ts.Statement, clock: string): Set<ts.Node> {
  const nodes = descendants(statement);
  const declarations = nodes.filter((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && !!node.initializer && clockCall(node.initializer, clock));
  const result = new Set<ts.Node>();
  for (const declaration of declarations) {
    const name = declaration.name.getText();
    const uses = nodes.filter((node) => ts.isIdentifier(node) && node.text === name);
    if (uses.length !== 2 || !(declaration.parent.flags & ts.NodeFlags.Const)) continue;
    const elapsed = nodes.find((node) => ts.isBinaryExpression(node)
      && clockCall(node.left, clock) && node.operatorToken.kind === ts.SyntaxKind.MinusToken
      && ts.isIdentifier(node.right) && node.right.text === name);
    if (!elapsed || !ts.isBinaryExpression(elapsed)) continue;
    const expect = elapsed.parent;
    if (!ts.isCallExpression(expect) || !ts.isIdentifier(expect.expression) || expect.expression.text !== 'expect'
      || expect.arguments.length !== 1) continue;
    const matcher = expect.parent;
    if (!ts.isPropertyAccessExpression(matcher) || matcher.name.text !== 'toBeLessThan') continue;
    const assertion = matcher.parent;
    if (!ts.isCallExpression(assertion) || assertion.arguments.length !== 1
      || !ts.isNumericLiteral(assertion.arguments[0]!) || Number(assertion.arguments[0]!.text) !== 10_000) continue;
    result.add(declaration.initializer!);
    result.add(elapsed.left);
  }
  return result;
}

function rootIdentifier(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return rootIdentifier(node.expression);
  }
  return undefined;
}

function assertionNames(source: ts.SourceFile): Set<string> {
  const names = new Set(['expect', 'assert']);
  for (const node of descendants(source)) {
    if (ts.isImportSpecifier(node) && ['expect', 'assert'].includes((node.propertyName ?? node.name).text)) {
      names.add(node.name.text);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /^(?:node:)?assert(?:\/strict)?$/.test(node.moduleSpecifier.text)) {
      if (node.importClause?.name) names.add(node.importClause.name.text);
      const binding = node.importClause?.namedBindings;
      if (binding && ts.isNamespaceImport(binding)) names.add(binding.name.text);
      if (binding && ts.isNamedImports(binding)) for (const entry of binding.elements) names.add(entry.name.text);
    }
  }
  return names;
}

function controls(node: ts.Node, statement: ts.Statement, source: ts.SourceFile): string[] {
  const result: string[] = [];
  for (let child = node, parent = node.parent; parent && child !== statement; child = parent, parent = parent.parent) {
    const token = (value: ts.Node | undefined): string => value ? tokens(value, source) : '';
    if (ts.isIfStatement(parent)) result.push(`if:${token(parent.expression)}:${child === parent.thenStatement ? 'then' : 'else'}`);
    else if (ts.isConditionalExpression(parent)) result.push(`conditional:${token(parent.condition)}:${child === parent.whenTrue ? 'then' : 'else'}`);
    else if (ts.isForStatement(parent)) result.push(`for:${token(parent.initializer)}:${token(parent.condition)}:${token(parent.incrementor)}`);
    else if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) {
      result.push(`${parent.kind}:${token(parent.initializer)}:${token(parent.expression)}`);
    } else if (ts.isWhileStatement(parent) || ts.isDoStatement(parent) || ts.isSwitchStatement(parent)) {
      result.push(`${parent.kind}:${token(parent.expression)}`);
    } else if (ts.isCaseClause(parent)) result.push(`case:${token(parent.expression)}`);
    else if (ts.isDefaultClause(parent)) result.push('default');
    else if (ts.isTryStatement(parent)) result.push(`try:${!!parent.catchClause}:${!!parent.finallyBlock}:${child === parent.tryBlock ? 'body' : child === parent.catchClause ? 'catch' : 'finally'}`);
    else if (ts.isCatchClause(parent)) result.push(`catch:${token(parent.variableDeclaration)}`);
    else if (ts.isBinaryExpression(parent) && [
      ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
    ].includes(parent.operatorToken.kind)) {
      result.push(`short-circuit:${parent.operatorToken.kind}:${child === parent.right ? token(parent.left) : 'left'}`);
    } else if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent) || ts.isFunctionDeclaration(parent)) {
      result.push(`function:${token(parent.name)}:${parent.parameters.map(token).join(',')}:${parent.modifiers?.map(token).join(',') ?? ''}`);
    }
  }
  return result;
}

function mechanicalSignature(statement: ts.Statement, source: ts.SourceFile, calls: Set<ts.Node>): unknown {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
    sourceAdmissionFailure('splice-invalid');
  }
  const registration = statement.expression;
  const names = assertionNames(source);
  const nodes = descendants(statement);
  const assertions = nodes.filter((node): node is ts.CallExpression => ts.isCallExpression(node)
    && names.has(rootIdentifier(node.expression) ?? '')
    && !(ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent))
    && !(ts.isCallExpression(node.parent) && node.parent.expression === node));
  for (const node of nodes) {
    if (ts.isIdentifier(node) && names.has(node.text)) {
      const parent = node.parent;
      if (!((ts.isCallExpression(parent) || ts.isPropertyAccessExpression(parent)) && parent.expression === node)) {
        sourceAdmissionFailure('behavior-change-required');
      }
    }
    if (ts.isElementAccessExpression(node) && names.has(rootIdentifier(node.expression) ?? '')) {
      sourceAdmissionFailure('behavior-change-required');
    }
  }
  const mockPattern = /\b(?:vi|jest|sinon|spyOn|stub|mock[A-Za-z]*|fn)\b/;
  return {
    registration: tokens(registration.expression, source),
    arguments: registration.arguments.map((argument) =>
      ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
        ? { kind: argument.kind, parameters: argument.parameters.map((parameter) => tokens(parameter, source)),
          modifiers: argument.modifiers?.map((modifier) => tokens(modifier, source)) ?? [] }
        : tokens(argument, source)),
    assertions: assertions.map((assertion) => ({ tokens: tokens(assertion, source, calls),
      controls: controls(assertion, statement, source) })),
    mocks: nodes.filter((node) => (ts.isCallExpression(node) || ts.isVariableDeclaration(node))
      && mockPattern.test(ts.isCallExpression(node) ? node.expression.getText(source) : node.getText(source)))
      .map((node) => tokens(node, source)),
    abrupt: nodes.filter((node) => ts.isReturnStatement(node) || ts.isThrowStatement(node)
      || ts.isBreakStatement(node) || ts.isContinueStatement(node))
      .map((node) => ({ tokens: tokens(node, source, calls), controls: controls(node, statement, source) })),
  };
}

/** @id CODE-M5-SOURCE-CLOCK-GUARD-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
function clockEnvironmentUnverifiable(source: ts.SourceFile): boolean {
  const nodes = descendants(source);
  const clocks = new Set(['Date', 'performance']);
  const mockAliases = new Set<string>();
  const timerAliases = new Set<string>();
  const timer = /(?:useFakeTimers|setSystemTime|installFakeTimers)/;
  const mock = /(?:spyOn|mock|stub)/i;
  const clockReference = (node: ts.Node): boolean => descendants(node).some((child) =>
    (ts.isIdentifier(child) || ts.isStringLiteral(child)) && clocks.has(child.text));
  const clockObject = (expression: ts.Expression): boolean => {
    const root = rootIdentifier(expression);
    return root !== undefined && (clocks.has(root)
      || (['globalThis', 'global', 'window'].includes(root) && clockReference(expression)));
  };
  for (;;) {
    const size = clocks.size + mockAliases.size + timerAliases.size;
    for (const node of nodes) {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) continue;
      const expression = node.initializer.getText(source);
      if (clockObject(node.initializer)) clocks.add(node.name.text);
      if (mock.test(expression) || mockAliases.has(expression)) mockAliases.add(node.name.text);
      if (timer.test(expression) || timerAliases.has(expression)) timerAliases.add(node.name.text);
    }
    if (size === clocks.size + mockAliases.size + timerAliases.size) break;
  }
  return nodes.some((node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)
      || ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)
      || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
      && node.name && ts.isIdentifier(node.name) && ['Date', 'performance'].includes(node.name.text)) return true;
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && clockObject(node.left)) return true;
    if (ts.isDeleteExpression(node) && clockObject(node.expression)) return true;
    if (!ts.isCallExpression(node)) return false;
    const expression = node.expression.getText(source);
    if (timer.test(expression) || timerAliases.has(expression)) return true;
    if ((mock.test(expression) || mockAliases.has(expression)) && node.arguments.some(clockReference)) return true;
    return /^Object\.(?:assign|defineProperty|defineProperties)$/.test(expression)
      && node.arguments.some(clockReference)
      && node.arguments.some((argument) => clockObject(argument)
        || (ts.isIdentifier(argument) && ['globalThis', 'global', 'window'].includes(argument.text)));
  });
}

/** @id CODE-M5-SOURCE-MECHANICAL-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
function assertMechanicalPreservation(oldStatement: ts.Statement, nextStatement: ts.Statement,
  oldSource: ts.SourceFile, nextSource: ts.SourceFile): void {
  const oldCalls = elapsedCalls(oldStatement, 'Date');
  const newCalls = elapsedCalls(nextStatement, 'performance');
  const clockChanged = oldCalls.size === 2 && newCalls.size === 2;
  if (clockChanged) {
    for (const source of [oldSource, nextSource]) {
      if (clockEnvironmentUnverifiable(source)) sourceAdmissionFailure('behavior-change-required');
    }
  }
  const left = mechanicalSignature(oldStatement, oldSource, clockChanged ? oldCalls : new Set());
  const right = mechanicalSignature(nextStatement, nextSource, clockChanged ? newCalls : new Set());
  if (JSON.stringify(left) !== JSON.stringify(right)) sourceAdmissionFailure('behavior-change-required');
}

/** @id CODE-M5-SOURCE-BLOCK-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function spliceCanonicalTestBlock(
  node: { id: string; path: string; line: number },
  currentFile: string, oldBlock: string, expectedFingerprint: string,
): {
  oldFile: string; oldBlock: string; newBlock: string; prefix: string; suffix: string;
  annotationStart: number; statementEnd: number; oldStatementEnd: number;
  oldFingerprint: string; newFingerprint: string;
} {
  const start = sourceLineStartOffset(currentFile, node.line);
  const currentSource = ts.createSourceFile(node.path, currentFile, ts.ScriptTarget.Latest, true);
  const statement = testStatements(currentSource).find((entry) => entry.getStart(currentSource) >= start);
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
    sourceAdmissionFailure('boundary-unresolved');
  }
  const newBlock = currentFile.slice(start, statement.end);
  const prefix = currentFile.slice(0, start);
  const suffix = currentFile.slice(statement.end);
  const ids = (text: string): string[] => [...text.matchAll(/@id\s+(TEST-[A-Z0-9-]+)/g)].map((match) => match[1]!);
  if (JSON.stringify(ids(newBlock)) !== JSON.stringify([node.id])
    || JSON.stringify(ids(oldBlock)) !== JSON.stringify([node.id])) sourceAdmissionFailure('splice-invalid');
  const oldFile = prefix + oldBlock + suffix;
  const oldSource = ts.createSourceFile(node.path, oldFile, ts.ScriptTarget.Latest, true);
  const oldStatement = testStatements(oldSource).find((entry) => entry.getStart(oldSource) >= start);
  if (!oldStatement || oldStatement.end !== start + oldBlock.length
    || ts.transpileModule(oldFile, { fileName: node.path, reportDiagnostics: true }).diagnostics?.length
    || ts.transpileModule(currentFile, { fileName: node.path, reportDiagnostics: true }).diagnostics?.length) {
    sourceAdmissionFailure('splice-invalid');
  }
  const oldFingerprint = testFingerprintFromText(node, oldFile);
  if (oldFingerprint !== expectedFingerprint) sourceAdmissionFailure('old-fingerprint-mismatch');
  const newFingerprint = testFingerprintFromText(node, currentFile);
  if (newFingerprint === oldFingerprint) sourceAdmissionFailure('unchanged-fingerprint');
  const annotations = (text: string): string[] => [...text.matchAll(/@(id|verifies|design)\s+([^\r\n*]+)/g)]
    .map((match) => `${match[1]}:${match[2]!.trim().split(/\s+/).join(' ')}`);
  if (JSON.stringify(annotations(oldBlock)) !== JSON.stringify(annotations(newBlock))) {
    sourceAdmissionFailure('behavior-change-required');
  }
  assertMechanicalPreservation(oldStatement, statement, oldSource, currentSource);
  return {
    oldFile, oldBlock, newBlock, prefix, suffix,
    annotationStart: Buffer.byteLength(prefix), statementEnd: Buffer.byteLength(currentFile.slice(0, statement.end)),
    oldStatementEnd: Buffer.byteLength(prefix + oldBlock), oldFingerprint, newFingerprint,
  };
}
