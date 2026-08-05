export const ipcChannels = {
  bootstrap: 'powershell-config:bootstrap',
  previewTheme: 'powershell-config:preview-theme',
  importTheme: 'powershell-config:import-theme',
  validateCustomizations: 'powershell-config:validate-customizations',
  applySettings: 'powershell-config:apply-settings',
  restoreDefaults: 'powershell-config:restore-defaults',
  restoreLatestBackup: 'powershell-config:restore-latest-backup',
  openTerminal: 'powershell-config:open-terminal',
  openLogs: 'powershell-config:open-logs',
  quit: 'powershell-config:quit',
} as const;
