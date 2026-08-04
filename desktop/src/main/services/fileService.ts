import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

export function readUtf8(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hashFile(filePath: string): string {
  return fs.existsSync(filePath) ? sha256(fs.readFileSync(filePath)) : 'missing';
}

export function writeAtomic(filePath: string, content: string | Buffer): void {
  ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, content);
  try {
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
}

export function copyIfExists(source: string, destination: string): boolean {
  if (!fs.existsSync(source)) return false;
  ensureDirectory(path.dirname(destination));
  fs.copyFileSync(source, destination);
  return true;
}

export function appendLog(logPath: string, message: string): void {
  ensureDirectory(path.dirname(logPath));
  const sanitized = message.replace(/[\r\n]+/g, ' ').slice(0, 4000);
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${sanitized}\n`, 'utf8');
}
