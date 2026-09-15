import { spawnSync } from 'node:child_process';
import process from 'node:process';

const proxyPath = process.env.NETLIFY_PROXY_PATH;
if (!proxyPath) {
  console.error('NETLIFY_PROXY_PATH is required');
  process.exit(2);
}

console.log('NETLIFY_SAFE_DEMO_PUBLISH_START');
const result = spawnSync('npx', ['-y', '@netlify/mcp@latest', '--site-id', '017a6ff5-a78c-451c-bf60-47abde3ec599', '--proxy-path', proxyPath], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '' },
});
console.log(`NETLIFY_SAFE_DEMO_PUBLISH_EXIT ${result.status ?? 1}`);
process.exit(result.status ?? 1);
