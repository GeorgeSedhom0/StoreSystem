!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"

# Enable abort warnings
!define MUI_ABORTWARNING

# Define variables
Var Dialog
Var PythonVersion
Var StatusLabel
Var StoreIdText
Var HostText
Var DbNameText
Var DbUserText
Var DbPassText
Var OtherStoreText
Var SecretText
Var NextButton

# Define pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
Page custom pythonInfoPage pythonInfoPageLeave
Page custom configurationPage configurationPageLeave
Page custom createVenvPage createVenvPageLeave
Page custom installRequirementsPage installRequirementsPageLeave

ShowInstDetails show

# Get dialog next button
Function GetNextButton
    Push $0
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $NextButton $0 1
    Pop $0
FunctionEnd

Function pythonInfoPage
    nsDialogs::Create 1018
    Pop $Dialog
    
    ${NSD_CreateLabel} 0 0 100% 40u "Python Version Information$\nRecommended version: Python 3.11.x"
    Pop $StatusLabel
    
    # Check current Python version
    nsExec::ExecToStack 'python --version'
    Pop $0
    Pop $PythonVersion
    
    ${If} $0 != 0
        ${NSD_CreateLabel} 0 50u 100% 40u "No Python installation detected.$\nYou can continue, but the installation might fail later.$\nConsider installing Python 3.11.x before proceeding."
    ${Else}
        ${NSD_CreateLabel} 0 50u 100% 40u "Current Python version: $PythonVersion$\nYou may proceed with installation or install Python 3.11.x if you prefer."
    ${EndIf}
    Pop $0
    
    nsDialogs::Show
FunctionEnd

Function pythonInfoPageLeave
FunctionEnd

Function configurationPage
    nsDialogs::Create 1018
    Pop $Dialog
    
    ${NSD_CreateGroupBox} 0 0 100% 160u "Environment Configuration"
    Pop $0
    
    ${NSD_CreateLabel} 10u 20u 70u 12u "Store ID:"
    Pop $0
    ${NSD_CreateText} 85u 18u 150u 12u "0"
    Pop $StoreIdText
    
    ${NSD_CreateLabel} 10u 40u 70u 12u "Host:"
    Pop $0
    ${NSD_CreateText} 85u 38u 150u 12u "localhost"
    Pop $HostText
    
    ${NSD_CreateLabel} 10u 60u 70u 12u "Database:"
    Pop $0
    ${NSD_CreateText} 85u 58u 150u 12u "store"
    Pop $DbNameText
    
    ${NSD_CreateLabel} 10u 80u 70u 12u "DB User:"
    Pop $0
    ${NSD_CreateText} 85u 78u 150u 12u "postgres"
    Pop $DbUserText
    
    ${NSD_CreateLabel} 10u 100u 70u 12u "DB Password:"
    Pop $0
    ${NSD_CreatePassword} 85u 98u 150u 12u "from10to20"
    Pop $DbPassText
    
    ${NSD_CreateLabel} 10u 120u 70u 12u "Other Store:"
    Pop $0
    ${NSD_CreateText} 85u 118u 150u 12u "http://100.96.9.8:8000"
    Pop $OtherStoreText
    
    ${NSD_CreateLabel} 10u 140u 70u 12u "Secret Key:"
    Pop $0
    ${NSD_CreateText} 85u 138u 150u 12u `a6s5d4d4s56a2634554235VCC#@CV542453v45aslopadc`
    Pop $SecretText
    
    nsDialogs::Show
FunctionEnd

Function configurationPageLeave
    ${NSD_GetText} $StoreIdText $R0
    ${NSD_GetText} $HostText $R1
    ${NSD_GetText} $DbNameText $R2
    ${NSD_GetText} $DbUserText $R3
    ${NSD_GetText} $DbPassText $R4
    ${NSD_GetText} $OtherStoreText $R5
    ${NSD_GetText} $SecretText $R6
    
    # Create .env file with error handling
    ClearErrors
    CreateDirectory "$INSTDIR\resources\server"
    FileOpen $0 "$INSTDIR\resources\server\.env" w
    ${If} ${Errors}
        MessageBox MB_OK|MB_ICONSTOP "Failed to create .env file. Please ensure you have write permissions to $INSTDIR\resources\server"
        Abort
    ${EndIf}
    
    FileWrite $0 "STORE_ID = $R0$\r$\n"
    FileWrite $0 "HOST = $\"$R1$\"$\r$\n"
    FileWrite $0 "DATABASE = $\"$R2$\"$\r$\n"
    FileWrite $0 "USER = $\"$R3$\"$\r$\n"
    FileWrite $0 "PASS = $\"$R4$\"$\r$\n"
    FileWrite $0 "OTHER_STORE = $\"$R5$\"$\r$\n"
    FileWrite $0 "SECRET = $\"$R6$\"$\r$\n"
    FileWrite $0 "ALGORITHM = $\"HS256$\"$\r$\n"
    
    ${If} ${Errors}
        MessageBox MB_OK|MB_ICONSTOP "Failed to write configuration to .env file. Please check disk space and permissions."
        FileClose $0
        Abort
    ${EndIf}
    
    FileClose $0
FunctionEnd

Function createVenvPage
    nsDialogs::Create 1018
    Pop $Dialog
    
    ${NSD_CreateLabel} 0 0 100% 40u "Click Next to start creating Python virtual environment..."
    Pop $StatusLabel
    
    nsDialogs::Show
FunctionEnd

Function createVenvPageLeave
    # Disable Next button first
    Call GetNextButton
    EnableWindow $NextButton 0
    
    # Update status before starting
    ${NSD_SetText} $StatusLabel "Creating Python virtual environment... Please wait..."
    
    # Execute venv creation
    nsExec::ExecToStack 'cmd /c "python -m venv "$INSTDIR\resources\server\env" --clear 2>&1"'
    Pop $0
    Pop $1
    
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONSTOP "Failed to create Python virtual environment.$\nPlease ensure Python is installed correctly.$\n$\nError: $1"
        Abort
    ${Else}
        ${NSD_SetText} $StatusLabel "Virtual environment created successfully!"
        EnableWindow $NextButton 1
    ${EndIf}
FunctionEnd

Function installRequirementsPage
    nsDialogs::Create 1018
    Pop $Dialog
    
    ${NSD_CreateLabel} 0 0 100% 40u "Click Next to start installing Python requirements..."
    Pop $StatusLabel
    
    nsDialogs::Show
FunctionEnd

Function installRequirementsPageLeave
    # Disable Next button first
    Call GetNextButton
    EnableWindow $NextButton 0
    
    # Update status before starting
    ${NSD_SetText} $StatusLabel "Installing Python requirements... Please wait..."
    
    # Execute pip install
    nsExec::ExecToStack 'cmd /c ""$INSTDIR\resources\server\env\Scripts\pip.exe" install -r "$INSTDIR\resources\server\requirements.txt" 2>&1"'
    Pop $0
    Pop $1
    
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONSTOP "Failed to install Python requirements.$\nPlease check your internet connection.$\n$\nError: $1"
        Abort
    ${Else}
        ${NSD_SetText} $StatusLabel "Installation completed successfully!"
        EnableWindow $NextButton 1
        GetDlgItem $0 $HWNDPARENT 1
        SendMessage $0 ${WM_SETTEXT} 0 "STR:Finish"
    ${EndIf}
    
    SetRebootFlag false
    Quit
FunctionEnd
