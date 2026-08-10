import type { TerminalProfileChoice, TerminalProfileConfig, TerminalStartupConfig } from '../shared/settings';
import { Field } from './ui';

const NOT_MANAGED = 'Não gerenciado pelo app';

/** Opções do combo "Perfil padrão": os perfis já presentes no settings.json do Windows Terminal
 * (nativos, dinâmicos e do fragmento gerenciado) mais os perfis criados na sub-aba Perfis que ainda
 * não foram aplicados. O valor gravado é o GUID, aceito pelo Windows Terminal em `defaultProfile`.
 * `removedGuids` são os perfis do app apagados no rascunho: eles ainda existem no settings.json do
 * Windows Terminal, mas serão removidos na próxima aplicação, então não podem ser oferecidos. */
function profileOptions(
  choices: readonly TerminalProfileChoice[],
  drafts: readonly TerminalProfileConfig[],
  removedGuids: ReadonlySet<string>,
): Array<{ guid: string; name: string }> {
  const byGuid = new Map<string, { guid: string; name: string }>();
  for (const choice of choices) {
    if (choice.hidden || removedGuids.has(choice.guid.toLowerCase())) continue;
    byGuid.set(choice.guid.toLowerCase(), { guid: choice.guid, name: choice.name });
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

/** Sub-aba "Inicialização". Das chaves de raiz do settings.json do Windows Terminal (irmãs de
 * `profiles`), a tela expõe apenas `defaultProfile`: as demais nunca existem no arquivo antes de o
 * usuário editá-las aqui, e ficavam permanentemente em "Não gerenciado pelo app". Elas continuam no
 * schema e no `TerminalService`, mas `ApplicationService.apply` as força a `null`, de modo que o app
 * não as grava e remove as que tenha gravado antes. */
export function TerminalStartupSection({ startup, onChange, profileChoices, draftProfiles, removedProfileGuids }: {
  startup: TerminalStartupConfig;
  onChange: (startup: TerminalStartupConfig) => void;
  profileChoices: readonly TerminalProfileChoice[];
  draftProfiles: readonly TerminalProfileConfig[];
  removedProfileGuids: ReadonlySet<string>;
}) {
  const options = profileOptions(profileChoices, draftProfiles, removedProfileGuids);
  const currentIsKnown = startup.defaultProfile === null
    || options.some((option) => option.guid.toLowerCase() === startup.defaultProfile?.toLowerCase());

  return (
    <article className="panel form-panel">
      <h2>Perfil padrão</h2>
      <div className="form-grid terminal-fields">
        <Field label="Perfil aberto pelo botão '+'" hint="Também vale para novas guias sem perfil informado.">
          <select value={startup.defaultProfile ?? ''} onChange={(event) => onChange({ ...startup, defaultProfile: event.target.value || null })}>
            <option value="">{NOT_MANAGED}</option>
            {!currentIsKnown && startup.defaultProfile !== null && (
              <option value={startup.defaultProfile}>{unknownProfileLabel(startup.defaultProfile)}</option>
            )}
            {options.map((option) => <option key={option.guid} value={option.guid}>{option.name}</option>)}
          </select>
        </Field>
      </div>
    </article>
  );
}
