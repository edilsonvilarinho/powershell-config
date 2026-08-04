# PowerShell Config

Instalador Windows para preparar PowerShell 7, Windows Terminal, Oh My Posh, Git, Neovim, fontes e modulos usados pelo perfil deste repositorio.

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

Os modulos antigos em `config-powershell/Modules` sao legado do processo manual e nao entram no instalador.

## Instalacao

1. Baixe `PowerShellConfig-Setup-X.Y.Z.exe` e o arquivo `.sha256` da release.
2. Confira o SHA-256 antes de executar.
3. Feche todas as janelas do Windows Terminal.
4. Execute o instalador.
5. Ao finalizar, abra o Windows Terminal pelo instalador ou pelo menu Iniciar.

O primeiro PowerShell 7 mostra `Show-TerminalHelp` uma vez. Nas proximas aberturas, o prompt inicia sem limpar a tela e sem repetir a ajuda.

Por decisao de configuracao deste projeto, `profiles.defaults.elevate` fica habilitado. Toda abertura de perfil solicita elevacao por UAC e abas elevadas e nao elevadas nao podem compartilhar a mesma janela.

### Instalacao silenciosa

```powershell
.\PowerShellConfig-Setup-X.Y.Z.exe /S
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
```

Os testes cobrem sintaxe PowerShell, assets, versionamento, bloco gerenciado, merge, idempotencia, conflito e rollback do Windows Terminal.

### Build local do EXE

Requer NSIS instalado:

```powershell
choco install nsis -y
New-Item -ItemType Directory -Path .\dist -Force | Out-Null
Push-Location .\installer
& 'C:\Program Files (x86)\NSIS\makensis.exe' .\PowerShellConfig.nsi
Pop-Location
```

Saida esperada:

```text
dist\PowerShellConfig-Setup-0.1.0.exe
```

## Release automatica

A versao unica do instalador fica em `installer/version.nsh`.

Tags `v*` disparam `.github/workflows/release-windows.yml`, que usa `windows-latest`, compila o NSIS e publica somente:

- `PowerShellConfig-Setup-X.Y.Z.exe`
- `PowerShellConfig-Setup-X.Y.Z.exe.sha256`

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

A primeira release oficial deve usar `major`, promovendo `0.1.0` para `v1.0.0`.

## Assinatura futura

Sem certificado configurado, o EXE e publicado sem assinatura e pode gerar alerta do SmartScreen. O workflow ja possui etapa condicional para:

- secret `WINDOWS_CERTIFICATE_BASE64`;
- secret `WINDOWS_CERTIFICATE_PASSWORD`;
- variable opcional `WINDOWS_TIMESTAMP_URL`.

O SHA-256 e gerado depois da assinatura.

## Limites de validacao

O GitHub Actions valida fontes, scripts, testes e compilacao NSIS. O aceite real do instalador ainda exige VM limpa para:

- Windows 10 22H2 x64;
- Windows 11 x64;
- Windows 11 ARM64.

Falhas de WinGet, proxy, UAC, GPO e configuracao JSON invalida precisam ser exercitadas nessas VMs antes da primeira release publica.
