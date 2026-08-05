import { aliasNames, type AppSettings } from './settings.js';

export type HelpSection = 'Atalhos' | 'Utilitários' | 'Teclas' | 'Personalizações' | 'Ao abrir a sessão';

export const helpSectionOrder: HelpSection[] = ['Atalhos', 'Utilitários', 'Teclas', 'Personalizações', 'Ao abrir a sessão'];

export interface HelpEntry {
  name: string;
  target: string | null;
  description: string;
  /** Binário externo exigido; o item só aparece na sessão real quando ele existe. */
  requires: string | null;
}

export interface HelpPreviewSection {
  section: HelpSection;
  entries: HelpEntry[];
}

interface DefaultHelpEntry extends HelpEntry {
  section: Extract<HelpSection, 'Atalhos' | 'Utilitários'>;
  alias: (typeof aliasNames)[number] | null;
}

/** Espelha os registros de Add-PowerShellConfigHelpEntry em powershell/user_profile.ps1. */
export const defaultHelpCatalog: DefaultHelpEntry[] = [
  { section: 'Atalhos', alias: 'ls', name: 'ls', target: 'Invoke-DirectoryListing', description: 'Lista o diretório com Terminal-Icons', requires: null },
  { section: 'Atalhos', alias: 'dir', name: 'dir', target: 'Invoke-DirectoryListing', description: 'Lista o diretório com Terminal-Icons', requires: null },
  { section: 'Atalhos', alias: 'll', name: 'll', target: 'Invoke-DirectoryListing', description: 'Lista o diretório com Terminal-Icons', requires: null },
  { section: 'Atalhos', alias: 'g', name: 'g', target: 'git', description: 'Executa o Git', requires: 'git' },
  { section: 'Atalhos', alias: 'vim', name: 'vim', target: 'nvim', description: 'Abre o Neovim', requires: 'nvim' },
  { section: 'Atalhos', alias: 'grep', name: 'grep', target: 'findstr', description: 'Filtra texto com o findstr', requires: null },
  { section: 'Atalhos', alias: 'tig', name: 'tig', target: 'tig.exe', description: 'Navegador Git do Git for Windows', requires: 'tig' },
  { section: 'Atalhos', alias: 'less', name: 'less', target: 'less.exe', description: 'Paginador do Git for Windows', requires: 'less' },
  { section: 'Utilitários', alias: null, name: 'which <comando>', target: null, description: 'Informa o caminho do executável', requires: null },
  { section: 'Utilitários', alias: null, name: 'history -c', target: null, description: 'Limpa o histórico da sessão e do PSReadLine', requires: null },
  { section: 'Utilitários', alias: null, name: 'lastBootUpTime', target: null, description: 'Informa o tempo desde a última inicialização', requires: null },
];

export const ctrlDHelpEntry: HelpEntry = {
  name: 'Ctrl+d',
  target: null,
  description: 'Apaga o caractere atual',
  requires: null,
};

/**
 * Reproduz o conteúdo que Show-TerminalHelp exibirá com estas configurações.
 * É uma aproximação: itens com `requires` só aparecem na sessão real quando o
 * binário correspondente existe na máquina.
 */
export function buildHelpPreview(settings: AppSettings): HelpPreviewSection[] {
  const sections = new Map<HelpSection, HelpEntry[]>(helpSectionOrder.map((section) => [section, []]));
  const push = (section: HelpSection, entry: HelpEntry): void => {
    sections.get(section)?.push(entry);
  };

  for (const entry of defaultHelpCatalog) {
    if (entry.alias && !settings.aliases[entry.alias]) continue;
    push(entry.section, { name: entry.name, target: entry.target, description: entry.description, requires: entry.requires });
  }

  if (settings.psReadLine.enabled && settings.psReadLine.ctrlD) push('Teclas', ctrlDHelpEntry);

  for (const entry of settings.customizations.aliases) {
    if (!entry.enabled) continue;
    push('Personalizações', { name: entry.name, target: entry.command, description: entry.description, requires: null });
  }
  for (const entry of settings.customizations.functions) {
    if (!entry.enabled) continue;
    push('Personalizações', { name: entry.name, target: null, description: entry.description, requires: null });
  }
  for (const entry of settings.customizations.commands) {
    if (!entry.enabled) continue;
    push('Ao abrir a sessão', { name: entry.label, target: null, description: entry.label, requires: null });
  }

  return helpSectionOrder
    .map((section) => ({ section, entries: sections.get(section) ?? [] }))
    .filter((group) => group.entries.length > 0);
}
