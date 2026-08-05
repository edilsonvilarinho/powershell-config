import type { AppSettings } from '../../shared/settings.js';

function normalizedCode(code: string): string {
  return code.replace(/\r\n?/g, '\n').trimEnd();
}

function commentLabel(label: string): string {
  return label.replace(/\r?\n/g, ' ').trim();
}

function powerShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildCustomProfile(settings: Pick<AppSettings, 'customizations'>): string {
  const sections: string[] = [
    '# Arquivo gerado pelo PowerShell Config. Não edite manualmente.',
    '# ATENÇÃO: as customizações abaixo são código PowerShell fornecido pelo próprio usuário.',
  ];

  const functions = settings.customizations.functions.filter((entry) => entry.enabled);
  const aliases = settings.customizations.aliases.filter((entry) => entry.enabled);
  const commands = settings.customizations.commands.filter((entry) => entry.enabled);
  sections.push('', '$global:PowerShellConfigCustomHelpEntries = @(');
  for (const entry of aliases) {
    sections.push(`    [pscustomobject]@{ Kind = 'Alias'; Name = ${powerShellSingleQuoted(entry.name)}; Target = ${powerShellSingleQuoted(entry.command)}; Description = ${powerShellSingleQuoted(entry.description)} }`);
  }
  for (const entry of functions) {
    sections.push(`    [pscustomobject]@{ Kind = 'Function'; Name = ${powerShellSingleQuoted(entry.name)}; Target = $null; Description = ${powerShellSingleQuoted(entry.description)} }`);
  }
  for (const entry of commands) {
    const label = commentLabel(entry.label);
    sections.push(`    [pscustomobject]@{ Kind = 'Startup'; Name = ${powerShellSingleQuoted(label)}; Target = $null; Description = ${powerShellSingleQuoted(label)} }`);
  }
  sections.push(')');

  if (functions.length) {
    sections.push('', '# Funções personalizadas');
    for (const entry of functions) {
      sections.push(`function global:${entry.name} {`, normalizedCode(entry.body), '}');
    }
  }

  if (aliases.length) {
    sections.push('', '# Aliases personalizados');
    for (const entry of aliases) {
      sections.push(`Set-Alias -Name '${entry.name}' -Value '${entry.command}' -Scope Global`);
    }
  }

  if (commands.length) {
    sections.push('', '# Comandos executados na abertura do perfil');
    for (const entry of commands) {
      sections.push(`# ${commentLabel(entry.label)}`, normalizedCode(entry.code));
    }
  }

  return `${sections.join('\n')}\n`;
}
