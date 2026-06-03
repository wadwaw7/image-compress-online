; Custom NSIS commands: detect and uninstall previous version before installing
; This is included by Tauri's NSIS build process

!macro customInit
  ; Check for old per-user install (currentUser mode)
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ImageCompress" "UninstallString"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "检测到已安装旧版 ImageCompress。是否先卸载旧版本再继续安装？" /SD IDYES IDYES doUninstall
    Abort "安装已取消"
    doUninstall:
    ; Extract the uninstaller directory and run it silently
    Push $0
    ; The uninstall string is like: "C:\Users\...\uninstall.exe"
    ; Run it silently
    ExecWait '$0 /S _?=$INSTDIR'
    ; Clean up registry
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ImageCompress"
  ${EndIf}
!macroend
