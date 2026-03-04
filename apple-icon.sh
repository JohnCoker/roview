#!/bin/sh
rm -rf app.iconset src-tauri/icons/icon.icns
mkdir app.iconset
sips -z 16 16     artwork/app-icon-apple.png --out app.iconset/icon_16x16.png
sips -z 32 32     artwork/app-icon-apple.png --out app.iconset/icon_16x16@2x.png
sips -z 32 32     artwork/app-icon-apple.png --out app.iconset/icon_32x32.png
sips -z 64 64     artwork/app-icon-apple.png --out app.iconset/icon_32x32@2x.png
sips -z 128 128   artwork/app-icon-apple.png --out app.iconset/icon_128x128.png
sips -z 256 256   artwork/app-icon-apple.png --out app.iconset/icon_128x128@2x.png
sips -z 256 256   artwork/app-icon-apple.png --out app.iconset/icon_256x256.png
sips -z 512 512   artwork/app-icon-apple.png --out app.iconset/icon_256x256@2x.png
sips -z 512 512   artwork/app-icon-apple.png --out app.iconset/icon_512x512.png
sips -z 1024 1024 artwork/app-icon-apple.png --out app.iconset/icon_512x512@2x.png
iconutil -c icns app.iconset -o src-tauri/icons/icon.icns
rm -rf app.iconset
ls -l src-tauri/icons/icon.icns
