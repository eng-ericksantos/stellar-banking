#!/usr/bin/env node
/**
 * @file Gate de orçamento do bundle inicial (estágio `bundle-budget-check` do CI).
 *
 * Complementa os `budgets` do angular.json (que medem bytes *brutos* durante o build) medindo o que
 * o usuário realmente baixa: o tamanho **gzip** de todos os arquivos referenciados em `index.csr.html`
 * (scripts, modulepreload e CSS). Falha (exit 1) se o total exceder o limite.
 *
 * Uso: node scripts/check-bundle-budget.mjs [limiteEmKB]   (padrão: 250, ou env BUNDLE_BUDGET_KB)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const browserDir = join(process.cwd(), 'dist', 'shell-portal', 'browser');
const indexFile = join(browserDir, 'index.csr.html');
const limitKb = Number(process.argv[2] ?? process.env.BUNDLE_BUDGET_KB ?? 250);

if (!existsSync(indexFile)) {
  console.error(`✖ ${indexFile} não encontrado. Execute "npm run build" antes.`);
  process.exit(1);
}

const html = readFileSync(indexFile, 'utf8');
const references = new Set();
for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.(?:js|css))"[^>]*>/g)) {
  references.add(match[1]);
}

let totalGzip = 0;
for (const reference of references) {
  const file = join(browserDir, reference.replace(/^\//, ''));
  if (!existsSync(file)) {
    continue;
  }
  const size = gzipSync(readFileSync(file)).length;
  totalGzip += size;
  console.log(`  ${reference.padEnd(32)} ${(size / 1024).toFixed(1).padStart(7)} kB gzip`);
}

const totalKb = totalGzip / 1024;
console.log(`\nTotal inicial: ${totalKb.toFixed(1)} kB gzip (limite ${limitKb} kB)`);
if (totalKb > limitKb) {
  console.error('✖ Orçamento de bundle excedido.');
  process.exit(1);
}
console.log('✔ Orçamento de bundle respeitado.');
