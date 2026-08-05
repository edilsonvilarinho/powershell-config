/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/renderer/styles.css', 'utf8')
  .replace(/\s+/g, ' ');

describe('layout responsivo', () => {
  it('mantém legíveis os metadados e o status no rodapé', () => {
    expect(stylesheet).toContain('aside footer { margin-top: auto; border-top: 1px solid var(--border); padding: 16px 10px 0; display: grid; gap: 3px; color: var(--muted); font: 13px Consolas, monospace;');
    expect(stylesheet).toContain('.apply-bar span { margin-right: auto; color: var(--muted); font: 13px Consolas, monospace;');
  });

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

  it('mantém o modo avançado organizado sem margens negativas', () => {
    expect(stylesheet).toContain('.advanced-customizations-content { display: grid; gap: 24px; min-width: 0; padding-top: 24px;');
    expect(stylesheet).toContain('.technical-customization-section { display: grid; gap: 10px; min-width: 0;');
    expect(stylesheet).toContain('.customization-list { display: grid; gap: 10px;');
    expect(stylesheet).not.toMatch(/\.customization-(?:summary-list|list)\s*\{[^}]*margin-top:\s*-/);
  });
});
