import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { indexGraph } from '../packages/analysis/src/graph.js';

/** @id TEST-M5-GRAPH-NESTED-BENCHMARK-ALIAS-001
 * @verifies REQ-M5-GRAPH-003 REQ-M5-COMPAT-013
 * @design DES-M5-GRAPH-002 DES-M5-GRAPH-004
 */
it('TEST-M5-GRAPH-NESTED-BENCHMARK-ALIAS-001 resolves explicit nested tsconfig aliases without suppressing missing targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-nested-alias-'));
  const prefix = 'benchmarks/codegraph/labeled';
  const source = `${prefix}/packages/lib/src/alias.ts`;
  const target = `${prefix}/packages/lib/src/value.ts`;
  const entries = {
    'package.json': '{"type":"module"}',
    'tsconfig.json': '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}',
    [`${prefix}/tsconfig.json`]: JSON.stringify({ compilerOptions: {
      module: 'NodeNext', moduleResolution: 'NodeNext', noLib: true,
      baseUrl: '.', paths: { '@lib/*': ['packages/lib/src/*'] },
    } }),
    [`${prefix}/packages/lib/package.json`]: '{"name":"@bench/lib","type":"module","exports":"./src/index.ts"}',
    [source]: "import { greet } from '@lib/value';\nexport const aliasMessage = greet();\n",
    [target]: 'export function greet() { return "hello"; }\n',
    [`${prefix}/packages/lib/src/missing.ts`]: "import { missing } from '@lib/absent';\nexport { missing };\n",
    [`${prefix}/packages/lib/src/relative.ts`]: "import { missing } from './absent.js';\nexport { missing };\n",
  };
  try {
    for (const [path, text] of Object.entries(entries)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const result = await indexGraph(root, { persist: false });
    expect(result.graph.imports).toContainEqual({
      from: source, to: target, specifier: '@lib/value', kind: 'import', line: 1, external: false,
    });
    expect(result.graph.diagnostics.filter((entry) => entry.code === 'GRAPH_UNRESOLVED')
      .map((entry) => entry.path).sort()).toEqual([
      `${prefix}/packages/lib/src/missing.ts`,
      `${prefix}/packages/lib/src/relative.ts`,
    ]);
    const again = await indexGraph(root, { persist: false });
    expect(again.graph.imports).toEqual(result.graph.imports);
    expect(again.graph.diagnostics).toEqual(result.graph.diagnostics);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it('keeps inherited alias bases, exact/longest-prefix precedence, and ordered targets without falling back to broader mappings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-alias-precedence-'));
  const entries = {
    'package.json': '{"type":"module"}',
    'config/tsconfig.json': JSON.stringify({ compilerOptions: {
      module: 'NodeNext', moduleResolution: 'NodeNext', noLib: true,
      paths: {
        '@lib/*': ['../broad/*'],
        '@lib/deep/*': ['../absent/*', '../specific/*'],
        '@lib/exact': ['../exact.ts'],
        '@lib/missing/*': ['../missing/*'],
      },
    } }),
    'nested/tsconfig.json': '{"extends":"../config/tsconfig.json"}',
    'nested/index.ts': [
      "import '@lib/exact';",
      "import '@lib/deep/value';",
      "import '@lib/missing/value';",
      "import './relative';",
      "import 'unmapped';",
    ].join('\n'),
    'exact.ts': 'export {};',
    'broad/exact.ts': 'export {};',
    'broad/deep/value.ts': 'export {};',
    'broad/missing/value.ts': 'export {};',
    'specific/value.ts': 'export {};',
    'nested/relative.ts': 'export {};',
  };
  try {
    for (const [path, text] of Object.entries(entries)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const { graph } = await indexGraph(root, { persist: false });
    expect(graph.imports.filter((edge) => !edge.external).map((edge) => edge.to))
      .toEqual(['exact.ts', 'specific/value.ts']);
    expect(graph.diagnostics.filter((entry) => entry.code === 'GRAPH_UNRESOLVED')
      .map((entry) => entry.message)).toEqual([
      'Unresolved local import @lib/missing/value.',
      'Unresolved local import ./relative.',
    ]);
    expect(graph.diagnostics.filter((entry) => entry.code === 'GRAPH_EXTERNAL_UNRESOLVED'))
      .toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
