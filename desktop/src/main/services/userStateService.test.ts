import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppPaths } from './paths.js';
import { UserStateService } from './userStateService.js';

const directories: string[] = [];

function createService(): { service: UserStateService; statePath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'powershell-config-user-state-'));
  directories.push(root);
  const configDirectory = path.join(root, 'config');
  const statePath = path.join(configDirectory, 'user-state.json');
  const service = new UserStateService({ configDirectory, userStatePath: statePath } as AppPaths);
  return { service, statePath };
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('UserStateService', () => {
  it('inicializa vazio e persiste favoritos sem duplicação', () => {
    const { service, statePath } = createService();
    expect(service.read()).toEqual({ schemaVersion: 1, favoriteThemeIds: [] });

    expect(service.write({ schemaVersion: 1, favoriteThemeIds: ['builtin:takuya', 'builtin:takuya'] }))
      .toEqual({ schemaVersion: 1, favoriteThemeIds: ['builtin:takuya'] });
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8')).favoriteThemeIds).toEqual(['builtin:takuya']);
  });

  it('rejeita estado persistido fora do contrato', () => {
    const { service, statePath } = createService();
    service.ensureInitialized();
    fs.writeFileSync(statePath, '{"schemaVersion":2,"favoriteThemeIds":[]}', 'utf8');
    expect(() => service.read()).toThrow();
  });
});
