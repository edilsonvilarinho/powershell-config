import fs from 'node:fs';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import type { AppSettings } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { hashFile, readUtf8, sha256 } from './fileService.js';

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

function setValue(content: string, path: (string | number)[], value: unknown): string {
  return applyEdits(content, modify(content, path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 4, eol: '\r\n' },
    getInsertionIndex: undefined,
  }));
}

export class TerminalService {
  constructor(private readonly paths: AppPaths) {}

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
    const custom = Array.isArray(parsed.schemes)
      ? parsed.schemes.map((scheme) => scheme.name).filter((name): name is string => typeof name === 'string')
      : [];
    return [...new Set([...builtInSchemes, ...custom])].sort((left, right) => left.localeCompare(right));
  }

  buildContent(settings: AppSettings): string {
    let content = this.readContent();
    parseJsonc(content);
    const values: Array<[(string | number)[], unknown]> = [
      [['profiles', 'defaults', 'colorScheme'], settings.terminal.colorScheme],
      [['profiles', 'defaults', 'font', 'face'], settings.terminal.fontFace],
      [['profiles', 'defaults', 'font', 'size'], settings.terminal.fontSize],
      [['profiles', 'defaults', 'opacity'], settings.terminal.opacity],
      [['profiles', 'defaults', 'useAcrylic'], settings.terminal.useAcrylic],
      [['profiles', 'defaults', 'elevate'], settings.terminal.elevate],
    ];
    for (const [jsonPath, value] of values) {
      content = setValue(content, jsonPath, value);
    }
    parseJsonc(content);
    return content;
  }

  validateContent(content: string): void {
    parseJsonc(content);
  }

  updateInstallerState(terminalContent: string, settings: AppSettings): string | null {
    if (!fs.existsSync(this.paths.statePath)) return null;
    const raw = fs.readFileSync(this.paths.statePath, 'utf8');
    const state = JSON.parse(raw) as {
      Terminal?: Record<string, unknown> & { PostInstallHash?: string; ManagedValues?: unknown };
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
    };
    return `${JSON.stringify(state, null, 2)}\n`;
  }
}
