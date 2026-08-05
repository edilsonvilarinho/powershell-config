---
name: powershell-config-release
description: Publica uma release patch, minor ou major do instalador Windows do repositorio powershell-config. Usar quando o usuario pedir para versionar, validar, criar tag, disparar o GitHub Actions "Release Windows Installer" e confirmar o EXE e SHA-256 publicados no GitHub Release.
---

# PowerShell Config Release

Publicar somente depois de pedido explicito do usuario.

## Fluxo

1. Ler `README.md`, `installer/version.nsh`, `installer/PowerShellConfig.nsi` e `.github/workflows/release-windows.yml`.
2. Exigir tipo de release `patch`, `minor` ou `major`.
3. Confirmar que `master` esta limpa e alinhada com `origin/master`.
4. Preferir o script deterministico; ele sincroniza `version.nsh`, `desktop/package.json` e `desktop/package-lock.json`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.claude\skills\powershell-config-release\scripts\release_powershell_config.ps1 -RepoPath C:\Users\edils\workspace\powershell-config -ReleaseType patch
```

5. Para validar sem alterar ou publicar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.claude\skills\powershell-config-release\scripts\release_powershell_config.ps1 -RepoPath C:\Users\edils\workspace\powershell-config -ReleaseType patch -ValidateOnly
```

6. Relatar versao, commit, tag, workflow, release e URLs dos quatro assets x64/ARM64.

## Guardrails

- Nao liberar worktree suja.
- Nao criar commit, tag ou push sem autorizacao explicita do usuario nesta conversa.
- Nao criar outra tag se a falha ocorreu depois do push; inspecionar o workflow existente.
- Considerar a release concluida somente com os instaladores `win-x64` e `win-arm64` e seus respectivos `.sha256` publicados.
- Nao alterar configuracao Git global; o script usa `safe.directory` por comando e restaura a identidade local.
