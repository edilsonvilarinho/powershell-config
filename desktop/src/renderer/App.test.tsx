import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { defaultSettings, type BootstrapData, type DesktopApi } from '../shared/settings';

const bootstrap: BootstrapData = {
  settings: defaultSettings,
  userState: { schemaVersion: 1, favoriteThemeIds: [] },
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
  localStorage.clear();
  vi.useRealTimers();
});

describe('App', () => {
  function installApi(overrides: Partial<DesktopApi> = {}): DesktopApi {
    const api: DesktopApi = {
      getBootstrap: vi.fn().mockResolvedValue(bootstrap),
      previewTheme: vi.fn().mockResolvedValue('data:image/png;base64,AA=='),
      importTheme: vi.fn(),
      saveUserState: vi.fn().mockResolvedValue({ userState: bootstrap.userState, revision: bootstrap.revision }),
      exportConfiguration: vi.fn().mockResolvedValue({ canceled: true }),
      inspectConfigurationImport: vi.fn().mockResolvedValue(null),
      applyConfigurationImport: vi.fn(),
      cancelConfigurationImport: vi.fn().mockResolvedValue(undefined),
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
    const list = await waitFor(() => {
      const element = document.querySelector('.customization-list');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(within(list).getByText('gcommit')).toBeInTheDocument();
    expect(within(list).getByText('git commit @args')).toBeInTheDocument();
    expect(within(list).getByText('Cria um commit Git')).toBeInTheDocument();

    const helpPreview = document.querySelector('.help-preview') as HTMLElement;
    expect(within(helpPreview).getByText('gcommit')).toBeInTheDocument();
    expect(helpPreview.textContent).toContain('Cria um commit Git');
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

  it('oferece modelos clicáveis e abre o editor técnico da própria linha', async () => {
    installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver exemplos' }));
    const template = screen.getByText('Formatar JSON').closest('article');
    expect(template).not.toBeNull();
    fireEvent.click(within(template as HTMLElement).getByRole('button', { name: 'Usar modelo' }));

    const list = document.querySelector('.customization-list') as HTMLElement;
    expect(within(list).getByText('Show-Json')).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Nome da função')).toHaveValue('Show-Json');
    expect((screen.getByLabelText(/^Corpo PowerShell/) as HTMLTextAreaElement).value).toContain('ConvertFrom-Json');
  });

  it('mostra na prévia da ajuda somente os atalhos padrão habilitados', async () => {
    installApi();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Perfil PowerShell$/ }));

    const helpPreview = document.querySelector('.help-preview') as HTMLElement;
    expect(helpPreview.textContent).toContain('## Atalhos');
    expect(helpPreview.textContent).toContain('lastBootUpTime');
    expect(within(helpPreview).getByText('vim')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'vim' }));
    expect(within(document.querySelector('.help-preview') as HTMLElement).queryByText('vim')).not.toBeInTheDocument();
  });

  it('remove mensagens de sucesso e erro automaticamente depois de cinco segundos', async () => {
    const api = installApi({
      exportConfiguration: vi.fn().mockResolvedValue({ canceled: false, themeCount: 2 }),
      openLogs: vi.fn().mockRejectedValue(new Error('Falha ao abrir logs.')),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportar configuração' }));
      await Promise.resolve();
    });
    expect(screen.getByText(/Configuração exportada com 2 tema/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByText(/Configuração exportada com 2 tema/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText(/Configuração exportada com 2 tema/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir pasta de logs' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Falha ao abrir logs.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByText('Falha ao abrir logs.')).not.toBeInTheDocument();
    expect(api.openLogs).toHaveBeenCalledOnce();
  });

  it('reinicia o temporizador quando uma mensagem substitui a anterior', async () => {
    installApi({
      exportConfiguration: vi.fn().mockResolvedValue({ canceled: false, themeCount: 1 }),
      openLogs: vi.fn().mockRejectedValue(new Error('Nova mensagem.')),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportar configuração' }));
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(3_000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir pasta de logs' }));
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText('Nova mensagem.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText('Nova mensagem.')).not.toBeInTheDocument();
  });

  it('migra favoritos legados do localStorage para o estado persistente', async () => {
    localStorage.setItem('theme-favorites', JSON.stringify(['builtin:takuya', 'tema-inexistente']));
    const saveUserState = vi.fn().mockResolvedValue({
      userState: { schemaVersion: 1, favoriteThemeIds: ['builtin:takuya'] },
      revision: 'revision-favorites',
    });
    installApi({ saveUserState });
    render(<App />);

    expect(await screen.findByText('Seu PowerShell, sob controle.')).toBeInTheDocument();
    expect(saveUserState).toHaveBeenCalledWith({ schemaVersion: 1, favoriteThemeIds: ['builtin:takuya'] }, 'revision-1');
    expect(localStorage.getItem('theme-favorites')).toBeNull();
  });

  it('revisa e confirma a importação antes de substituir o estado', async () => {
    const preview = {
      token: 'import-token',
      sourceAppVersion: '2.9.0',
      exportedAt: '2026-08-05T12:00:00.000Z',
      aliasCount: 4,
      functionCount: 2,
      commandCount: 1,
      favoriteCount: 3,
      themeCount: 2,
    };
    const importedSettings = { ...defaultSettings, ui: { theme: 'light' as const } };
    const applyConfigurationImport = vi.fn().mockResolvedValue({
      settings: importedSettings,
      userState: { schemaVersion: 1, favoriteThemeIds: ['builtin:takuya'] },
      revision: 'revision-imported',
      appliedAt: '2026-08-05T12:01:00.000Z',
      importedThemeCount: 2,
    });
    installApi({
      inspectConfigurationImport: vi.fn().mockResolvedValue(preview),
      applyConfigurationImport,
      getBootstrap: vi.fn()
        .mockResolvedValueOnce(bootstrap)
        .mockResolvedValueOnce({ ...bootstrap, settings: importedSettings, revision: 'revision-imported' }),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Importar configuração' }));

    expect(await screen.findByRole('heading', { name: 'Revisar configuração importada' })).toBeInTheDocument();
    expect(screen.getByText('2 tema(s) portátil(eis)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Importar com backup' }));

    await waitFor(() => expect(applyConfigurationImport).toHaveBeenCalledWith({ token: 'import-token', expectedRevision: 'revision-1' }));
    expect(await screen.findByText(/Configuração importada com backup e 2 tema/)).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('cancela a importação revisada sem aplicar alterações', async () => {
    const cancelConfigurationImport = vi.fn().mockResolvedValue(undefined);
    const applyConfigurationImport = vi.fn();
    installApi({
      inspectConfigurationImport: vi.fn().mockResolvedValue({
        token: 'cancel-token', sourceAppVersion: '3.0.4', exportedAt: '2026-08-05T12:00:00.000Z',
        aliasCount: 0, functionCount: 0, commandCount: 0, favoriteCount: 0, themeCount: 0,
      }),
      cancelConfigurationImport,
      applyConfigurationImport,
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Configurações$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Importar configuração' }));
    expect(await screen.findByRole('heading', { name: 'Revisar configuração importada' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(cancelConfigurationImport).toHaveBeenCalledWith('cancel-token'));
    expect(applyConfigurationImport).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Revisar configuração importada' })).not.toBeInTheDocument();
  });
});
