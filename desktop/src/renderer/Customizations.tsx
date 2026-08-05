import { useEffect, useMemo, useState } from 'react';
import {
  aliasNames,
  isAliasTarget,
  isValidCommandName,
  type AppSettings,
  type NativeAliasInfo,
} from '../shared/settings';

export interface CustomizationDisplayIssue {
  id: string;
  field: string;
  message: string;
  line?: number;
  column?: number;
}

interface Props {
  customizations: AppSettings['customizations'];
  nativeAliases: NativeAliasInfo[];
  issues: CustomizationDisplayIssue[];
  onChange: (customizations: AppSettings['customizations']) => void;
}

type CreatorMode = 'shortcut' | 'startup';
type Template =
  | { category: string; title: string; description: string; usage: string; kind: 'alias'; name: string; command: string }
  | { category: string; title: string; description: string; usage: string; kind: 'function'; name: string; body: string }
  | { category: string; title: string; description: string; usage: string; kind: 'command'; label: string; code: string };

const templates: Template[] = [
  { category: 'Alias simples', title: 'Listar arquivos', description: 'Cria um nome curto para Get-ChildItem.', usage: 'listar C:\\', kind: 'alias', name: 'listar', command: 'Get-ChildItem' },
  { category: 'Alias simples', title: 'Consultar processos', description: 'Cria um nome curto para Get-Process.', usage: 'processos pwsh', kind: 'alias', name: 'processos', command: 'Get-Process' },
  { category: 'Alias simples', title: 'Localizar comando', description: 'Localiza executáveis, funções, aliases e cmdlets.', usage: 'comando git', kind: 'alias', name: 'comando', command: 'Get-Command' },
  { category: 'Ação reutilizável', title: 'Git commit', description: 'Executa git commit e repassa os argumentos informados.', usage: 'gcommit -m "mensagem"', kind: 'function', name: 'gcommit', body: 'git commit @args' },
  { category: 'Ação reutilizável', title: 'Criar pasta e entrar', description: 'Cria uma pasta e altera o diretório atual.', usage: 'mkcd .\\novo-projeto', kind: 'function', name: 'mkcd', body: "param([Parameter(Mandatory)][string]$Path)\nNew-Item -ItemType Directory -Path $Path -Force | Out-Null\nSet-Location -LiteralPath $Path" },
  { category: 'Ação reutilizável', title: 'Formatar JSON', description: 'Lê e exibe um arquivo JSON de forma legível.', usage: 'Show-Json .\\package.json', kind: 'function', name: 'Show-Json', body: 'param([Parameter(Mandatory)][string]$Path)\nGet-Content -LiteralPath $Path -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 100' },
  { category: 'Ao abrir o PowerShell', title: 'Ambiente local', description: 'Define APP_ENV em todas as novas sessões.', usage: "$env:APP_ENV = 'local'", kind: 'command', label: 'Ambiente local', code: "$env:APP_ENV = 'local'" },
  { category: 'Ao abrir o PowerShell', title: 'Saída UTF-8', description: 'Define UTF-8 como codificação padrão do Out-File.', usage: "Out-File usa 'utf8'", kind: 'command', label: 'Codificação UTF-8', code: "$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'" },
  { category: 'Ao abrir o PowerShell', title: 'Abrir workspace', description: 'Entra em $HOME\\workspace somente quando a pasta existir.', usage: 'Nova sessão inicia no workspace', kind: 'command', label: 'Pasta de trabalho', code: "if (Test-Path -LiteralPath (Join-Path $HOME 'workspace')) {\n  Set-Location -LiteralPath (Join-Path $HOME 'workspace')\n}" },
];

function customizationId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function issueText(issue: CustomizationDisplayIssue | undefined): string | undefined {
  if (!issue) return undefined;
  const position = issue.line ? `Linha ${issue.line}${issue.column ? `, coluna ${issue.column}` : ''}: ` : '';
  return `${position}${issue.message}`;
}

function EditorField({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return <label className={`field ${error ? 'field-invalid' : ''}`}><span>{label}</span>{children}{error ? <small role="alert">{error}</small> : hint ? <small>{hint}</small> : null}</label>;
}

type CustomizationKind = 'aliases' | 'functions' | 'commands';

type CustomizationRow =
  | { kind: 'aliases'; entry: AppSettings['customizations']['aliases'][number] }
  | { kind: 'functions'; entry: AppSettings['customizations']['functions'][number] }
  | { kind: 'commands'; entry: AppSettings['customizations']['commands'][number] };

function rowTitle(row: CustomizationRow): string {
  return row.kind === 'commands' ? row.entry.label : row.entry.name;
}

function rowSubtitle(row: CustomizationRow): string {
  if (row.kind === 'commands') return 'Executado ao abrir o PowerShell';
  return row.entry.description || 'Descrição obrigatória pendente';
}

function rowCode(row: CustomizationRow): string {
  if (row.kind === 'aliases') return `${row.entry.name} → ${row.entry.command}`;
  const source = row.kind === 'functions' ? row.entry.body : row.entry.code;
  return source.split(/\r?\n/)[0];
}

export function Customizations({ customizations, nativeAliases, issues, onChange }: Props) {
  const [mode, setMode] = useState<CreatorMode>('shortcut');
  const [name, setName] = useState('');
  const [action, setAction] = useState('');
  const [description, setDescription] = useState('');
  const [forwardArguments, setForwardArguments] = useState(true);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorBusy, setCreatorBusy] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const nativeByName = useMemo(
    () => new Map(nativeAliases.map((entry) => [entry.name.toLowerCase(), entry])),
    [nativeAliases],
  );
  const usedNames = useMemo(() => new Set([
    ...aliasNames,
    ...customizations.aliases.map((entry) => entry.name.toLowerCase()),
    ...customizations.functions.map((entry) => entry.name.toLowerCase()),
  ]), [customizations]);

  useEffect(() => {
    if (!issues.length) return;
    setExpandedIds((current) => new Set([...current, ...issues.map((issue) => issue.id)]));
  }, [issues]);

  useEffect(() => {
    const firstIssue = issues[0];
    if (!firstIssue || !expandedIds.has(firstIssue.id)) return;
    const field = document.querySelector<HTMLElement>(`[data-issue-id="${firstIssue.id}"][data-issue-field="${firstIssue.field}"]`);
    field?.focus();
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [issues, expandedIds]);

  const nameProblem = (candidate: string): string | null => {
    const trimmed = candidate.trim();
    if (!trimmed) return 'Informe o nome que será digitado no PowerShell.';
    if (!isValidCommandName(trimmed)) return 'Use letras, números, ponto, hífen ou sublinhado; comece com letra ou sublinhado.';
    const native = nativeByName.get(trimmed.toLowerCase());
    if (native) {
      const suggestion = trimmed.toLowerCase() === 'gc' ? ' Use "gcommit", por exemplo.' : '';
      return `"${trimmed}" já é um alias nativo de "${native.definition}".${suggestion}`;
    }
    if (usedNames.has(trimmed.toLowerCase())) return `O nome "${trimmed}" já está em uso.`;
    return null;
  };

  const addCustomization = async (): Promise<void> => {
    setCreatorError(null);
    const trimmedName = name.trim();
    const trimmedAction = action.trim();
    const trimmedDescription = description.trim();
    if (!trimmedAction) {
      setCreatorError('Informe o que deve ser executado.');
      return;
    }
    if (mode === 'shortcut') {
      const problem = nameProblem(trimmedName);
      if (problem) { setCreatorError(problem); return; }
      if (!trimmedDescription) {
        setCreatorError('Informe uma descrição para incluir esta personalização na ajuda do PowerShell.');
        return;
      }
      if (/[\r\n;|{}&<>]/.test(trimmedAction)) {
        setCreatorError('No criador simplificado, use um comando com argumentos, sem encadeamentos ou blocos. Para scripts, use o modo avançado.');
        return;
      }
    } else if (!trimmedName) {
      setCreatorError('Informe uma identificação para reconhecer esta automação.');
      return;
    }

    setCreatorBusy(true);
    try {
      if (mode === 'shortcut' && isAliasTarget(trimmedAction) && forwardArguments) {
        onChange({
          ...customizations,
          aliases: [...customizations.aliases, { id: customizationId('alias'), enabled: true, name: trimmedName, command: trimmedAction, description: trimmedDescription }],
        });
      } else if (mode === 'shortcut') {
        const id = customizationId('function');
        const body = forwardArguments && !/@args\s*$/i.test(trimmedAction) ? `${trimmedAction} @args` : trimmedAction;
        const validation = await window.powershellConfig.validateCustomizations([{ id, kind: 'function', name: trimmedName, code: body }]);
        const issue = validation.issues[0];
        if (issue) {
          setCreatorError(issueText(issue) ?? issue.message);
          return;
        }
        onChange({
          ...customizations,
          functions: [...customizations.functions, { id, enabled: true, name: trimmedName, body, description: trimmedDescription }],
        });
      } else {
        const id = customizationId('command');
        const validation = await window.powershellConfig.validateCustomizations([{ id, kind: 'command', code: trimmedAction }]);
        const issue = validation.issues[0];
        if (issue) {
          setCreatorError(issueText(issue) ?? issue.message);
          return;
        }
        onChange({
          ...customizations,
          commands: [...customizations.commands, { id, enabled: true, label: trimmedName, code: trimmedAction }],
        });
      }
      setName('');
      setAction('');
      setDescription('');
      setForwardArguments(true);
    } catch {
      setCreatorError('Não foi possível validar essa personalização. Tente novamente ou consulte os logs.');
    } finally {
      setCreatorBusy(false);
    }
  };

  const useTemplate = (template: Template): void => {
    setCreatorError(null);
    if (template.kind !== 'command') {
      const problem = nameProblem(template.name);
      if (problem) { setCreatorError(problem); return; }
    }
    if (template.kind === 'alias') {
      onChange({ ...customizations, aliases: [...customizations.aliases, { id: customizationId('alias'), enabled: true, name: template.name, command: template.command, description: template.description }] });
    } else if (template.kind === 'function') {
      onChange({ ...customizations, functions: [...customizations.functions, { id: customizationId('function'), enabled: true, name: template.name, body: template.body, description: template.description }] });
    } else {
      onChange({ ...customizations, commands: [...customizations.commands, { id: customizationId('command'), enabled: true, label: template.label, code: template.code }] });
    }
  };

  const patchEntry = (kind: CustomizationKind, id: string, patch: Record<string, unknown>): void => {
    onChange({
      ...customizations,
      [kind]: customizations[kind].map((entry) => entry.id === id ? { ...entry, ...patch } : entry),
    } as AppSettings['customizations']);
  };

  const setEnabled = (kind: CustomizationKind, id: string, enabled: boolean): void => {
    patchEntry(kind, id, { enabled });
  };

  const remove = (kind: CustomizationKind, id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    onChange({ ...customizations, [kind]: customizations[kind].filter((entry) => entry.id !== id) });
  };

  const toggleExpanded = (id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addEmpty = (kind: CustomizationKind): void => {
    const id = customizationId(kind === 'aliases' ? 'alias' : kind === 'functions' ? 'function' : 'command');
    const entry = kind === 'aliases'
      ? { id, enabled: true, name: '', command: '', description: '' }
      : kind === 'functions'
        ? { id, enabled: true, name: '', body: '', description: '' }
        : { id, enabled: true, label: '', code: '' };
    onChange({ ...customizations, [kind]: [...customizations[kind], entry] } as AppSettings['customizations']);
    setExpandedIds((current) => new Set([...current, id]));
  };

  const rows: CustomizationRow[] = [
    ...customizations.aliases.map((entry) => ({ kind: 'aliases' as const, entry })),
    ...customizations.functions.map((entry) => ({ kind: 'functions' as const, entry })),
    ...customizations.commands.map((entry) => ({ kind: 'commands' as const, entry })),
  ];
  const total = rows.length;
  const hasCode = customizations.functions.length + customizations.commands.length > 0;

  const rowEditor = (row: CustomizationRow): React.ReactNode => {
    const fieldError = (field: string): string | undefined =>
      issueText(issues.find((issue) => issue.id === row.entry.id && issue.field === field));

    if (row.kind === 'aliases') {
      return <>
        <EditorField label="Nome do alias" error={fieldError('name')}><input data-issue-id={row.entry.id} data-issue-field="name" required maxLength={128} value={row.entry.name} onChange={(event) => patchEntry('aliases', row.entry.id, { name: event.target.value })} /></EditorField>
        <EditorField label="Comando de destino" error={fieldError('command')} hint="Ex.: Get-ChildItem"><input data-issue-id={row.entry.id} data-issue-field="command" required maxLength={256} placeholder="Get-ChildItem" value={row.entry.command} onChange={(event) => patchEntry('aliases', row.entry.id, { command: event.target.value })} /></EditorField>
        <EditorField label="Descrição" error={fieldError('description')} hint="Exibida no help e no Show-TerminalHelp"><input data-issue-id={row.entry.id} data-issue-field="description" required maxLength={256} value={row.entry.description} onChange={(event) => patchEntry('aliases', row.entry.id, { description: event.target.value })} /></EditorField>
      </>;
    }

    if (row.kind === 'functions') {
      return <>
        <EditorField label="Nome da função" error={fieldError('name')}><input data-issue-id={row.entry.id} data-issue-field="name" required maxLength={128} value={row.entry.name} onChange={(event) => patchEntry('functions', row.entry.id, { name: event.target.value })} /></EditorField>
        <EditorField label="Descrição" error={fieldError('description')} hint="Exibida no help e no Show-TerminalHelp"><input data-issue-id={row.entry.id} data-issue-field="description" required maxLength={256} value={row.entry.description} onChange={(event) => patchEntry('functions', row.entry.id, { description: event.target.value })} /></EditorField>
        <EditorField label="Corpo PowerShell" error={fieldError('body')} hint="Pode começar com param(...) e conter múltiplas linhas."><textarea data-issue-id={row.entry.id} data-issue-field="body" required maxLength={32_768} spellCheck={false} value={row.entry.body} onChange={(event) => patchEntry('functions', row.entry.id, { body: event.target.value })} /></EditorField>
      </>;
    }

    return <>
      <EditorField label="Identificação" error={fieldError('label')} hint="Exibida no help como automação de abertura"><input data-issue-id={row.entry.id} data-issue-field="label" required maxLength={128} value={row.entry.label} onChange={(event) => patchEntry('commands', row.entry.id, { label: event.target.value })} /></EditorField>
      <EditorField label="Código PowerShell" error={fieldError('code')}><textarea data-issue-id={row.entry.id} data-issue-field="code" required maxLength={32_768} spellCheck={false} value={row.entry.code} onChange={(event) => patchEntry('commands', row.entry.id, { code: event.target.value })} /></EditorField>
    </>;
  };

  return <article className="panel customization-panel">
    <div className="customization-intro">
      <div><p className="eyebrow">CRIAÇÃO SIMPLIFICADA</p><h2>O que você quer criar?</h2><p>Descreva o comportamento. O aplicativo gera a estrutura PowerShell adequada.</p></div>
      <div className="customization-type-grid">
        <button type="button" className={mode === 'shortcut' ? 'selected' : ''} onClick={() => { setMode('shortcut'); setCreatorError(null); }}><strong>Atalho manual</strong><span>Você digita um nome para executar uma ação.</span><small>Ex.: gcommit executa git commit</small></button>
        <button type="button" className={mode === 'startup' ? 'selected' : ''} onClick={() => { setMode('startup'); setCreatorError(null); }}><strong>Ao abrir o PowerShell</strong><span>A ação é executada automaticamente em cada nova sessão.</span><small>Ex.: definir uma variável de ambiente</small></button>
      </div>
    </div>

    <div className="guided-creator">
      <EditorField label={mode === 'shortcut' ? 'Nome que você quer digitar' : 'Identificação'} hint={mode === 'shortcut' ? 'Ex.: gcommit' : 'Ex.: Ambiente local'}>
        <input value={name} maxLength={128} placeholder={mode === 'shortcut' ? 'gcommit' : 'Ambiente local'} onChange={(event) => { setName(event.target.value); setCreatorError(null); }} />
      </EditorField>
      <EditorField label="O que deve ser executado" hint={mode === 'shortcut' ? 'Aceita um comando completo, como git commit.' : 'Código executado automaticamente em cada nova sessão.'}>
        <input value={action} maxLength={32_768} placeholder={mode === 'shortcut' ? 'git commit' : "$env:APP_ENV = 'local'"} onChange={(event) => { setAction(event.target.value); setCreatorError(null); }} />
      </EditorField>
      {mode === 'shortcut' && <div className="guided-description"><EditorField label="Descrição" hint="Obrigatória. Entra automaticamente na ajuda exibida por help.">
        <input required value={description} maxLength={256} placeholder="Ex.: Cria um commit Git" onChange={(event) => { setDescription(event.target.value); setCreatorError(null); }} />
      </EditorField></div>}
      {mode === 'shortcut' && <label className="forward-arguments"><input type="checkbox" checked={forwardArguments} onChange={(event) => setForwardArguments(event.target.checked)} /><span><strong>Aceitar argumentos adicionais</strong><small>Permite usar, por exemplo, gcommit -m "mensagem".</small></span></label>}
      {(name.trim() || action.trim()) && <div className="behavior-preview" role="status"><strong>Resultado</strong><span>{mode === 'shortcut' ? `Ao digitar “${name.trim() || 'nome'}${forwardArguments ? ' ...' : ''}”, será executado “${action.trim() || 'comando'}${forwardArguments && action.trim() && !isAliasTarget(action.trim()) ? ' ...' : ''}”.` : `“${action.trim() || 'comando'}” será executado ao abrir uma nova sessão.`}</span></div>}
      {creatorError && <p className="creator-error" role="alert">{creatorError}</p>}
      <div className="guided-actions"><button type="button" className="secondary" onClick={() => setShowExamples(!showExamples)}>{showExamples ? 'Ocultar exemplos' : 'Ver exemplos'}</button><button type="button" className="primary" disabled={creatorBusy} onClick={() => void addCustomization()}>{creatorBusy ? 'Validando...' : 'Adicionar personalização'}</button></div>
    </div>

    {showExamples && <div className="template-grid" aria-label="Modelos de personalização">{templates.map((template) => <article className="template-card" key={`${template.kind}-${template.title}`}><small>{template.category}</small><strong>{template.title}</strong><p>{template.description}</p><code>{template.usage}</code><button type="button" className="secondary" onClick={() => useTemplate(template)}>Usar modelo</button></article>)}</div>}

    <div className="customization-heading">
      <div><h2>Suas personalizações</h2><p>{total ? `${total} item(ns) configurado(s). Todas entram na ajuda do terminal.` : 'Nenhuma personalização criada.'}</p></div>
      <div className="customization-add-actions">
        <button type="button" className="secondary compact" onClick={() => addEmpty('aliases')}>+ alias</button>
        <button type="button" className="secondary compact" onClick={() => addEmpty('functions')}>+ função</button>
        <button type="button" className="secondary compact" onClick={() => addEmpty('commands')}>+ comando</button>
      </div>
    </div>

    {hasCode && <div className="risk-notice" role="note"><strong>Execução de código local</strong><p>Funções e comandos executam com as permissões da sessão. A validação verifica sintaxe, mas não limita seus efeitos.</p></div>}

    <div className="customization-list">
      {!total && <p className="empty-customization">Nenhuma personalização configurada. Use o criador acima ou os botões “+ alias”, “+ função” e “+ comando”.</p>}
      {rows.map((row) => {
        const id = row.entry.id;
        const expanded = expandedIds.has(id);
        const title = rowTitle(row) || 'Sem nome';
        return <div className={`customization-row ${expanded ? 'expanded' : ''}`} key={id}>
          <div className="customization-row-header">
            <input className="enabled-box" type="checkbox" checked={row.entry.enabled} aria-label={`Ativar ${title}`} onChange={(event) => setEnabled(row.kind, id, event.target.checked)} />
            <span className="customization-row-title"><strong>{title}</strong><small>{rowSubtitle(row)}</small></span>
            <code>{rowCode(row)}</code>
            <button type="button" className="secondary compact" aria-expanded={expanded} aria-controls={`customization-editor-${id}`} onClick={() => toggleExpanded(id)}>{expanded ? 'Fechar' : 'Editar'}</button>
            <button type="button" className="danger compact" aria-label={`Excluir ${title}`} onClick={() => remove(row.kind, id)}>Excluir</button>
          </div>
          {expanded && <div className="customization-row-editor" id={`customization-editor-${id}`}>{rowEditor(row)}</div>}
        </div>;
      })}
    </div>
  </article>;
}
