# ADR-0006: Windows installer and native launcher

Status: accepted on 2026-08-13

## Context

The accepted portable ZIP is self-contained, but extracting it and starting CMD entrypoints is unnecessarily difficult for ordinary Windows users. Some managed Windows environments also apply stricter reputation or path policies to browser-downloaded portable folders. The application must retain its browser-on-loopback architecture and its bundled Node/native SQLite runtime; rewriting it as Electron or a Node single executable would add risk without solving publisher trust by itself.

## Decision

- Make a current-user Inno Setup x64 executable the primary Windows distribution and keep the portable ZIP as an alternate.
- Install under `%LOCALAPPDATA%\Programs\ProjectManagerDashboard` with `PrivilegesRequired=lowest`.
- Compile a small x64 .NET Framework Windows GUI launcher. It accepts only `--start`, `--stop`, and `--check`, invokes the existing bundled Node launcher with `UseShellExecute=false` and `CreateNoWindow=true`, and writes bounded diagnostics under the application data directory.
- Keep mutable data under `%LOCALAPPDATA%\ProjectManagerDashboard`; uninstall never deletes it.
- Stop the authenticated installed service before overwriting application files during an in-place update.
- Pin Inno Setup 7.0.2 and require a valid Authenticode signature from `Pyrsys B.V.` before installing the compiler used by the build.
- Permit a release-only signing command to Authenticode-sign the launcher, uninstaller, and Setup. Do not store certificates or passwords in the repository. `AppPublisher=lz` is package metadata, not a substitute for a trusted certificate.
- Publish the Setup EXE and portable ZIP only after their respective acceptance scripts pass.

## Consequences

Windows 10/11 users can install, launch from a shortcut without a console, update in place, and uninstall without installing developer tools or losing their workspace. The application still runs locally in the browser and binds only to loopback. Unsigned local/test installers can still trigger SmartScreen or organizational policy; a trusted code-signing certificate or approved managed deployment is required to establish a verified Windows publisher and reputation.

The release matrix now covers portable extraction and browser interaction plus installer structure, first install, native launch, complete API/export setup, repeat launch, running in-place update, restart persistence, uninstall, application-file removal, and workspace retention.
