import fs from 'node:fs';
import { defaultSettings, migrateSettings, settingsSchema, type AppSettings } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { ensureDirectory, readUtf8, writeAtomic } from './fileService.js';

export class SettingsService {
  constructor(private readonly paths: AppPaths) {}

  ensureInitialized(): void {
    ensureDirectory(this.paths.configDirectory);
    if (!fs.existsSync(this.paths.settingsPath)) {
      writeAtomic(this.paths.settingsPath, `${JSON.stringify(defaultSettings, null, 2)}\n`);
    }
  }

  read(): AppSettings {
    this.ensureInitialized();
    const content = readUtf8(this.paths.settingsPath);
    if (!content) throw new Error('Arquivo de configurações não encontrado.');
    return migrateSettings(JSON.parse(content));
  }

  serialize(settings: AppSettings): string {
    return `${JSON.stringify(settingsSchema.parse(settings), null, 2)}\n`;
  }
}
