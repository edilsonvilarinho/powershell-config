# PowerShell Config

Instalador Windows para preparar PowerShell 7, Windows Terminal, Oh My Posh, Git, Neovim, fontes e modulos usados pelo perfil deste repositorio. O mesmo Setup instala o aplicativo Electron `PowerShell Config`, que oferece uma camada visual segura para administrar essas opcoes.

O processo oficial e o instalador NSIS publicado em [GitHub Releases](https://github.com/edilsonvilarinho/powershell-config/releases). As instrucoes manuais antigas e a substituicao integral do `settings.json` nao fazem mais parte do fluxo suportado.

## Sistemas suportados

- Windows 10 22H2 build 19045 ou superior.
- Windows 11.
- Arquiteturas x64 e ARM64.
- Internet e WinGet, distribuido pelo App Installer do Windows.

O instalador e por usuario e grava os arquivos gerenciados em `%LOCALAPPDATA%\PowerShellConfig`.

## O que e instalado

Pacotes stable instalados ou atualizados pelo WinGet:

- `Microsoft.WindowsTerminal` — [Microsoft Store](https://apps.microsoft.com/detail/9N0DX20HK701?hl=pt-br&gl=BR&ocid=pdpshare)
- `Microsoft.PowerShell`
- `JanDeDobbeleer.OhMyPosh`
- `Git.Git`
- `Neovim.Neovim`

Modulos instalados no escopo do usuario pela PSGallery:

- `posh-git`
- `Terminal-Icons`
- `PSReadLine`

Tambem sao instaladas as quatro variantes Windows Compatible da fonte `Hack NF` usadas pelo tema.

O aplicativo desktop e instalado em `%LOCALAPPDATA%\PowerShellConfig\app`, permanece disponivel na bandeja e inicia oculto com o Windows. Fechar a janela apenas a oculta; a opcao `Sair` encerra o processo.

Os modulos antigos em `config-powershell/Modules` sao legado do processo manual e nao entram no instalador.

## Instalacao

1. Baixe o instalador da sua arquitetura e o `.sha256` correspondente:
   - `PowerShellConfig-Setup-X.Y.Z-win-x64.exe`
   - `PowerShellConfig-Setup-X.Y.Z-win-arm64.exe`
2. Confira o SHA-256 antes de executar.
3. Feche todas as janelas do Windows Terminal.
4. Execute o instalador.
5. Ao finalizar, abra o PowerShell Config pelo instalador ou pelo menu Iniciar.

O primeiro PowerShell 7 mostra `Show-TerminalHelp` uma vez. Nas proximas aberturas, o prompt inicia sem limpar a tela e sem repetir a ajuda.

Por decisao de configuracao deste projeto, `profiles.defaults.elevate` fica habilitado. Toda abertura de perfil solicita elevacao por UAC e abas elevadas e nao elevadas nao podem compartilhar a mesma janela.

### Instalacao silenciosa

```powershell
.\PowerShellConfig-Setup-X.Y.Z-win-x64.exe /S
```

O log operacional fica em:

```text
%LOCALAPPDATA%\PowerShellConfig-install.log
```

## Preservacao e rollback

O instalador:

- adiciona um bloco marcado ao perfil PowerShell existente;
- faz backup do `settings.json` do Windows Terminal;
- mescla somente as propriedades administradas;
- registra configuracao anterior do terminal padrao, fontes e politica de execucao;
- nao instala dependencias durante a abertura do shell;
- nao persiste `Bypass`; usa `RemoteSigned` apenas quando necessario e sem sobrescrever GPO.

A desinstalacao remove somente o que pertence ao projeto. PowerShell, Windows Terminal, Git, Neovim, Oh My Posh e modulos nao sao removidos nem rebaixados.

Se o usuario alterar uma propriedade depois da instalacao, o rollback preserva a alteracao em vez de sobrescreve-la.

As alteracoes feitas pelo aplicativo usam revisao por hash, backup datado e gravacao atomica. Se o perfil, o estado do instalador ou o `settings.json` do Windows Terminal mudar externamente durante a edicao, o aplicativo interrompe a aplicacao e exige recarregamento.

## Aplicativo desktop

O aplicativo possui cinco areas:

- `Visao geral`: versoes e integridade do ambiente.
- `Temas Oh My Posh`: catalogo local, favoritos, busca, preview gerado pelo executavel oficial e importacao validada de `.omp.json`.
- `Perfil PowerShell`: Oh My Posh, `posh-git`, Terminal-Icons, PSReadLine, aliases conhecidos e ajuda inicial.
- `Windows Terminal`: esquema, fonte, tamanho, opacidade, acrilico e elevacao, preservando JSONC e propriedades externas.
- `Configuracoes`: tema claro/escuro baseado no OpenCode, inicializacao com Windows, logs e restauracao dos padroes.

O renderer nao possui acesso direto a Node.js, filesystem, registro ou processos. Operacoes privilegiadas passam por IPC validado no preload com `contextIsolation`, sandbox e `nodeIntegration: false`. Nao ha telemetria nem carregamento de paginas remotas dentro do Electron.

## Perfil distribuido

Comandos principais:

- `g`: Git
- `vim`: Neovim
- `grep`: `findstr`
- `tig` e `less`: ferramentas do Git for Windows
- `ls`, `dir`, `ll`: listagem com Terminal-Icons
- `history -c`: limpa historico da sessao e do PSReadLine
- `lastBootUpTime`: tempo desde o ultimo boot
- `which <comando>`: caminho do executavel
- `Show-TerminalHelp`: ajuda do ambiente

Funcoes pessoais de contas Claude e referencias Java desativadas nao fazem parte do perfil distribuido.

## Validacao local

Executar testes sem instalar o ambiente:

```powershell
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\installer\scripts\Test-PowerShellConfig.ps1
Push-Location .\desktop
npm ci
npm test
npm run build
Pop-Location
```

Os testes cobrem sintaxe PowerShell, assets, versionamento, bloco gerenciado, merge, idempotencia, conflito e rollback do Windows Terminal, schema do desktop, JSONC, renderer e gravacao atomica.

Smoke test do renderer empacotado:

```powershell
.\desktop\scripts\smoke-packaged.ps1 `
  -ExecutablePath '.\desktop\dist-build\x64\win-unpacked\PowerShell Config.exe' `
  -RepositoryRoot .
```

### Build local do EXE

Requer Node.js 24, npm e NSIS:

```powershell
choco install nsis -y
npm ci --prefix .\desktop
npm run package:x64 --prefix .\desktop
New-Item -ItemType Directory -Path .\dist -Force | Out-Null
$payload = (Resolve-Path '.\desktop\dist-build\x64\win-unpacked').Path
Push-Location .\installer
& 'C:\Program Files (x86)\NSIS\makensis.exe' `
  '/DPRODUCT_VERSION=1.0.0' `
  '/DTARGET_ARCH=x64' `
  "/DDESKTOP_PAYLOAD_DIR=$payload" `
  .\PowerShellConfig.nsi
Pop-Location
```

Saida esperada:

```text
dist\PowerShellConfig-Setup-1.0.0-win-x64.exe
```

## Release automatica

A versao unica do instalador fica em `installer/version.nsh`.

Tags `v*` disparam `.github/workflows/release-windows.yml`, que usa `windows-latest`, testa e empacota o Electron para x64/ARM64, compila o NSIS e publica somente:

- `PowerShellConfig-Setup-X.Y.Z-win-x64.exe`
- `PowerShellConfig-Setup-X.Y.Z-win-x64.exe.sha256`
- `PowerShellConfig-Setup-X.Y.Z-win-arm64.exe`
- `PowerShellConfig-Setup-X.Y.Z-win-arm64.exe.sha256`

A skill repo-local `powershell-config-release` automatiza bump, testes, commit, tag, push atomico, acompanhamento do Actions e confirmacao dos assets.

Validar uma release sem alterar o repositorio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.codex\skills\powershell-config-release\scripts\release_powershell_config.ps1 -RepoPath C:\Users\edils\workspace\powershell-config -ReleaseType patch -ValidateOnly
```

Publicar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.codex\skills\powershell-config-release\scripts\release_powershell_config.ps1 -RepoPath C:\Users\edils\workspace\powershell-config -ReleaseType patch
```

Tipos aceitos: `patch`, `minor` e `major`.

O tipo solicitado deve refletir o impacto real da proxima entrega: `patch`, `minor` ou `major`.

## Assinatura futura

Sem certificado configurado, o EXE e publicado sem assinatura e pode gerar alerta do SmartScreen. O workflow ja possui etapa condicional para:

- secret `WINDOWS_CERTIFICATE_BASE64`;
- secret `WINDOWS_CERTIFICATE_PASSWORD`;
- variable opcional `WINDOWS_TIMESTAMP_URL`.

O SHA-256 e gerado depois da assinatura.

## Limites de validacao

O GitHub Actions valida fontes, scripts, testes Electron, smoke test do aplicativo x64 empacotado, payloads x64/ARM64 e compilacao NSIS. O aceite real do instalador ainda exige VM limpa para:

- Windows 10 22H2 x64;
- Windows 11 x64;
- Windows 11 ARM64.

Falhas de WinGet, proxy, UAC, GPO e configuracao JSON invalida precisam ser exercitadas nessas VMs antes da primeira release publica.
