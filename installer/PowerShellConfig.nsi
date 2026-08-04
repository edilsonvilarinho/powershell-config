!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

SetCompressor zlib
Unicode true

!ifndef PRODUCT_VERSION
!include "version.nsh"
!endif

!ifndef TARGET_ARCH
!define TARGET_ARCH "x64"
!endif

!ifndef DESKTOP_PAYLOAD_DIR
!define DESKTOP_PAYLOAD_DIR "..\desktop\dist-build\x64\win-unpacked"
!endif

!define PRODUCT_NAME "PowerShell Config"
!define PRODUCT_PUBLISHER "edilsonvilarinho"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

Var InstallLogPath
Var LatestInstallLogPath
Var InstallSessionId
Var InstallPhaseStart

!macro WriteInstallLog LEVEL STAGE MESSAGE
    Push "[${LEVEL}] [${STAGE}] ${MESSAGE}"
    Call WriteInstallLog
!macroend

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\dist\PowerShellConfig-Setup-${PRODUCT_VERSION}-win-${TARGET_ARCH}.exe"
InstallDir "$LOCALAPPDATA\PowerShellConfig"
InstallDirRegKey HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=1046 "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do ambiente PowerShell e Windows Terminal"
VIAddVersionKey /LANG=1046 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Copyright (c) ${PRODUCT_PUBLISHER}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\app\PowerShell Config.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o PowerShell Config"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"
!insertmacro MUI_LANGUAGE "English"

Section "PowerShell Config" SEC_APP
    SectionIn RO
    SetShellVarContext current
    System::Call 'kernel32::GetTickCount() i .r8'
    StrCpy $InstallPhaseStart $8
    !insertmacro WriteInstallLog "INFO" "nsis.previousApp" "START"
    IfFileExists "$INSTDIR\app\PowerShell Config.exe" 0 desktopStopped
        DetailPrint "Encerrando a versao anterior do PowerShell Config..."
        ExecWait '"$INSTDIR\app\PowerShell Config.exe" --shutdown' $1
        !insertmacro WriteInstallLog "INFO" "nsis.previousApp" "shutdownExitCode=$1"
        Sleep 1200
desktopStopped:
    System::Call 'kernel32::GetTickCount() i .r8'
    IntOp $8 $8 - $InstallPhaseStart
    !insertmacro WriteInstallLog "INFO" "nsis.previousApp" "SUCCESS durationMs=$8"
    SetOutPath "$INSTDIR"

    !insertmacro WriteInstallLog "INFO" "nsis.payload.config" "START target=$INSTDIR"
    File /oname=profile.ps1 "..\powershell\user_profile.ps1"
    File /oname=takuya.omp.json "..\powershell\takuya.omp.json"
    File /oname=settings.default.json "..\powershell\settings.default.json"
    File /oname=terminal-fragment.json "terminal-fragment.json"
    !insertmacro WriteInstallLog "INFO" "nsis.payload.config" "SUCCESS"

    SetOutPath "$INSTDIR\app"
    System::Call 'kernel32::GetTickCount() i .r8'
    StrCpy $InstallPhaseStart $8
    !insertmacro WriteInstallLog "INFO" "nsis.payload.app" "START target=$INSTDIR\app"
    File /r "${DESKTOP_PAYLOAD_DIR}\*.*"
    System::Call 'kernel32::GetTickCount() i .r8'
    IntOp $8 $8 - $InstallPhaseStart
    !insertmacro WriteInstallLog "INFO" "nsis.payload.app" "SUCCESS durationMs=$8"

    SetOutPath "$INSTDIR\fonts"
    !insertmacro WriteInstallLog "INFO" "nsis.payload.fonts" "START target=$INSTDIR\fonts count=4"
    File "..\powershell\fonts\Hack Regular Nerd Font Complete Windows Compatible.ttf"
    File "..\powershell\fonts\Hack Bold Nerd Font Complete Windows Compatible.ttf"
    File "..\powershell\fonts\Hack Italic Nerd Font Complete Windows Compatible.ttf"
    File "..\powershell\fonts\Hack Bold Italic Nerd Font Complete Windows Compatible.ttf"
    !insertmacro WriteInstallLog "INFO" "nsis.payload.fonts" "SUCCESS"

    SetOutPath "$INSTDIR\scripts"
    !insertmacro WriteInstallLog "INFO" "nsis.payload.scripts" "START target=$INSTDIR\scripts"
    File "scripts\Common.ps1"
    File "scripts\Configure-PowerShellConfig.ps1"
    File "scripts\Install-PowerShellConfig.ps1"
    File "scripts\InstallerLogging.ps1"
    File "scripts\Uninstall-PowerShellConfig.ps1"
    !insertmacro WriteInstallLog "INFO" "nsis.payload.scripts" "SUCCESS"

    SetOutPath "$INSTDIR"
    DetailPrint "Configurando dependencias e perfil do usuario..."
    System::Call 'kernel32::GetTickCount() i .r8'
    StrCpy $InstallPhaseStart $8
    !insertmacro WriteInstallLog "INFO" "nsis.configure" "START"
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Install-PowerShellConfig.ps1" -InstallRoot "$INSTDIR" -ProductVersion "${PRODUCT_VERSION}" -LogPath "$InstallLogPath" -LatestLogPath "$LatestInstallLogPath" -SessionId "$InstallSessionId"'
    Pop $0
    System::Call 'kernel32::GetTickCount() i .r8'
    IntOp $8 $8 - $InstallPhaseStart
    !insertmacro WriteInstallLog "INFO" "nsis.configure" "END exitCode=$0 durationMs=$8"
    ${If} $0 != 0
        !insertmacro WriteInstallLog "ERROR" "nsis.install" "FAILURE configurationExitCode=$0"
        MessageBox MB_OK|MB_ICONSTOP "A instalacao falhou. Log desta execucao: $InstallLogPath. Log mais recente: $LatestInstallLogPath. Os arquivos e backups foram preservados em $INSTDIR para diagnostico e recuperacao."
        Abort
    ${EndIf}

    DetailPrint "Registrando o PowerShell Config para iniciar com o Windows..."
    System::Call 'kernel32::GetTickCount() i .r8'
    StrCpy $InstallPhaseStart $8
    !insertmacro WriteInstallLog "INFO" "nsis.startup" "START"
    ExecWait '"$INSTDIR\app\PowerShell Config.exe" --sync-startup' $1
    System::Call 'kernel32::GetTickCount() i .r8'
    IntOp $8 $8 - $InstallPhaseStart
    !insertmacro WriteInstallLog "INFO" "nsis.startup" "END exitCode=$1 durationMs=$8"
    ${If} $1 != 0
        !insertmacro WriteInstallLog "ERROR" "nsis.install" "FAILURE startupExitCode=$1"
        MessageBox MB_OK|MB_ICONSTOP "A configuracao foi instalada, mas o aplicativo nao conseguiu registrar a inicializacao com o Windows. Codigo: $1"
        Abort
    ${EndIf}

    !insertmacro WriteInstallLog "INFO" "nsis.registration" "START"
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "NoRepair" 1
    !insertmacro WriteInstallLog "INFO" "nsis.registration" "SUCCESS uninstallKey=HKCU\${PRODUCT_UNINST_KEY}"

    !insertmacro WriteInstallLog "INFO" "nsis.shortcuts" "START"
    CreateDirectory "$SMPROGRAMS\PowerShell Config"
    CreateShortcut "$SMPROGRAMS\PowerShell Config\PowerShell Config.lnk" "$INSTDIR\app\PowerShell Config.exe"
    CreateShortcut "$SMPROGRAMS\PowerShell Config\Windows Terminal.lnk" "$LOCALAPPDATA\Microsoft\WindowsApps\wt.exe" "-p PowerShell"
    CreateShortcut "$SMPROGRAMS\PowerShell Config\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
    !insertmacro WriteInstallLog "INFO" "nsis.shortcuts" "SUCCESS target=$SMPROGRAMS\PowerShell Config"
    !insertmacro WriteInstallLog "INFO" "nsis.install" "SUCCESS productVersion=${PRODUCT_VERSION} architecture=${TARGET_ARCH}"
SectionEnd

Section "Uninstall"
    SetShellVarContext current
    DetailPrint "Encerrando o PowerShell Config..."
    ExecWait '"$INSTDIR\app\PowerShell Config.exe" --shutdown' $1
    Sleep 1200
    ExecWait '"$INSTDIR\app\PowerShell Config.exe" --set-startup=disabled' $1
    DetailPrint "Restaurando configuracoes anteriores..."

    IfFileExists "$LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe" usePwsh checkProgramFilesPwsh
usePwsh:
    nsExec::ExecToLog '"$LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Uninstall-PowerShellConfig.ps1" -InstallRoot "$INSTDIR"'
    Pop $0
    Goto uninstallResult
checkProgramFilesPwsh:
    IfFileExists "$PROGRAMFILES64\PowerShell\7\pwsh.exe" useProgramFilesPwsh useWindowsPowerShell
useProgramFilesPwsh:
    nsExec::ExecToLog '"$PROGRAMFILES64\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Uninstall-PowerShellConfig.ps1" -InstallRoot "$INSTDIR"'
    Pop $0
    Goto uninstallResult
useWindowsPowerShell:
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Uninstall-PowerShellConfig.ps1" -InstallRoot "$INSTDIR"'
    Pop $0
uninstallResult:
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Algumas configuracoes nao puderam ser restauradas. Os arquivos serao preservados em $INSTDIR para diagnostico."
        Abort
    ${EndIf}

    Delete "$SMPROGRAMS\PowerShell Config\PowerShell Config.lnk"
    Delete "$SMPROGRAMS\PowerShell Config\Windows Terminal.lnk"
    Delete "$SMPROGRAMS\PowerShell Config\Desinstalar.lnk"
    RMDir "$SMPROGRAMS\PowerShell Config"
    DeleteRegKey HKCU "${PRODUCT_UNINST_KEY}"
    RMDir /r "$INSTDIR"
SectionEnd

Function EnsureWindowsTerminalClosed
checkWindowsTerminal:
    System::Call 'kernel32::GetTickCount() i .r8'
    StrCpy $InstallPhaseStart $8
    !insertmacro WriteInstallLog "INFO" "nsis.preflight.windowsTerminal" "START"
    nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "if (Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue) { exit 10 }; exit 0"'
    Pop $0
    System::Call 'kernel32::GetTickCount() i .r8'
    IntOp $8 $8 - $InstallPhaseStart
    !insertmacro WriteInstallLog "INFO" "nsis.preflight.windowsTerminal" "END exitCode=$0 durationMs=$8"

    ${If} $0 == 0
        Return
    ${ElseIf} $0 == 10
        IfSilent windowsTerminalRunningSilent windowsTerminalRunningInteractive
windowsTerminalRunningInteractive:
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O Windows Terminal esta em execucao. Encerre completamente todas as janelas e o processo na bandeja antes de continuar." IDRETRY checkWindowsTerminal IDCANCEL windowsTerminalCheckCancelled
windowsTerminalRunningSilent:
        !insertmacro WriteInstallLog "ERROR" "nsis.preflight.windowsTerminal" "FAILURE Windows Terminal aberto em modo silencioso"
        SetErrorLevel 10
        Quit
windowsTerminalCheckCancelled:
        !insertmacro WriteInstallLog "WARN" "nsis.preflight.windowsTerminal" "CANCELLED pelo usuario"
        SetErrorLevel 1
        Quit
    ${Else}
        IfSilent windowsTerminalCheckFailed windowsTerminalCheckFailedInteractive
windowsTerminalCheckFailedInteractive:
        MessageBox MB_OK|MB_ICONSTOP "Nao foi possivel verificar se o Windows Terminal esta em execucao. Codigo: $0. A instalacao sera cancelada sem extrair arquivos."
windowsTerminalCheckFailed:
        !insertmacro WriteInstallLog "ERROR" "nsis.preflight.windowsTerminal" "FAILURE checkExitCode=$0"
        SetErrorLevel 11
        Quit
    ${EndIf}
FunctionEnd

Function .onInit
    SetShellVarContext current
    CreateDirectory "$LOCALAPPDATA\PowerShellConfig"
    CreateDirectory "$LOCALAPPDATA\PowerShellConfig\logs"
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    System::Call 'kernel32::GetCurrentProcessId() i .r7'
    StrCpy $InstallSessionId "$2$1$0-$4$5$6-pid$7"
    StrCpy $InstallLogPath "$LOCALAPPDATA\PowerShellConfig\logs\install-$InstallSessionId.log"
    StrCpy $LatestInstallLogPath "$LOCALAPPDATA\PowerShellConfig-install.log"
    FileOpen $8 "$InstallLogPath" w
    FileClose $8
    FileOpen $8 "$LatestInstallLogPath" w
    FileClose $8
    !insertmacro WriteInstallLog "INFO" "nsis.install" "START productVersion=${PRODUCT_VERSION} architecture=${TARGET_ARCH} installRoot=$INSTDIR logPath=$InstallLogPath"
    !insertmacro MUI_LANGDLL_DISPLAY
    Call EnsureWindowsTerminalClosed
FunctionEnd

Function WriteInstallLog
    Exch $R9
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $8

    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    FileOpen $8 "$InstallLogPath" a
    FileSeek $8 0 END
    FileWrite $8 "$2-$1-$0T$4:$5:$6 [session=$InstallSessionId] $R9$\r$\n"
    FileClose $8
    FileOpen $8 "$LatestInstallLogPath" a
    FileSeek $8 0 END
    FileWrite $8 "$2-$1-$0T$4:$5:$6 [session=$InstallSessionId] $R9$\r$\n"
    FileClose $8

    Pop $8
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
    Pop $R9
FunctionEnd

Function un.onInit
    SetShellVarContext current
    !insertmacro MUI_UNGETLANGUAGE
FunctionEnd
