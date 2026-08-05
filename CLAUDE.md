# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

Testes do repositório (scripts, NSIS, workflow, perfil, versões) — PowerShell, na raiz:

```powershell
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\installer\scripts\Test-PowerShellConfig.ps1
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\installer\scripts\Test-PowerShellConfig.ps1 -ExpectedVersion 4.0.1
```

Aplicativo Electron (`desktop/`, Node 24):

```powershell
npm ci
npm test                      # vitest run (main + renderer)
npm test -- src/main/services/terminalService.test.ts   # arquivo único
npm test -- -t "nome do teste"                          # teste único por nome
npm run typecheck             # tsconfig.json + tsconfig.main.json
npm run build                 # typecheck + vite build + tsc main
npm run dev                   # vite + tsc --watch + electron
npm run package:x64           # electron-builder --dir em dist-build/x64
```

Smoke test do app empacotado (executa o binário real com raiz temporária):

```powershell
.\desktop\scripts\smoke-packaged.ps1 -ExecutablePath '.\desktop\dist-build\x64\win-unpacked\PowerShell Config.exe' -RepositoryRoot .
```

Release (somente com pedido explícito; publica por tag `v*`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.codex\skills\powershell-config-release\scripts\release_powershell_config.ps1 -RepoPath <repo> -ReleaseType patch -ValidateOnly
```

O NSIS local exige `makensis.exe`; o instalador só é montado no workflow `.github/workflows/release-windows.yml`.

## Arquitetura

Três camadas cooperam sobre o mesmo diretório de instalação `%LOCALAPPDATA%\PowerShellConfig`:

1. **`installer/`** — NSIS (`PowerShellConfig.nsi`) + scripts PowerShell 5.1/7. Instala dependências via WinGet, mescla o `settings.json` do Windows Terminal, instala fontes, insere o bloco gerenciado no `$PROFILE` e grava `state/install-state.json`.
2. **`powershell/`** — payload distribuído: `user_profile.ps1` (vira `profile.ps1` na raiz de instalação), `takuya.omp.json`, `settings.default.json` e as 4 fontes Hack NF. O `$PROFILE` do usuário só recebe um bloco delimitado por `# >>> powershell-config >>>` / `# <<< powershell-config <<<` que faz dot-source de `profile.ps1`.
3. **`desktop/`** — app Electron (main + preload + renderer React) que edita a configuração já instalada.

Layout em tempo de execução: `app/` (payload Electron), `config/` (settings.json, user-state.json, custom-profile.ps1, themes/), `state/install-state.json`, `backups/`, `logs/`, `fonts/`.

### install-state.json é o contrato entre camadas

Escrito pelo instalador, lido pelo app (`paths.ts` resolve `Profile.Path`; `terminalService.ts` resolve `TerminalFragment.Path`) e consumido pelo desinstalador para reverter só o que é gerenciado (perfil, settings do Terminal, fragmento, terminal padrão, execution policy, fontes — cada item com hash pós-instalação; se o hash divergir, a reversão é ignorada). Alterar o formato quebra as três camadas ao mesmo tempo.

### Concorrência otimista por `revision`

`ApplicationService.revision()` é o SHA-256 concatenado de settings, user-state, settings do Terminal, fragmento, tema ativo, install-state, `$PROFILE`, `profile.ps1` e `custom-profile.ps1`. Toda mutação exposta por IPC exige `expectedRevision` e falha se algo mudou fora do app. Novo caminho de arquivo gerenciado deve entrar em `revision()`, senão edições externas passam despercebidas.

### Pipeline de aplicação (`applicationService.ts`)

Validar tudo antes de escrever qualquer coisa: schema Zod → colisão com aliases nativos (`Get-Alias` via pwsh) → parse de sintaxe PowerShell das customizações (`Parser::ParseInput`) → esquema de cores existente → render de prévia do tema → parse do `profile.ps1` e do `custom-profile.ps1` gerado. Só então: snapshot dos alvos em `backups/desktop/<timestamp>/`, `writeAtomic` em cada arquivo, e `restore()` de todos os snapshots se qualquer escrita falhar. `restoreLatestBackup` e a importação portátil reusam esse mesmo pipeline.

### Windows Terminal: edição cirúrgica, nunca reescrita

`terminalService.ts` usa `jsonc-parser` (`modify` + `applyEdits`) para alterar apenas as chaves em `profiles.defaults`, preservando comentários, vírgulas finais e propriedades de terceiros. O instalador faz o equivalente em PowerShell (`Merge-TerminalSettings` em `Common.ps1`), com snapshot por propriedade para rollback seletivo. Nunca serializar o arquivo inteiro a partir de um objeto.

### Customizações do usuário

O app gera `config/custom-profile.ps1` (`customProfileService.ts`) com funções, aliases e comandos, mais o array `$global:PowerShellConfigCustomHelpEntries` (`Kind` = `Alias` | `Function` | `Startup`) que alimenta `Show-TerminalHelp`. É código PowerShell do usuário executado na sessão — a validação é só de sintaxe, não sandbox. O perfil só carrega esse arquivo por caminho fixo (`Join-Path $PSScriptRoot 'config\custom-profile.ps1'`), verificado por assert em `Test-PowerShellConfig.ps1`.

### Ajuda do terminal é montada, não escrita

`user_profile.ps1` não tem texto de ajuda fixo: cada comando chama `Add-PowerShellConfigHelpEntry` **dentro do mesmo `if` que o define**, então `Show-TerminalHelp` descreve exatamente o que existe na sessão (respeita `settings.aliases.*` e a ausência de `git`/`nvim`/`tig`/`less`). `help` sem argumentos exibe essa ajuda; com argumentos delega ao `ScriptBlock` do `help` nativo capturado antes da sobrescrita. Ao adicionar um comando padrão ao perfil, registre a entrada junto — `Test-PowerShellConfig.ps1` cobra isso por alias. `desktop/src/shared/help.ts` espelha esse catálogo apenas para a prévia na UI e é aproximação declarada (o app não sabe quais binários existem na máquina).

### Schema de settings

`schemaVersion` atual é 3. Mudança de schema toca três arquivos que precisam ficar coerentes:
- `desktop/src/shared/settings.ts` (Zod + `defaultSettings` + `migrateSettings`);
- `powershell/settings.default.json` (payload do instalador);
- `powershell/user_profile.ps1` (lista `schemaVersion -notin @(1, 2, 3)`).

`Test-PowerShellConfig.ps1` valida essas três pontas por texto e por conteúdo.

### IPC e superfície do renderer

Canais em `desktop/src/shared/ipc.ts`; `preload.cts` **duplica os literais** (não importa o módulo) — adicionar canal exige editar `shared/ipc.ts`, `preload.cts`, `main/ipc.ts` e a interface `DesktopApi`. `main/ipc.ts` valida tipo e tamanho de todo payload antes de chamar o serviço. A janela roda com `contextIsolation`, `sandbox`, sem `nodeIntegration`, com `will-navigate` e `setWindowOpenHandler` bloqueados.

Processos externos (`pwsh`, `oh-my-posh`, `wt`) sempre por `execFileSafe` (`shell: false`, timeout, `windowsHide`) com o executável resolvido por `resolveWindowsExecutable`; argumentos variáveis nunca entram em string de comando — payloads grandes vão por variável de ambiente.

### Instalação nova vs. upgrade

`.onInit` do NSIS define `$IsUpgrade` detectando somente `state\install-state.json` — nunca `app\`/`config\` isolados, pois esses resíduos sobrevivem ao rollback de uma instalação nova que falhou (`Uninstall-PowerShellConfig.ps1 -RollbackOnly` sempre apaga `install-state.json`, mas não toca `app/`/`config/`); tratar esse resíduo como upgrade pularia toda a configuração de Terminal/perfil/cor numa reinstalação. Em upgrade real: extrai o novo app em `app.update`, troca por `Rename` (`app` → `app.previous` → swap, com rollback), e **pula** preflight do Windows Terminal, fontes, WinGet, perfil, Terminal e startup. `config/`, `state/` e `backups/` nunca são removidos por upgrade. Falha de configuração em upgrade não dispara rollback integral (`Configure-PowerShellConfig.ps1`). Rollback de instalação nova (`-RollbackOnly`) remove `config/settings.json` e `config/themes/active.omp.json` se ainda intocados desde a instalação (`ManagedConfig` no estado + `Remove-ManagedFileIfPristine` em `Common.ps1`), para não deixar o app com um `colorScheme` órfão.

### Test-PowerShellConfig.ps1 é teste de contrato textual

Além de exercitar funções de `Common.ps1`, ele faz assert sobre o **texto** de `PowerShellConfig.nsi`, `Install-`/`Configure-PowerShellConfig.ps1`, `user_profile.ps1`, `settings.default.json` e do workflow, e exige `installer/version.nsh` == `desktop/package.json` version. Editar qualquer um desses arquivos costuma exigir atualizar o assert correspondente — não relaxe o assert sem entender a invariante que ele protege.

## Convenções

- Variáveis de ambiente para testar sem instalar: `POWERSHELL_CONFIG_ROOT`, `POWERSHELL_CONFIG_TERMINAL_SETTINGS`, `POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC`, `POWERSHELL_CONFIG_SMOKE_RESULT`.
- Toda escrita de arquivo gerenciado usa `writeAtomic` (tmp + rename) no app e `Write-Utf8NoBomFile`/`Save-JsonFile` no instalador; UTF-8 sem BOM em ambos.
- Mensagens do NSIS e dos scripts do instalador são ASCII sem acento (evita mojibake no console/log); código TypeScript e o texto do app usam pt-BR acentuado.
- `desktop/dist/`, `dist-build/`, `dist/` e logs são gerados; `config-powershell/` e `img_/` são material do procedimento manual antigo e não entram no instalador (há assert impedindo os módulos versionados de `config-powershell/Modules` no payload).
