import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/settings.js';
import { buildCustomProfile } from './customProfileService.js';

describe('buildCustomProfile', () => {
  it('gera funções antes de aliases e comandos, ignorando itens desativados', () => {
    const content = buildCustomProfile({
      customizations: {
        functions: [
          { id: 'function-enabled', enabled: true, name: 'Invoke-Workspace', body: "param([string]$Name)\nWrite-Host $Name" },
          { id: 'function-disabled', enabled: false, name: 'Remove-All', body: 'throw disabled' },
        ],
        aliases: [{ id: 'alias-work', enabled: true, name: 'work', command: 'Invoke-Workspace' }],
        commands: [{ id: 'command-env', enabled: true, label: 'Define ambiente', code: "$env:APP_ENV = 'local'" }],
      },
    });

    expect(content).toContain('function global:Invoke-Workspace {');
    expect(content).toContain("Set-Alias -Name 'work' -Value 'Invoke-Workspace' -Scope Global");
    expect(content).toContain("$env:APP_ENV = 'local'");
    expect(content).not.toContain('Remove-All');
    expect(content.indexOf('function global:')).toBeLessThan(content.indexOf('Set-Alias'));
    expect(content.indexOf('Set-Alias')).toBeLessThan(content.indexOf("$env:APP_ENV"));
  });

  it('gera um arquivo inerte quando não há customizações', () => {
    const content = buildCustomProfile(defaultSettings);
    expect(content).toContain('código PowerShell fornecido pelo próprio usuário');
    expect(content).not.toContain('Set-Alias');
    expect(content).not.toContain('function global:');
  });
});
