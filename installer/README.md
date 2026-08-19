# Unified Installer

This is an NSIS installer script that packages the **RASOrbit**, **RASOrbit Input Editor**,
and **RASOrbit Viewer** executables together in a single Windows installer.
(And thus is only of interest to the maintainers of RASOrbit.)

The `rasorbit.exe` binary must be obtained separately;
see [www.rasaero.com](https://www.rasaero.com/).

[Input Editor](https://johncoker.github.io/roinput) and [Viewer](https://johncoker.github.io/roview) (this repo)
are open source and also have individual installers.

You will also need the [NSIS compiler](https://downloads.sourceforge.net/nsis/nsis-3.12.zip) to build the Windows
installer image.

The script `installer.ps1` for PowerShell (version 5.1 or later) will download the latest release of the Input Editor
and Viewer from GitHub and package a Windows installer out of all three.

1. Download [this directory](installer.zip) and unzip, creating the `installer` directory.
2. `cd` into it.
3. Copy the `rasorbit.exe` binary into the directory.
4. Download and unzip the [NSIS compiler](https://downloads.sourceforge.net/nsis/nsis-3.12.zip?download) into the directory.
5. Run `.\installer.ps1`
6. Test `RASOrbit Setup.exe`.

If you get the error that executing scripts is disabled, run PowerShell as Administrator and change the policy
(for the current session only):
```
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```
