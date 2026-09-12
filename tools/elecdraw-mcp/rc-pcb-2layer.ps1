$ErrorActionPreference = 'Stop'
$tok = 'agt_1789220726896_521_mtyftoj5'
$url = 'http://127.0.0.1:39281/rpc'
$tmp = Join-Path $env:TEMP 'ed_rpc.json'
$script:rpcId = 1

function Rpc([string]$method, $params) {
  $script:rpcId++
  $obj = [ordered]@{ jsonrpc = '2.0'; id = $script:rpcId; method = $method; params = $params }
  $body = $obj | ConvertTo-Json -Compress -Depth 12
  [System.IO.File]::WriteAllText($tmp, $body, [System.Text.UTF8Encoding]::new($false))
  $out = curl.exe --noproxy "*" -s -m 25 -X POST $url -H "Authorization: Bearer $tok" -H "Content-Type: application/json" --data-binary "@$tmp"
  if (-not $out) { throw "empty $method" }
  $j = $out | ConvertFrom-Json
  if ($null -ne $j.error) { throw "$method : $($j.error.message)" }
  Write-Host "OK $method"
  return $j.result
}

function Track($x1, $y1, $x2, $y2, $layer, $netId, $netName) {
  $dx = [double]$x1 - [double]$x2
  $dy = [double]$y1 - [double]$y2
  if ([math]::Sqrt($dx * $dx + $dy * $dy) -lt 2) { return }
  try {
    Rpc 'pcb.add_track_segment' @{
      x1 = [double]$x1; y1 = [double]$y1; x2 = [double]$x2; y2 = [double]$y2
      layer = $layer; netId = $netId; netName = $netName
    } | Out-Null
  } catch {
    Write-Host "WARN track ($x1,$y1)->($x2,$y2) $_"
    throw
  }
}

function Pad($s, $ref, $num) {
  $p = $s.pads | Where-Object { $_.ref -eq $ref -and [string]$_.pad -eq [string]$num } | Select-Object -First 1
  if (-not $p) { throw "missing $ref.$num" }
  return $p
}

try { Rpc 'pcb.drawing_session_begin' @{ reason = 'RC lab 2-layer route' } | Out-Null } catch { Write-Host "begin: $_" }

Rpc 'pcb.set_copper_layer_count' @{ count = 2 } | Out-Null
Rpc 'pcb.clear_copper' @{ tracks = $true; vias = $true } | Out-Null
try { Rpc 'pcb.clear_mount_nets' @{} | Out-Null } catch { Write-Host "mount nets: $_" }

# Spaced layout
Rpc 'pcb.move_footprint' @{ ref = 'S1'; x = 300; y = 220; rotation = 90 } | Out-Null
Rpc 'pcb.move_footprint' @{ ref = 'R1'; x = 300; y = 450; rotation = 90 } | Out-Null
Rpc 'pcb.move_footprint' @{ ref = 'C1'; x = 300; y = 680; rotation = 90 } | Out-Null
Rpc 'pcb.move_footprint' @{ ref = 'S2'; x = 580; y = 450; rotation = 0 } | Out-Null
Rpc 'pcb.move_footprint' @{ ref = 'J1'; x = 980; y = 480; rotation = 0 } | Out-Null
foreach ($m in @(
  @{ ref = 'H1'; x = 80; y = 80 },
  @{ ref = 'H2'; x = 1180; y = 80 },
  @{ ref = 'H3'; x = 80; y = 920 },
  @{ ref = 'H4'; x = 1180; y = 920 }
)) {
  try { Rpc 'pcb.move_footprint' $m | Out-Null } catch {}
}

$s = Rpc 'pcb.get_summary'
foreach ($p in $s.pads) {
  if ($p.ref -match '^(S1|R1|C1|S2|J1|H)') {
    Write-Host ("PAD {0}.{1} ({2:N0},{3:N0}) [{4}]" -f $p.ref, $p.pad, $p.x, $p.y, $p.netName)
  }
}

Rpc 'pcb.set_active_layer' @{ layer = 'F.Cu' } | Out-Null

# NET_1: S1.2 -> R1.1
$a = Pad $s 'S1' 2; $b = Pad $s 'R1' 1
Track $a.x $a.y $b.x $a.y 'F.Cu' $a.netId $a.netName
Track $b.x $a.y $b.x $b.y 'F.Cu' $a.netId $a.netName

# VC: R1.2 -> C1.1
$a = Pad $s 'R1' 2; $b = Pad $s 'C1' 1
Track $a.x $a.y $b.x $b.y 'F.Cu' $a.netId $a.netName

# VC: C1.1 -> S2.1 from LEFT (avoid S2.3)
$a = Pad $s 'C1' 1; $b = Pad $s 'S2' 1
$midX = [double]$b.x - 80
Track $a.x $a.y $midX $a.y 'F.Cu' $a.netId $a.netName
Track $midX $a.y $midX $b.y 'F.Cu' $a.netId $a.netName
Track $midX $b.y $b.x $b.y 'F.Cu' $a.netId $a.netName

# GND: C1.2 -> S2.2 from farther RIGHT (x=780) so VCC drop at x=700 stays clear
$a = Pad $s 'C1' 2; $b = Pad $s 'S2' 2
Track $a.x $a.y 780 $a.y 'F.Cu' $a.netId $a.netName
Track 780 $a.y 780 $b.y 'F.Cu' $a.netId $a.netName
Track 780 $b.y $b.x $b.y 'F.Cu' $a.netId $a.netName

# VCC: top corridor, approach J1.2 from RIGHT at x=1120
$a = Pad $s 'S1' 1; $j = Pad $s 'J1' 2
Track $a.x $a.y $a.x 100 'F.Cu' $a.netId $a.netName
Track $a.x 100 1120 100 'F.Cu' $a.netId $a.netName
Track 1120 100 1120 $j.y 'F.Cu' $a.netId $a.netName
Track 1120 $j.y $j.x $j.y 'F.Cu' $a.netId $a.netName

# NET_1: bottom corridor, rise at x=850 (left of J1), enter horizontally
$a = Pad $s 'R1' 1; $j = Pad $s 'J1' 3
Track $a.x $a.y 140 $a.y 'F.Cu' $a.netId $a.netName
Track 140 $a.y 140 800 'F.Cu' $a.netId $a.netName
Track 140 800 850 800 'F.Cu' $a.netId $a.netName
Track 850 800 850 $j.y 'F.Cu' $a.netId $a.netName
Track 850 $j.y $j.x $j.y 'F.Cu' $a.netId $a.netName

# GND to J1.1: stay left of header, enter at y=330 from x=820
$a = Pad $s 'S2' 2; $j = Pad $s 'J1' 1
Track $a.x $a.y 820 $a.y 'F.Cu' $a.netId $a.netName
Track 820 $a.y 820 $j.y 'F.Cu' $a.netId $a.netName
Track 820 $j.y $j.x $j.y 'F.Cu' $a.netId $a.netName

# VC -> J1.4 via B.Cu (keep clear of F.Cu congestion)
$s = Rpc 'pcb.get_summary'
$vc = Pad $s 'S2' 1
$j4 = Pad $s 'J1' 4
$v1x = 580; $v1y = 340
$v2x = 1080; $v2y = [double]$j4.y + 40
Rpc 'pcb.add_via' @{ x = $v1x; y = $v1y; netId = $vc.netId; netName = $vc.netName } | Out-Null
Rpc 'pcb.add_via' @{ x = $v2x; y = $v2y; netId = $vc.netId; netName = $vc.netName } | Out-Null
Rpc 'pcb.set_active_layer' @{ layer = 'F.Cu' } | Out-Null
Track $vc.x $vc.y $vc.x $v1y 'F.Cu' $vc.netId $vc.netName
Track $vc.x $v1y $v1x $v1y 'F.Cu' $vc.netId $vc.netName
Track $j4.x $j4.y $v2x $j4.y 'F.Cu' $vc.netId $vc.netName
Track $v2x $j4.y $v2x $v2y 'F.Cu' $vc.netId $vc.netName
Rpc 'pcb.set_active_layer' @{ layer = 'B.Cu' } | Out-Null
Track $v1x $v1y $v1x 860 'B.Cu' $vc.netId $vc.netName
Track $v1x 860 $v2x 860 'B.Cu' $vc.netId $vc.netName
Track $v2x 860 $v2x $v2y 'B.Cu' $vc.netId $vc.netName

# GND return on B.Cu along board edge (avoid TH pad columns)
$s = Rpc 'pcb.get_summary'
$gnd = Pad $s 'C1' 2
$gid = $gnd.netId; $gn = $gnd.netName
$gx = 500; $gy = 760
Rpc 'pcb.add_via' @{ x = $gx; y = $gy; netId = $gid; netName = $gn } | Out-Null
Rpc 'pcb.set_active_layer' @{ layer = 'F.Cu' } | Out-Null
Track $gnd.x $gnd.y $gx $gnd.y 'F.Cu' $gid $gn
Track $gx $gnd.y $gx $gy 'F.Cu' $gid $gn

$j1 = Pad $s 'J1' 1
$jx = 1050; $jy = [double]$j1.y
Rpc 'pcb.add_via' @{ x = $jx; y = $jy; netId = $gid; netName = $gn } | Out-Null
Rpc 'pcb.set_active_layer' @{ layer = 'F.Cu' } | Out-Null
Track $j1.x $j1.y $jx $jy 'F.Cu' $gid $gn

Rpc 'pcb.set_active_layer' @{ layer = 'B.Cu' } | Out-Null
Track $gx $gy $gx 880 'B.Cu' $gid $gn
Track $gx 880 1200 880 'B.Cu' $gid $gn
Track 1200 880 1200 $jy 'B.Cu' $gid $gn
Track 1200 $jy $jx $jy 'B.Cu' $gid $gn

$end = Rpc 'pcb.drawing_session_end' @{ fit = $true }
$f = Rpc 'pcb.get_summary'
Write-Host ("DONE copper={0} tracks={1} vias={2}" -f $f.copperLayerCount, $f.trackCount, $f.viaCount)
$f.pads | Where-Object { $_.ref -like 'H*' } | ForEach-Object {
  Write-Host ("H-check {0}.{1} net=[{2}]" -f $_.ref, $_.pad, $_.netName)
}
Write-Host ($end | ConvertTo-Json -Compress)
