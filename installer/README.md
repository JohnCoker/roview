# Unified Installer

This is an NSIS installer script that packages the **RASOrbit**, **Input Editor**, and **Viewer** (this repo) 
binaries together in a single Windows installer. (And thus only interesting to the maintainers of RASOrbit.)

The `rasorbit.exe` binary is ITAR-controlled and must be obtained separately.
See [www.rasaero.com](http://www.rasaero.com/).

Download the [NSIS compiler](https://downloads.sourceforge.net/nsis/nsis-3.12.zip) into the current directory and
unzip it.

Then run the script `installer.ps1` in PowerShell (version 5.1 or later).
That will download the latest release of the Input Editor and Viewer into the
local directory and package a Windows installer out of all three.

1. Download [this directory](installer.zip) and unzip.
2. `cd` into it.
3. Place `rasorbit.exe` in the directory.
4. Download and unzip the [NSIS compiler](https://downloads.sourceforge.net/nsis/nsis-3.12.zip?download) in the directory.
5. Run `.\installer.ps1`
6. Test `RASOrbit Setup.exe`.

If you get the error that executing scripts is disabled, run PowerShell as Administrator and change the policy
(for the current session only):
```
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```
