import { relative, resolve } from 'node:path';

/** @id CODE-M5-TEST-RUNTIME-REPORTER-001
 * @implements REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-006
 * @design DES-M5-015
 */
/** @typedef {import('vitest/reporters').Reporter} Reporter */
export default class RuntimeReporter {
  /** @type {import('vitest/node').Vitest | undefined} */
  context;
  /** @type {import('../../packages/analysis/src/test-runtime.js').TestRuntimeReporterBridge | undefined} */
  bridge;

  /** @param {import('vitest/node').Vitest} context */
  onInit(context) {
    this.context = context;
    if (globalThis.__musubix5TestRuntimeCoordinator) throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: duplicate-conflict');
    this.bridge = {
      root: resolve(context.config.root), args: process.argv.slice(2), files: [],
      configureEnvironment(environment) {
        const project = context.getRootProject();
        project.config.env = { ...project.config.env, ...environment };
      },
    };
    globalThis.__musubix5TestRuntimeCoordinator = this.bridge;
  }

  /** @param {ReadonlyArray<import('vitest/node').TestSpecification>} specifications */
  onTestRunStart(specifications) {
    if (!this.bridge) throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: reporter-missing');
    this.bridge.files = specifications.map((s) => relative(this.bridge?.root ?? '', s.moduleId).split('\\').join('/')).sort();
  }

  /** @param {import('vitest/node').TestModule} module */
  async onTestModuleQueued(module) { await this.bridge?.controller?.module(module.moduleId, 'not-started'); }
  /** @param {import('vitest/node').TestModule} module */
  async onTestModuleCollected(module) { await this.bridge?.controller?.module(module.moduleId, 'not-started'); }
  /** @param {import('vitest/node').TestModule} module */
  async onTestModuleStart(module) { await this.bridge?.controller?.module(module.moduleId, 'running'); }
  /** @param {import('vitest/node').TestModule} module */
  async onTestModuleEnd(module) {
    await this.bridge?.controller?.module(module.moduleId, module.state() === 'failed' ? 'failed' : 'completed');
  }
  /** @param {ReadonlyArray<import('vitest/node').TestModule>} modules @param {ReadonlyArray<unknown>} errors */
  async onTestRunEnd(modules, errors) {
    if (!this.bridge?.controller || !this.context) {
      console.error('TEST_RUNTIME_BOOTSTRAP_INVALID: reporter-missing (startup incomplete; no acknowledgment)');
      process.exitCode = 1;
      return;
    }
    /** @type {unknown} */
    const supplied = Reflect.get(this.context.getRootProject().getProvidedContext(), 'musubix5StableWallClockV1');
    try {
      for (const module of modules) {
        await this.bridge.controller.module(module.moduleId,
          module.state() === 'failed' ? 'failed' : 'completed');
      }
      await this.bridge.controller.finish(supplied, modules.filter((m) => m.state() === 'failed').length + errors.length);
    } catch (cause) {
      console.error(cause);
      process.exitCode = 1;
    }
  }
}
