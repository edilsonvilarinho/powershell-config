import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export function execFileSafe(
  executable: string,
  args: readonly string[],
  timeout = 20_000,
  environment?: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...args], {
      windowsHide: true,
      timeout,
      shell: false,
      maxBuffer: 5 * 1024 * 1024,
      env: environment ?? process.env,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `: ${stderr.trim()}` : ''}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export function resolveWindowsExecutable(command: string, candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const wingetLink = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', command);
    if (fs.existsSync(wingetLink)) return wingetLink;
    const windowsApps = path.join(localAppData, 'Microsoft', 'WindowsApps', command);
    if (fs.existsSync(windowsApps)) return windowsApps;
  }
  return command;
}
