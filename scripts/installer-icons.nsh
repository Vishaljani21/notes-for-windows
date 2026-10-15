; Use the original Notes artwork directly so an older executable icon cached
; by Explorer cannot replace the Desktop or Start menu icon after an update.
; Only update links selected/retained by electron-builder's standard installer.
!macro customInstall
  ${if} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\icons\notes-original.ico" 0 SW_SHOWNORMAL "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$newStartMenuLink", p 0)'
  ${endIf}
  ${if} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\icons\notes-original.ico" 0 SW_SHOWNORMAL "ALT|CONTROL|N" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$newDesktopLink", p 0)'
  ${endIf}
!macroend
