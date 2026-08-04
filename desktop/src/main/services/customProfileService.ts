import type { AppSettings } from '../../shared/settings.js';

function normalizedCode(code: string): string {
  return code.replace(/\r\n?/g, '\n').trimEnd();
}

function commentLabel(label: string): string {
  return label.replace(/\r?\n/g, ' ').trim();
}

export function buildCustomProfile(settings: Pick<AppSettings, 'customizations'>): string {
  const sections: string[] = [
    '# Arquivo gerado pelo PowerShell Config. Não edite manualmente.',
    '# ATENÇÃO: as customizações abaixo são código PowerShell fornecido pelo próprio usuário.',
  ];

  const functions = settings.customizations.functions.filter((entry) => entry.enabled);
  if (functions.length) {
    sections.push('', '# Funções personalizadas');
    for (const entry of functions) {
      sections.push(`function global:${entry.name} {`, normalizedCode(entry.body), '}');
    }
  }

  const aliases = settings.customizations.aliases.filter((entry) => entry.enabled);
  if (aliases.length) {
    sections.push('', '# Aliases personalizados');
    for (const entry of aliases) {
      sections.push(`Set-Alias -Name '${entry.name}' -Value '${entry.command}' -Scope Global`);
    }
  }

  const commands = settings.customizations.commands.filter((entry) => entry.enabled);
  if (commands.length) {
    sections.push('', '# Comandos executados na abertura do perfil');
    for (const entry of commands) {
      sections.push(`# ${commentLabel(entry.label)}`, normalizedCode(entry.code));
    }
  }

  return `${sections.join('\n')}\n`;
}
