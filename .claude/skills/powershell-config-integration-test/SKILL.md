---
name: powershell-config-integration-test
description: Dispara e acompanha o workflow "Integration Test" no GitHub Actions do repositorio powershell-config, que instala/atualiza/desinstala o instalador Windows de verdade contra o $PROFILE e o Windows Terminal reais do runner. Usar quando o usuario pedir para rodar, disparar ou verificar o teste de integracao fim-a-fim.
---

# PowerShell Config Integration Test

Dispara o workflow `.github/workflows/integration-test.yml` (`workflow_dispatch`), separado do
`release-windows.yml` — nao publica release, nao assina, nao depende de tag. Builda um instalador
x64 descartavel (versao `0.0.0`) e roda `installer/scripts/Test-Integration.ps1` fim-a-fim: install
silencioso real -> app desktop real -> upgrade sobre a ultima release publicada (se existir) ->
uninstall com rollback -> cleanup.

## Fluxo

1. Confirmar que `master` (ou o branch atual) esta com o workflow `integration-test.yml` publicado no
   remoto — `gh workflow run` so funciona com o arquivo presente no branch default ou passado via `--ref`.
2. Disparar:

```bash
gh workflow run integration-test.yml --ref master
```

Para pular a fase de upgrade (sem baixar a ultima release publicada):

```bash
gh workflow run integration-test.yml --ref master -f skip_upgrade=true
```

3. Localizar a run recem-criada e acompanhar ate o fim:

```bash
gh run list --workflow=integration-test.yml --limit 1
gh run watch <run-id> --exit-status
```

4. Se falhar, buscar o log da fase especifica (`FASE 1..4` ou `INTEGRATION_FAIL:` no output do step
   "Run end-to-end integration test"):

```bash
gh run view <run-id> --log-failed
```

5. Relatar ao usuario: FASE que falhou (ou `INTEGRATION_OK` com total de verificacoes), link da run.

## Guardrails

- Nao editar `release-windows.yml` para adicionar `workflow_dispatch` — `Test-PowerShellConfig.ps1`
  garante propositalmente que aquele workflow so dispara por tag `v*`; use sempre este workflow
  separado para testes sob demanda.
- Nao apagar releases nem tags para "limpar" o teste.
- Job roda contra `$LOCALAPPDATA`/`$PROFILE` reais do runner efemero do GitHub Actions — nunca rodar
  este workflow apontando para um runner self-hosted persistente sem revisar `Test-Integration.ps1`
  primeiro (ele remove `%LOCALAPPDATA%\PowerShellConfig` e o bloco gerenciado do `$PROFILE` no `finally`).
