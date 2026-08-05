import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/settings.js';
import { findNativeAliasCollisions, validateCustomizationCode } from './powershellCustomizationService.js';

describe('powershellCustomizationService', () => {
  it('identifica colisão de alias e função com aliases nativos sem diferenciar maiúsculas', () => {
    const issues = findNativeAliasCollisions({
      customizations: {
        aliases: [{ id: 'alias-gc', enabled: true, name: 'GC', command: 'git', description: 'Executa Git' }],
        functions: [{ id: 'function-safe', enabled: true, name: 'gcommit', body: 'git commit @args', description: 'Cria um commit Git' }],
        commands: [],
      },
    }, [{ name: 'gc', definition: 'Get-Content' }]);

    expect(issues).toEqual([expect.objectContaining({ id: 'alias-gc', field: 'name' })]);
    expect(issues[0]?.message).toContain('Get-Content');
  });

  it('usa o parser do PowerShell sem executar o código informado', async () => {
    const validation = await validateCustomizationCode([
      { id: 'valid-function', kind: 'function', name: 'gcommit', code: 'git commit @args' },
      { id: 'invalid-command', kind: 'command', code: 'if (' },
    ]);

    expect(validation.issues).toHaveLength(1);
    expect(validation.issues[0]).toEqual(expect.objectContaining({ id: 'invalid-command', field: 'code', line: 1 }));
  });

  it('não altera o estado padrão ao validar colisões', () => {
    expect(findNativeAliasCollisions(defaultSettings, [])).toEqual([]);
  });
});
