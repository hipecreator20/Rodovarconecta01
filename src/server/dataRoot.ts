import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { EMBEDDED_DATA_SEED_GZIP_B64 } from './embeddedDataSeed.ts';

let cachedServerlessRoot: string | null = null;

function seedFromEmbeddedArchive(tmpDataDir: string): void {
  if (!EMBEDDED_DATA_SEED_GZIP_B64) return;
  try {
    const jsonStr = zlib
      .gunzipSync(Buffer.from(EMBEDDED_DATA_SEED_GZIP_B64, 'base64'))
      .toString('utf8');
    const files = JSON.parse(jsonStr) as Record<string, string>;
    for (const [relPath, content] of Object.entries(files)) {
      const targetPath = path.join(tmpDataDir, relPath);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf8');
      }
    }
  } catch (err) {
    console.warn('Failed to extract embedded data seed:', (err as Error).message);
  }
}

/**
 * Resolves the writable root directory for runtime JSON/attachment storage.
 * - Uses process.env.RODOVAR_DATA_ROOT when explicitly configured.
 * - Uses process.cwd() when writable and not on Vercel.
 * - Automatically falls back to os.tmpdir() and seeds from bundled ./data or
 *   embedded seed archive on read-only serverless filesystems (Vercel / AWS Lambda).
 */
export function resolveDataRoot(): string {
  const cwd = process.cwd();
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const configuredRoot = process.env.RODOVAR_DATA_ROOT?.trim();

  if (configuredRoot && !isVercel) {
    return configuredRoot;
  }

  if (!isVercel) {
    try {
      fs.accessSync(cwd, fs.constants.W_OK);
      if (fs.existsSync(path.join(cwd, 'data', 'rodovar-server-db.json'))) {
        return cwd;
      }
    } catch {
      // fall through to tmpRoot
    }
  }

  if (cachedServerlessRoot && fs.existsSync(path.join(cachedServerlessRoot, 'data', 'rodovar-server-db.json'))) {
    return cachedServerlessRoot;
  }

  let candidateRoot = path.join(os.tmpdir(), 'rodovar-conecta-runtime-v2');
  if (configuredRoot && configuredRoot.startsWith(os.tmpdir())) {
    candidateRoot = configuredRoot;
  }

  const tmpDataDir = path.join(candidateRoot, 'data');
  const bundledDataDir = path.join(cwd, 'data');

  try {
    fs.mkdirSync(tmpDataDir, { recursive: true });
    if (fs.existsSync(bundledDataDir) && !fs.existsSync(path.join(tmpDataDir, 'rodovar-server-db.json'))) {
      fs.cpSync(bundledDataDir, tmpDataDir, { recursive: true });
    }
    if (!fs.existsSync(path.join(tmpDataDir, 'rodovar-server-db.json'))) {
      seedFromEmbeddedArchive(tmpDataDir);
    }
  } catch {
    // Best-effort copy in restricted serverless environments
  }

  cachedServerlessRoot = candidateRoot;
  return candidateRoot;
}

