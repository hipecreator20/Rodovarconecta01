import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let cachedServerlessRoot: string | null = null;

/**
 * Resolves the writable root directory for runtime JSON/attachment storage.
 * - Uses process.env.RODOVAR_DATA_ROOT when explicitly configured.
 * - Uses process.cwd() when writable (Google AI Studio / local Node server).
 * - Automatically falls back to os.tmpdir() and seeds from bundled ./data on
 *   read-only serverless filesystems (e.g., Vercel / AWS Lambda) without losing data.
 */
export function resolveDataRoot(): string {
  if (process.env.RODOVAR_DATA_ROOT && process.env.RODOVAR_DATA_ROOT.trim() !== '') {
    return process.env.RODOVAR_DATA_ROOT.trim();
  }

  const cwd = process.cwd();
  try {
    fs.accessSync(cwd, fs.constants.W_OK);
    return cwd;
  } catch {
    if (cachedServerlessRoot) {
      return cachedServerlessRoot;
    }
    const tmpRoot = path.join(os.tmpdir(), 'rodovar-conecta-runtime');
    const tmpDataDir = path.join(tmpRoot, 'data');
    const bundledDataDir = path.join(cwd, 'data');
    try {
      if (!fs.existsSync(tmpDataDir)) {
        fs.mkdirSync(tmpDataDir, { recursive: true });
        if (fs.existsSync(bundledDataDir)) {
          fs.cpSync(bundledDataDir, tmpDataDir, { recursive: true });
        }
      }
    } catch {
      // Best-effort copy in restricted serverless environments
    }
    cachedServerlessRoot = tmpRoot;
    return tmpRoot;
  }
}
