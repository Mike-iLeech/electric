; Keep the basic installer scoped to the current user.
; The application data directory is deliberately separate from $INSTDIR.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

LangString electricDeleteData 1049 "Удалить данные приложения"
LangString electricDeleteData 1033 "Delete application data"
LangString electricRemoveProgram 1049 "Удалить программу"
LangString electricRemoveProgram 1033 "Uninstall application"
!define UNINSTALL_SECTION_NAME "$(electricRemoveProgram)"
LangString electricDeleteDataInfo 1049 "Данные сохраняются без флажка. При его выборе удалятся проекты, резервные копии, модули, настройки, экспорт и кэш обновлений."
LangString electricDeleteDataInfo 1033 "Data is kept unless the box is checked. Selecting it deletes projects, backups, modules, settings, exports and the update cache."
LangString electricDeleteDataFailed 1049 "Не удалось удалить все данные. Проверьте папки $APPDATA\ElectricCAD Easy и $LOCALAPPDATA\electriccad-easy-updater."
LangString electricDeleteDataFailed 1033 "Some data could not be removed. Check $APPDATA\ElectricCAD Easy and $LOCALAPPDATA\electriccad-easy-updater."
!define MUI_UNCOMPONENTSPAGE_TEXT_TOP "$(electricDeleteDataInfo)"

; electron-builder adds a native components page when this macro is present.
; /o leaves the checkbox off. The guard also keeps updates/silent uninstall safe.
!macro customUnInstallSection
  Section /o "un.$(electricDeleteData)" electricDeleteDataSection
    ${IfNot} ${Silent}
    ${AndIfNot} ${isUpdated}
      SetShellVarContext current
      ClearErrors
      RMDir /r "$APPDATA\ElectricCAD Easy"
      RMDir /r "$LOCALAPPDATA\electriccad-easy-updater"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(electricDeleteDataFailed)"
      ${EndIf}
    ${EndIf}
  SectionEnd
!macroend

; Do not allow the upstream hidden CLI flag to bypass the explicit checkbox.
!macro customUnInit
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${IfNot} ${Errors}
    SetErrorLevel 2
    Abort
  ${EndIf}
!macroend
