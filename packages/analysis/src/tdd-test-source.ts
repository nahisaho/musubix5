import ts from 'typescript';
import { digest, isSource } from './files.js';
import type { TraceNode } from './trace.js';

export function sourceLineStartOffset(text: string, line: number): number {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const newline = text.indexOf('\n', offset);
    if (newline < 0) return text.length;
    offset = newline + 1;
  }
  return offset;
}

/** @id CODE-M5-TDD-EOL-FINGERPRINT-001
 * @implements REQ-M5-TDD-003 REQ-M5-PARALLEL-010
 * @design DES-M5-PARALLEL-006
 */
export function canonicalTestFingerprintText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function testStatements(source: ts.Node): ts.Statement[] {
  const statements: ts.Statement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStatement(node)) statements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return statements;
}

export function testFingerprintFromText(test: Pick<TraceNode, 'path' | 'line'>, text: string): string {
  const start = sourceLineStartOffset(text, test.line);
  if (isSource(test.path)) {
    const source = ts.createSourceFile(test.path, text, ts.ScriptTarget.Latest, true);
    const declaration = testStatements(source).find((statement) => statement.getStart(source) >= start);
    if (declaration) return digest(canonicalTestFingerprintText(text.slice(start, declaration.end)).trim());
  }
  const lineEnd = text.indexOf('\n', start);
  const searchFrom = lineEnd < 0 ? text.length : lineEnd + 1;
  const next = text.slice(searchFrom).search(/^[ \t]*(?:\/\*+|\/\/|#).*?@id\s+TEST-/m);
  return digest(canonicalTestFingerprintText(
    text.slice(start, next < 0 ? text.length : searchFrom + next),
  ).trim());
}
