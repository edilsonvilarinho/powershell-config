import fs from 'node:fs';
import path from 'node:path';
import { dialog } from 'electron';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import type { AppSettings, TerminalColorSchemeColors, TerminalProfileConfig } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { hashFile, readUtf8, sha256 } from './fileService.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const builtInSchemes = [
  'Campbell',
  'Campbell Powershell',
  'One Half Dark',
  'One Half Light',
  'Solarized Dark',
  'Solarized Light',
  'Tango Dark',
  'Tango Light',
  'Vintage',
];

function parseJsonc(content: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value = parse(content, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0 || !value || typeof value !== 'object') {
    throw new Error(`settings.json do Windows Terminal contém JSONC inválido (${errors.length} erro(s)).`);
  }
  return value as Record<string, unknown>;
}

const editFormattingOptions = { insertSpaces: true, tabSize: 4, eol: '\r\n' } as const;

function setValue(content: string, path: (string | number)[], value: unknown): string {
  return applyEdits(content, modify(content, path, value, {
    formattingOptions: editFormattingOptions,
    getInsertionIndex: undefined,
  }));
}

/** `true` se `segments` resolve até um valor existente em `content` (nenhum contêiner intermediário ausente). */
function pathExists(content: string, segments: (string | number)[]): boolean {
  let node: unknown;
  try {
    node = parse(content, [], { allowTrailingComma: true, disallowComments: false });
  } catch {
    return false;
  }
  for (const segment of segments) {
    if (isRecord(node) && typeof segment === 'string') {
      node = node[segment];
    } else if (Array.isArray(node) && typeof segment === 'number') {
      node = node[segment];
    } else {
      return false;
    }
    if (node === undefined) return false;
  }
  return true;
}

/** Remove uma chave. Não-operação (sem erro) se algum contêiner intermediário do caminho ainda não
 * existir - `jsonc-parser` não sabe "remover" dentro de um ramo que nunca foi criado. */
function removeValue(content: string, path: (string | number)[]): string {
  if (!pathExists(content, path)) return content;
  return applyEdits(content, modify(content, path, undefined, {
    formattingOptions: editFormattingOptions,
  }));
}

function appendArrayValue(content: string, path: (string | number)[], value: unknown): string {
  return applyEdits(content, modify(content, path, value, {
    formattingOptions: editFormattingOptions,
    isArrayInsertion: true,
  }));
}

function setDeep(obj: Record<string, unknown>, segments: (string | number)[], value: unknown): void {
  let cursor = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!isRecord(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

interface ProfileFieldDescriptor {
  path: (string | number)[];
  value: unknown;
  /** `true`: sempre gravado (mesmo `false`/vazio). `false`: `null` remove a chave (herda de `profiles.defaults`). */
  always: boolean;
}

/** Serializa `TerminalProfileConfig.icon` para o formato que o Windows Terminal entende:
 * string simples (emoji ou caminho de arquivo) ou ausência da chave. Nunca um objeto. */
function serializeProfileIcon(icon: TerminalProfileConfig['icon']): string | null {
  if (icon === null || icon.kind === 'none') return null;
  return icon.kind === 'emoji' ? icon.value : icon.path;
}

function profileFieldDescriptors(p: TerminalProfileConfig): ProfileFieldDescriptor[] {
  const a = p.appearance;
  const adv = p.advanced;
  return [
    { path: ['guid'], value: p.guid, always: true },
    { path: ['name'], value: p.name, always: true },
    { path: ['hidden'], value: p.hidden, always: true },
    { path: ['elevate'], value: p.elevate, always: true },

    { path: ['commandline'], value: p.commandline, always: false },
    { path: ['startingDirectory'], value: p.startingDirectory?.trim() || null, always: false },
    { path: ['tabTitle'], value: p.tabTitle, always: false },
    { path: ['icon'], value: serializeProfileIcon(p.icon), always: false },

    { path: ['colorScheme'], value: a.colorScheme, always: false },
    { path: ['font', 'face'], value: a.fontFace, always: false },
    { path: ['font', 'size'], value: a.fontSize, always: false },
    { path: ['font', 'weight'], value: a.fontWeight, always: false },
    { path: ['font', 'cellWidth'], value: a.cellWidth, always: false },
    { path: ['font', 'cellHeight'], value: a.cellHeight, always: false },
    { path: ['cursorShape'], value: a.cursorShape, always: false },
    { path: ['cursorColor'], value: a.cursorColor, always: false },
    { path: ['cursorHeight'], value: a.cursorHeight, always: false },
    { path: ['backgroundImage'], value: a.backgroundImagePath, always: false },
    { path: ['backgroundImageOpacity'], value: a.backgroundImageOpacity, always: false },
    { path: ['backgroundImageStretchMode'], value: a.backgroundImageStretchMode, always: false },
    { path: ['backgroundImageAlignment'], value: a.backgroundImageAlignment, always: false },
    { path: ['intenseTextStyle'], value: a.intenseTextStyle, always: false },
    { path: ['adjustIndistinguishableColors'], value: a.adjustIndistinguishableColors, always: false },
    // Chave única com ponto literal no nome - não é um objeto aninhado `experimental: {...}`.
    { path: ['experimental.retroTerminalEffect'], value: a.retroTerminalEffect, always: false },
    { path: ['padding'], value: a.padding, always: false },
    { path: ['scrollbarState'], value: a.scrollbarState, always: false },
    { path: ['tabColor'], value: a.tabColor, always: false },
    { path: ['foreground'], value: a.foreground, always: false },
    { path: ['background'], value: a.background, always: false },
    { path: ['selectionBackground'], value: a.selectionBackground, always: false },
    { path: ['opacity'], value: a.opacity, always: false },
    { path: ['useAcrylic'], value: a.useAcrylic, always: false },

    { path: ['suppressApplicationTitle'], value: adv.suppressApplicationTitle, always: false },
    { path: ['antialiasingMode'], value: adv.antialiasingMode, always: false },
    { path: ['altGrAliasing'], value: adv.altGrAliasing, always: false },
    { path: ['snapOnInput'], value: adv.snapOnInput, always: false },
    { path: ['historySize'], value: adv.historySize, always: false },
    { path: ['closeOnExit'], value: adv.closeOnExit, always: false },
    { path: ['bellStyle'], value: adv.bellStyle, always: false },
    { path: ['bellSound'], value: adv.bellSound, always: false },
    { path: ['pathTranslationStyle'], value: adv.pathTranslationStyle, always: false },
    // Chave única com ponto literal no nome, mesma convenção de experimental.retroTerminalEffect.
    { path: ['experimental.useAtlasEngine'], value: adv.useAtlasEngine, always: false },
    { path: ['autoMarkPrompts'], value: adv.autoMarkPrompts, always: false },
    { path: ['showMarksOnScrollbar'], value: adv.showMarksOnScrollbar, always: false },
  ];
}

function profileFontMaps(p: TerminalProfileConfig): { features: Record<string, number> | null; axes: Record<string, number> | null } {
  return {
    features: p.appearance.fontFeatures.length > 0
      ? Object.fromEntries(p.appearance.fontFeatures.map((entry) => [entry.tag, entry.value]))
      : null,
    axes: p.appearance.fontAxes.length > 0
      ? Object.fromEntries(p.appearance.fontAxes.map((entry) => [entry.tag, entry.value]))
      : null,
  };
}

/** Monta o objeto completo de um perfil novo para inserção de uma vez em `profiles.list`. */
function buildProfileObject(p: TerminalProfileConfig): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of profileFieldDescriptors(p)) {
    if (field.always || field.value !== null) setDeep(obj, field.path, field.value);
  }
  const { features, axes } = profileFontMaps(p);
  if (features) setDeep(obj, ['font', 'features'], features);
  if (axes) setDeep(obj, ['font', 'axes'], axes);
  return obj;
}

export class TerminalService {
  constructor(private readonly paths: AppPaths) {}

  private managedFragmentPath(): string | null {
    const stateContent = readUtf8(this.paths.statePath);
    if (!stateContent) return null;
    try {
      const state = JSON.parse(stateContent) as { TerminalFragment?: { Path?: unknown } };
      return typeof state.TerminalFragment?.Path === 'string' && path.isAbsolute(state.TerminalFragment.Path)
        ? state.TerminalFragment.Path
        : null;
    } catch {
      return null;
    }
  }

  fragmentHash(): string {
    const fragmentPath = this.managedFragmentPath();
    return fragmentPath ? hashFile(fragmentPath) : 'missing';
  }

  exists(): boolean {
    return fs.existsSync(this.paths.terminalSettingsPath);
  }

  hash(): string {
    return hashFile(this.paths.terminalSettingsPath);
  }

  readContent(): string {
    return readUtf8(this.paths.terminalSettingsPath) ?? '{\r\n  "$schema": "https://aka.ms/terminal-profiles-schema"\r\n}\r\n';
  }

  listColorSchemes(): string[] {
    const content = this.readContent();
    const parsed = parseJsonc(content) as { schemes?: Array<{ name?: unknown }> };
    const userSchemes = Array.isArray(parsed.schemes)
      ? parsed.schemes.map((scheme) => scheme.name).filter((name): name is string => typeof name === 'string')
      : [];
    const fragmentPath = this.managedFragmentPath();
    let managedSchemes: string[] = [];
    if (fragmentPath) {
      const fragmentContent = readUtf8(fragmentPath);
      if (fragmentContent) {
        try {
          const fragment = parseJsonc(fragmentContent) as { schemes?: Array<{ name?: unknown }> };
          managedSchemes = Array.isArray(fragment.schemes)
            ? fragment.schemes.map((scheme) => scheme.name).filter((name): name is string => typeof name === 'string')
            : [];
        } catch {
          // Fragmento ausente ou inválido não torna o esquema disponível para aplicação.
        }
      }
    }
    return [...new Set([...builtInSchemes, ...userSchemes, ...managedSchemes])]
      .sort((left, right) => left.localeCompare(right));
  }

  private findSchemeColors(content: string, name: string): TerminalColorSchemeColors | null {
    let parsed: { schemes?: unknown };
    try {
      parsed = parseJsonc(content) as { schemes?: unknown };
    } catch {
      return null;
    }
    const schemes = Array.isArray(parsed.schemes) ? parsed.schemes : [];
    const match = schemes.find((scheme) => isRecord(scheme) && scheme.name === name);
    if (!isRecord(match)) return null;
    return {
      background: typeof match.background === 'string' ? match.background : null,
      foreground: typeof match.foreground === 'string' ? match.foreground : null,
      selectionBackground: typeof match.selectionBackground === 'string' ? match.selectionBackground : null,
    };
  }

  /** Cores do esquema pelo nome, lidas do settings.json do usuário ou do fragmento gerenciado.
   * Retorna `null` para esquemas built-in do Windows Terminal sem entrada explícita em nenhum
   * dos dois arquivos - suas cores nunca são hardcoded aqui. */
  getColorSchemeColors(name: string): TerminalColorSchemeColors | null {
    const fromUserSettings = this.findSchemeColors(this.readContent(), name);
    if (fromUserSettings) return fromUserSettings;
    const fragmentPath = this.managedFragmentPath();
    if (fragmentPath) {
      const fragmentContent = readUtf8(fragmentPath);
      if (fragmentContent) {
        const fromFragment = this.findSchemeColors(fragmentContent, name);
        if (fromFragment) return fromFragment;
      }
    }
    return null;
  }

  private async selectFileWithDialog(options: { title: string; extensions: string[] }): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: options.title,
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: options.extensions }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return result.filePaths[0];
  }

  async selectBackgroundImageWithDialog(): Promise<string | null> {
    return this.selectFileWithDialog({ title: 'Selecionar imagem de fundo', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] });
  }

  async selectProfileIconWithDialog(): Promise<string | null> {
    return this.selectFileWithDialog({ title: 'Selecionar ícone do perfil', extensions: ['ico', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'svg'] });
  }

  async selectStartingDirectoryWithDialog(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar diretório inicial',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return result.filePaths[0];
  }

  private applyDefaultsEdits(content: string, t: AppSettings['terminal']): string {
    const alwaysValues: Array<[(string | number)[], unknown]> = [
      [['profiles', 'defaults', 'colorScheme'], t.colorScheme],
      [['profiles', 'defaults', 'font', 'face'], t.fontFace],
      [['profiles', 'defaults', 'font', 'size'], t.fontSize],
      [['profiles', 'defaults', 'opacity'], t.opacity],
      [['profiles', 'defaults', 'useAcrylic'], t.useAcrylic],
      [['profiles', 'defaults', 'elevate'], t.elevate],
      [['profiles', 'defaults', 'cursorShape'], t.cursorShape],
      // Chave única com ponto literal no nome - não é um objeto aninhado `experimental: {...}`.
      [['profiles', 'defaults', 'experimental.retroTerminalEffect'], t.retroTerminalEffect],
    ];
    for (const [jsonPath, value] of alwaysValues) {
      content = setValue(content, jsonPath, value);
    }

    // Campos de override: presentes -> escreve; `null` -> remove a chave (herda o default do Terminal).
    const optionalValues: Array<[(string | number)[], string | number | boolean | null]> = [
      [['profiles', 'defaults', 'foreground'], t.foreground],
      [['profiles', 'defaults', 'background'], t.background],
      [['profiles', 'defaults', 'selectionBackground'], t.selectionBackground],
      [['profiles', 'defaults', 'font', 'weight'], t.fontWeight],
      [['profiles', 'defaults', 'font', 'cellWidth'], t.cellWidth],
      [['profiles', 'defaults', 'font', 'cellHeight'], t.cellHeight],
      [['profiles', 'defaults', 'cursorColor'], t.cursorColor],
      [['profiles', 'defaults', 'cursorHeight'], t.cursorHeight],
      [['profiles', 'defaults', 'backgroundImage'], t.backgroundImagePath],
      [['profiles', 'defaults', 'backgroundImageOpacity'], t.backgroundImageOpacity],
      [['profiles', 'defaults', 'backgroundImageStretchMode'], t.backgroundImageStretchMode],
      [['profiles', 'defaults', 'backgroundImageAlignment'], t.backgroundImageAlignment],
      [['profiles', 'defaults', 'intenseTextStyle'], t.intenseTextStyle],
      [['profiles', 'defaults', 'adjustIndistinguishableColors'], t.adjustIndistinguishableColors],
      [['profiles', 'defaults', 'padding'], t.padding],
      [['profiles', 'defaults', 'scrollbarState'], t.scrollbarState],
    ];
    for (const [jsonPath, value] of optionalValues) {
      content = value === null ? removeValue(content, jsonPath) : setValue(content, jsonPath, value);
    }

    // Mapas livres (tag OpenType de 4 caracteres -> número): array -> objeto; array vazio remove a chave.
    const featuresObject = t.fontFeatures.length > 0
      ? Object.fromEntries(t.fontFeatures.map((entry) => [entry.tag, entry.value]))
      : null;
    content = featuresObject
      ? setValue(content, ['profiles', 'defaults', 'font', 'features'], featuresObject)
      : removeValue(content, ['profiles', 'defaults', 'font', 'features']);

    const axesObject = t.fontAxes.length > 0
      ? Object.fromEntries(t.fontAxes.map((entry) => [entry.tag, entry.value]))
      : null;
    content = axesObject
      ? setValue(content, ['profiles', 'defaults', 'font', 'axes'], axesObject)
      : removeValue(content, ['profiles', 'defaults', 'font', 'axes']);

    return content;
  }

  /** Índice atual do perfil com este guid em `profiles.list`, reparseando `content` a cada chamada
   * (nunca reusa um índice calculado antes de uma edição anterior). `-1` se ausente. */
  private locateProfileByGuid(content: string, guid: string): number {
    const parsed = parseJsonc(content) as { profiles?: { list?: unknown } };
    const list = Array.isArray(parsed.profiles?.list) ? (parsed.profiles!.list as unknown[]) : [];
    return list.findIndex((entry) => isRecord(entry) && entry.guid === guid);
  }

  private updateProfileFields(content: string, index: number, p: TerminalProfileConfig): string {
    const base: (string | number)[] = ['profiles', 'list', index];
    for (const field of profileFieldDescriptors(p)) {
      const jsonPath = [...base, ...field.path];
      content = field.always || field.value !== null ? setValue(content, jsonPath, field.value) : removeValue(content, jsonPath);
    }
    const { features, axes } = profileFontMaps(p);
    content = features
      ? setValue(content, [...base, 'font', 'features'], features)
      : removeValue(content, [...base, 'font', 'features']);
    content = axes
      ? setValue(content, [...base, 'font', 'axes'], axes)
      : removeValue(content, [...base, 'font', 'axes']);
    return content;
  }

  /** Edita `profiles.list` só nas entradas cujo guid pertence ao app (owned por `AppSettings.terminalProfiles`).
   * Perfis nativos/dinâmicos do Windows Terminal (WSL, Git Bash, etc.) nunca são tocados.
   * Ordem obrigatória: 1) atualiza os existentes campo a campo; 2) remove os que saíram de `previousGuids`
   * em ordem decrescente de índice (remover do maior para o menor preserva os índices já calculados dos
   * demais); 3) insere os perfis novos no fim do array, um de cada vez. */
  private applyProfilesListEdits(content: string, profiles: readonly TerminalProfileConfig[], previousGuids: readonly string[]): string {
    for (const p of profiles) {
      const index = this.locateProfileByGuid(content, p.guid);
      if (index !== -1) content = this.updateProfileFields(content, index, p);
    }

    const nextGuids = new Set(profiles.map((p) => p.guid));
    const removalIndices = previousGuids
      .filter((guid) => !nextGuids.has(guid))
      .map((guid) => this.locateProfileByGuid(content, guid))
      .filter((index) => index !== -1)
      .sort((left, right) => right - left);
    for (const index of removalIndices) {
      content = removeValue(content, ['profiles', 'list', index]);
    }

    for (const p of profiles) {
      const index = this.locateProfileByGuid(content, p.guid);
      if (index === -1) {
        content = appendArrayValue(content, ['profiles', 'list', -1], buildProfileObject(p));
      }
    }

    return content;
  }

  /** `previousProfileGuids`: guids de `AppSettings.terminalProfiles` geridos antes desta mudança
   * (lidos do `currentSettings` pelo chamador). A diferença entre eles e `settings.terminalProfiles`
   * é exatamente o que precisa ser removido de `profiles.list`. */
  buildContent(settings: AppSettings, previousProfileGuids: readonly string[] = []): string {
    let content = this.readContent();
    parseJsonc(content);
    content = this.applyDefaultsEdits(content, settings.terminal);
    content = this.applyProfilesListEdits(content, settings.terminalProfiles, previousProfileGuids);
    parseJsonc(content);
    return content;
  }

  validateContent(content: string): void {
    parseJsonc(content);
  }

  updateInstallerState(terminalContent: string, settings: AppSettings, themeContent?: Buffer): string | null {
    if (!fs.existsSync(this.paths.statePath)) return null;
    const raw = fs.readFileSync(this.paths.statePath, 'utf8');
    const state = JSON.parse(raw) as {
      Terminal?: Record<string, unknown> & { PostInstallHash?: string; ManagedValues?: unknown };
      ManagedConfig?: Record<string, unknown> & { ThemeInstalledHash?: string };
    };
    if (!state.Terminal) return null;
    state.Terminal.PostInstallHash = sha256(Buffer.from(terminalContent, 'utf8')).toUpperCase();
    state.Terminal.ManagedValues = {
      colorScheme: settings.terminal.colorScheme,
      elevate: settings.terminal.elevate,
      font: { face: settings.terminal.fontFace, size: settings.terminal.fontSize },
      opacity: settings.terminal.opacity,
      startingDirectory: null,
      suppressApplicationTitle: true,
      useAcrylic: settings.terminal.useAcrylic,
      cursorShape: settings.terminal.cursorShape,
      'experimental.retroTerminalEffect': settings.terminal.retroTerminalEffect,
      foreground: settings.terminal.foreground,
      background: settings.terminal.background,
      selectionBackground: settings.terminal.selectionBackground,
      cursorColor: settings.terminal.cursorColor,
      cursorHeight: settings.terminal.cursorHeight,
      backgroundImage: settings.terminal.backgroundImagePath,
      backgroundImageOpacity: settings.terminal.backgroundImageOpacity,
      backgroundImageStretchMode: settings.terminal.backgroundImageStretchMode,
      backgroundImageAlignment: settings.terminal.backgroundImageAlignment,
      intenseTextStyle: settings.terminal.intenseTextStyle,
      adjustIndistinguishableColors: settings.terminal.adjustIndistinguishableColors,
      padding: settings.terminal.padding,
      scrollbarState: settings.terminal.scrollbarState,
    };
    if (themeContent && state.ManagedConfig) {
      state.ManagedConfig.ThemeInstalledHash = sha256(themeContent).toUpperCase();
    }
    return `${JSON.stringify(state, null, 2)}\n`;
  }
}
