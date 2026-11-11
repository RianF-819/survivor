@echo off
title Pixel Survivor 3D - Local Server
cd /d "%~dp0"
echo ========================================================
echo   STARTING PIXEL SURVIVOR 3D LOCAL SERVER
echo ========================================================
echo.
echo Server active at: http://localhost:8080
echo Launching your browser...
echo.
echo * PENTING: JANGAN TUTUP jendela ini selama Anda bermain! *
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = 8080; $root = (Get-Item -Path '.').FullName; try { $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:' + $port + '/'); $listener.Start(); } catch { $port = 8081; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:' + $port + '/'); $listener.Start(); }; Start-Process ('http://localhost:' + $port); Write-Host ('Server active at http://localhost:' + $port + '/ (Press Ctrl+C to stop)'); while ($listener.IsListening) { try { $context = $listener.GetContext(); $request = $context.Request; $response = $context.Response; $urlPath = $request.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = 'index.html'; }; $filePath = Join-Path $root $urlPath; if (Test-Path $filePath -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($filePath); $ext = [System.IO.Path]::GetExtension($filePath).ToLower(); switch ($ext) { '.html' { $response.ContentType = 'text/html; charset=utf-8' } '.css' { $response.ContentType = 'text/css' } '.js' { $response.ContentType = 'application/javascript' } '.json' { $response.ContentType = 'application/json' } '.env' { $response.ContentType = 'text/plain' } '.flac' { $response.ContentType = 'audio/flac' } default { $response.ContentType = 'application/octet-stream' } }; $response.ContentLength64 = $bytes.Length; $response.OutputStream.Write($bytes, 0, $bytes.Length); } else { $response.StatusCode = 404; }; $response.OutputStream.Close(); } catch { } }"
pause
