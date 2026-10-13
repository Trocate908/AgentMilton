import serverless from 'serverless-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const apiDistPath = path.resolve(repoRoot, 'artifacts/api-server/dist/index.mjs');

if (!existsSync(apiDistPath)) {
  execSync('pnpm --filter @workspace/api-server run build', {
    stdio: 'inherit',
    cwd: repoRoot,
  });
}

const { default: app } = await import(apiDistPath);

export default serverless(app, {
  basePath: '/api',
});
