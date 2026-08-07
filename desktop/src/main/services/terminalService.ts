import fs from 'node:fs';
import path from 'node:path';
import { dialog } from 'electron';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import type { AppSettings, TerminalColorSchemeColors } from '../../shared/settings.js';
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

function removeValue(content: string, path: (string | number)[]): string {
  return applyEdits(content, modify(content, path, undefined, {
    formattingOptions: editFormattingOptions,
  }));
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

  async selectBackgroundImageWithDialog(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar imagem de fundo',
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return result.filePaths[0];
  }

  buildContent(settings: AppSettings): string {
    let content = this.readContent();
    parseJsonc(content);
    const t = settings.terminal;

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
