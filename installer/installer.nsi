Unicode true

!include "MUI2.nsh"

Name "RASOrbit"
OutFile ".\RASOrbit Setup.exe"
InstallDir "$PROGRAMFILES\RASOrbit"
InstallDirRegKey HKLM "Software\RASOrbit" "InstallLocation"
RequestExecutionLevel admin

; app_icon.ico is a PNG-compressed icon. NSIS 3 accepts that.
!define MUI_ICON ".\app_icon.ico"
!define MUI_UNICON ".\app_icon.ico"

; Inner-page header, on the left of the title. wizard_small.bmp is 150x57:
; the whole symbol on the left, fading to the header color on the right.
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP ".\wizard_small.bmp"
!define MUI_HEADERIMAGE_UNBITMAP ".\wizard_small.bmp"

; Welcome and finish sidebar. wizard_image.bmp is 164x314.
!define MUI_WELCOMEFINISHPAGE_BITMAP ".\wizard_image.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP ".\wizard_image.bmp"

!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

Var StartMenuFolder
!define MUI_STARTMENUPAGE_DEFAULTFOLDER "RASOrbit"
!define MUI_STARTMENUPAGE_REGISTRY_ROOT HKLM
!define MUI_STARTMENUPAGE_REGISTRY_KEY "Software\RASOrbit"
!define MUI_STARTMENUPAGE_REGISTRY_VALUENAME "StartMenuFolder"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE ".\license.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_STARTMENU Application $StartMenuFolder
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\rasorbit.exe"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "RASOrbit"
    SetOutPath "$INSTDIR"

    File ".\rasorbit.exe"
    File ".\roinput.exe"
    File ".\roview.exe"
    File ".\app_icon.ico"

    WriteUninstaller "$INSTDIR\uninstall.exe"

    !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
        CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
        CreateShortcut "$SMPROGRAMS\$StartMenuFolder\RASOrbit.lnk" "$INSTDIR\rasorbit.exe" "" "$INSTDIR\app_icon.ico"
        CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Input Editor.lnk" "$INSTDIR\roinput.exe"
        CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Viewer.lnk" "$INSTDIR\roview.exe"
        CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Uninstall RASOrbit.lnk" "$INSTDIR\uninstall.exe"
    !insertmacro MUI_STARTMENU_WRITE_END

    WriteRegStr HKLM "Software\RASOrbit" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "DisplayName" "RASOrbit"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "DisplayIcon" "$INSTDIR\app_icon.ico"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "Publisher" "Rogers Aeroscience"
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "NoModify" 1
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit" "NoRepair" 1
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\rasorbit.exe"
    Delete "$INSTDIR\roinput.exe"
    Delete "$INSTDIR\roview.exe"
    Delete "$INSTDIR\app_icon.ico"
    Delete "$INSTDIR\uninstall.exe"

    !insertmacro MUI_STARTMENU_GETFOLDER Application $StartMenuFolder
    StrCmp $StartMenuFolder "" done_shortcuts
    Delete "$SMPROGRAMS\$StartMenuFolder\RASOrbit.lnk"
    Delete "$SMPROGRAMS\$StartMenuFolder\Input Editor.lnk"
    Delete "$SMPROGRAMS\$StartMenuFolder\Viewer.lnk"
    Delete "$SMPROGRAMS\$StartMenuFolder\Uninstall RASOrbit.lnk"
    RMDir "$SMPROGRAMS\$StartMenuFolder"
    done_shortcuts:

    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RASOrbit"
    DeleteRegKey HKLM "Software\RASOrbit"

    RMDir "$INSTDIR"
SectionEnd
