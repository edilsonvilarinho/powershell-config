import fs from 'node:fs';
import { defaultUserState, userStateSchema, type UserState } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { ensureDirectory, readUtf8, writeAtomic } from './fileService.js';

export class UserStateService {
  constructor(private readonly paths: AppPaths) {}

  ensureInitialized(): void {
    ensureDirectory(this.paths.configDirectory);
    if (!fs.existsSync(this.paths.userStatePath)) this.write(defaultUserState);
  }

  read(): UserState {
    this.ensureInitialized();
    const content = readUtf8(this.paths.userStatePath);
    if (!content) throw new Error('Estado do usuário não encontrado.');
    return userStateSchema.parse(JSON.parse(content));
  }

  write(userState: UserState): UserState {
    const parsed = userStateSchema.parse(userState);
    writeAtomic(this.paths.userStatePath, `${JSON.stringify(parsed, null, 2)}\n`);
    return parsed;
  }
}
