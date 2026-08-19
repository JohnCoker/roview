# Terminate instantly on any error (like 'set -e')
$ErrorActionPreference = 'Stop'

# Force TLS 1.2 encryption to guarantee compatibility with GitHub on older PS 5.1 systems
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Make sure RASOrbit itself is here
if (-not (Test-Path -Path ".\rasorbit.exe" -PathType Leaf)) {
    Throw "rasorbit.exe not in current directory.";
}
Write-Host "Found rasorbit.exe..." -ForegroundColor Green

# Download roview and roinput binaries
foreach ($prog in 'roview', 'roinput') {
    Write-Host "Downloading ${prog}..." -ForegroundColor Cyan

    # Clean up old version first.
    Remove-Item "${prog}*.exe" -ErrorAction SilentlyContinue

    # Fetch the latest release data
    $latest = (Invoke-RestMethod -Uri "https://api.github.com/repos/JohnCoker/$prog/releases")[0]

    # get the version number
    $version = $latest.name -replace '^(?:Release *)?(?:v *)?(\d+\.(?:[\d.]*)).*$', '$1'

    # Find the non-installer executable
    $found = 0
    foreach ($asset in $latest.assets) {
        # Check if the filename ends in .exe AND does NOT end in -setup.exe
        if ($asset.name -like "*.exe" -and $asset.name -notlike "*-setup.exe") {

            $url = $asset.browser_download_url
            $filename = $asset.name

            # Download the asset directly into the Current Working Directory (CWD)
            $destinationPath = Join-Path -Path $PWD -ChildPath $filename
            Invoke-WebRequest -Uri $url -OutFile $destinationPath
            $exe = "${prog}.exe"
            mv ".\${filename}" ".\$exe"

            # Stop looking once we find the matching file
            Write-Host "Downloaded: ${exe} ${version}" -ForegroundColor Green
            $found = 1
            break
        }
    }
    if (!$found) {
        Throw "Unable to find $prog executable.";
    }
}

# Static installer config
$NsiScriptPath = Join-Path -Path $pwd -ChildPath "installer.nsi"

# Run NSIS compiler
$MakeNsisExe = Get-ChildItem -Path $pwd -Filter "makensis.exe" -Recurse | Select-Object -First 1
Remove-Item "RASOrbit Setup.*" -ErrorAction SilentlyContinue
if ($MakeNsisExe) {
    Write-Host "Compiling installer with NSIS..." -ForegroundColor Green
    & $MakeNsisExe.FullName $NsiScriptPath
    Write-Host "Generated: RASOrbit Setup.exe" -ForegroundColor Green
} else {
    Throw "Download and unzip the NSIS compiler in this directory.";
}
