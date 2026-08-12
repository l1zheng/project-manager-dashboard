#define SourceDirectory GetEnv("PM_INSTALLER_SOURCE_DIR")
#define ArtifactDirectory GetEnv("PM_INSTALLER_OUTPUT_DIR")
#define ApplicationVersion GetEnv("PM_INSTALLER_VERSION")
#define SigningEnabled GetEnv("PM_INSTALLER_SIGNING_ENABLED")

#if SourceDirectory == ""
  #error PM_INSTALLER_SOURCE_DIR is required
#endif
#if ArtifactDirectory == ""
  #error PM_INSTALLER_OUTPUT_DIR is required
#endif
#if ApplicationVersion == ""
  #error PM_INSTALLER_VERSION is required
#endif

[Setup]
AppId={{0B838BD8-C96A-472E-9AC7-E51B2DDB5549}
AppName=Project Manager Dashboard
AppVersion={#ApplicationVersion}
AppPublisher=lz
AppPublisherURL=https://github.com/l1zheng/project-manager-dashboard
AppSupportURL=https://github.com/l1zheng/project-manager-dashboard/issues
DefaultDirName={localappdata}\Programs\ProjectManagerDashboard
DefaultGroupName=Project Manager Dashboard
UninstallDisplayName=Project Manager Dashboard
UninstallDisplayIcon={app}\ProjectManagerDashboard.exe
OutputDir={#ArtifactDirectory}
OutputBaseFilename=ProjectManagerDashboard-Setup-{#ApplicationVersion}-win-x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequired=lowest
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
AllowNoIcons=yes
CloseApplications=no
RestartApplications=no
DisableProgramGroupPage=auto
UsePreviousAppDir=yes
#if SigningEnabled == "1"
SignTool=installer
SignedUninstaller=yes
SignToolRetryCount=3
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Files]
#if SigningEnabled == "1"
Source: "{#SourceDirectory}\ProjectManagerDashboard.exe"; DestDir: "{app}"; Flags: ignoreversion signonce
Source: "{#SourceDirectory}\*"; Excludes: "ProjectManagerDashboard.exe"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#else
Source: "{#SourceDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif

[Icons]
Name: "{group}\Project Manager Dashboard"; Filename: "{app}\ProjectManagerDashboard.exe"; Parameters: "--start"; WorkingDir: "{app}"
Name: "{autodesktop}\Project Manager Dashboard"; Filename: "{app}\ProjectManagerDashboard.exe"; Parameters: "--start"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\ProjectManagerDashboard.exe"; Parameters: "--start"; Description: "Launch Project Manager Dashboard"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\ProjectManagerDashboard.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated skipifdoesntexist

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  LauncherPath: String;
  ResultCode: Integer;
begin
  Result := '';
  LauncherPath := ExpandConstant('{app}\ProjectManagerDashboard.exe');
  if FileExists(LauncherPath) then
  begin
    if not Exec(LauncherPath, '--stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Result := 'The running dashboard could not be stopped. Close it and try again.'
    else if ResultCode <> 0 then
      Result := 'The running dashboard could not be stopped. Close it and try again.';
  end;
end;
