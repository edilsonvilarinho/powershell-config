import { dialog, type BrowserWindow } from 'electron';

let hasUnsavedCustomizations = false;

export function setHasUnsavedCustomizations(value: boolean): void {
  hasUnsavedCustomizations = value;
}

export function getHasUnsavedCustomizations(): boolean {
  return hasUnsavedCustomizations;
}

// Retorna true se o usuário confirmou sair mesmo com personalizações não aplicadas (ou se não havia nenhuma pendente).
export async function confirmQuitWithUnsavedChanges(window: BrowserWindow | null): Promise<boolean> {
  if (!hasUnsavedCustomizations) return true;
  const result = await dialog.showMessageBox(window ?? undefined as unknown as BrowserWindow, {
    type: 'warning',
    buttons: ['Cancelar', 'Sair mesmo assim'],
    defaultId: 0,
    cancelId: 0,
    title: 'Alterações não aplicadas',
    message: 'Você adicionou funções, aliases ou comandos que ainda não foram aplicados.',
    detail: 'Se sair agora, essas alterações serão perdidas. Volte ao PowerShell Config e clique em "Revisar e aplicar" para salvá-las de verdade.',
  });
  return result.response === 1;
}
