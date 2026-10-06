import { join } from 'node:path';
import { createPortableTemporaryRoot, portableModuleUrl } from '../../packages/analysis/src/candidate-portability.js';

export { portableModuleUrl };
export const portableTemporaryRoot = (authorizedRoot = join(process.cwd(), '.musubix/cache/fixtures')) =>
  createPortableTemporaryRoot(authorizedRoot);
