import { existsSync } from 'node:fs';
import process from 'node:process';

export function loadOptionalEnvFile(filePath = '.env', {
  existsSyncImpl = existsSync,
  loadEnvFileImpl = process.loadEnvFile,
} = {}) {
  if (typeof filePath !== 'string' || filePath.trim() === '') throw new Error('Environment file path is required');
  if (typeof existsSyncImpl !== 'function') throw new Error('Environment file existence check is required');
  if (typeof loadEnvFileImpl !== 'function') throw new Error('Environment file loader is required');
  if (!existsSyncImpl(filePath)) return false;
  loadEnvFileImpl(filePath);
  return true;
}
