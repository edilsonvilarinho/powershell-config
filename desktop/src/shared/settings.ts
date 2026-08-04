import { z } from 'zod';

export const aliasNames = ['g', 'vim', 'grep', 'tig', 'less', 'ls', 'dir', 'll'] as const;

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  ui: z.object({
    theme: z.enum(['dark', 'light']),
  }).strict(),
  startup: z.object({
    enabled: z.boolean(),
  }).strict(),
  prompt: z.object({
    enabled: z.boolean(),
    themeId: z.string().min(1).max(128),
    themeName: z.string().min(1).max(128),
  }).strict(),
  modules: z.object({
    poshGit: z.boolean(),
    terminalIcons: z.boolean(),
  }).strict(),
  psReadLine: z.object({
    enabled: z.boolean(),
    editMode: z.enum(['Emacs', 'Windows', 'Vi']),
    bellStyle: z.enum(['None', 'Audible', 'Visual']),
    predictionSource: z.enum(['None', 'History']),
    predictionViewStyle: z.enum(['InlineView', 'ListView']),
    ctrlD: z.boolean(),
  }).strict(),
  aliases: z.object(Object.fromEntries(aliasNames.map((name) => [name, z.boolean()])) as Record<(typeof aliasNames)[number], z.ZodBoolean>).strict(),
  help: z.object({
    showOnFirstRun: z.boolean(),
  }).strict(),
  terminal: z.object({
    colorScheme: z.string().min(1).max(128),
    fontFace: z.string().min(1).max(128),
    fontSize: z.number().min(6).max(72),
    opacity: z.number().int().min(0).max(100),
    useAcrylic: z.boolean(),
    elevate: z.boolean(),
  }).strict(),
}).strict();

export type AppSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: AppSettings = {
  schemaVersion: 1,
  ui: { theme: 'dark' },
  startup: { enabled: true },
  prompt: { enabled: true, themeId: 'builtin:takuya', themeName: 'takuya' },
  modules: { poshGit: true, terminalIcons: true },
  psReadLine: {
    enabled: true,
    editMode: 'Emacs',
    bellStyle: 'None',
    predictionSource: 'History',
    predictionViewStyle: 'ListView',
    ctrlD: true,
  },
  aliases: { g: true, vim: true, grep: true, tig: true, less: true, ls: true, dir: true, ll: true },
  help: { showOnFirstRun: true },
  terminal: {
    colorScheme: 'One Half Dark (modded)',
    fontFace: 'Hack NF',
    fontSize: 11,
    opacity: 80,
    useAcrylic: false,
    elevate: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeKnownDefaults(defaultValue: unknown, candidate: unknown): unknown {
  if (!isRecord(defaultValue) || !isRecord(candidate)) return candidate ?? defaultValue;
  return {
    ...candidate,
    ...Object.fromEntries(Object.entries(defaultValue).map(([key, value]) => [
    key,
    mergeKnownDefaults(value, candidate[key]),
    ])),
  };
}

export function migrateSettings(input: unknown): AppSettings {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    throw new Error('Versão de settings.json ausente ou não suportada.');
  }
  return settingsSchema.parse(mergeKnownDefaults(defaultSettings, input));
}

export interface ThemeInfo {
  id: string;
  name: string;
  source: 'builtin' | 'installed' | 'imported';
}

export interface Diagnostics {
  powershellVersion: string | null;
  ohMyPoshVersion: string | null;
  terminalSettingsPath: string | null;
  terminalAvailable: boolean;
  profileLoaderInstalled: boolean;
  settingsValid: boolean;
  activeThemeExists: boolean;
  poshGitInstalled: boolean;
  terminalIconsInstalled: boolean;
  configuredFontInstalled: boolean;
}

export interface BootstrapData {
  settings: AppSettings;
  revision: string;
  themes: ThemeInfo[];
  colorSchemes: string[];
  diagnostics: Diagnostics;
  appVersion: string;
  backups: BackupInfo[];
}

export interface BackupInfo {
  id: string;
  createdAt: string;
}

export interface ApplyRequest {
  settings: AppSettings;
  expectedRevision: string;
}

export interface ApplyResult {
  settings: AppSettings;
  revision: string;
  appliedAt: string;
}

export interface DesktopApi {
  getBootstrap(): Promise<BootstrapData>;
  previewTheme(themeId: string): Promise<string>;
  importTheme(): Promise<ThemeInfo | null>;
  applySettings(request: ApplyRequest): Promise<ApplyResult>;
  restoreDefaults(expectedRevision: string): Promise<ApplyResult>;
  restoreLatestBackup(expectedRevision: string): Promise<ApplyResult>;
  openTerminal(): Promise<void>;
  openLogs(): Promise<void>;
  quit(): void;
}
