import { resolve } from 'node:path';
import ts from 'typescript';

import { files, portable } from '../../packages/analysis/src/files.js';

const selectorPath = 'packages/analysis/src/files.ts';
const chronologyPaths = [
  'packages/analysis/src/change-evidence.ts',
  'packages/analysis/src/tdd-cycle-resolver.ts',
] as const;
const chronologyEntryPoints = new Set([
  'selectCurrentChangeTddCycle',
  'selectCurrentTddCycle',
]);

function bytewise(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    current = checker.getAliasedSymbol(current);
  }
  return current;
}

function isTypeOnlyReference(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isImportSpecifier(current)) {
      return current.isTypeOnly || current.parent.parent.isTypeOnly;
    }
    if (ts.isImportClause(current)) return current.isTypeOnly;
    if (ts.isExportSpecifier(current)) {
      return current.isTypeOnly || current.parent.parent.isTypeOnly;
    }
    if (ts.isStatement(current)) return false;
  }
  return false;
}

function nearestFunction(node: ts.Node): ts.SignatureDeclaration | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
}

/** @id CODE-M5-WAVE1-EVIDENCE-GUARD-001
 * @implements REQ-M5-WAVE1-EVIDENCE-001
 * @implements REQ-M5-WAVE1-EVIDENCE-002
 * @design DES-M5-WAVE1-EVIDENCE-001
 */
export async function evidenceSelectorViolations(root: string): Promise<string[]> {
  const sourcePaths = (await files(root))
    .filter((path) => /^packages\/[^/]+\/src\/.*\.ts$/.test(path))
    .sort(bytewise);
  const program = ts.createProgram({
    rootNames: sourcePaths.map((path) => resolve(root, path)),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      noEmit: true,
    },
  });
  const checker = program.getTypeChecker();
  const declarationSource = program.getSourceFile(resolve(root, selectorPath));
  if (!declarationSource) return [];

  let selectorDeclaration: ts.Identifier | undefined;
  let allowedFunction: ts.FunctionDeclaration | undefined;
  for (const statement of declarationSource.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'evidenceInputPaths') {
      selectorDeclaration = statement.name;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'evidenceInputs') {
      allowedFunction = statement;
    }
  }
  if (!selectorDeclaration || !allowedFunction) return [];
  const declaredSymbol = checker.getSymbolAtLocation(selectorDeclaration);
  if (!declaredSymbol) return [];
  const targetSymbol = canonicalSymbol(checker, declaredSymbol);
  const violations = new Set<string>();

  for (const path of sourcePaths) {
    const sourceFile = program.getSourceFile(resolve(root, path));
    if (!sourceFile) continue;
    const visit = (node: ts.Node): void => {
      if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node))
        && node !== selectorDeclaration
        && !isTypeOnlyReference(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol
          && canonicalSymbol(checker, symbol) === targetSymbol
          && nearestFunction(node) !== allowedFunction) {
          violations.add(path);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return [...violations].sort(bytewise);
}

function propertyName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

function namedFunction(node: ts.Node): ts.FunctionDeclaration | undefined {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current;
  }
  return undefined;
}

export async function evidenceChronologyViolations(root: string): Promise<string[]> {
  const availablePaths = new Set(await files(root));
  const sourcePaths = chronologyPaths.filter((path) => availablePaths.has(path));
  const program = ts.createProgram({
    rootNames: sourcePaths.map((path) => resolve(root, path)),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      noEmit: true,
    },
  });
  const checker = program.getTypeChecker();
  const allowedSources = new Set(sourcePaths.map((path) => resolve(root, path)));
  const pending: ts.FunctionDeclaration[] = [];
  const visited = new Set<ts.Symbol>();
  const violations = new Set<string>();
  let usesMonotonicOrder = false;

  for (const path of sourcePaths) {
    const source = program.getSourceFile(resolve(root, path));
    if (!source) continue;
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement)
        && statement.name
        && chronologyEntryPoints.has(statement.name.text)) {
        pending.push(statement);
      }
    }
  }

  while (pending.length) {
    const declaration = pending.pop()!;
    const declarationSymbol = declaration.name && checker.getSymbolAtLocation(declaration.name);
    if (!declarationSymbol) continue;
    const symbol = canonicalSymbol(checker, declarationSymbol);
    if (visited.has(symbol)) continue;
    visited.add(symbol);

    const visit = (node: ts.Node): void => {
      const field = propertyName(node);
      if (field === 'order') usesMonotonicOrder = true;
      if (field === 'recordedAt') {
        const owner = namedFunction(node);
        const sourcePath = owner?.getSourceFile().fileName;
        const normalizedSourcePath = sourcePath ? portable(sourcePath) : undefined;
        const relativePath = sourcePaths.find(
          (path) => portable(resolve(root, path)) === normalizedSourcePath,
        );
        violations.add(`${relativePath ?? sourcePath}#${owner?.name?.text ?? '<anonymous>'}:recordedAt`);
      }
      if (ts.isCallExpression(node)) {
        const called = checker.getSymbolAtLocation(node.expression);
        const target = called && canonicalSymbol(checker, called);
        for (const targetDeclaration of target?.declarations ?? []) {
          if (ts.isFunctionDeclaration(targetDeclaration)
            && allowedSources.has(targetDeclaration.getSourceFile().fileName)) {
            pending.push(targetDeclaration);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    if (declaration.body) visit(declaration.body);
  }

  if (!usesMonotonicOrder) {
    violations.add('packages/analysis/src/tdd-cycle-resolver.ts#selectCurrentTddCycle:missing-order');
  }
  return [...violations].sort(bytewise);
}
