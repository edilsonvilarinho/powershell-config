import path from 'node:path';
import type {
  AppSettings,
  CustomizationCodeInput,
  CustomizationValidationIssue,
  CustomizationValidationResult,
  NativeAliasInfo,
} from '../../shared/settings.js';
import { execFileSafe, resolveWindowsExecutable } from './processService.js';

function powershellExecutable(): string {
  return resolveWindowsExecutable('pwsh.exe', [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe') : null,
  ]);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export async function listNativeAliases(): Promise<NativeAliasInfo[]> {
  const script = [
    'Get-Alias',
    '| Sort-Object Name',
    '| Select-Object Name, Definition',
    '| ConvertTo-Json -Compress -AsArray',
  ].join(' ');
  const result = await execFileSafe(
    powershellExecutable(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    10_000,
  );
  const parsed: unknown = result.stdout ? JSON.parse(result.stdout) : [];
  return asArray(parsed).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.Name !== 'string' || typeof record.Definition !== 'string') return [];
    return [{ name: record.Name, definition: record.Definition }];
  });
}

export function findNativeAliasCollisions(
  settings: Pick<AppSettings, 'customizations'>,
  nativeAliases: NativeAliasInfo[],
): CustomizationValidationIssue[] {
  const nativeByName = new Map(nativeAliases.map((entry) => [entry.name.toLowerCase(), entry]));
  return [...settings.customizations.aliases, ...settings.customizations.functions].flatMap((entry) => {
    const collision = nativeByName.get(entry.name.trim().toLowerCase());
    if (!collision) return [];
    return [{
      id: entry.id,
      field: 'name' as const,
      message: `"${entry.name}" já é um alias nativo de "${collision.definition}". Escolha outro nome.`,
    }];
  });
}

export async function validateCustomizationCode(
  items: CustomizationCodeInput[],
): Promise<CustomizationValidationResult> {
  if (!items.length) return { issues: [] };
  const payload = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  const script = [
    "$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:POWERSHELL_CONFIG_VALIDATION_PAYLOAD))",
    '$items = @($json | ConvertFrom-Json)',
    '$result = foreach ($item in $items) {',
    "  $source = if ($item.kind -eq 'function') { \"function global:$($item.name) {`n$($item.code)`n}\" } else { [string]$item.code }",
    '  $tokens = $null',
    '  $errors = $null',
    '  [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null',
    '  foreach ($parseError in @($errors)) {',
    "    $line = [Math]::Max(1, $parseError.Extent.StartLineNumber - $(if ($item.kind -eq 'function') { 1 } else { 0 }))",
    '    [pscustomobject]@{',
    '      id = [string]$item.id',
    "      field = $(if ($item.kind -eq 'function') { 'body' } else { 'code' })",
    '      message = [string]$parseError.Message',
    '      line = $line',
    '      column = [Math]::Max(1, $parseError.Extent.StartColumnNumber)',
    '    }',
    '  }',
    '}',
    '@($result) | ConvertTo-Json -Compress -AsArray',
  ].join('\n');
  const result = await execFileSafe(
    powershellExecutable(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    15_000,
    { ...process.env, POWERSHELL_CONFIG_VALIDATION_PAYLOAD: payload },
  );
  const parsed: unknown = result.stdout ? JSON.parse(result.stdout) : [];
  const issues = asArray(parsed).flatMap<CustomizationValidationIssue>((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.message !== 'string') return [];
    const field = record.field;
    if (field !== 'body' && field !== 'code') return [];
    return [{
      id: record.id,
      field,
      message: record.message,
      ...(typeof record.line === 'number' ? { line: record.line } : {}),
      ...(typeof record.column === 'number' ? { column: record.column } : {}),
    }];
  });
  return { issues };
}
