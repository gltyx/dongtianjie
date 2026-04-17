param(
    [Parameter(Mandatory = $true)]
    [string] $PngPath
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PngPath)) {
    Write-Error "File not found: $PngPath"
}

Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($PngPath)
$bmp = $null
$gfx = $null
try {
    $w = $img.Width
    $h = $img.Height
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.DrawImage($img, 0, 0, $w, $h)
    $gfx.Dispose()
    $gfx = $null
    $img.Dispose()
    $img = $null

    for ($yy = 0; $yy -lt $h; $yy++) {
        for ($xx = 0; $xx -lt $w; $xx++) {
            $col = $bmp.GetPixel($xx, $yy)
            if ($col.A -eq 0) { continue }
            $pr = [int]$col.R
            $pg = [int]$col.G
            $pb = [int]$col.B
            $sum = $pr + $pg + $pb
            $mx = [Math]::Max($pr, [Math]::Max($pg, $pb))
            if ($mx -lt 92 -and $sum -lt 268) {
                $bmp.SetPixel($xx, $yy, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            }
        }
    }

    $bmp.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "OK $PngPath"
}
finally {
    if ($null -ne $gfx) { $gfx.Dispose() }
    if ($null -ne $bmp) { $bmp.Dispose() }
    if ($null -ne $img) { $img.Dispose() }
}
