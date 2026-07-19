$ErrorActionPreference = "Stop"
$ModelDir = Join-Path $PSScriptRoot "models"
$ModelPath = Join-Path $ModelDir "best_nano_111.pt"
$Url = "https://github.com/sayedgamal99/Real-Time-Smoke-Fire-Detection-YOLO11/raw/refs/heads/main/models/best_nano_111.pt"

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null
Write-Host "Downloading trained fire/smoke model..."
Invoke-WebRequest -Uri $Url -OutFile $ModelPath
Write-Host "Saved model to $ModelPath"
