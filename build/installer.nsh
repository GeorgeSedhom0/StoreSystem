; OpenStore NSIS Installer Customization
; Handles: auto-start on boot, firewall rules, clean uninstall

!macro customInstall
  ; Add firewall exceptions for localhost-only services
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="OpenStore Backend" dir=in action=allow protocol=TCP localport=8000 remoteip=127.0.0.1'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="OpenStore PostgreSQL" dir=in action=allow protocol=TCP localport=5432 remoteip=127.0.0.1'

  ; Register app to auto-start on boot
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenStore" '"$INSTDIR\OpenStore.exe"'
!macroend

!macro customUnInstall
  ; Remove auto-start registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenStore"

  ; Remove firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="OpenStore Backend"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="OpenStore PostgreSQL"'

  ; Ask user if they want to keep their data
  MessageBox MB_YESNO "هل تريد حذف بيانات البرنامج؟ (قاعدة البيانات، الإعدادات)$\n$\nDo you want to delete application data? (database, settings)" IDNO SkipDataDelete
    RMDir /r "$APPDATA\OpenStore"
  SkipDataDelete:
!macroend
