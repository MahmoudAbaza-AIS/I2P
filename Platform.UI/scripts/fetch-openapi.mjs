#!/usr/bin/env node
/**
 * Fetches the OpenAPI spec from the running backend and saves it to
 * openapi/platform-i2p.v1.json for use with ng-openapi-gen.
 *
 * Usage:
 *   npm run api:fetch          (requires backend running at http://localhost:5044)
 *   BACKEND_URL=https://staging.example.com npm run api:fetch
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:5044';
const specUrl = `${backendUrl}/openapi/v1.json`;
const outputPath = join(ROOT, 'openapi', 'platform-i2p.v1.json');

console.log(`Fetching OpenAPI spec from: ${specUrl}`);

let response;
try {
  response = await fetch(specUrl);
} catch (err) {
  console.error(`Failed to connect to backend at ${backendUrl}`);
  console.error('Make sure the backend is running before executing this script.');
  console.error(err.message);
  process.exit(1);
}

if (!response.ok) {
  console.error(`HTTP ${response.status} ${response.statusText} from ${specUrl}`);
  process.exit(1);
}

const spec = await response.json();

mkdirSync(join(ROOT, 'openapi'), { recursive: true });
writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');

console.log(`OpenAPI spec saved to: openapi/platform-i2p.v1.json`);
console.log(`Now run: npm run api:generate`);
