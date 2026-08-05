import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  nativeAliases: [{ name: 'gc', definition: 'Get-Content' }],
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
      validateCustomizations: vi.fn().mockResolvedValue({ issues: [] }),
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
    expect(screen.getByText(/schema v3 válido/)).toBeInTheDocument();
  });

  it('renderiza as cinco telas principais pela navegação lateral', async () => {
    installApi();
    render(<App />);

    expect(await screen.findByText('Seu PowerShell, sob controle.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Temas Oh My Posh$/ }));
    expect(screen.getByText('Escolha o prompt sem sair do app.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Perfil PowerShell$/ }));
    expect(screen.getByText('Comportamento e código do seu shell.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Windows Terminal$/ }));
    expect(screen.getByText('Aparência sem substituir seu JSON.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Configurações$/ }));
    expect(screen.getByText('Preferências e recuperação.')).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar com backup' }));

    expect(await screen.findByText(/Os dados foram recarregados/)).toBeInTheDocument();
    await waitFor(() => expect(getBootstrap).toHaveBeenCalledTimes(2));
    expect(applySettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Configuração sincronizada')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('remove detalhes técnicos de erros de validação recebidos pelo IPC', async () => {
    installApi({
      applySettings: vi.fn().mockRejectedValue(new Error(
        "Error invoking remote method 'powershell-config:apply-settings': [{\"message\":\"Informe um comando válido.\"}]",
      )),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Claro OpenCode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e aplicar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar com backup' }));

    expect(await screen.findByText('Informe um comando válido.')).toBeInTheDocument();
    expect(screen.queryByText(/remote method/)).not.toBeInTheDocument();
  });

  it('cria um atalho para comando completo sem exigir conhecimento de função PowerShell', async () => {
    const api = installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));

    expect(screen.getByText('O que você quer criar?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Nome que você quer digitar/), { target: { value: 'gcommit' } });
    fireEvent.change(screen.getByLabelText(/^O que deve ser executado/), { target: { value: 'git commit' } });
    fireEvent.change(screen.getByLabelText(/^Descrição/), { target: { value: 'Cria um commit Git' } });
    expect(screen.getByText(/Ao digitar “gcommit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar personalização' }));

    await waitFor(() => expect(api.validateCustomizations).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'function', name: 'gcommit', code: 'git commit @args' }),
    ]));
    expect(await screen.findByText('gcommit')).toBeInTheDocument();
    expect(screen.getAllByText('git commit @args').length).toBeGreaterThan(0);
    expect(screen.getByText('Cria um commit Git')).toBeInTheDocument();
  });

  it('bloqueia a criação de atalho sem descrição', async () => {
    const api = installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));

    fireEvent.change(screen.getByLabelText(/^Nome que você quer digitar/), { target: { value: 'gcommit' } });
    fireEvent.change(screen.getByLabelText(/^O que deve ser executado/), { target: { value: 'git commit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar personalização' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe uma descrição');
    expect(api.validateCustomizations).not.toHaveBeenCalled();
  });

  it('bloqueia alias nativo e explica o conflito sem erro técnico', async () => {
    installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));
    fireEvent.change(screen.getByLabelText(/^Nome que você quer digitar/), { target: { value: 'gc' } });
    fireEvent.change(screen.getByLabelText(/^O que deve ser executado/), { target: { value: 'git commit' } });
    fireEvent.change(screen.getByLabelText(/^Descrição/), { target: { value: 'Cria um commit Git' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar personalização' }));

    expect(screen.getByRole('alert')).toHaveTextContent('gc');
    expect(screen.getByRole('alert')).toHaveTextContent('Get-Content');
    expect(screen.getByRole('alert')).toHaveTextContent('gcommit');
  });

  it('oferece modelos clicáveis e mantém os editores técnicos no modo avançado', async () => {
    installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver exemplos' }));
    const template = screen.getByText('Formatar JSON').closest('article');
    expect(template).not.toBeNull();
    fireEvent.click(within(template as HTMLElement).getByRole('button', { name: 'Usar modelo' }));
    expect(screen.getByText('Show-Json')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Modo avançado/));
    expect(screen.getByLabelText('Nome da função')).toHaveValue('Show-Json');
    expect((screen.getByLabelText(/^Corpo PowerShell/) as HTMLTextAreaElement).value).toContain('ConvertFrom-Json');
  });
});
