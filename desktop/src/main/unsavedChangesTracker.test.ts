import { afterEach, describe, expect, it, vi } from 'vitest';

const { showMessageBox } = vi.hoisted(() => ({ showMessageBox: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

import {
  confirmQuitWithUnsavedChanges,
  getHasUnsavedCustomizations,
  setHasUnsavedCustomizations,
} from './unsavedChangesTracker.js';

afterEach(() => {
  showMessageBox.mockReset();
  setHasUnsavedCustomizations(false);
});

describe('unsavedChangesTracker', () => {
  it('rastreia o estado informado pelo renderer', () => {
    expect(getHasUnsavedCustomizations()).toBe(false);
    setHasUnsavedCustomizations(true);
    expect(getHasUnsavedCustomizations()).toBe(true);
  });

  it('confirma sair sem perguntar quando não há pendência', async () => {
    setHasUnsavedCustomizations(false);
    await expect(confirmQuitWithUnsavedChanges(null)).resolves.toBe(true);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('pergunta e respeita a escolha de cancelar quando há pendência', async () => {
    setHasUnsavedCustomizations(true);
    showMessageBox.mockResolvedValue({ response: 0 });

    await expect(confirmQuitWithUnsavedChanges(null)).resolves.toBe(false);
    expect(showMessageBox).toHaveBeenCalledOnce();
  });

  it('pergunta e respeita a escolha de sair mesmo assim', async () => {
    setHasUnsavedCustomizations(true);
    showMessageBox.mockResolvedValue({ response: 1 });

    await expect(confirmQuitWithUnsavedChanges(null)).resolves.toBe(true);
  });
});
