Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$outDir = Join-Path $PSScriptRoot '..\miniprogram\images'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Save-Icon {
  param(
    [string]$Name,
    [string]$Color,
    [scriptblock]$Draw
  )
  $size = 81
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($Color), 5)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  & $Draw $g $pen
  $bmp.Save((Join-Path $outDir "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function Points {
  param([array]$Pairs)
  $result = New-Object 'System.Drawing.Point[]' $Pairs.Count
  for ($i = 0; $i -lt $Pairs.Count; $i++) {
    $result[$i] = New-Object System.Drawing.Point($Pairs[$i][0], $Pairs[$i][1])
  }
  return , $result
}

function Draw-Home($g, $pen) {
  $g.DrawLines($pen, (Points @(@(14, 39), @(40, 16), @(67, 39))))
  $g.DrawLines($pen, (Points @(@(20, 35), @(20, 67), @(61, 67), @(61, 35))))
  $g.DrawLines($pen, (Points @(@(34, 67), @(34, 49), @(47, 49), @(47, 67))))
}

function Draw-Grid($g, $pen) {
  $g.DrawRectangle($pen, 17, 17, 19, 19)
  $g.DrawRectangle($pen, 45, 17, 19, 19)
  $g.DrawRectangle($pen, 17, 45, 19, 19)
  $g.DrawRectangle($pen, 45, 45, 19, 19)
}

function Draw-Cart($g, $pen) {
  $g.DrawLine($pen, 13, 20, 21, 20)
  $g.DrawLines($pen, (Points @(@(21, 20), @(28, 55), @(62, 55), @(69, 31), @(26, 31))))
  $g.DrawEllipse($pen, 31, 61, 9, 9)
  $g.DrawEllipse($pen, 54, 61, 9, 9)
}

function Draw-User($g, $pen) {
  $g.DrawEllipse($pen, 29, 13, 23, 23)
  $g.DrawLines($pen, (Points @(@(19, 68), @(23, 55), @(31, 49), @(50, 49), @(58, 55), @(62, 68))))
}

function Draw-Service($g, $pen) {
  $g.DrawArc($pen, 15, 14, 51, 48, 180, 180)
  $g.DrawRectangle($pen, 12, 38, 10, 17)
  $g.DrawRectangle($pen, 59, 38, 10, 17)
  $g.DrawLines($pen, (Points @(@(22, 55), @(22, 64), @(39, 64))))
  $g.DrawEllipse($pen, 37, 59, 8, 8)
}

function Draw-Order($g, $pen) {
  $g.DrawRectangle($pen, 22, 13, 37, 55)
  $g.DrawLine($pen, 30, 27, 51, 27)
  $g.DrawLine($pen, 30, 38, 51, 38)
  $g.DrawLine($pen, 30, 49, 45, 49)
}

function Draw-Search($g, $pen) {
  $g.DrawEllipse($pen, 18, 18, 26, 26)
  $g.DrawLine($pen, 42, 42, 59, 59)
}

$normal = '#8C8B82'
$active = '#E2572B'
$dark = '#55564E'
$light = '#F7E7CC'

Save-Icon -Name 'tab-home' -Color $normal -Draw ${function:Draw-Home}
Save-Icon -Name 'tab-home-active' -Color $active -Draw ${function:Draw-Home}
Save-Icon -Name 'tab-grid' -Color $normal -Draw ${function:Draw-Grid}
Save-Icon -Name 'tab-grid-active' -Color $active -Draw ${function:Draw-Grid}
Save-Icon -Name 'tab-cart' -Color $normal -Draw ${function:Draw-Cart}
Save-Icon -Name 'tab-cart-active' -Color $active -Draw ${function:Draw-Cart}
Save-Icon -Name 'tab-user' -Color $normal -Draw ${function:Draw-User}
Save-Icon -Name 'tab-user-active' -Color $active -Draw ${function:Draw-User}
Save-Icon -Name 'icon-service' -Color $dark -Draw ${function:Draw-Service}
Save-Icon -Name 'icon-cart' -Color $dark -Draw ${function:Draw-Cart}
Save-Icon -Name 'icon-order' -Color $dark -Draw ${function:Draw-Order}
Save-Icon -Name 'icon-service-light' -Color $light -Draw ${function:Draw-Service}
Save-Icon -Name 'icon-cart-light' -Color $light -Draw ${function:Draw-Cart}
Save-Icon -Name 'icon-order-light' -Color $light -Draw ${function:Draw-Order}
Save-Icon -Name 'icon-cart-brand' -Color '#1F4D3B' -Draw ${function:Draw-Cart}
Save-Icon -Name 'icon-search' -Color '#9A988F' -Draw ${function:Draw-Search}

Write-Output "icons generated in $outDir"
