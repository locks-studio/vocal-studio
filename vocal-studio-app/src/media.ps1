# Lit la musique en cours sur ce PC via les contrôles multimédias de Windows
# (Deezer, Spotify, navigateur…) et écrit une ligne JSON à chaque changement.
param([string]$Prefer = "deezer", [int]$ParentPid = 0)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Read-Cover($ref) {
  if (-not $ref) { return $null }
  try {
    $s = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($s)
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $type = if ($s.ContentType) { $s.ContentType } else { "image/png" }
    return "data:$type;base64," + [Convert]::ToBase64String($ms.ToArray())
  } catch { return $null }
}

$lastKey = $null; $lastCover = $null; $lastLine = $null
while ($true) {
  # S'arrête tout seul si Hush a été fermé brutalement
  if ($ParentPid -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
  try {
    $sessions = @($mgr.GetSessions())
    # Priorité : l'appli préférée si elle joue, puis n'importe quelle appli qui joue, puis la session courante
    $playing = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq "Playing" }
    $s = $playing | Where-Object { $_.SourceAppUserModelId -match $Prefer } | Select-Object -First 1
    if (-not $s) { $s = $playing | Select-Object -First 1 }
    if (-not $s) { $s = $mgr.GetCurrentSession() }

    if (-not $s) { $out = @{ track = $null } }
    else {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $tl = $s.GetTimelineProperties()
      $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) { $lastKey = $key; $lastCover = Read-Cover $p.Thumbnail }
      $out = @{ track = @{
        app      = $s.SourceAppUserModelId
        title    = $p.Title
        artist   = $p.Artist
        cover    = $lastCover
        duration = [int64]$tl.EndTime.TotalMilliseconds
        progress = [int64]$tl.Position.TotalMilliseconds
        updated  = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
        playing  = ($s.GetPlaybackInfo().PlaybackStatus -eq "Playing")
      } }
    }
    $line = $out | ConvertTo-Json -Compress -Depth 4
    if ($line -ne $lastLine) { $lastLine = $line; [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
  } catch {
    [Console]::Out.WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress)); [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds 1500
}
