import type { TerminalProfileChoice, TerminalProfileConfig, TerminalStartupConfig } from '../shared/settings';
import { Field, NullableToggle } from './ui';

const NOT_MANAGED = 'Não gerenciado pelo app';

/** Opções do combo "Perfil padrão": os perfis já presentes no settings.json do Windows Terminal
 * (nativos, dinâmicos e do fragmento gerenciado) mais os perfis criados na sub-aba Perfis que ainda
 * não foram aplicados. O valor gravado é o GUID, aceito pelo Windows Terminal em `defaultProfile`. */
function profileOptions(choices: readonly TerminalProfileChoice[], drafts: readonly TerminalProfileConfig[]): Array<{ guid: string; name: string }> {
  const byGuid = new Map<string, { guid: string; name: string }>();
  for (const choice of choices) {
    if (!choice.hidden) byGuid.set(choice.guid.toLowerCase(), { guid: choice.guid, name: choice.name });
  }
  for (const draft of drafts) {
    if (!draft.hidden) byGuid.set(draft.guid.toLowerCase(), { guid: draft.guid, name: draft.name });
  }
  return [...byGuid.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** Rótulo do valor atual quando ele não corresponde a nenhum perfil conhecido - `defaultProfile`
 * também aceita nome, e o valor pode ter vindo de uma configuração importada. */
function unknownProfileLabel(value: string): string {
  return `${value} (perfil não encontrado)`;
}

function numberValue(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}

/** Sub-aba "Inicialização": chaves de raiz do settings.json do Windows Terminal (irmãs de `profiles`).
 * "Não gerenciado" (`null`) significa que o app não escreve a chave. Se o app já a gravava e o campo
 * volta a "Não gerenciado", a chave é removida na próxima aplicação; valores definidos fora do app
 * nunca são apagados. */
export function TerminalStartupSection({ startup, onChange, profileChoices, draftProfiles }: {
  startup: TerminalStartupConfig;
  onChange: (startup: TerminalStartupConfig) => void;
  profileChoices: readonly TerminalProfileChoice[];
  draftProfiles: readonly TerminalProfileConfig[];
}) {
  const set = <K extends keyof TerminalStartupConfig>(key: K, value: TerminalStartupConfig[K]): void => {
    onChange({ ...startup, [key]: value });
  };
  const options = profileOptions(profileChoices, draftProfiles);
  const currentIsKnown = startup.defaultProfile === null
    || options.some((option) => option.guid.toLowerCase() === startup.defaultProfile?.toLowerCase());

  return (
    <>
      <article className="panel form-panel">
        <h2>Perfil padrão</h2>
        <div className="form-grid terminal-fields">
          <Field label="Perfil aberto pelo botão '+'" hint="Também vale para novas guias sem perfil informado.">
            <select value={startup.defaultProfile ?? ''} onChange={(event) => set('defaultProfile', event.target.value || null)}>
              <option value="">{NOT_MANAGED}</option>
              {!currentIsKnown && startup.defaultProfile !== null && (
                <option value={startup.defaultProfile}>{unknownProfileLabel(startup.defaultProfile)}</option>
              )}
              {options.map((option) => <option key={option.guid} value={option.guid}>{option.name}</option>)}
            </select>
          </Field>
        </div>
        <small className="readonly-value">
          Campos em "{NOT_MANAGED}" não são escritos no settings.json do Windows Terminal. O aplicativo
          de terminal padrão do Windows é definido pelo instalador, não por esta tela.
        </small>
      </article>

      <article className="panel form-panel">
        <h2>Sessão</h2>
        <NullableToggle
          value={startup.startOnUserLogin}
          onChange={(value) => set('startOnUserLogin', value)}
          label="Iniciar na inicialização da máquina"
          description="Abre o Windows Terminal automaticamente no login do Windows."
          emptyLabel={NOT_MANAGED}
        />
        <div className="form-grid terminal-fields">
          <Field label="Quando o Terminal começa" hint="O que aparece quando o primeiro terminal é criado.">
            <select value={startup.firstWindowPreference ?? ''} onChange={(event) => set('firstWindowPreference', (event.target.value || null) as TerminalStartupConfig['firstWindowPreference'])}>
              <option value="">{NOT_MANAGED}</option>
              <option value="defaultProfile">Abrir uma guia com o perfil padrão</option>
              <option value="persistedWindowLayout">Restaurar as janelas da sessão anterior</option>
            </select>
          </Field>
          <Field label="Comportamento ao criar nova instância" hint="Como novas instâncias se anexam às janelas existentes.">
            <select value={startup.windowingBehavior ?? ''} onChange={(event) => set('windowingBehavior', (event.target.value || null) as TerminalStartupConfig['windowingBehavior'])}>
              <option value="">{NOT_MANAGED}</option>
              <option value="useNew">Criar uma nova janela</option>
              <option value="useExisting">Anexar à janela mais recente da área de trabalho atual</option>
              <option value="useAnyExisting">Anexar à janela mais recente, em qualquer área de trabalho</option>
            </select>
          </Field>
        </div>
      </article>

      <article className="panel form-panel">
        <h2>Janela</h2>
        <div className="form-grid terminal-fields">
          <Field label="Parâmetros de inicialização" hint="Modo da janela na abertura.">
            <select value={startup.launchMode ?? ''} onChange={(event) => set('launchMode', (event.target.value || null) as TerminalStartupConfig['launchMode'])}>
              <option value="">{NOT_MANAGED}</option>
              <option value="default">Padrão, permitir que o Windows decida</option>
              <option value="maximized">Maximizada</option>
              <option value="fullscreen">Tela cheia</option>
              <option value="focus">Modo foco</option>
              <option value="maximizedFocus">Maximizada em modo foco</option>
            </select>
          </Field>
          <Field label="Posição inicial" hint='Pixels do canto superior esquerdo, no formato "x,y". Ignorado quando maximizada.'>
            <input
              type="text"
              value={startup.initialPosition ?? ''}
              placeholder={NOT_MANAGED}
              maxLength={24}
              onChange={(event) => set('initialPosition', event.target.value.trim() || null)}
            />
          </Field>
          <Field label="Colunas na inicialização" hint="Ignorado quando a janela abre maximizada.">
            <input
              type="number"
              min={1}
              max={999}
              value={startup.initialCols ?? ''}
              placeholder={NOT_MANAGED}
              onChange={(event) => set('initialCols', numberValue(event.target.value, 1, 999))}
            />
          </Field>
          <Field label="Linhas na inicialização" hint="Ignorado quando a janela abre maximizada.">
            <input
              type="number"
              min={1}
              max={999}
              value={startup.initialRows ?? ''}
              placeholder={NOT_MANAGED}
              onChange={(event) => set('initialRows', numberValue(event.target.value, 1, 999))}
            />
          </Field>
        </div>
        <NullableToggle
          value={startup.centerOnLaunch}
          onChange={(value) => set('centerOnLaunch', value)}
          label="Centralizar na abertura"
          description="Centraliza a janela no monitor indicado pela posição inicial."
          emptyLabel={NOT_MANAGED}
        />
      </article>

      <article className="panel form-panel">
        <h2>Idioma</h2>
        <div className="form-grid terminal-fields">
          <Field label="Idioma da interface do Terminal" hint='Tag BCP-47, como "pt-BR" ou "en-US". Requer reiniciar o Windows Terminal.'>
            <input
              type="text"
              value={startup.language ?? ''}
              placeholder={NOT_MANAGED}
              maxLength={35}
              onChange={(event) => set('language', event.target.value.trim() || null)}
            />
          </Field>
        </div>
      </article>
    </>
  );
}
