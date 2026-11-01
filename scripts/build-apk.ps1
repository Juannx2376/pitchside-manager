# Compila el APK de depuración (Android) con Capacitor.
# Requiere .android-tools/ (JDK 17 + Android SDK) en la raíz del repo; ver AGENTS.md.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$t = Join-Path $root '.android-tools'
$env:JAVA_HOME = (Get-ChildItem (Join-Path $t 'jdk') -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $t 'sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Set-Location $root
npm run build -w @pitchside/web
Set-Location (Join-Path $root 'apps\web')
npx cap sync android
Set-Location 'android'
.\gradlew.bat assembleDebug --no-daemon
New-Item -ItemType Directory -Force (Join-Path $root 'release') | Out-Null
Copy-Item 'app\build\outputs\apk\debug\app-debug.apk' (Join-Path $root 'release\Pitchside-Manager-debug.apk') -Force
Write-Host 'APK: release\Pitchside-Manager-debug.apk'
