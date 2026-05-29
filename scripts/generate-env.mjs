import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(projectRoot, '.env');
const outputPath = resolve(projectRoot, 'src/environments/environment.ts');

const fileEnv = readEnvFile(envPath);
const apiBaseUrl = normalizeUrl(
  process.env.TECH_TEES_API_BASE_URL ||
  fileEnv.TECH_TEES_API_BASE_URL ||
  'http://localhost:3000',
);
const mercadoPagoPublicKey = String(
  process.env.MERCADO_PAGO_PUBLIC_KEY ||
  fileEnv.MERCADO_PAGO_PUBLIC_KEY ||
  '',
).trim();
const storeName = String(
  process.env.TECH_TEES_STORE_NAME ||
  fileEnv.TECH_TEES_STORE_NAME ||
  'Copa do mundo',
).trim();
const storeSlug = String(
  process.env.TECH_TEES_STORE_SLUG ||
  fileEnv.TECH_TEES_STORE_SLUG ||
  'copa-do-mundo',
).trim();

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `export const environment = {
  apiBaseUrl: ${JSON.stringify(apiBaseUrl)},
  mercadoPagoPublicKey: ${JSON.stringify(mercadoPagoPublicKey)},
  storeName: ${JSON.stringify(storeName)},
  storeSlug: ${JSON.stringify(storeSlug)},
};
`,
);

function readEnvFile(path) {
  try {
    return readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .reduce((values, line) => {
        const trimmedLine = line.trim();

        if (!trimmedLine || trimmedLine.startsWith('#')) {
          return values;
        }

        const separatorIndex = trimmedLine.indexOf('=');
        if (separatorIndex === -1) {
          return values;
        }

        const key = trimmedLine.slice(0, separatorIndex).trim();
        const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        values[key] = value;
        return values;
      }, {});
  } catch {
    return {};
  }
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}
