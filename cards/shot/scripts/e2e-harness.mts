// Shared browser-test scaffolding: a throwaway http.createServer serving
// this card's folder, plus the built bundle from the integration's www/ (so glp-card.js can be loaded without file:// CORS
// issues) plus a `/__harness.html` route. Used by both scripts/screenshot.mts
// (README screenshots) and test/e2e/smoke.test.mjs (Playwright E2E smoke
// test) so the two don't duplicate this setup — mirrors glp-order-card's
// scripts/e2e-harness.mts (same pattern, kept independent per repo since the
// two cards' mock-data shapes differ enough that a shared module would just
// add indirection).

import http from 'node:http';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wwwDir: string = path.join(__dirname, '..', '..', '..', 'custom_components', 'gaggiuino_profiler', 'www');
export const repoRoot: string = path.join(__dirname, '..');

const MIME: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function startServer(harnessHtml: string): Promise<Server> {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    if (urlPath === '/__harness.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(harnessHtml);
      return;
    }
    if (urlPath === '/glp-card.js') {
      fs.readFile(path.join(wwwDir, 'glp-card.js'), (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(data);
      });
      return;
    }
    const filePath = path.join(repoRoot, decodeURIComponent(urlPath));
    // A string-prefix check accepts siblings such as `/a/repo-evil` for root
    // `/a/repo`; the relative path is `..`-rooted for anything outside instead.
    const relativePath = path.relative(repoRoot, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}
