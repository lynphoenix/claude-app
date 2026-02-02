import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Version at compile time - read from package.json
function getCompiledVersion(): string {
  try {
    // In production, we're in dist/version.js, package.json is ../package.json
    // In development, we're in src/version.ts, package.json is ../package.json
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return pkg.version;
  } catch (error) {
    console.error('Failed to read compiled version:', error);
    return 'unknown';
  }
}

export const COMPILED_VERSION = getCompiledVersion();

// Check version on disk (current package.json)
export function getDiskVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return pkg.version;
  } catch (error) {
    console.error('Failed to read disk version:', error);
    return 'unknown';
  }
}

export function isVersionMismatch(): boolean {
  const diskVersion = getDiskVersion();
  const compiled = COMPILED_VERSION;

  if (diskVersion === 'unknown' || compiled === 'unknown') {
    return false;
  }

  return diskVersion !== compiled;
}
