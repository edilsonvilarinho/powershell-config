import { useState } from 'react';

export function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`status ${ok ? 'ok' : 'error'}`}><span aria-hidden="true">●</span>{children}</span>;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

/** Toggle com terceiro estado "herdar" (`value === null`), usado nos campos que em `profiles.list`
 * são overrides opcionais de `profiles.defaults`. Em `AppSettings['terminal']` (Padrões) o campo
 * correspondente nunca é nulo, então lá o app usa `Toggle` normal em vez deste. */
export function NullableToggle({ value, onChange, label, description }: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row nullable-toggle-row">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <select value={value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')}>
        <option value="">Herdado de Padrões</option>
        <option value="true">Ativado</option>
        <option value="false">Desativado</option>
      </select>
    </label>
  );
}

export function Field({ label, children, hint, onReset }: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  /** Quando definido, mostra o botão "↺ Herdar de Padrões" ao lado do rótulo (só faz sentido em
   * campos de perfil que são overrides opcionais de `profiles.defaults`). */
  onReset?: { disabled: boolean; onClick: () => void };
}) {
  return (
    <label className="field">
      <span>
        {label}
        {onReset && (
          <button
            type="button"
            className="secondary compact field-reset"
            disabled={onReset.disabled}
            aria-label={`Herdar ${label.toLowerCase()} de Padrões`}
            onClick={(event) => { event.preventDefault(); onReset.onClick(); }}
          >↺</button>
        )}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ColorOverrideField({ label, hint, value, fallback, onChange }: {
  label: string;
  hint: string;
  value: string | null;
  fallback: string | null;
  onChange: (value: string | null) => void;
}) {
  const effective = value ?? fallback ?? '#000000';
  return (
    <div className="color-override">
      <div className="color-override-label"><strong>{label}</strong><small>{hint}</small></div>
      <div className="color-override-controls">
        <input type="color" value={effective} onChange={(event) => onChange(event.target.value)} />
        <input
          type="text"
          className="color-hex"
          value={value ?? ''}
          placeholder={fallback ?? 'Herdado do esquema'}
          maxLength={7}
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
        <button
          type="button"
          className="secondary compact"
          disabled={value === null}
          aria-label={`Restaurar ${label.toLowerCase()} para o padrão do esquema`}
          onClick={() => onChange(null)}
        >↺</button>
      </div>
    </div>
  );
}

export function TerminalPreview({ fontFace, fontSize, foreground, background, selectionBackground }: {
  fontFace: string;
  fontSize: number;
  foreground: string | null;
  background: string | null;
  selectionBackground: string | null;
}) {
  return (
    <div
      className="terminal-preview"
      style={{ background: background ?? '#0c0c0c', color: foreground ?? '#cccccc', fontFamily: fontFace, fontSize: `${fontSize}px` }}
    >
      <div>Windows Terminal</div>
      <div>C:\&gt; git status</div>
      <div>On branch <span className="terminal-preview-selection" style={{ background: selectionBackground ?? '#264f78' }}>master</span></div>
    </div>
  );
}

export function TagValueListEditor({ label, hint, entries, onChange }: {
  label: string;
  hint: string;
  entries: Array<{ tag: string; value: number }>;
  onChange: (entries: Array<{ tag: string; value: number }>) => void;
}) {
  return (
    <div className="tag-value-editor">
      <div className="tag-value-editor-header"><strong>{label}</strong><small>{hint}</small></div>
      {entries.map((entry, index) => (
        <div className="tag-value-row" key={index}>
          <input
            maxLength={4}
            value={entry.tag}
            placeholder="wght"
            onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, tag: event.target.value } : item))}
          />
          <input
            type="number"
            value={entry.value}
            onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item))}
          />
          <button type="button" className="secondary compact" onClick={() => onChange(entries.filter((_, i) => i !== index))}>Remover</button>
        </div>
      ))}
      <button type="button" className="secondary compact" onClick={() => onChange([...entries, { tag: '', value: 0 }])}>Adicionar</button>
    </div>
  );
}

export function CollapsiblePanel({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`collapsible-panel ${open ? 'expanded' : ''}`}>
      <button type="button" className="collapsible-header" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <span><strong>{title}</strong><small>{hint}</small></span>
        <i aria-hidden="true">{open ? '▲' : '▼'}</i>
      </button>
      {open && <div className="collapsible-body" id={id}>{children}</div>}
    </div>
  );
}
