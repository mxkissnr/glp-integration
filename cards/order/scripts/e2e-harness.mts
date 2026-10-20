// Shared browser-test scaffolding: a throwaway http.createServer serving
// this card's folder, plus the built bundle from the integration's www/ (so glp-order-card.js can be loaded without file://
// CORS issues) plus a `/__harness.html` route, and a mockApi() helper that
// stubs every api/orders/* endpoint the card fetches on load/poll. Used by
// both scripts/screenshot.mts (README screenshots) and test/e2e/smoke.test.mjs
// (Playwright E2E smoke test, #48) so the two don't duplicate this setup.

import http from 'node:http';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wwwDir = path.join(__dirname, '..', '..', '..', 'custom_components', 'gaggiuino_profiler', 'www');
export const repoRoot = path.join(__dirname, '..');

const MIME: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };

export interface MockApiOptions {
  menu?: unknown;
  settings?: unknown;
  queueEta?: unknown;
  activeBeans?: unknown;
  mine?: unknown;
}

export function startServer(harnessHtml: string): Promise<Server> {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    if (urlPath === '/__harness.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(harnessHtml);
      return;
    }
    if (urlPath === '/glp-order-card.js') {
      fs.readFile(path.join(wwwDir, 'glp-order-card.js'), (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(data);
      });
      return;
    }
    const filePath = path.join(repoRoot, decodeURIComponent(urlPath));
    if (!filePath.startsWith(repoRoot)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function mockApi(page: Page, { menu = [], settings = { enabled: true }, queueEta = { positions: {} }, activeBeans = [], mine = [] }: MockApiOptions = {}): Promise<void> {
  await page.route('**/api/orders/menu', route => route.fulfill({ json: menu }));
  await page.route('**/api/orders/settings', route => route.fulfill({ json: settings }));
  await page.route('**/api/orders/queue-eta', route => route.fulfill({ json: queueEta }));
  await page.route('**/api/orders/active-beans', route => route.fulfill({ json: activeBeans }));
  await page.route('**/api/orders/mine**', route => route.fulfill({ json: mine }));
}
