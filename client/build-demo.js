/**
 * Builds the browser-only demo into one self-contained HTML file.
 *
 *   npm run build:demo     ->  crm-demo.html
 *
 * VITE_DEMO=1 swaps the API transport for the in-memory store in
 * src/demo/, and routes through the hash so the file works straight
 * off disk and on any static host without rewrite rules.
 *
 * The result must reference nothing external — the check at the end
 * fails the build rather than emitting a file that breaks once moved.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'dist-demo');
const outFile = path.join(root, 'crm-demo.html');

execFileSync('npx', ['vite', 'build', '--outDir', 'dist-demo'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEMO: '1' },
});

const assets = path.join(outDir, 'assets');
const pick = (ext) => {
  const f = fs.readdirSync(assets).find((n) => n.endsWith(ext));
  if (!f) throw new Error(`no ${ext} produced by the build`);
  return fs.readFileSync(path.join(assets, f), 'utf8');
};

let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const css = pick('.css');
const js = pick('.js').replace(/\/\/# sourceMappingURL=.*$/gm, '');

/* Function replacements — a string replacement would treat backslashes
   in the bundle as escape sequences and corrupt the output. */
html = html.replace(/<link rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="[^"]*\.js"[^>]*><\/script>/, () => `<script type="module">\n${js}\n</script>`);

const body = html.replace(/<!--[\s\S]*?-->/g, '');
const external = body.match(/(?:src|href)="(?:https?:)?\/\/[^"]+/g) || [];
const leftover = body.match(/(?:src|href)="\/assets[^"]+/g) || [];
if (external.length || leftover.length) {
  console.error('demo is not self-contained:', [...external, ...leftover]);
  process.exit(1);
}

fs.writeFileSync(outFile, html);
console.log(`\ncrm-demo.html — ${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB, no external references`);
