import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type AppSettings } from '../shared/settings';
import { Customizations, type CustomizationDisplayIssue } from './Customizations';

const emptyCustomizations = defaultSettings.customizations;

const populatedCustomizations: AppSettings['customizations'] = {
  aliases: [{ id: 'alias-1', enabled: true, name: 'listar', command: 'Get-ChildItem', description: 'Lista arquivos' }],
  functions: [{ id: 'function-1', enabled: true, name: 'gcommit', body: 'git commit @args', description: 'Cria um commit Git' }],
  commands: [{ id: 'command-1', enabled: true, label: 'Ambiente local', code: "$env:APP_ENV = 'local'" }],
};

function renderCustomizations(
  customizations: AppSettings['customizations'] = emptyCustomizations,
  issues: CustomizationDisplayIssue[] = [],
  onChange = vi.fn(),
) {
  return {
    onChange,
    ...render(
      <Customizations
        customizations={customizations}
        nativeAliases={[]}
        issues={issues}
        onChange={onChange}
      />,
    ),
  };
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
  it('mostra estado vazio explícito e não renderiza seções técnicas separadas', () => {
    const { container } = renderCustomizations();

    expect(screen.getByText(/Nenhuma personalização configurada/)).toBeInTheDocument();
    expect(container.querySelectorAll('.customization-row')).toHaveLength(0);
    expect(container.querySelector('.advanced-customizations')).toBeNull();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('lista cada personalização uma única vez, com editor fechado', () => {
    const { container } = renderCustomizations(populatedCustomizations);

    expect(container.querySelectorAll('.customization-row')).toHaveLength(3);
    expect(screen.getByText('listar')).toBeInTheDocument();
    expect(screen.getByText('listar → Get-ChildItem')).toBeInTheDocument();
    expect(screen.getByText('Cria um commit Git')).toBeInTheDocument();
    expect(screen.getByText('Executado ao abrir o PowerShell')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do alias')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Corpo PowerShell/)).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Execução de código local');
  });

  it('abre o editor do tipo correto ao clicar em Editar', () => {
    renderCustomizations(populatedCustomizations);

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1]);

    expect(screen.getByLabelText('Nome da função')).toHaveValue('gcommit');
    expect(screen.getByLabelText(/^Corpo PowerShell/)).toHaveValue('git commit @args');
    expect(screen.queryByLabelText('Nome do alias')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('expande a linha com erro de validação e foca o campo destacado', () => {
    renderCustomizations(
      {
        aliases: [{ id: 'alias-erro', enabled: true, name: 'listar', command: 'Get-ChildItem', description: '' }],
        functions: [],
        commands: [],
      },
      [{ id: 'alias-erro', field: 'description', message: 'Descrição obrigatória.' }],
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Descrição obrigatória.');
    const field = screen.getAllByLabelText(/^Descrição/).find((input) => input.dataset.issueId === 'alias-erro');
    expect(field).toHaveFocus();
  });

  it('cria entrada técnica vazia já expandida', () => {
    const onChange = vi.fn();
    renderCustomizations(emptyCustomizations, [], onChange);

    fireEvent.click(screen.getByRole('button', { name: '+ comando' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      commands: [expect.objectContaining({ enabled: true, label: '', code: '' })],
    }));
  });
});
