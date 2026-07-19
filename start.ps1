$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    py -m venv .venv
}

& ".\.venv\Scripts\Activate.ps1"
python -m pip install --upgrade pip
pip install -r ai\requirements.txt

if (-not (Test-Path "ai\models\best_nano_111.pt")) {
    & ".\ai\download_model.ps1"
}

python ai\app.py
