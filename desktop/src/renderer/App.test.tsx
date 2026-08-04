import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { defaultSettings, type BootstrapData, type DesktopApi } from '../shared/settings';

const bootstrap: BootstrapData = {
  settings: defaultSettings,
  revision: 'revision-1',
  themes: [{ id: 'builtin:takuya', name: 'takuya', source: 'builtin' }],
  colorSchemes: ['One Half Dark (modded)'],
  diagnostics: {
    powershellVersion: '7.5.2',
    ohMyPoshVersion: '29.11.0',
    terminalSettingsPath: 'C:\\Terminal\\settings.json',
    terminalAvailable: true,
    profileLoaderInstalled: true,
    settingsValid: true,
    activeThemeExists: true,
    poshGitInstalled: true,
    terminalIconsInstalled: true,
    configuredFontInstalled: true,
  },
  appVersion: '1.0.0',
  backups: [],
};

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe('App', () => {
  function installApi(overrides: Partial<DesktopApi> = {}): DesktopApi {
    const api: DesktopApi = {
      getBootstrap: vi.fn().mockResolvedValue(bootstrap),
      previewTheme: vi.fn().mockResolvedValue('data:image/png;base64,AA=='),
      importTheme: vi.fn(),
      applySettings: vi.fn(),
      restoreDefaults: vi.fn(),
      restoreLatestBackup: vi.fn(),
      openTerminal: vi.fn(),
      openLogs: vi.fn(),
      quit: vi.fn(),
      ...overrides,
    };
    Object.defineProperty(window, 'powershellConfig', { value: api, configurable: true });
    return api;
  }

  it('exibe diagnóstico principal depois do bootstrap', async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText('Seu PowerShell, sob controle.')).toBeInTheDocument();
    expect(screen.getByText('7.5.2')).toBeInTheDocument();
    expect(screen.getByText('29.11.0')).toBeInTheDocument();
  });

  it('navega para configurações e alterna para o tema claro no rascunho', async () => {
    installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Claro OpenCode' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByText('1 alteração(ões) pendente(s)')).toBeInTheDocument();
  });

  it('abre a galeria e solicita uma prévia local do tema selecionado', async () => {
    const api = installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Temas Oh My Posh$/ }));
    expect(await screen.findByRole('option', { name: /takuya/ })).toBeInTheDocument();
    expect(api.previewTheme).toHaveBeenCalledWith('builtin:takuya');
  });
});
