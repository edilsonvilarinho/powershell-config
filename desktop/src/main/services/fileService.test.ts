import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readUtf8, writeAtomic } from './fileService.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('writeAtomic', () => {
  it('cria e substitui um arquivo existente sem deixar temporário', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'powershell-config-atomic-'));
    roots.push(root);
    const target = path.join(root, 'config', 'settings.json');
    writeAtomic(target, 'primeiro');
    writeAtomic(target, 'segundo');
    expect(readUtf8(target)).toBe('segundo');
    expect(fs.readdirSync(path.dirname(target))).toEqual(['settings.json']);
  });
});
