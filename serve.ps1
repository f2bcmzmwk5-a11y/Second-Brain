# ============================================================================
#  Second Brain - lokaler Testserver fuer Windows
#
#  Starten:  Rechtsklick auf diese Datei > "Mit PowerShell ausfuehren"
#            oder im Terminal:  powershell -ExecutionPolicy Bypass -File serve.ps1
#
#  Danach im Browser oeffnen:  http://localhost:8080
#  Beenden:  Strg + C
#
#  (Ein Server ist noetig, weil der Service Worker nur ueber http://localhost
#   oder https:// funktioniert - per Doppelklick auf index.html geht es nicht.)
# ============================================================================

param(
    [int]$Port = 8080
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.webmanifest' = 'application/manifest+json'
    '.txt'  = 'text/plain; charset=utf-8'
    '.zip'  = 'application/zip'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Port $Port ist belegt oder gesperrt." -ForegroundColor Red
    Write-Host "Anderen Port versuchen:  .\serve.ps1 -Port 8081" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  Second Brain laeuft" -ForegroundColor Green
Write-Host "  Ordner:  $root"
Write-Host "  Adresse: $prefix" -ForegroundColor Cyan
Write-Host "  Beenden: Strg + C"
Write-Host ""

# Schreibt eine Antwort. Reihenfolge ist wichtig: erst alle Kopfzeilen,
# ContentLength64 zuletzt - sonst setzt Headers.Add() die Laenge zurueck.
function Send-Response {
    param($Response, [byte[]]$Bytes, [string]$Type, [int]$Status = 200, [bool]$BodyOnly = $true)

    $Response.StatusCode = $Status
    # Beim Entwickeln nichts zwischenspeichern, sonst sieht man
    # Aenderungen nicht sofort.
    $Response.Headers.Add('Cache-Control', 'no-store')
    $Response.ContentType = $Type
    $Response.ContentLength64 = $Bytes.Length
    # Bei HEAD fragt der Browser nur die Kopfzeilen ab - kein Inhalt.
    if ($BodyOnly) {
        $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
        $Response.OutputStream.Flush()
    }
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        # Ein Fehler bei einer Anfrage darf den Server nicht beenden.
        try {
            $withBody = ($req.HttpMethod -ne 'HEAD')

            # Pfad aus der Anfrage in einen Dateipfad umwandeln
            $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
            if ($rel -eq '') { $rel = 'index.html' }
            $rel = $rel -replace '/', '\'

            $path = Join-Path $root $rel
            $full = [System.IO.Path]::GetFullPath($path)

            # Sicherheitsnetz: nichts ausserhalb des Ordners ausliefern
            if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root), 'OrdinalIgnoreCase')) {
                $res.StatusCode = 403
                $res.Close()
                continue
            }

            if (Test-Path $full -PathType Container) {
                $full = Join-Path $full 'index.html'
            }

            if (Test-Path $full -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($full).ToLower()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }

                $bytes = [System.IO.File]::ReadAllBytes($full)
                Send-Response -Response $res -Bytes $bytes -Type $type -Status 200 -BodyOnly $withBody
                Write-Host ("  200  /" + $rel.Replace('\','/'))
            } else {
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - nicht gefunden: /$rel")
                Send-Response -Response $res -Bytes $msg -Type 'text/plain; charset=utf-8' -Status 404 -BodyOnly $withBody
                Write-Host ("  404  /" + $rel.Replace('\','/')) -ForegroundColor DarkYellow
            }
        } catch {
            Write-Host ("  FEHLER  " + $_.Exception.Message) -ForegroundColor Red
        }

        try { $res.Close() } catch { }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "`n  Server beendet." -ForegroundColor Yellow
}
