import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText(/schema v2 válido/)).toBeInTheDocument();
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

  it('recarrega os dados depois de conflito de revisão sem reaplicar automaticamente', async () => {
    const refreshed = { ...bootstrap, revision: 'revision-2' };
    const getBootstrap = vi.fn()
      .mockResolvedValueOnce(bootstrap)
      .mockResolvedValueOnce(refreshed);
    const applySettings = vi.fn().mockRejectedValue(
      new Error('As configurações foram alteradas externamente. Recarregue antes de aplicar.'),
    );
    installApi({ getBootstrap, applySettings });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Claro OpenCode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e aplicar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar com backup' }));

    expect(await screen.findByText(/Os dados foram recarregados/)).toBeInTheDocument();
    await waitFor(() => expect(getBootstrap).toHaveBeenCalledTimes(2));
    expect(applySettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Configuração sincronizada')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('oferece CRUD explícito para aliases, funções e comandos personalizados', async () => {
    installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));

    expect(screen.getByText('Execução de código local')).toBeInTheDocument();
    expect(screen.getByText(/não torna esse código seguro/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alias' }));
    fireEvent.change(screen.getByLabelText('Nome do alias'), { target: { value: 'gco' } });
    fireEvent.change(screen.getByLabelText('Comando de destino'), { target: { value: 'git' } });
    expect(screen.getByRole('button', { name: 'Excluir alias gco' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar função' }));
    expect(screen.getByLabelText('Nome da função')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Corpo PowerShell/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar comando' }));
    expect(screen.getByLabelText('Identificação')).toBeInTheDocument();
    expect(screen.getByLabelText('Código PowerShell')).toBeInTheDocument();
    expect(screen.getByText(/alteração\(ões\) pendente\(s\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir alias gco' }));
    expect(screen.queryByLabelText('Nome do alias')).not.toBeInTheDocument();
  });
});
