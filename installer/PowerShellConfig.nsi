!include "MUI2.nsh"
!include "LogicLib.nsh"

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
    IfFileExists "$INSTDIR\app\PowerShell Config.exe" 0 desktopStopped
        DetailPrint "Encerrando a versao anterior do PowerShell Config..."
        ExecWait '"$INSTDIR\app\PowerShell Config.exe" --shutdown' $1
        Sleep 1200
desktopStopped:
    SetOutPath "$INSTDIR"

    File /oname=profile.ps1 "..\powershell\user_profile.ps1"
    File /oname=takuya.omp.json "..\powershell\takuya.omp.json"
    File /oname=settings.default.json "..\powershell\settings.default.json"
    File /oname=terminal-fragment.json "terminal-fragment.json"

    SetOutPath "$INSTDIR\app"
    File /r "${DESKTOP_PAYLOAD_DIR}\*.*"

    SetOutPath "$INSTDIR\fonts"
    File "..\powershell\fonts\Hack Regular Nerd Font Complete Windows Compatible.ttf"
    File "..\powershell\fonts\Hack Bold Nerd Font Complete Windows Compatible.ttf"
    File "..\powershell\fonts\Hack Italic Nerd Font Complete Windows Compatible.ttf"
    File "..\powershell\fonts\Hack Bold Italic Nerd Font Complete Windows Compatible.ttf"

    SetOutPath "$INSTDIR\scripts"
    File "scripts\Common.ps1"
    File "scripts\Configure-PowerShellConfig.ps1"
    File "scripts\Install-PowerShellConfig.ps1"
    File "scripts\Uninstall-PowerShellConfig.ps1"

    SetOutPath "$INSTDIR"
    DetailPrint "Configurando dependencias e perfil do usuario..."
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Install-PowerShellConfig.ps1" -InstallRoot "$INSTDIR" -ProductVersion "${PRODUCT_VERSION}"' $0
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONSTOP "A instalacao falhou. Consulte $LOCALAPPDATA\PowerShellConfig-install.log. Os arquivos e backups foram preservados em $INSTDIR para diagnostico e recuperacao."
        Abort
    ${EndIf}

    DetailPrint "Registrando o PowerShell Config para iniciar com o Windows..."
    ExecWait '"$INSTDIR\app\PowerShell Config.exe" --sync-startup' $1
    ${If} $1 != 0
        MessageBox MB_OK|MB_ICONSTOP "A configuracao foi instalada, mas o aplicativo nao conseguiu registrar a inicializacao com o Windows. Codigo: $1"
        Abort
    ${EndIf}

    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${PRODUCT_UNINST_KEY}" "NoRepair" 1

    CreateDirectory "$SMPROGRAMS\PowerShell Config"
    CreateShortcut "$SMPROGRAMS\PowerShell Config\PowerShell Config.lnk" "$INSTDIR\app\PowerShell Config.exe"
    CreateShortcut "$SMPROGRAMS\PowerShell Config\Windows Terminal.lnk" "$LOCALAPPDATA\Microsoft\WindowsApps\wt.exe" "-p PowerShell"
    CreateShortcut "$SMPROGRAMS\PowerShell Config\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
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
    ExecWait '"$LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Uninstall-PowerShellConfig.ps1" -InstallRoot "$INSTDIR"' $0
    Goto uninstallResult
checkProgramFilesPwsh:
    IfFileExists "$PROGRAMFILES64\PowerShell\7\pwsh.exe" useProgramFilesPwsh useWindowsPowerShell
useProgramFilesPwsh:
    ExecWait '"$PROGRAMFILES64\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Uninstall-PowerShellConfig.ps1" -InstallRoot "$INSTDIR"' $0
    Goto uninstallResult
useWindowsPowerShell:
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Uninstall-PowerShellConfig.ps1" -InstallRoot "$INSTDIR"' $0
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

Function .onInit
    SetShellVarContext current
    !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Function un.onInit
    SetShellVarContext current
    !insertmacro MUI_UNGETLANGUAGE
FunctionEnd
