/** @id CODE-M5-CI-CANDIDATE-PRECONDITION-PROBE-001
 * @implements REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [operation, root, commit, phase] = process.argv.slice(2);

try {
  const workspace = await import(pathToFileURL(
    resolve(root, 'dist/packages/analysis/src/workspace-manager.js'),
  ).href);
  if (operation === 'lfs') {
    await workspace.verifyCandidateLfsClosure(root, commit, 'local');
  } else if (operation === 'tree' && (phase === 'pre' || phase === 'post')) {
    console.log(await workspace.compareTrackedTree(root, commit, phase));
  } else {
    throw new Error('Candidate gate precondition probe input invalid.');
  }
} catch (error) {
  console.log(JSON.stringify({ code: error?.code, message: error?.message }));
  process.exitCode = 1;
}
