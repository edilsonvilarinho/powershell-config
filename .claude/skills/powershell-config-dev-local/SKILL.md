---
name: powershell-config-dev-local
description: Sobe e derruba o app Electron do powershell-config em modo dev local (npm run dev), isolado do install real via POWERSHELL_CONFIG_ROOT. Usar quando o usuario pedir para subir/testar localmente, abrir a janela do app pra ver uma mudanca, ou parar o dev server.
---

# PowerShell Config - Dev Local

Sobe `desktop/` em modo dev (vite + tsc --watch + electron) numa raiz isolada
em `%LOCALAPPDATA%\PowerShellConfigDev`, seedada uma unica vez a partir de
`powershell/settings.default.json` e `powershell/takuya.omp.json` (mesmo padrao
de `desktop/scripts/smoke-packaged.ps1`). Nunca toca o install real em
`%LOCALAPPDATA%\PowerShellConfig`.

## Subir

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.claude\skills\powershell-config-dev-local\scripts\Start-DevServer.ps1
```

- Roda em background (processo destacado); a janela do Electron aparece sozinha
  depois do build inicial (poucos segundos).
- PID do processo raiz fica em `%LOCALAPPDATA%\PowerShellConfigDev\dev-server.pid`;
  log combinado (vite + tsc + electron) em `dev-server.log` na mesma pasta.
- Rodar de novo com o server ja no ar nao duplica processo: o script detecta o
  PID vivo e avisa.
- A raiz de dev persiste entre execucoes (settings/tema/perfis ficam salvos),
  pra nao perder estado a cada teste. Pra resetar do zero, apagar
  `%LOCALAPPDATA%\PowerShellConfigDev` antes de subir de novo.

## Parar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.claude\skills\powershell-config-dev-local\scripts\Stop-DevServer.ps1
```

Mata a arvore inteira (`taskkill /T /F` no PID raiz: cmd -> npm -> concurrently
-> vite/tsc/electron) e limpa o PID file. Fallback cata qualquer `electron.exe`
orfao cuja linha de comando aponte pro `dist/main/main/main.js` do dev.

## Guardrails

- Nunca definir `POWERSHELL_CONFIG_ROOT` apontando pro install real do usuario.
- Nao editar `%LOCALAPPDATA%\PowerShellConfigDev` a mao fora dos scripts; se
  precisar resetar, apagar a pasta inteira e deixar o Start recriar.
- Se `Start-DevServer.ps1` disser que ja esta rodando mas a janela nao aparece,
  parar com `Stop-DevServer.ps1` e checar `dev-server.log` antes de subir de novo.
