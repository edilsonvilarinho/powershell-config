import { useState } from 'react';
import {
  emptyTerminalProfileAdvanced,
  emptyTerminalProfileAppearance,
  type AppSettings,
  type TerminalColorSchemeColors,
  type TerminalProfileAdvanced,
  type TerminalProfileAppearance,
  type TerminalProfileConfig,
} from '../shared/settings';
import { CollapsiblePanel, ColorOverrideField, Field, NullableToggle, TagValueListEditor, TerminalPreview, Toggle } from './ui';

/** Adapta `AppSettings['terminal']` (Padrões) para o mesmo formato de `TerminalProfileAppearance`
 * (todos os campos como override opcional), permitindo reusar `TerminalAppearanceFields` nos dois
 * modos. `tabColor` não existe em `profiles.defaults` gerenciado pelo app, por isso é sempre `null`. */
export function terminalDefaultsAsAppearance(t: AppSettings['terminal']): TerminalProfileAppearance {
  return {
    colorScheme: t.colorScheme,
    fontFace: t.fontFace,
    fontSize: t.fontSize,
    fontWeight: t.fontWeight,
    cellWidth: t.cellWidth,
    cellHeight: t.cellHeight,
    fontFeatures: t.fontFeatures,
    fontAxes: t.fontAxes,
    cursorShape: t.cursorShape,
    cursorColor: t.cursorColor,
    cursorHeight: t.cursorHeight,
    backgroundImagePath: t.backgroundImagePath,
    backgroundImageOpacity: t.backgroundImageOpacity,
    backgroundImageStretchMode: t.backgroundImageStretchMode,
    backgroundImageAlignment: t.backgroundImageAlignment,
    intenseTextStyle: t.intenseTextStyle,
    adjustIndistinguishableColors: t.adjustIndistinguishableColors,
    retroTerminalEffect: t.retroTerminalEffect,
    padding: t.padding,
    scrollbarState: t.scrollbarState,
    tabColor: null,
    foreground: t.foreground,
    background: t.background,
    selectionBackground: t.selectionBackground,
    opacity: t.opacity,
    useAcrylic: t.useAcrylic,
  };
}

/** Campos de Aparência compartilhados entre "Padrões" (`profiles.defaults`, `mode="defaults"`) e cada
 * perfil (`profiles.list[i]`, `mode="profile"`). Em `mode="profile"` todo campo é um override opcional
 * de Padrões: os controles ganham um botão "↺ Herdar de Padrões" e aceitam voltar a `null`. Em
 * `mode="defaults"` os campos que o Windows Terminal sempre grava (colorScheme, fonte, opacidade,
 * useAcrylic, cursorShape, efeito retrô) não oferecem essa opção, pois `AppSettings['terminal']` não
 * aceita `null` neles. */
export function TerminalAppearanceFields({ values, onChange, schemes, effectiveColors, mode }: {
  values: TerminalProfileAppearance;
  onChange: (key: keyof TerminalProfileAppearance, value: unknown) => void;
  schemes: string[];
  effectiveColors: TerminalColorSchemeColors | null;
  mode: 'defaults' | 'profile';
}) {
  const [backgroundImageBusy, setBackgroundImageBusy] = useState(false);
  const isProfile = mode === 'profile';
  const reset = (key: keyof TerminalProfileAppearance, isSet: boolean) =>
    isProfile ? { disabled: !isSet, onClick: () => onChange(key, null) } : undefined;

  const chooseBackgroundImage = async (): Promise<void> => {
    setBackgroundImageBusy(true);
    try {
      const selected = await window.powershellConfig.selectBackgroundImage();
      if (selected) onChange('backgroundImagePath', selected);
    } finally {
      setBackgroundImageBusy(false);
    }
  };

  const fontFace = values.fontFace ?? '';
  const fontSize = values.fontSize ?? 12;
  const opacity = values.opacity ?? 100;
  const cursorShape = values.cursorShape ?? 'bar';

  return (
    <>
      <article className="panel form-panel">
        <h2>Texto</h2>
        <div className="form-grid terminal-fields">
          <Field label="Esquema de cores" onReset={reset('colorScheme', values.colorScheme !== null)}>
            <select value={values.colorScheme ?? ''} onChange={(event) => onChange('colorScheme', event.target.value === '' ? null : event.target.value)}>
              {isProfile && <option value="">Herdado de Padrões</option>}
              {schemes.map((scheme) => <option key={scheme} value={scheme}>{scheme}</option>)}
            </select>
          </Field>
          <Field label="Fonte" onReset={reset('fontFace', values.fontFace !== null)}>
            <input value={fontFace} maxLength={128} placeholder={isProfile ? 'Herdado de Padrões' : undefined} onChange={(event) => onChange('fontFace', isProfile ? (event.target.value.trim() || null) : event.target.value)} />
          </Field>
          <Field label="Tamanho" onReset={reset('fontSize', values.fontSize !== null)}>
            <input type="number" min="6" max="72" step="0.5" value={fontSize} onChange={(event) => onChange('fontSize', event.target.value === '' && isProfile ? null : Number(event.target.value))} />
          </Field>
          <Field label="Espessura da fonte" onReset={reset('fontWeight', values.fontWeight !== null)}>
            <select value={typeof values.fontWeight === 'string' ? values.fontWeight : values.fontWeight === null ? '' : 'custom'} onChange={(event) => onChange('fontWeight', event.target.value === '' ? null : event.target.value === 'custom' ? 400 : event.target.value)}>
              <option value="">{isProfile ? 'Herdado de Padrões' : 'Padrão do Terminal'}</option>
              {['thin', 'extra-light', 'light', 'semi-light', 'normal', 'medium', 'semi-bold', 'bold', 'extra-bold', 'black', 'extra-black'].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
              <option value="custom">Personalizado (100-990)</option>
            </select>
          </Field>
          {typeof values.fontWeight === 'number' && <Field label="Peso personalizado"><input type="number" min="100" max="990" step="10" value={values.fontWeight} onChange={(event) => onChange('fontWeight', Number(event.target.value))} /></Field>}
          <Field label="Largura da célula" hint="Ex.: 0.6. Vazio usa o padrão da fonte."><input value={values.cellWidth ?? ''} placeholder="auto" onChange={(event) => onChange('cellWidth', event.target.value.trim() || null)} /></Field>
          <Field label="Altura da linha" hint="Ex.: 1.2. Vazio usa o padrão da fonte."><input value={values.cellHeight ?? ''} placeholder="auto" onChange={(event) => onChange('cellHeight', event.target.value.trim() || null)} /></Field>
        </div>

        <CollapsiblePanel id="terminal-color-overrides" title="Substituir cores do esquema" hint="Expanda para substituir o primeiro plano, a tela de fundo e a tela de fundo da seleção.">
          <div className="form-grid terminal-fields">
            <ColorOverrideField label="Primeiro plano" hint="Substitui a cor de primeiro plano do esquema de cores." value={values.foreground} fallback={effectiveColors?.foreground ?? null} onChange={(value) => onChange('foreground', value)} />
            <ColorOverrideField label="Tela de fundo" hint="Substitui a cor da tela de fundo do esquema de cores." value={values.background} fallback={effectiveColors?.background ?? null} onChange={(value) => onChange('background', value)} />
            <ColorOverrideField label="Seleção de tela de fundo" hint="Substitui a cor da tela de fundo da seleção do esquema de cores." value={values.selectionBackground} fallback={effectiveColors?.selectionBackground ?? null} onChange={(value) => onChange('selectionBackground', value)} />
            {isProfile && <ColorOverrideField label="Cor da guia" hint="Define a cor da guia deste perfil no Windows Terminal." value={values.tabColor} fallback={null} onChange={(value) => onChange('tabColor', value)} />}
          </div>
          <TerminalPreview
            fontFace={fontFace || 'Cascadia Mono'}
            fontSize={fontSize}
            foreground={values.foreground ?? effectiveColors?.foreground ?? null}
            background={values.background ?? effectiveColors?.background ?? null}
            selectionBackground={values.selectionBackground ?? effectiveColors?.selectionBackground ?? null}
          />
        </CollapsiblePanel>

        <CollapsiblePanel id="terminal-font-axes" title="Eixos de fonte variáveis" hint='Ajusta eixos DWrite da fonte (ex.: "wght").'>
          <TagValueListEditor label="Eixos" hint="4 caracteres ASCII (ex.: wght) e valor numérico." entries={values.fontAxes} onChange={(entries) => onChange('fontAxes', entries)} />
        </CollapsiblePanel>

        <CollapsiblePanel id="terminal-font-features" title="Recursos de fonte" hint='Ativa/desativa recursos OpenType (ex.: "ss01", "liga").'>
          <TagValueListEditor label="Recursos" hint="4 caracteres ASCII e 0 (desativado) ou 1 (ativado)." entries={values.fontFeatures} onChange={(entries) => onChange('fontFeatures', entries)} />
        </CollapsiblePanel>
      </article>

      <article className="panel form-panel">
        <h2>Cursor</h2>
        <div className="form-grid terminal-fields">
          <Field label="Forma do cursor" onReset={reset('cursorShape', values.cursorShape !== null)}>
            <select value={values.cursorShape ?? ''} onChange={(event) => onChange('cursorShape', event.target.value === '' ? null : event.target.value)}>
              {isProfile && <option value="">Herdado de Padrões</option>}
              <option value="bar">Barra ( | )</option>
              <option value="doubleUnderscore">Sublinhado duplo ( ‗ )</option>
              <option value="emptyBox">Caixa vazia ( ▯ )</option>
              <option value="filledBox">Caixa preenchida ( █ )</option>
              <option value="underscore">Sublinhado ( ▁ )</option>
              <option value="vintage">Vintage ( ▃ )</option>
            </select>
          </Field>
          {cursorShape === 'vintage' && <Field label="Altura do cursor" hint="1-100, só se aplica à forma vintage."><input type="number" min="1" max="100" value={values.cursorHeight ?? 25} onChange={(event) => onChange('cursorHeight', Number(event.target.value))} /></Field>}
        </div>
        <ColorOverrideField label="Cor do cursor" hint="Substitui a cor do cursor do esquema de cores." value={values.cursorColor} fallback={null} onChange={(value) => onChange('cursorColor', value)} />
      </article>

      <article className="panel form-panel">
        <h2>Imagem da tela de fundo</h2>
        <div className="form-grid terminal-fields">
          <Field label="Caminho da imagem"><span className="readonly-value">{values.backgroundImagePath === 'desktopWallpaper' ? 'Papel de parede da área de trabalho' : values.backgroundImagePath ?? (isProfile ? 'Herdado de Padrões' : 'Nenhum')}</span></Field>
        </div>
        <div className="button-row">
          <button type="button" className="secondary compact" disabled={backgroundImageBusy} onClick={() => void chooseBackgroundImage()}>Escolher arquivo...</button>
          <button type="button" className="secondary compact" onClick={() => onChange('backgroundImagePath', 'desktopWallpaper')}>Usar papel de parede da área de trabalho</button>
          <button type="button" className="secondary compact" disabled={values.backgroundImagePath === null} onClick={() => onChange('backgroundImagePath', null)}>Remover</button>
        </div>
        {values.backgroundImagePath && <div className="form-grid terminal-fields">
          <Field label={`Opacidade da imagem: ${Math.round((values.backgroundImageOpacity ?? 1) * 100)}%`}><input type="range" min="0" max="100" value={Math.round((values.backgroundImageOpacity ?? 1) * 100)} onChange={(event) => onChange('backgroundImageOpacity', Number(event.target.value) / 100)} /></Field>
          <Field label="Ajuste da imagem"><select value={values.backgroundImageStretchMode ?? 'uniformToFill'} onChange={(event) => onChange('backgroundImageStretchMode', event.target.value)}>
            <option value="fill">Preencher</option>
            <option value="none">Nenhum</option>
            <option value="uniform">Uniforme</option>
            <option value="uniformToFill">Uniforme para preencher</option>
          </select></Field>
          <Field label="Alinhamento da imagem"><select value={values.backgroundImageAlignment ?? 'center'} onChange={(event) => onChange('backgroundImageAlignment', event.target.value)}>
            {['center', 'left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((alignment) => <option key={alignment} value={alignment}>{alignment}</option>)}
          </select></Field>
        </div>}
      </article>

      <article className="panel form-panel">
        <h2>Formatação de Texto</h2>
        <div className="form-grid terminal-fields">
          <Field label="Estilo de texto intenso"><select value={values.intenseTextStyle ?? ''} onChange={(event) => onChange('intenseTextStyle', event.target.value || null)}>
            <option value="">Padrão do Terminal</option>
            <option value="none">Nenhum</option>
            <option value="bold">Negrito</option>
            <option value="bright">Cores brilhantes</option>
            <option value="all">Negrito e cores brilhantes</option>
          </select></Field>
          <Field label="Ajustar cores indistinguíveis"><select value={values.adjustIndistinguishableColors ?? ''} onChange={(event) => onChange('adjustIndistinguishableColors', event.target.value || null)}>
            <option value="">Padrão do Terminal</option>
            <option value="never">Nunca</option>
            <option value="indexed">Somente cores do esquema</option>
            <option value="always">Sempre</option>
          </select></Field>
        </div>
        {isProfile
          ? <NullableToggle value={values.retroTerminalEffect} onChange={(value) => onChange('retroTerminalEffect', value)} label="Efeito de terminal retrô" description="Mostra efeitos de estilo retrô, como texto brilhante e linhas de digitalização." />
          : <Toggle checked={values.retroTerminalEffect ?? false} onChange={(value) => onChange('retroTerminalEffect', value)} label="Efeito de terminal retrô" description="Mostra efeitos de estilo retrô, como texto brilhante e linhas de digitalização." />}
      </article>

      <article className="panel form-panel">
        <h2>Transparência</h2>
        <div className="form-grid terminal-fields">
          <Field label={`Opacidade: ${opacity}%`} hint="0 é transparente; 100 é opaco." onReset={reset('opacity', values.opacity !== null)}>
            <input type="range" min="0" max="100" value={opacity} onChange={(event) => onChange('opacity', Number(event.target.value))} />
          </Field>
        </div>
        {isProfile
          ? <NullableToggle value={values.useAcrylic} onChange={(value) => onChange('useAcrylic', value)} label="Usar material acrílico" />
          : <Toggle checked={values.useAcrylic ?? false} onChange={(value) => onChange('useAcrylic', value)} label="Usar material acrílico" />}
      </article>

      <article className="panel form-panel">
        <h2>Janela</h2>
        <div className="form-grid terminal-fields">
          <Field label="Preenchimento" hint='Formatos: "N", "N, N" ou "N, N, N, N". Vazio usa "8, 8, 8, 8".'><input value={values.padding ?? ''} placeholder="8, 8, 8, 8" onChange={(event) => onChange('padding', event.target.value.trim() || null)} /></Field>
          <Field label="Visibilidade da barra de rolagem"><select value={values.scrollbarState ?? ''} onChange={(event) => onChange('scrollbarState', event.target.value || null)}>
            <option value="">Padrão do Terminal</option>
            <option value="visible">Visível</option>
            <option value="hidden">Oculta</option>
            <option value="always">Sempre</option>
          </select></Field>
        </div>
      </article>
    </>
  );
}

function TerminalEmulationFields({ advanced, onChange }: {
  advanced: TerminalProfileAdvanced;
  onChange: (key: keyof TerminalProfileAdvanced, value: unknown) => void;
}) {
  return (
    <article className="panel form-panel">
      <h2>Emulação de Terminal</h2>
      <div className="form-grid terminal-fields">
        <Field label="Estilo de antialiasing do texto"><select value={advanced.antialiasingMode ?? ''} onChange={(event) => onChange('antialiasingMode', event.target.value || null)}>
          <option value="">Herdado de Padrões</option>
          <option value="grayscale">Escala de cinza</option>
          <option value="cleartype">ClearType</option>
          <option value="aliased">Serrilhado</option>
        </select></Field>
        <Field label="Tamanho do histórico" hint="0-32767. Vazio herda de Padrões."><input type="number" min="0" max="32767" value={advanced.historySize ?? ''} onChange={(event) => onChange('historySize', event.target.value === '' ? null : Number(event.target.value))} /></Field>
        <Field label="Fechamento automático"><select value={advanced.closeOnExit ?? ''} onChange={(event) => onChange('closeOnExit', event.target.value || null)}>
          <option value="">Herdado de Padrões</option>
          <option value="automatic">Automático</option>
          <option value="graceful">Normal</option>
          <option value="always">Sempre</option>
          <option value="never">Nunca</option>
        </select></Field>
        <Field label="Estilo de aviso sonoro"><select value={advanced.bellStyle ?? ''} onChange={(event) => onChange('bellStyle', event.target.value || null)}>
          <option value="">Herdado de Padrões</option>
          <option value="all">Todos</option>
          <option value="audible">Sonoro</option>
          <option value="window">Piscar janela</option>
          <option value="taskbar">Piscar barra de tarefas</option>
          <option value="none">Nenhum</option>
        </select></Field>
        <Field label="Som do aviso sonoro" hint="Caminho de um arquivo de áudio. Vazio herda de Padrões.">
          <input value={typeof advanced.bellSound === 'string' ? advanced.bellSound : ''} onChange={(event) => onChange('bellSound', event.target.value.trim() || null)} />
        </Field>
        <Field label="Tradução de caminhos (arrastar e soltar)"><select value={advanced.pathTranslationStyle ?? ''} onChange={(event) => onChange('pathTranslationStyle', event.target.value || null)}>
          <option value="">Herdado de Padrões</option>
          <option value="none">Nenhuma</option>
          <option value="wsl">WSL</option>
          <option value="cygwin">Cygwin</option>
          <option value="msys2">MSYS2</option>
          <option value="mingw">MinGW</option>
        </select></Field>
      </div>
      <NullableToggle value={advanced.altGrAliasing} onChange={(value) => onChange('altGrAliasing', value)} label="Considerar Ctrl+Alt como AltGr" />
      <NullableToggle value={advanced.snapOnInput} onChange={(value) => onChange('snapOnInput', value)} label="Rolar para a entrada ao digitar" />
    </article>
  );
}

function TerminalAdvancedFields({ advanced, onChange }: {
  advanced: TerminalProfileAdvanced;
  onChange: (key: keyof TerminalProfileAdvanced, value: unknown) => void;
}) {
  return (
    <article className="panel form-panel">
      <h2>Avançado</h2>
      <NullableToggle value={advanced.suppressApplicationTitle} onChange={(value) => onChange('suppressApplicationTitle', value)} label="Suprimir alterações de título" description='Ignora pedidos de troca de título do shell; usa "Título da guia" ou o nome do perfil.' />
      <NullableToggle value={advanced.useAtlasEngine} onChange={(value) => onChange('useAtlasEngine', value)} label="Motor de renderização experimental (Atlas)" />
      <NullableToggle value={advanced.autoMarkPrompts} onChange={(value) => onChange('autoMarkPrompts', value)} label="Marcar prompts automaticamente" />
      <NullableToggle value={advanced.showMarksOnScrollbar} onChange={(value) => onChange('showMarksOnScrollbar', value)} label="Mostrar marcações na barra de rolagem" />
    </article>
  );
}

function TerminalProfileIconField({ icon, onChange }: {
  icon: TerminalProfileConfig['icon'];
  onChange: (icon: TerminalProfileConfig['icon']) => void;
}) {
  const [busy, setBusy] = useState(false);
  const kind = icon?.kind ?? 'none';

  const chooseFile = async (): Promise<void> => {
    setBusy(true);
    try {
      const selected = await window.powershellConfig.selectProfileIcon();
      if (selected) onChange({ kind: 'file', path: selected });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label="Ícone" hint="Local do arquivo de imagem ou emoji do ícone usado no perfil.">
      <div className="icon-field">
        <select
          value={kind}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'none') onChange(null);
            else if (next === 'emoji') onChange({ kind: 'emoji', value: icon?.kind === 'emoji' ? icon.value : '🚀' });
            else onChange({ kind: 'file', path: icon?.kind === 'file' ? icon.path : '' });
          }}
        >
          <option value="none">Nenhum</option>
          <option value="emoji">Emoji</option>
          <option value="file">Arquivo</option>
        </select>
        {icon?.kind === 'emoji' && <input maxLength={16} value={icon.value} onChange={(event) => onChange({ kind: 'emoji', value: event.target.value })} />}
        {icon?.kind === 'file' && (
          <>
            <span className="readonly-value">{icon.path || 'Nenhum arquivo selecionado'}</span>
            <button type="button" className="secondary compact" disabled={busy} onClick={() => void chooseFile()}>Procurar...</button>
          </>
        )}
      </div>
    </Field>
  );
}

function createProfileId(): string {
  return crypto.randomUUID();
}

function createProfileGuid(): string {
  return `{${crypto.randomUUID()}}`;
}

function emptyProfile(): TerminalProfileConfig {
  return {
    id: createProfileId(),
    guid: createProfileGuid(),
    name: 'Novo perfil',
    commandline: null,
    startingDirectory: null,
    icon: null,
    tabTitle: null,
    elevate: false,
    hidden: false,
    appearance: { ...emptyTerminalProfileAppearance },
    advanced: { ...emptyTerminalProfileAdvanced },
  };
}

function uniqueProfileName(base: string, existingLowercaseNames: Set<string>): string {
  if (!existingLowercaseNames.has(base.toLowerCase())) return base;
  let counter = 2;
  while (existingLowercaseNames.has(`${base} (${counter})`.toLowerCase())) counter += 1;
  return `${base} (${counter})`;
}

function duplicateProfile(source: TerminalProfileConfig, existingLowercaseNames: Set<string>): TerminalProfileConfig {
  return {
    ...structuredClone(source),
    id: createProfileId(),
    guid: createProfileGuid(),
    name: uniqueProfileName(`${source.name} - cópia`, existingLowercaseNames),
  };
}

function TerminalProfileEditor({ profile, onChange, onDelete, schemes, activeColorSchemeColors }: {
  profile: TerminalProfileConfig;
  onChange: (updater: (profile: TerminalProfileConfig) => TerminalProfileConfig) => void;
  onDelete: () => void;
  schemes: string[];
  activeColorSchemeColors: TerminalColorSchemeColors | null;
}) {
  const setField = <K extends keyof TerminalProfileConfig>(key: K, value: TerminalProfileConfig[K]): void => {
    onChange((current) => ({ ...current, [key]: value }));
  };
  const setAppearance = (key: keyof TerminalProfileAppearance, value: unknown): void => {
    onChange((current) => ({ ...current, appearance: { ...current.appearance, [key]: value } }));
  };
  const setAdvanced = (key: keyof TerminalProfileAdvanced, value: unknown): void => {
    onChange((current) => ({ ...current, advanced: { ...current.advanced, [key]: value } }));
  };

  return (
    <section className="terminal-profile-editor">
      <article className="panel form-panel">
        <h2>{profile.name || 'Novo perfil'}</h2>
        <div className="form-grid terminal-fields">
          <Field label="Nome"><input value={profile.name} maxLength={128} onChange={(event) => setField('name', event.target.value)} /></Field>
          <Field label="Linha de comando" hint="Arquivo executável usado no perfil."><input value={profile.commandline ?? ''} placeholder="%SystemRoot%\System32\cmd.exe" onChange={(event) => setField('commandline', event.target.value.trim() || null)} /></Field>
          <Field label="Diretório inicial" hint="Vazio usa o diretório de processo pai."><input value={profile.startingDirectory ?? ''} placeholder="Usar o diretório de processo pai" onChange={(event) => setField('startingDirectory', event.target.value.trim() || null)} /></Field>
          <Field label="Título da guia" hint="Substitui o nome do perfil como título passado ao shell."><input value={profile.tabTitle ?? ''} placeholder="Nenhum" onChange={(event) => setField('tabTitle', event.target.value.trim() || null)} /></Field>
        </div>
        <TerminalProfileIconField icon={profile.icon} onChange={(icon) => setField('icon', icon)} />
        <Toggle checked={profile.elevate} onChange={(value) => setField('elevate', value)} label="Executar esse perfil como Administrador" description="Se habilitado, o perfil abre automaticamente em uma janela elevada." />
        <Toggle checked={profile.hidden} onChange={(value) => setField('hidden', value)} label="Ocultar perfil da lista suspensa" description="O perfil continua no settings.json, mas não aparece na lista de perfis do Terminal." />
      </article>

      <TerminalAppearanceFields values={profile.appearance} onChange={setAppearance} schemes={schemes} effectiveColors={activeColorSchemeColors} mode="profile" />
      <TerminalEmulationFields advanced={profile.advanced} onChange={setAdvanced} />
      <TerminalAdvancedFields advanced={profile.advanced} onChange={setAdvanced} />

      <div className="button-row">
        <button type="button" className="danger" onClick={onDelete}>Apagar perfil</button>
      </div>
    </section>
  );
}

export function TerminalProfilesSection({ profiles, onChange, schemes, activeColorSchemeColors }: {
  profiles: TerminalProfileConfig[];
  onChange: (profiles: TerminalProfileConfig[]) => void;
  schemes: string[];
  activeColorSchemeColors: TerminalColorSchemeColors | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id ?? null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string>(profiles[0]?.id ?? '');

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const addEmpty = (): void => {
    const profile = emptyProfile();
    onChange([...profiles, profile]);
    setSelectedId(profile.id);
    setAddMenuOpen(false);
  };

  const addDuplicate = (): void => {
    const source = profiles.find((p) => p.id === duplicateSourceId) ?? profiles[0];
    if (!source) return;
    const profile = duplicateProfile(source, new Set(profiles.map((p) => p.name.toLowerCase())));
    onChange([...profiles, profile]);
    setSelectedId(profile.id);
    setAddMenuOpen(false);
  };

  const updateSelected = (updater: (profile: TerminalProfileConfig) => TerminalProfileConfig): void => {
    if (!selected) return;
    onChange(profiles.map((p) => (p.id === selected.id ? updater(p) : p)));
  };

  const removeSelected = (): void => {
    if (!selected) return;
    if (!window.confirm(`Apagar o perfil "${selected.name}"? Ele será removido do settings.json do Windows Terminal na próxima aplicação.`)) return;
    onChange(profiles.filter((p) => p.id !== selected.id));
    setSelectedId(null);
  };

  return (
    <div className="terminal-profiles-layout">
      <aside className="terminal-profiles-list panel">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={`terminal-profile-item ${selected?.id === profile.id ? 'active' : ''}`}
            onClick={() => setSelectedId(profile.id)}
          >
            {profile.name}
          </button>
        ))}
        {profiles.length === 0 && <p className="empty">Nenhum perfil gerenciado pelo app ainda.</p>}

        <button type="button" className="secondary compact" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}>+ Adicionar perfil</button>
        {addMenuOpen && (
          <div className="collapsible-body">
            <button type="button" className="secondary compact" onClick={addEmpty}>Novo perfil vazio</button>
            {profiles.length > 0 && (
              <div className="button-row">
                <select value={duplicateSourceId || profiles[0].id} onChange={(event) => setDuplicateSourceId(event.target.value)}>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
                <button type="button" className="secondary compact" onClick={addDuplicate}>Duplicar</button>
              </div>
            )}
          </div>
        )}
      </aside>

      {selected ? (
        <TerminalProfileEditor
          key={selected.id}
          profile={selected}
          onChange={updateSelected}
          onDelete={removeSelected}
          schemes={schemes}
          activeColorSchemeColors={activeColorSchemeColors}
        />
      ) : (
        <p className="empty">Nenhum perfil selecionado. Crie um perfil para configurar Nome, Linha de comando, Aparência, Emulação e Avançado.</p>
      )}
    </div>
  );
}
