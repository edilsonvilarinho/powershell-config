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

export function Customizations({ customizations, nativeAliases, issues, onChange }: Props) {
  const [mode, setMode] = useState<CreatorMode>('shortcut');
  const [name, setName] = useState('');
  const [action, setAction] = useState('');
  const [forwardArguments, setForwardArguments] = useState(true);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorBusy, setCreatorBusy] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

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
    const firstIssue = issues[0];
    if (!firstIssue) return;
    const field = document.querySelector<HTMLElement>(`[data-issue-id="${firstIssue.id}"][data-issue-field="${firstIssue.field}"]`);
    field?.focus();
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [issues]);

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
    if (!trimmedAction) {
      setCreatorError('Informe o que deve ser executado.');
      return;
    }
    if (mode === 'shortcut') {
      const problem = nameProblem(trimmedName);
      if (problem) { setCreatorError(problem); return; }
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
          aliases: [...customizations.aliases, { id: customizationId('alias'), enabled: true, name: trimmedName, command: trimmedAction }],
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
          functions: [...customizations.functions, { id, enabled: true, name: trimmedName, body }],
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
      onChange({ ...customizations, aliases: [...customizations.aliases, { id: customizationId('alias'), enabled: true, name: template.name, command: template.command }] });
    } else if (template.kind === 'function') {
      onChange({ ...customizations, functions: [...customizations.functions, { id: customizationId('function'), enabled: true, name: template.name, body: template.body }] });
    } else {
      onChange({ ...customizations, commands: [...customizations.commands, { id: customizationId('command'), enabled: true, label: template.label, code: template.code }] });
    }
  };

  const setEnabled = (kind: 'aliases' | 'functions' | 'commands', id: string, enabled: boolean): void => {
    onChange({ ...customizations, [kind]: customizations[kind].map((entry) => entry.id === id ? { ...entry, enabled } : entry) });
  };

  const remove = (kind: 'aliases' | 'functions' | 'commands', id: string): void => {
    onChange({ ...customizations, [kind]: customizations[kind].filter((entry) => entry.id !== id) });
  };

  const total = customizations.aliases.length + customizations.functions.length + customizations.commands.length;

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
      {mode === 'shortcut' && <label className="forward-arguments"><input type="checkbox" checked={forwardArguments} onChange={(event) => setForwardArguments(event.target.checked)} /><span><strong>Aceitar argumentos adicionais</strong><small>Permite usar, por exemplo, gcommit -m "mensagem".</small></span></label>}
      {(name.trim() || action.trim()) && <div className="behavior-preview" role="status"><strong>Resultado</strong><span>{mode === 'shortcut' ? `Ao digitar “${name.trim() || 'nome'}${forwardArguments ? ' ...' : ''}”, será executado “${action.trim() || 'comando'}${forwardArguments && action.trim() && !isAliasTarget(action.trim()) ? ' ...' : ''}”.` : `“${action.trim() || 'comando'}” será executado ao abrir uma nova sessão.`}</span></div>}
      {creatorError && <p className="creator-error" role="alert">{creatorError}</p>}
      <div className="guided-actions"><button type="button" className="secondary" onClick={() => setShowExamples(!showExamples)}>{showExamples ? 'Ocultar exemplos' : 'Ver exemplos'}</button><button type="button" className="primary" disabled={creatorBusy} onClick={() => void addCustomization()}>{creatorBusy ? 'Validando...' : 'Adicionar personalização'}</button></div>
    </div>

    {showExamples && <div className="template-grid" aria-label="Modelos de personalização">{templates.map((template) => <article className="template-card" key={`${template.kind}-${template.title}`}><small>{template.category}</small><strong>{template.title}</strong><p>{template.description}</p><code>{template.usage}</code><button type="button" className="secondary" onClick={() => useTemplate(template)}>Usar modelo</button></article>)}</div>}

    <div className="customization-heading"><div><h2>Suas personalizações</h2><p>{total ? `${total} item(ns) configurado(s).` : 'Nenhuma personalização criada.'}</p></div></div>
    {total > 0 && <div className="customization-summary-list">
      {customizations.aliases.map((entry) => <div className="customization-summary" key={entry.id}><label><input type="checkbox" checked={entry.enabled} onChange={(event) => setEnabled('aliases', entry.id, event.target.checked)} /><span><strong>{entry.name}</strong><small>Atalho para {entry.command}</small></span></label><code>{entry.name} → {entry.command}</code><button className="danger compact" onClick={() => remove('aliases', entry.id)}>Excluir</button></div>)}
      {customizations.functions.map((entry) => <div className="customization-summary" key={entry.id}><label><input type="checkbox" checked={entry.enabled} onChange={(event) => setEnabled('functions', entry.id, event.target.checked)} /><span><strong>{entry.name}</strong><small>Ação reutilizável</small></span></label><code>{entry.body.split(/\r?\n/)[0]}</code><button className="danger compact" onClick={() => remove('functions', entry.id)}>Excluir</button></div>)}
      {customizations.commands.map((entry) => <div className="customization-summary" key={entry.id}><label><input type="checkbox" checked={entry.enabled} onChange={(event) => setEnabled('commands', entry.id, event.target.checked)} /><span><strong>{entry.label}</strong><small>Executado ao abrir o PowerShell</small></span></label><code>{entry.code.split(/\r?\n/)[0]}</code><button className="danger compact" onClick={() => remove('commands', entry.id)}>Excluir</button></div>)}
    </div>}

    <details className="advanced-customizations" open={issues.length > 0 || undefined}>
      <summary>Modo avançado — editar PowerShell gerado</summary>
      <div className="advanced-customizations-content">
        <div className="risk-notice" role="note"><strong>Execução de código local</strong><p>O código abaixo executa com as permissões da sessão. A validação verifica sintaxe, mas não limita seus efeitos.</p></div>

        <section className="technical-customization-section">
          <div className="customization-heading"><div><h2>Aliases técnicos</h2><p>Use somente o nome de um comando, sem caminho, argumentos ou expressões.</p></div><button className="secondary" onClick={() => onChange({ ...customizations, aliases: [...customizations.aliases, { id: customizationId('alias'), enabled: true, name: '', command: '' }] })}>Adicionar alias</button></div>
          <div className="customization-list">
            {!customizations.aliases.length && <p className="empty-customization">Nenhum alias técnico configurado.</p>}
            {customizations.aliases.map((entry) => <div className="customization-item alias-editor" key={entry.id}>
              <input className="enabled-box" type="checkbox" checked={entry.enabled} aria-label={`Ativar alias ${entry.name || 'novo'}`} onChange={(event) => setEnabled('aliases', entry.id, event.target.checked)} />
              <EditorField label="Nome do alias" error={issueText(issues.find((issue) => issue.id === entry.id && issue.field === 'name'))}><input data-issue-id={entry.id} data-issue-field="name" required maxLength={128} value={entry.name} onChange={(event) => onChange({ ...customizations, aliases: customizations.aliases.map((item) => item.id === entry.id ? { ...item, name: event.target.value } : item) })} /></EditorField>
              <EditorField label="Comando de destino" error={issueText(issues.find((issue) => issue.id === entry.id && issue.field === 'command'))} hint="Ex.: Get-ChildItem"><input data-issue-id={entry.id} data-issue-field="command" required maxLength={256} placeholder="Get-ChildItem" value={entry.command} onChange={(event) => onChange({ ...customizations, aliases: customizations.aliases.map((item) => item.id === entry.id ? { ...item, command: event.target.value } : item) })} /></EditorField>
              <button className="danger compact" aria-label={`Excluir alias ${entry.name || 'novo'}`} onClick={() => remove('aliases', entry.id)}>Excluir</button>
            </div>)}
          </div>
        </section>

        <section className="technical-customization-section">
          <div className="customization-heading"><div><h2>Funções técnicas</h2><p>Use para parâmetros, argumentos fixos ou lógica com múltiplas linhas.</p></div><button className="secondary" onClick={() => onChange({ ...customizations, functions: [...customizations.functions, { id: customizationId('function'), enabled: true, name: '', body: '' }] })}>Adicionar função</button></div>
          <div className="customization-list">
            {!customizations.functions.length && <p className="empty-customization">Nenhuma função técnica configurada.</p>}
            {customizations.functions.map((entry) => <div className="customization-item code-editor" key={entry.id}>
              <div className="customization-item-header"><input className="enabled-box" type="checkbox" checked={entry.enabled} aria-label={`Ativar função ${entry.name || 'nova'}`} onChange={(event) => setEnabled('functions', entry.id, event.target.checked)} /><EditorField label="Nome da função" error={issueText(issues.find((issue) => issue.id === entry.id && issue.field === 'name'))}><input data-issue-id={entry.id} data-issue-field="name" required maxLength={128} value={entry.name} onChange={(event) => onChange({ ...customizations, functions: customizations.functions.map((item) => item.id === entry.id ? { ...item, name: event.target.value } : item) })} /></EditorField><button className="danger compact" aria-label={`Excluir função ${entry.name || 'nova'}`} onClick={() => remove('functions', entry.id)}>Excluir</button></div>
              <EditorField label="Corpo PowerShell" error={issueText(issues.find((issue) => issue.id === entry.id && issue.field === 'body'))} hint="Pode começar com param(...) e conter múltiplas linhas."><textarea data-issue-id={entry.id} data-issue-field="body" required maxLength={32_768} spellCheck={false} value={entry.body} onChange={(event) => onChange({ ...customizations, functions: customizations.functions.map((item) => item.id === entry.id ? { ...item, body: event.target.value } : item) })} /></EditorField>
            </div>)}
          </div>
        </section>

        <section className="technical-customization-section">
          <div className="customization-heading"><div><h2>Comandos técnicos na abertura</h2><p>Executados na ordem exibida quando o perfil é carregado.</p></div><button className="secondary" onClick={() => onChange({ ...customizations, commands: [...customizations.commands, { id: customizationId('command'), enabled: true, label: '', code: '' }] })}>Adicionar comando</button></div>
          <div className="customization-list">
            {!customizations.commands.length && <p className="empty-customization">Nenhum comando técnico configurado.</p>}
            {customizations.commands.map((entry) => <div className="customization-item code-editor" key={entry.id}>
              <div className="customization-item-header"><input className="enabled-box" type="checkbox" checked={entry.enabled} aria-label={`Ativar comando ${entry.label || 'novo'}`} onChange={(event) => setEnabled('commands', entry.id, event.target.checked)} /><EditorField label="Identificação" error={issueText(issues.find((issue) => issue.id === entry.id && issue.field === 'label'))}><input data-issue-id={entry.id} data-issue-field="label" required maxLength={128} value={entry.label} onChange={(event) => onChange({ ...customizations, commands: customizations.commands.map((item) => item.id === entry.id ? { ...item, label: event.target.value } : item) })} /></EditorField><button className="danger compact" aria-label={`Excluir comando ${entry.label || 'novo'}`} onClick={() => remove('commands', entry.id)}>Excluir</button></div>
              <EditorField label="Código PowerShell" error={issueText(issues.find((issue) => issue.id === entry.id && issue.field === 'code'))}><textarea data-issue-id={entry.id} data-issue-field="code" required maxLength={32_768} spellCheck={false} value={entry.code} onChange={(event) => onChange({ ...customizations, commands: customizations.commands.map((item) => item.id === entry.id ? { ...item, code: event.target.value } : item) })} /></EditorField>
            </div>)}
          </div>
        </section>
      </div>
    </details>
  </article>;
}
