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

$lastKey = $null; $lastCover = $null; $lastLine = $null; $lastApp = $null; $s = $null
# Commandes envoyées par Hush sur l'entrée standard : toggle, next, prev (lues sans bloquer)
$stdin = [Console]::In
$cmdTask = $stdin.ReadLineAsync()
function Run-Command($cmd) {
  if (-not $script:s) { return }
  switch ($cmd) {
    "toggle" { $null = Await ($script:s.TryTogglePlayPauseAsync()) ([bool]) }
    "next"   { $null = Await ($script:s.TrySkipNextAsync()) ([bool]) }
    "prev"   { $null = Await ($script:s.TrySkipPreviousAsync()) ([bool]) }
  }
}
while ($true) {
  # S'arrête tout seul si Hush a été fermé brutalement
  if ($ParentPid -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
  try {
    $sessions = @($mgr.GetSessions())
    # Priorité : l'appli préférée si elle joue, puis n'importe quelle appli qui joue, puis la session courante
    $playing = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq "Playing" }
    $s = $playing | Where-Object { $_.SourceAppUserModelId -match $Prefer } | Select-Object -First 1
    if (-not $s) { $s = $playing | Select-Object -First 1 }
    # Rien ne joue (par exemple après une pause) : on garde la même appli qu'avant
    if (-not $s -and $lastApp) { $s = $sessions | Where-Object { $_.SourceAppUserModelId -eq $lastApp } | Select-Object -First 1 }
    if (-not $s) { $s = $mgr.GetCurrentSession() }
    if ($s) { $lastApp = $s.SourceAppUserModelId }

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
  # Attente de 1,5 s, découpée pour réagir vite aux commandes
  for ($i = 0; $i -lt 6; $i++) {
    if ($cmdTask.IsCompleted) {
      $cmd = $cmdTask.Result
      if ($null -eq $cmd) { exit } # Hush a fermé l'entrée : on s'arrête
      try { Run-Command $cmd.Trim() } catch {}
      $cmdTask = $stdin.ReadLineAsync()
      $lastLine = $null # renvoie l'état tout de suite
      break
    }
    Start-Sleep -Milliseconds 250
  }
}
