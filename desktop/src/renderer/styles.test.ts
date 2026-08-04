/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/renderer/styles.css', 'utf8')
  .replace(/\s+/g, ' ');

describe('layout responsivo', () => {
  it('expande a área útil e a prévia em janelas amplas', () => {
    expect(stylesheet).toContain('.content section { width: 100%; max-width: 2200px;');
    expect(stylesheet).toContain('.theme-list { height: clamp(300px, 54vh, 760px);');
    expect(stylesheet).toContain('.preview-frame img { width: 100%; height: auto;');
    expect(stylesheet).toContain('@media (min-width: 1800px)');
  });

  it('reduz elementos estruturais antes de comprimir o conteúdo', () => {
    expect(stylesheet).toContain('@media (max-width: 1050px)');
    expect(stylesheet).toContain('.app-shell { grid-template-columns: 196px minmax(0, 1fr);');
    expect(stylesheet).toContain('@media (max-height: 760px)');
    expect(stylesheet).toContain('.theme-list { height: 280px;');
  });
});
