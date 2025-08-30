@echo off
echo Creating Chrome Extension Package...

:: Create a clean directory for packaging
if exist "chrome-extension-package" rmdir /s /q "chrome-extension-package"
mkdir "chrome-extension-package"

:: Copy essential files
copy "manifest.json" "chrome-extension-package\"
copy "popup.html" "chrome-extension-package\"
copy "popup.js" "chrome-extension-package\"
copy "content.js" "chrome-extension-package\"

:: Copy icons if they exist
if exist "icons" (
    xcopy "icons" "chrome-extension-package\icons\" /s /i
) else (
    echo WARNING: Icons folder not found. Please create icons before packaging.
)

:: Create ZIP file (requires PowerShell)
powershell -command "Compress-Archive -Path 'chrome-extension-package\*' -DestinationPath 'youtube-random-extension-v1.0.1.zip' -Force"

echo Package created: youtube-random-extension-v1.0.1.zip
echo Ready for Chrome Web Store upload!

pause
