!include nsDialogs.nsh
!include LogicLib.nsh
!include MUI2.nsh

; Closing Electron normally also closes its tunnel and audio helper.
; Never force-kill an active room from the installer/uninstaller.
!macro customCheckAppRunning
  StrCpy $R9 "0"
  concordCheckAgain:
    nsProcess::_FindProcess "${PRODUCT_FILENAME}.exe"
    Pop $0
    ${If} $0 == 0
      ; electron-updater starts NSIS just before Electron exits. Wait without killing.
      ${If} ${isUpdated}
        ${If} $R9 < 200
          IntOp $R9 $R9 + 1
          Sleep 100
          Goto concordCheckAgain
        ${EndIf}
      ${EndIf}
      ${IfNot} ${Silent}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Feche o Concord antes de continuar. Isso encerra sua sala e libera os componentes de áudio e conexão.$\r$\n$\r$\nDepois, clique em Tentar novamente." /SD IDCANCEL IDRETRY concordCheckAgain
      ${EndIf}
      SetErrorLevel 2
      Quit
    ${EndIf}
!macroend

; Always install for the current user, including when launched by an admin.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
  Var ConcordDesktopChoice
  Var ConcordDesktopCheckbox

  !macro customInit
    !insertmacro setInstallModePerUser
    ${IfNot} ${AtLeastWin10}
      MessageBox MB_OK|MB_ICONSTOP "O Concord precisa do Windows 10 ou 11 de 64 bits."
      SetErrorLevel 1633
      Quit
    ${EndIf}
    StrCpy $ConcordDesktopChoice "1"
    ${If} ${FileExists} "$INSTDIR\${PRODUCT_FILENAME}.exe"
      ${IfNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
        StrCpy $ConcordDesktopChoice "0"
      ${EndIf}
    ${EndIf}
    ${If} ${isNoDesktopShortcut}
      StrCpy $ConcordDesktopChoice "0"
    ${EndIf}
  !macroend

  !macro customPageAfterChangeDir
    Page custom ConcordOptionsCreate ConcordOptionsLeave

  Function ConcordOptionsCreate
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Instalar o Concord" "Pronto para instalar no seu Windows."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0u 0u 300u 42u "O programa será instalado somente para seu usuário.$\r$\nDepois da instalação, abra pelo menu Iniciar."
    Pop $0
    ${NSD_CreateLabel} 0u 48u 300u 30u "Pasta do programa:$\r$\n$INSTDIR"
    Pop $0
    ${NSD_CreateCheckbox} 0u 90u 300u 20u "Criar atalho na Área de Trabalho"
    Pop $ConcordDesktopCheckbox
    ${If} $ConcordDesktopChoice == "1"
      ${NSD_Check} $ConcordDesktopCheckbox
    ${EndIf}
    ${NSD_CreateLabel} 0u 120u 300u 30u "Seu nome e sua foto ficam guardados no seu perfil do Windows, separados da instalação."
    Pop $0
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:&Instalar"
    nsDialogs::Show
  FunctionEnd

  Function ConcordOptionsLeave
    ${IfNot} ${Silent}
      ${If} $ConcordDesktopCheckbox != 0
        ${NSD_GetState} $ConcordDesktopCheckbox $ConcordDesktopChoice
      ${EndIf}
    ${EndIf}
  FunctionEnd
  !macroend

  !macro customInstall
    WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" "DesktopShortcut" "$ConcordDesktopChoice"
    ${If} $ConcordDesktopChoice == "1"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${Else}
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
    ${EndIf}
  !macroend
!endif
