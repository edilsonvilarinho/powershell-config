import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type AppSettings } from '../shared/settings';
import { Customizations, type CustomizationDisplayIssue } from './Customizations';

const emptyCustomizations = defaultSettings.customizations;

function renderCustomizations(
  customizations: AppSettings['customizations'] = emptyCustomizations,
  issues: CustomizationDisplayIssue[] = [],
) {
  return render(
    <Customizations
      customizations={customizations}
      nativeAliases={[]}
      issues={issues}
      onChange={vi.fn()}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('Customizations', () => {
  it('organiza o modo avançado vazio em seções com estados explícitos', () => {
    const { container } = renderCustomizations();

    const content = container.querySelector('.advanced-customizations-content');
    expect(content).not.toBeNull();
    expect(content?.querySelectorAll('.technical-customization-section')).toHaveLength(3);
    expect(screen.getByText('Nenhum alias técnico configurado.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma função técnica configurada.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum comando técnico configurado.')).toBeInTheDocument();
  });

  it('mantém editores preenchidos dentro das respectivas seções técnicas', () => {
    const { container } = renderCustomizations({
      aliases: [{ id: 'alias-1', enabled: true, name: 'listar', command: 'Get-ChildItem', description: 'Lista arquivos' }],
      functions: [{ id: 'function-1', enabled: true, name: 'gcommit', body: 'git commit @args', description: 'Cria um commit Git' }],
      commands: [{ id: 'command-1', enabled: true, label: 'Ambiente local', code: "$env:APP_ENV = 'local'" }],
    });

    expect(screen.getByLabelText('Nome do alias')).toHaveValue('listar');
    expect(screen.getByLabelText(/^Comando de destino/)).toHaveValue('Get-ChildItem');
    expect(screen.getByLabelText('Nome da função')).toHaveValue('gcommit');
    expect(container.querySelector('[data-issue-id="alias-1"][data-issue-field="description"]')).toHaveValue('Lista arquivos');
    expect(container.querySelector('[data-issue-id="function-1"][data-issue-field="description"]')).toHaveValue('Cria um commit Git');
    expect(screen.getByLabelText(/^Corpo PowerShell/)).toHaveValue('git commit @args');
    expect(screen.getByLabelText('Identificação')).toHaveValue('Ambiente local');
    expect(screen.getByLabelText('Código PowerShell')).toHaveValue("$env:APP_ENV = 'local'");
    expect(screen.queryByText(/Nenhum alias técnico/)).not.toBeInTheDocument();
  });

  it('abre o modo avançado e destaca o campo com erro de validação', () => {
    renderCustomizations(
      {
        aliases: [{ id: 'alias-erro', enabled: true, name: 'listar', command: 'Get-ChildItem', description: '' }],
        functions: [],
        commands: [],
      },
      [{ id: 'alias-erro', field: 'description', message: 'Descrição obrigatória.' }],
    );

    expect(screen.getByText('Modo avançado — editar PowerShell gerado').closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('alert')).toHaveTextContent('Descrição obrigatória.');
    expect(screen.getAllByLabelText(/^Descrição/).find((field) => field.dataset.issueId === 'alias-erro')).toHaveFocus();
  });
});
