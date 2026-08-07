import { z } from 'zod';

export const aliasNames = ['g', 'vim', 'grep', 'tig', 'less', 'ls', 'dir', 'll'] as const;

const customizationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal no formato #RRGGBB.').nullable();
const cssLengthSchema = z.string().regex(/^-?[0-9]+(\.[0-9]+)?(px|pt|%)?$/, 'Use um número, opcionalmente com px/pt/%.').nullable();
const openTypeTagSchema = z.string().regex(/^[\x20-\x7E]{4}$/, 'Use exatamente 4 caracteres ASCII imprimíveis (ex.: "wght", "ss01").');
const paddingSchema = z.string().regex(
  /^-?[0-9]+(\.[0-9]+)?( *, *-?[0-9]+(\.[0-9]+)?|( *, *-?[0-9]+(\.[0-9]+)?){3})?$/,
  'Use "N", "N, N" ou "N, N, N, N".',
).nullable();
const commandNameSchema = z.string().trim().min(1).max(128).regex(
  /^[A-Za-z_][A-Za-z0-9_.-]*$/,
  'Use apenas letras, números, ponto, hífen e sublinhado; o primeiro caractere deve ser uma letra ou sublinhado.',
);
const aliasTargetSchema = z.string().trim().min(1).max(256).regex(
  /^[A-Za-z_][A-Za-z0-9_.-]*(?:\\[A-Za-z_][A-Za-z0-9_.-]*)?$/,
  'Informe um comando pelo nome, sem caminho de arquivo, argumentos ou expressões.',
);
const customizationDescriptionSchema = z.string().trim().max(256).refine(
  (value) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value),
  'Use uma descrição em uma única linha, sem caracteres de controle.',
);

export function isValidCommandName(value: string): boolean {
  return commandNameSchema.safeParse(value).success;
}

export function isAliasTarget(value: string): boolean {
  return aliasTargetSchema.safeParse(value).success;
}

const customizationsSchema = z.object({
  aliases: z.array(z.object({
    id: customizationIdSchema,
    enabled: z.boolean(),
    name: commandNameSchema,
    command: aliasTargetSchema,
    description: customizationDescriptionSchema,
  }).strict()).max(100),
  functions: z.array(z.object({
    id: customizationIdSchema,
    enabled: z.boolean(),
    name: commandNameSchema,
    body: z.string().max(32_768).refine((value) => value.trim().length > 0, 'Informe o corpo PowerShell da função.'),
    description: customizationDescriptionSchema,
  }).strict()).max(100),
  commands: z.array(z.object({
    id: customizationIdSchema,
    enabled: z.boolean(),
    label: z.string().trim().min(1).max(128),
    code: z.string().max(32_768).refine((value) => value.trim().length > 0, 'Informe o código PowerShell.'),
  }).strict()).max(100),
}).strict().superRefine((customizations, context) => {
  const knownNames = new Set<string>(aliasNames);
  const customNames = new Map<string, string>();
  const ids = new Set<string>();
  for (const [group, entries] of [
    ['aliases', customizations.aliases],
    ['functions', customizations.functions],
    ['commands', customizations.commands],
  ] as const) {
    entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        context.addIssue({ code: 'custom', path: [group, index, 'id'], message: 'Identificador de customização duplicado.' });
      }
      ids.add(entry.id);
    });
  }
  for (const [group, entries] of [
    ['aliases', customizations.aliases],
    ['functions', customizations.functions],
  ] as const) {
    entries.forEach((entry, index) => {
      const normalized = entry.name.toLowerCase();
      if (knownNames.has(normalized)) {
        context.addIssue({
          code: 'custom',
          path: [group, index, 'name'],
          message: `O nome "${entry.name}" pertence aos aliases conhecidos e não pode ser sobrescrito.`,
        });
      }
      const previous = customNames.get(normalized);
      if (previous) {
        context.addIssue({
          code: 'custom',
          path: [group, index, 'name'],
          message: `O nome "${entry.name}" já está em uso em ${previous}.`,
        });
      } else {
        customNames.set(normalized, group === 'aliases' ? 'aliases personalizados' : 'funções personalizadas');
      }
    });
  }
});

export const editableSettingsSchema = z.object({
  schemaVersion: z.literal(4),
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
  customizations: customizationsSchema,
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

    foreground: hexColorSchema,
    background: hexColorSchema,
    selectionBackground: hexColorSchema,

    fontWeight: z.union([
      z.enum(['thin', 'extra-light', 'light', 'semi-light', 'normal', 'medium', 'semi-bold', 'bold', 'extra-bold', 'black', 'extra-black']),
      z.number().int().min(100).max(990),
    ]).nullable(),
    cellWidth: cssLengthSchema,
    cellHeight: cssLengthSchema,
    fontFeatures: z.array(z.object({ tag: openTypeTagSchema, value: z.number().int() }).strict()).max(50),
    fontAxes: z.array(z.object({ tag: openTypeTagSchema, value: z.number() }).strict()).max(50),

    cursorShape: z.enum(['bar', 'doubleUnderscore', 'emptyBox', 'filledBox', 'underscore', 'vintage']),
    cursorColor: hexColorSchema,
    cursorHeight: z.number().int().min(1).max(100).nullable(),

    backgroundImagePath: z.string().trim().max(1024).nullable(),
    backgroundImageOpacity: z.number().min(0).max(1).nullable(),
    backgroundImageStretchMode: z.enum(['fill', 'none', 'uniform', 'uniformToFill']).nullable(),
    backgroundImageAlignment: z.enum(['center', 'left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']).nullable(),

    intenseTextStyle: z.enum(['none', 'bold', 'bright', 'all']).nullable(),
    adjustIndistinguishableColors: z.enum(['never', 'indexed', 'always']).nullable(),
    retroTerminalEffect: z.boolean(),

    padding: paddingSchema,
    scrollbarState: z.enum(['visible', 'hidden', 'always']).nullable(),
  }).strict(),
}).strict();

export const settingsSchema = editableSettingsSchema.superRefine((settings, context) => {
  for (const [group, entries] of [
    ['aliases', settings.customizations.aliases],
    ['functions', settings.customizations.functions],
  ] as const) {
    entries.forEach((entry, index) => {
      if (!entry.description.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['customizations', group, index, 'description'],
          message: 'Informe uma descrição para incluir esta personalização na ajuda do PowerShell.',
        });
      }
    });
  }
});

export type AppSettings = z.infer<typeof editableSettingsSchema>;

export const defaultSettings: AppSettings = {
  schemaVersion: 4,
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
  customizations: { aliases: [], functions: [], commands: [] },
  help: { showOnFirstRun: true },
  terminal: {
    colorScheme: 'One Half Dark (modded)',
    fontFace: 'Hack NF',
    fontSize: 11,
    opacity: 80,
    useAcrylic: false,
    elevate: true,

    foreground: null,
    background: null,
    selectionBackground: null,

    fontWeight: null,
    cellWidth: null,
    cellHeight: null,
    fontFeatures: [],
    fontAxes: [],

    cursorShape: 'bar',
    cursorColor: null,
    cursorHeight: null,

    backgroundImagePath: null,
    backgroundImageOpacity: null,
    backgroundImageStretchMode: null,
    backgroundImageAlignment: null,

    intenseTextStyle: null,
    adjustIndistinguishableColors: null,
    retroTerminalEffect: false,

    padding: null,
    scrollbarState: null,
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
  if (!isRecord(input) || ![1, 2, 3, 4].includes(input.schemaVersion as number)) {
    throw new Error('Versão de settings.json ausente ou não suportada.');
  }
  let migratedRecord: Record<string, unknown>;
  if (input.schemaVersion === 1) {
    migratedRecord = { ...input, schemaVersion: 4, customizations: defaultSettings.customizations };
  } else if (input.schemaVersion === 2) {
    const customizations = isRecord(input.customizations) ? input.customizations : {};
    const addDescription = (entries: unknown): unknown[] => Array.isArray(entries)
      ? entries.map((entry) => isRecord(entry)
        ? { ...entry, description: typeof entry.description === 'string' ? entry.description : '' }
        : entry)
      : [];
    migratedRecord = {
      ...input,
      schemaVersion: 4,
      customizations: {
        ...customizations,
        aliases: addDescription(customizations.aliases),
        functions: addDescription(customizations.functions),
      },
    };
  } else {
    // schemaVersion 3 ou 4: mergeKnownDefaults abaixo já injeta os campos novos de `terminal`
    // (foreground/background/selectionBackground/fontWeight/etc.) ausentes em settings v3 com seus neutros.
    migratedRecord = { ...input, schemaVersion: 4 };
  }
  return editableSettingsSchema.parse(mergeKnownDefaults(defaultSettings, migratedRecord));
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

export interface TerminalColorSchemeColors {
  background: string | null;
  foreground: string | null;
  selectionBackground: string | null;
}

export interface BootstrapData {
  settings: AppSettings;
  userState: UserState;
  revision: string;
  themes: ThemeInfo[];
  colorSchemes: string[];
  activeColorSchemeColors: TerminalColorSchemeColors | null;
  diagnostics: Diagnostics;
  nativeAliases: NativeAliasInfo[];
  appVersion: string;
  backups: BackupInfo[];
}

export interface NativeAliasInfo {
  name: string;
  definition: string;
}

export interface CustomizationCodeInput {
  id: string;
  kind: 'function' | 'command';
  name?: string;
  code: string;
}

export interface CustomizationValidationIssue {
  id: string;
  field: 'name' | 'body' | 'code';
  message: string;
  line?: number;
  column?: number;
}

export interface CustomizationValidationResult {
  issues: CustomizationValidationIssue[];
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

export const userStateSchema = z.object({
  schemaVersion: z.literal(1),
  favoriteThemeIds: z.array(z.string().min(1).max(128)).max(200)
    .transform((items) => [...new Set(items)]),
}).strict();

export type UserState = z.infer<typeof userStateSchema>;

export const defaultUserState: UserState = {
  schemaVersion: 1,
  favoriteThemeIds: [],
};

export interface UserStateResult {
  userState: UserState;
  revision: string;
}

export interface ExportResult {
  canceled: boolean;
  filePath?: string;
  themeCount?: number;
}

export interface ImportPreview {
  token: string;
  sourceAppVersion: string;
  exportedAt: string;
  aliasCount: number;
  functionCount: number;
  commandCount: number;
  favoriteCount: number;
  themeCount: number;
}

export interface ImportRequest {
  token: string;
  expectedRevision: string;
}

export interface ImportResult extends ApplyResult {
  userState: UserState;
  importedThemeCount: number;
}

export interface DesktopApi {
  getBootstrap(): Promise<BootstrapData>;
  previewTheme(themeId: string): Promise<string>;
  importTheme(): Promise<ThemeInfo | null>;
  saveUserState(userState: UserState, expectedRevision: string): Promise<UserStateResult>;
  exportConfiguration(): Promise<ExportResult>;
  inspectConfigurationImport(): Promise<ImportPreview | null>;
  applyConfigurationImport(request: ImportRequest): Promise<ImportResult>;
  cancelConfigurationImport(token: string): Promise<void>;
  validateCustomizations(items: CustomizationCodeInput[]): Promise<CustomizationValidationResult>;
  applySettings(request: ApplyRequest): Promise<ApplyResult>;
  restoreDefaults(expectedRevision: string): Promise<ApplyResult>;
  restoreLatestBackup(expectedRevision: string): Promise<ApplyResult>;
  selectBackgroundImage(): Promise<string | null>;
  openTerminal(): Promise<void>;
  openLogs(): Promise<void>;
  quit(): void;
  notifyUnsavedCustomizations(hasPending: boolean): void;
}
