import { useEffect, useMemo, useState } from 'react';
import { settingsSchema, type AppSettings, type BootstrapData, type Diagnostics, type ImportPreview, type ThemeInfo, type UserState } from '../shared/settings';
import { buildHelpPreview } from '../shared/help';
import { Customizations, type CustomizationDisplayIssue } from './Customizations';

type Section = 'overview' | 'themes' | 'profile' | 'terminal' | 'settings';

const navItems: Array<{ id: Section; label: string; glyph: string }> = [
  { id: 'overview', label: 'Visão geral', glyph: '⌂' },
  { id: 'themes', label: 'Temas Oh My Posh', glyph: '◈' },
  { id: 'profile', label: 'Perfil PowerShell', glyph: '>' },
  { id: 'terminal', label: 'Windows Terminal', glyph: '▣' },
  { id: 'settings', label: 'Configurações', glyph: '⚙' },
];

function cloneSettings(settings: AppSettings): AppSettings {
  return structuredClone(settings);
}

function setNested(
  settings: AppSettings,
  group: keyof Omit<AppSettings, 'schemaVersion'>,
  key: string,
  value: unknown,
): AppSettings {
  return { ...settings, [group]: { ...(settings[group] as object), [key]: value } } as AppSettings;
}

function changesBetween(previous: unknown, next: unknown, prefix = ''): string[] {
  if (Object.is(previous, next)) return [];
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') {
    return [`${prefix}: ${String(previous)} → ${String(next)}`];
  }
  const left = previous as Record<string, unknown>;
  const right = next as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
    changesBetween(left[key], right[key], prefix ? `${prefix}.${key}` : key),
  );
}

function userErrorMessage(error: unknown): string {
  let text = error instanceof Error ? error.message : String(error);
  text = text.replace(/^Error invoking remote method '[^']+':\s*/i, '').trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const first = parsed.find((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).message === 'string') as Record<string, unknown> | undefined;
      if (first) return String(first.message);
    }
  } catch {
    const messageMatch = text.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (messageMatch) {
      try { return JSON.parse(`"${messageMatch[1]}"`) as string; } catch { /* usa o texto limpo abaixo */ }
    }
  }
  return text.replace(/^Error:\s*/i, '') || 'Ocorreu um erro inesperado. Consulte os logs.';
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`status ${ok ? 'ok' : 'error'}`}><span aria-hidden="true">●</span>{children}</span>;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function DiagnosticCard({ title, value, ok }: { title: string; value: string; ok: boolean }) {
  return <article className="metric-card"><span>{title}</span><strong>{value}</strong><Status ok={ok}>{ok ? 'Operacional' : 'Atenção'}</Status></article>;
}

function readLegacyFavoriteThemes(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('theme-favorites') ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function Overview({ data }: { data: BootstrapData }) {
  const diagnostics = data.diagnostics;
  return (
    <section>
      <header className="page-header"><div><p className="eyebrow">AMBIENTE</p><h1>Seu PowerShell, sob controle.</h1><p>Diagnóstico local do perfil, prompt e Windows Terminal.</p></div></header>
      <div className="metrics-grid">
        <DiagnosticCard title="PowerShell" value={diagnostics.powershellVersion ?? 'Não localizado'} ok={Boolean(diagnostics.powershellVersion)} />
        <DiagnosticCard title="Oh My Posh" value={diagnostics.ohMyPoshVersion ?? 'Não localizado'} ok={Boolean(diagnostics.ohMyPoshVersion)} />
        <DiagnosticCard title="Tema ativo" value={data.settings.prompt.themeName} ok={diagnostics.activeThemeExists} />
        <DiagnosticCard title="Windows Terminal" value={diagnostics.terminalAvailable ? 'Instalado' : 'Não localizado'} ok={diagnostics.terminalAvailable} />
      </div>
      <div className="two-columns">
        <article className="panel terminal-panel">
          <div className="terminal-dots"><i /><i /><i /></div>
          <pre><span className="prompt">PS</span> <span className="path">~</span> <span className="command">Get-PowerShellConfig</span>{'\n'}<span className="muted">profile</span>  {diagnostics.profileLoaderInstalled ? 'ready' : 'loader ausente'}{'\n'}<span className="muted">settings</span> {diagnostics.settingsValid ? `schema v${data.settings.schemaVersion} válido` : 'inválido'}{'\n'}<span className="muted">startup</span>  {data.settings.startup.enabled ? 'enabled --hidden' : 'disabled'}</pre>
        </article>
        <article className="panel">
          <h2>Integridade</h2>
          <ul className="health-list">
            <li><Status ok={diagnostics.profileLoaderInstalled}>Bloco gerenciado no $PROFILE</Status></li>
            <li><Status ok={diagnostics.settingsValid}>Configuração estruturada válida</Status></li>
             <li><Status ok={diagnostics.activeThemeExists}>Tema local ativo disponível</Status></li>
             <li><Status ok={Boolean(diagnostics.terminalSettingsPath)}>settings.json do Terminal localizado</Status></li>
             <li><Status ok={diagnostics.poshGitInstalled}>Módulo posh-git instalado</Status></li>
             <li><Status ok={diagnostics.terminalIconsInstalled}>Módulo Terminal-Icons instalado</Status></li>
             <li><Status ok={diagnostics.configuredFontInstalled}>Fonte configurada disponível no Windows</Status></li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function Themes({ themes, draft, onDraft, onImport, preview, previewBusy, favorites, favoritesBusy, onToggleFavorite }: {
  themes: ThemeInfo[];
  draft: AppSettings;
  onDraft: (settings: AppSettings) => void;
  onImport: () => void;
  preview: string | null;
  previewBusy: boolean;
  favorites: Set<string>;
  favoritesBusy: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'imported'>('all');
  const visible = themes.filter((theme) => theme.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'favorites' ? favorites.has(theme.id) : theme.source === 'imported')));

  return (
    <section>
      <header className="page-header"><div><p className="eyebrow">OH MY POSH</p><h1>Escolha o prompt sem sair do app.</h1><p>Os temas são lidos da instalação local e aplicados por cópia gerenciada.</p></div><button className="secondary" onClick={onImport}>Importar .json</button></header>
      <div className="theme-layout">
        <div className="theme-browser panel">
          <div className="toolbar"><input type="search" placeholder="Buscar tema..." value={query} onChange={(event) => setQuery(event.target.value)} /><div className="segmented"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button className={filter === 'favorites' ? 'active' : ''} onClick={() => setFilter('favorites')}>Favoritos</button><button className={filter === 'imported' ? 'active' : ''} onClick={() => setFilter('imported')}>Importados</button></div></div>
          <div className="theme-list" role="listbox" aria-label="Temas Oh My Posh">
            {visible.map((theme) => <div role="option" aria-selected={draft.prompt.themeId === theme.id} key={theme.id} className={`theme-item ${draft.prompt.themeId === theme.id ? 'selected' : ''}`}><button className="theme-select" onClick={() => onDraft(setNested(draft, 'prompt', 'themeId', theme.id))}><span><strong>{theme.name}</strong><small>{theme.source}</small></span></button><button className="favorite-button" aria-label={`Favoritar ${theme.name}`} disabled={favoritesBusy} onClick={() => onToggleFavorite(theme.id)}>{favorites.has(theme.id) ? '★' : '☆'}</button></div>)}
            {!visible.length && <p className="empty">Nenhum tema encontrado.</p>}
          </div>
        </div>
        <article className="panel preview-panel">
          <div><p className="eyebrow">PRÉVIA LOCAL</p><h2>{themes.find((theme) => theme.id === draft.prompt.themeId)?.name ?? draft.prompt.themeName}</h2></div>
          <div className="preview-frame">{previewBusy ? <span className="loader">Renderizando...</span> : preview ? <img src={preview} alt="Prévia do prompt selecionado" /> : <span>Prévia indisponível</span>}</div>
          <Toggle checked={draft.prompt.enabled} onChange={(value) => onDraft(setNested(draft, 'prompt', 'enabled', value))} label="Ativar Oh My Posh" description="Usa o tema local ativo no próximo PowerShell." />
        </article>
      </div>
    </section>
  );
}

function HelpPreview({ settings }: { settings: AppSettings }) {
  const sections = useMemo(() => buildHelpPreview(settings), [settings]);
  return (
    <article className="panel help-preview-panel">
      <div className="customization-heading"><div><h2>Ajuda do próximo terminal</h2><p>Gerada automaticamente a partir destas configurações. No PowerShell, use <code>help</code> ou <code>Show-TerminalHelp</code>.</p></div></div>
      <div className="help-preview">
        <span className="help-preview-heading"># Ambiente PowerShell</span>
        {sections.map((group) => (
          <div className="help-preview-section" key={group.section}>
            <span className="help-preview-heading">## {group.section}</span>
            {group.entries.map((entry) => (
              <span className="help-preview-entry" key={`${group.section}-${entry.name}`}>
                {'* '}<code>{entry.name}</code>{entry.target ? <>{' → '}<code>{entry.target}</code></> : null}{`: ${entry.description}`}
                {entry.requires ? <em className="help-preview-requires"> (só aparece se {entry.requires} estiver instalado)</em> : null}
              </span>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

function Profile({ draft, onDraft, nativeAliases, issues }: { draft: AppSettings; onDraft: (settings: AppSettings) => void; nativeAliases: BootstrapData['nativeAliases']; issues: CustomizationDisplayIssue[] }) {
  const updateCustomizations = (customizations: AppSettings['customizations']): void => {
    onDraft({ ...draft, customizations });
  };

  return (
    <section><header className="page-header"><div><p className="eyebrow">USER_PROFILE.PS1</p><h1>Comportamento e código do seu shell.</h1><p>Opções conhecidas e customizações próprias, persistidas em um arquivo gerenciado.</p></div></header>
      <div className="two-columns">
        <article className="panel form-panel"><h2>Módulos</h2><Toggle checked={draft.modules.poshGit} onChange={(value) => onDraft(setNested(draft, 'modules', 'poshGit', value))} label="posh-git" /><Toggle checked={draft.modules.terminalIcons} onChange={(value) => onDraft(setNested(draft, 'modules', 'terminalIcons', value))} label="Terminal-Icons" /><Toggle checked={draft.psReadLine.enabled} onChange={(value) => onDraft(setNested(draft, 'psReadLine', 'enabled', value))} label="PSReadLine" /></article>
        <article className="panel form-panel"><h2>PSReadLine</h2><div className="form-grid"><Field label="Modo de edição"><select value={draft.psReadLine.editMode} onChange={(event) => onDraft(setNested(draft, 'psReadLine', 'editMode', event.target.value as AppSettings['psReadLine']['editMode']))}><option>Emacs</option><option>Windows</option><option>Vi</option></select></Field><Field label="Bell"><select value={draft.psReadLine.bellStyle} onChange={(event) => onDraft(setNested(draft, 'psReadLine', 'bellStyle', event.target.value as AppSettings['psReadLine']['bellStyle']))}><option>None</option><option>Audible</option><option>Visual</option></select></Field><Field label="Predição"><select value={draft.psReadLine.predictionSource} onChange={(event) => onDraft(setNested(draft, 'psReadLine', 'predictionSource', event.target.value as AppSettings['psReadLine']['predictionSource']))}><option>History</option><option>None</option></select></Field><Field label="Visualização"><select value={draft.psReadLine.predictionViewStyle} onChange={(event) => onDraft(setNested(draft, 'psReadLine', 'predictionViewStyle', event.target.value as AppSettings['psReadLine']['predictionViewStyle']))}><option>ListView</option><option>InlineView</option></select></Field></div><Toggle checked={draft.psReadLine.ctrlD} onChange={(value) => onDraft(setNested(draft, 'psReadLine', 'ctrlD', value))} label="Ctrl+D apaga o caractere atual" /></article>
      </div>
      <article className="panel form-panel"><h2>Aliases conhecidos</h2><div className="alias-grid">{Object.entries(draft.aliases).map(([name, enabled]) => <Toggle key={name} checked={enabled} onChange={(value) => onDraft({ ...draft, aliases: { ...draft.aliases, [name]: value } })} label={name} />)}</div></article>
      <Customizations customizations={draft.customizations} nativeAliases={nativeAliases} issues={issues} onChange={updateCustomizations} />
      <HelpPreview settings={draft} />
      <article className="panel form-panel"><Toggle checked={draft.help.showOnFirstRun} onChange={(value) => onDraft(setNested(draft, 'help', 'showOnFirstRun', value))} label="Exibir ajuda na próxima abertura" description="Para repetir, desative e aplique; depois ative e aplique novamente." /></article>
    </section>
  );
}

function TerminalSettings({ draft, onDraft, schemes }: { draft: AppSettings; onDraft: (settings: AppSettings) => void; schemes: string[] }) {
  return (
    <section><header className="page-header"><div><p className="eyebrow">WINDOWS TERMINAL</p><h1>Aparência sem substituir seu JSON.</h1><p>Somente propriedades gerenciadas são alteradas; comentários e campos desconhecidos são preservados.</p></div></header>
      <article className="panel form-panel"><div className="form-grid terminal-fields"><Field label="Esquema de cores"><select value={draft.terminal.colorScheme} onChange={(event) => onDraft(setNested(draft, 'terminal', 'colorScheme', event.target.value))}>{schemes.map((scheme) => <option key={scheme}>{scheme}</option>)}</select></Field><Field label="Fonte"><input value={draft.terminal.fontFace} maxLength={128} onChange={(event) => onDraft(setNested(draft, 'terminal', 'fontFace', event.target.value))} /></Field><Field label="Tamanho"><input type="number" min="6" max="72" step="0.5" value={draft.terminal.fontSize} onChange={(event) => onDraft(setNested(draft, 'terminal', 'fontSize', Number(event.target.value)))} /></Field><Field label={`Opacidade: ${draft.terminal.opacity}%`} hint="0 é transparente; 100 é opaco."><input type="range" min="0" max="100" value={draft.terminal.opacity} onChange={(event) => onDraft(setNested(draft, 'terminal', 'opacity', Number(event.target.value)))} /></Field></div><Toggle checked={draft.terminal.useAcrylic} onChange={(value) => onDraft(setNested(draft, 'terminal', 'useAcrylic', value))} label="Usar material acrílico" /><Toggle checked={draft.terminal.elevate} onChange={(value) => onDraft(setNested(draft, 'terminal', 'elevate', value))} label="Abrir perfis elevados" description="Mantém o comportamento atual de solicitar UAC." /></article>
    </section>
  );
}

function SettingsPage({ draft, onDraft, diagnostics, backupLabel, onOpenTerminal, onOpenLogs, onExport, onImport, onRestore, onRestoreBackup }: { draft: AppSettings; onDraft: (settings: AppSettings) => void; diagnostics: Diagnostics; backupLabel: string; onOpenTerminal: () => void; onOpenLogs: () => void; onExport: () => void; onImport: () => void; onRestore: () => void; onRestoreBackup: () => void }) {
  return (
    <section><header className="page-header"><div><p className="eyebrow">APLICATIVO</p><h1>Preferências e recuperação.</h1></div></header>
      <div className="two-columns"><article className="panel form-panel"><h2>Aparência</h2><div className="theme-mode"><button className={draft.ui.theme === 'dark' ? 'active' : ''} onClick={() => onDraft(setNested(draft, 'ui', 'theme', 'dark'))}>Escuro OpenCode</button><button className={draft.ui.theme === 'light' ? 'active' : ''} onClick={() => onDraft(setNested(draft, 'ui', 'theme', 'light'))}>Claro OpenCode</button></div><Toggle checked={draft.startup.enabled} onChange={(value) => onDraft(setNested(draft, 'startup', 'enabled', value))} label="Iniciar com o Windows" description="Inicia oculto na bandeja." /></article><article className="panel form-panel"><h2>Ações</h2><div className="button-stack"><button className="secondary" onClick={onOpenTerminal}>Abrir Windows Terminal</button><button className="secondary" onClick={onOpenLogs}>Abrir pasta de logs</button><button className="secondary" onClick={onExport}>Exportar configuração</button><button className="secondary" onClick={onImport}>Importar configuração</button><button className="secondary" onClick={onRestoreBackup} disabled={backupLabel === 'Nenhum backup'}>Restaurar último backup</button><small className="backup-label">{backupLabel}</small><button className="danger" onClick={onRestore}>Restaurar padrões do PowerShell Config</button></div></article></div>
      <article className="panel"><h2>Arquivos gerenciados</h2><dl className="paths"><dt>Windows Terminal</dt><dd>{diagnostics.terminalSettingsPath ?? 'Não localizado'}</dd><dt>Telemetria</dt><dd>Desativada. Nenhum dado sai desta máquina.</dd></dl></article>
    </section>
  );
}

export function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; sticky?: boolean } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [customizationIssues, setCustomizationIssues] = useState<CustomizationDisplayIssue[]>([]);

  const load = async (): Promise<boolean> => {
    try {
      let bootstrap = await window.powershellConfig.getBootstrap();
      const availableThemes = new Set(bootstrap.themes.map((theme) => theme.id));
      const legacyFavorites = [...readLegacyFavoriteThemes()].filter((id) => availableThemes.has(id));
      if (legacyFavorites.length) {
        const migratedUserState: UserState = {
          schemaVersion: 1,
          favoriteThemeIds: [...new Set([...bootstrap.userState.favoriteThemeIds, ...legacyFavorites])],
        };
        try {
          const saved = await window.powershellConfig.saveUserState(migratedUserState, bootstrap.revision);
          bootstrap = { ...bootstrap, userState: saved.userState, revision: saved.revision };
          localStorage.removeItem('theme-favorites');
        } catch (error) {
          setMessage({ type: 'error', text: `Não foi possível migrar os temas favoritos: ${userErrorMessage(error)}` });
        }
      }
      setData(bootstrap);
      setDraft(cloneSettings(bootstrap.settings));
      document.documentElement.dataset.theme = bootstrap.settings.ui.theme;
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: userErrorMessage(error) });
      return false;
    }
  };

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      setMessage({ type: 'error', text: userErrorMessage(error) });
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!message || message.sticky) return;
    const timer = window.setTimeout(() => setMessage((current) => current === message ? null : current), 5_000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!draft) return;
    document.documentElement.dataset.theme = draft.ui.theme;
  }, [draft?.ui.theme]);
  useEffect(() => { setCustomizationIssues([]); }, [draft]);
  useEffect(() => {
    if (!draft || section !== 'themes') return;
    let cancelled = false;
    setPreviewBusy(true);
    setPreview(null);
    void window.powershellConfig.previewTheme(draft.prompt.themeId).then((image) => {
      if (!cancelled) setPreview(image);
    }).catch((error) => {
      if (!cancelled) setMessage({ type: 'error', text: userErrorMessage(error) });
    }).finally(() => { if (!cancelled) setPreviewBusy(false); });
    return () => { cancelled = true; };
  }, [draft?.prompt.themeId, section]);

  const dirty = Boolean(data && draft && JSON.stringify(data.settings) !== JSON.stringify(draft));
  const changes = useMemo(() => data && draft ? changesBetween(data.settings, draft) : [], [data, draft]);
  const hasUnsavedCustomizations = changes.some((change) => change.startsWith('customizations.'));
  useEffect(() => {
    window.powershellConfig.notifyUnsavedCustomizations(hasUnsavedCustomizations);
  }, [hasUnsavedCustomizations]);

  if (!data || !draft) return <main className="boot"><div className="boot-mark">&gt;_</div><p>{message?.text ?? 'Carregando PowerShell Config...'}</p></main>;

  const reviewDraft = async (): Promise<void> => {
    const localIssues: CustomizationDisplayIssue[] = [];
    const parsed = settingsSchema.safeParse(draft);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [root, group, index, field] = issue.path;
        if (root !== 'customizations' || typeof group !== 'string' || typeof index !== 'number' || typeof field !== 'string') continue;
        if (group !== 'aliases' && group !== 'functions' && group !== 'commands') continue;
        const entry = draft.customizations[group][index];
        if (entry) localIssues.push({ id: entry.id, field, message: issue.message });
      }
    }
    const nativeByName = new Map(data.nativeAliases.map((entry) => [entry.name.toLowerCase(), entry]));
    for (const entry of [...draft.customizations.aliases, ...draft.customizations.functions]) {
      const native = nativeByName.get(entry.name.trim().toLowerCase());
      if (native) localIssues.push({ id: entry.id, field: 'name', message: `"${entry.name}" já é um alias nativo de "${native.definition}". Escolha outro nome.` });
    }
    if (localIssues.length) {
      setCustomizationIssues(localIssues);
      setSection('profile');
      setMessage({ type: 'error', text: `Corrija ${localIssues.length} campo(s) destacado(s) antes de revisar.` });
      return;
    }

    setBusy(true);
    try {
      const validation = await window.powershellConfig.validateCustomizations([
        ...draft.customizations.functions.map((entry) => ({ id: entry.id, kind: 'function' as const, name: entry.name, code: entry.body })),
        ...draft.customizations.commands.map((entry) => ({ id: entry.id, kind: 'command' as const, code: entry.code })),
      ]);
      if (validation.issues.length) {
        setCustomizationIssues(validation.issues);
        setSection('profile');
        setMessage({ type: 'error', text: `Corrija ${validation.issues.length} erro(s) de sintaxe destacado(s) antes de revisar.` });
        return;
      }
      setReview(true);
    } catch (error) {
      setMessage({ type: 'error', text: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const apply = async (): Promise<void> => {
    const customizationsChanged = changes.some((change) => change.startsWith('customizations.'));
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.powershellConfig.applySettings({ settings: draft, expectedRevision: data.revision });
      const refreshed = await window.powershellConfig.getBootstrap();
      setData({ ...refreshed, settings: result.settings, revision: result.revision });
      setDraft(cloneSettings(result.settings));
      setReview(false);
      setMessage(
        customizationsChanged
          ? {
              type: 'success',
              text: 'Configurações validadas e aplicadas com backup. Abra um novo terminal (PowerShell ou Windows Terminal) para que funções, aliases e comandos personalizados entrem em vigor — o $PROFILE só é lido ao iniciar uma sessão.',
              sticky: true,
            }
          : { type: 'success', text: 'Configurações validadas e aplicadas com backup.' },
      );
    } catch (error) {
      setReview(false);
      const errorText = userErrorMessage(error);
      if (errorText.includes('As configurações foram alteradas externamente.')) {
        const reloaded = await load();
        setMessage({
          type: 'error',
          text: reloaded
            ? 'As configurações foram alteradas externamente. Os dados foram recarregados; revise e refaça a alteração.'
            : errorText,
        });
      } else {
        setMessage({ type: 'error', text: errorText });
      }
    } finally { setBusy(false); }
  };

  const importTheme = async (): Promise<void> => {
    try {
      const imported = await window.powershellConfig.importTheme();
      if (!imported) return;
      setData({ ...data, themes: [...data.themes.filter((theme) => theme.id !== imported.id), imported].sort((a, b) => a.name.localeCompare(b.name)) });
      setDraft(setNested(draft, 'prompt', 'themeId', imported.id));
      setMessage({ type: 'success', text: `Tema ${imported.name} importado e validado.` });
    } catch (error) { setMessage({ type: 'error', text: userErrorMessage(error) }); }
  };

  const toggleFavorite = async (id: string): Promise<void> => {
    if (favoritesBusy) return;
    const previous = data.userState;
    const favorites = new Set(previous.favoriteThemeIds);
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    const next: UserState = { schemaVersion: 1, favoriteThemeIds: [...favorites] };
    setFavoritesBusy(true);
    setData({ ...data, userState: next });
    try {
      const saved = await window.powershellConfig.saveUserState(next, data.revision);
      setData((current) => current ? { ...current, userState: saved.userState, revision: saved.revision } : current);
    } catch (error) {
      setData((current) => current ? { ...current, userState: previous } : current);
      setMessage({ type: 'error', text: userErrorMessage(error) });
    } finally {
      setFavoritesBusy(false);
    }
  };

  const exportConfiguration = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.powershellConfig.exportConfiguration();
      if (!result.canceled) setMessage({ type: 'success', text: `Configuração exportada com ${result.themeCount ?? 0} tema(s).` });
    } catch (error) {
      setMessage({ type: 'error', text: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const inspectConfigurationImport = async (): Promise<void> => {
    setBusy(true);
    try {
      const previewResult = await window.powershellConfig.inspectConfigurationImport();
      if (previewResult) setImportPreview(previewResult);
    } catch (error) {
      setMessage({ type: 'error', text: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const cancelConfigurationImport = async (): Promise<void> => {
    const token = importPreview?.token;
    setImportPreview(null);
    if (token) await runAction(() => window.powershellConfig.cancelConfigurationImport(token));
  };

  const applyConfigurationImport = async (): Promise<void> => {
    if (!importPreview) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.powershellConfig.applyConfigurationImport({ token: importPreview.token, expectedRevision: data.revision });
      const refreshed = await window.powershellConfig.getBootstrap();
      setData({ ...refreshed, settings: result.settings, userState: result.userState, revision: result.revision });
      setDraft(cloneSettings(result.settings));
      setImportPreview(null);
      setMessage({ type: 'success', text: `Configuração importada com backup e ${result.importedThemeCount} tema(s).` });
    } catch (error) {
      setImportPreview(null);
      setMessage({ type: 'error', text: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (): Promise<void> => {
    if (!window.confirm('Restaurar todas as opções gerenciadas para os padrões? Um backup será criado.')) return;
    setBusy(true);
    try {
      await window.powershellConfig.restoreDefaults(data.revision);
      await load();
      setMessage({ type: 'success', text: 'Padrões restaurados com backup.' });
    } catch (error) { setMessage({ type: 'error', text: userErrorMessage(error) }); }
    finally { setBusy(false); }
  };

  const restoreBackup = async (): Promise<void> => {
    if (!window.confirm('Restaurar o backup mais recente? O estado atual também será salvo antes da restauração.')) return;
    setBusy(true);
    try {
      await window.powershellConfig.restoreLatestBackup(data.revision);
      await load();
      setMessage({ type: 'success', text: 'Backup mais recente restaurado; o estado anterior foi preservado.' });
    } catch (error) { setMessage({ type: 'error', text: userErrorMessage(error) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="app-shell">
      <div className="titlebar"><span>&gt;_ PowerShell Config</span></div>
      <aside><div className="brand"><div className="brand-mark">PS</div><div><strong>PowerShell</strong><span>Config</span></div></div><nav>{navItems.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><i>{item.glyph}</i>{item.label}</button>)}</nav><footer><span>v{data.appVersion}</span><small>Windows • local</small></footer></aside>
      <main className="content">
        {section === 'overview' && <Overview data={{ ...data, settings: draft }} />}
        {section === 'themes' && <Themes themes={data.themes} draft={draft} onDraft={setDraft} onImport={() => void importTheme()} preview={preview} previewBusy={previewBusy} favorites={new Set(data.userState.favoriteThemeIds)} favoritesBusy={favoritesBusy} onToggleFavorite={(id) => void toggleFavorite(id)} />}
        {section === 'profile' && hasUnsavedCustomizations && <p className="unsaved-customizations-banner" role="alert">Você adicionou funções, aliases ou comandos que ainda não foram salvos. Eles existem só nesta tela — clique em <strong>Revisar e aplicar</strong>, no rodapé, para gravá-los de verdade. Se o app fechar antes disso, essas alterações serão perdidas.</p>}
        {section === 'profile' && <Profile draft={draft} onDraft={setDraft} nativeAliases={data.nativeAliases} issues={customizationIssues} />}
        {section === 'terminal' && <TerminalSettings draft={draft} onDraft={setDraft} schemes={data.colorSchemes} />}
        {section === 'settings' && <SettingsPage draft={draft} onDraft={setDraft} diagnostics={data.diagnostics} backupLabel={data.backups[0] ? `Último: ${new Date(data.backups[0].createdAt).toLocaleString('pt-BR')}` : 'Nenhum backup'} onOpenTerminal={() => void runAction(() => window.powershellConfig.openTerminal())} onOpenLogs={() => void runAction(() => window.powershellConfig.openLogs())} onExport={() => void exportConfiguration()} onImport={() => void inspectConfigurationImport()} onRestore={() => void restore()} onRestoreBackup={() => void restoreBackup()} />}
      </main>
      <div className="apply-bar"><span>{dirty ? `${changes.length} alteração(ões) pendente(s)` : 'Configuração sincronizada'}</span><button className="ghost" disabled={!dirty || busy} onClick={() => setDraft(cloneSettings(data.settings))}>Descartar</button><button className="primary" disabled={!dirty || busy} onClick={() => void reviewDraft()}>Revisar e aplicar</button></div>
      {message && <div className={`toast ${message.type}`} role="status"><span>{message.text}</span><button aria-label="Fechar mensagem" onClick={() => setMessage(null)}>×</button></div>}
      {review && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="modal"><p className="eyebrow">TRANSAÇÃO SEGURA</p><h2 id="review-title">Revisar alterações</h2><p>Um backup será criado antes da validação e gravação atômica.</p><ul className="change-list">{changes.map((change) => <li key={change}>{change}</li>)}</ul>{changes.some((change) => change.startsWith('customizations.')) && <p className="modal-note" role="note">Esta alteração inclui funções, aliases ou comandos personalizados: será preciso abrir um novo terminal depois de aplicar.</p>}<div className="modal-actions"><button className="secondary" onClick={() => setReview(false)} disabled={busy}>Cancelar</button><button className="primary" onClick={() => void apply()} disabled={busy}>{busy ? 'Validando...' : 'Aplicar com backup'}</button></div></div></div>}
      {importPreview && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal"><p className="eyebrow">IMPORTAÇÃO VALIDADA</p><h2 id="import-title">Revisar configuração importada</h2><p>Origem: PowerShell Config {importPreview.sourceAppVersion}, exportado em {new Date(importPreview.exportedAt).toLocaleString('pt-BR')}.</p><ul className="change-list"><li>{importPreview.aliasCount} alias(es)</li><li>{importPreview.functionCount} função(ões)</li><li>{importPreview.commandCount} comando(s)</li><li>{importPreview.favoriteCount} favorito(s)</li><li>{importPreview.themeCount} tema(s) portátil(eis)</li></ul><p>As configurações e os favoritos atuais serão substituídos. Os temas locais existentes serão preservados.</p><div className="modal-actions"><button className="secondary" onClick={() => void cancelConfigurationImport()} disabled={busy}>Cancelar</button><button className="primary" onClick={() => void applyConfigurationImport()} disabled={busy}>{busy ? 'Aplicando...' : 'Importar com backup'}</button></div></div></div>}
    </div>
  );
}
