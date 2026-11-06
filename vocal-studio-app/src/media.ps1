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
# Attention : [Console]::In.ReadLineAsync() bloque sous Windows PowerShell 5.1. On lit donc le flux brut,
# dont la lecture asynchrone tourne vraiment en arrière-plan.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$cmdTask = $stdin.ReadLineAsync()
# Volume de l'appli qui joue (Deezer, Spotify, navigateur) dans le mélangeur de Windows.
# Compilé au premier réglage seulement : Add-Type prend une seconde.
$script:volReady = $false
function Set-AppVolume($value) {
  if (-not $script:volReady) {
    Add-Type -TypeDefinition @"
using System; using System.Diagnostics; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class HushDeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IHushEnum {
  int EnumAudioEndpoints(int flow, int mask, out IntPtr devs);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IHushDevice dev); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IHushDevice {
  [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IHushManager {
  int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
  int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
  [PreserveSig] int GetSessionEnumerator(out IHushSessions e); }
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IHushSessions {
  [PreserveSig] int GetCount(out int n);
  [PreserveSig] int GetSession(int i, out IHushSession s); }
[ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IHushSession {
  int GetState(out int s); int GetDisplayName(out IntPtr p); int SetDisplayName(IntPtr a, IntPtr b); int GetIconPath(out IntPtr p); int SetIconPath(IntPtr a, IntPtr b);
  int GetGroupingParam(out Guid g); int SetGroupingParam(ref Guid g, IntPtr c); int RegisterAudioSessionNotification(IntPtr c); int UnregisterAudioSessionNotification(IntPtr c);
  int GetSessionIdentifier(out IntPtr s); int GetSessionInstanceIdentifier(out IntPtr s);
  [PreserveSig] int GetProcessId(out uint pid); }
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IHushVolume {
  [PreserveSig] int SetMasterVolume(float v, ref Guid ctx);
  [PreserveSig] int GetMasterVolume(out float v); }
public static class HushMixer {
  public static int Set(string[] names, float v) {
    var en = (IHushEnum)new HushDeviceEnumerator(); IHushDevice dev;
    if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0) return 0;
    var iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"); object o;
    if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return 0;
    IHushSessions list; if (((IHushManager)o).GetSessionEnumerator(out list) != 0) return 0;
    int n, done = 0; list.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IHushSession s; if (list.GetSession(i, out s) != 0) continue;
      uint pid; s.GetProcessId(out pid); if (pid == 0) continue;
      string proc; try { proc = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; }
      foreach (var name in names) if (proc.Contains(name)) { var g = Guid.Empty; ((IHushVolume)s).SetMasterVolume(v, ref g); done++; break; }
    }
    return done;
  }
}
"@
    $script:volReady = $true
  }
  # « Deezer.Deezer_xxx!App », « Spotify.exe », « Chrome », « MSEdge » : on garde les mots qui peuvent être le nom du programme
  $names = @(($script:s.SourceAppUserModelId.ToLower() -replace '\.exe$', '') -split '[._!\\]' | Where-Object { $_.Length -ge 4 })
  $null = [HushMixer]::Set([string[]]$names, [float]$value)
}
function Run-Command($cmd) {
  if (-not $script:s) { return }
  if ($cmd -match '^volume ([0-9.]+)$') { try { Set-AppVolume ([double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture)) } catch {}; return }
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
