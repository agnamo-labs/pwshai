# Script to install local AI toolchains
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      PWSHAI LOCAL AI TOOLCHAIN INSTALLER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Ensuring Python and pip are up to date..." -ForegroundColor Yellow
python -m pip install --upgrade pip

Write-Host "`n[2/4] Installing HuggingFace CLI and model management tools..." -ForegroundColor Yellow
pip install -U "huggingface_hub[cli]"
pip install huggingface-hub hf-transfer

Write-Host "`n[3/4] Installing llama-cpp-python for local inference..." -ForegroundColor Yellow
# Try standard install, may need compilation tools on windows
try {
    pip install llama-cpp-python
    Write-Host "  ✔ Successfully installed llama-cpp-python" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ llama-cpp-python failed to compile. You may need C++ Build Tools installed." -ForegroundColor Red
}

Write-Host "`n[4/4] Installing Ollama (Local Model Runner)..." -ForegroundColor Yellow
Write-Host "Checking if Ollama is installed..."
if (Get-Command "ollama" -ErrorAction SilentlyContinue) {
    Write-Host "  ✔ Ollama is already installed!" -ForegroundColor Green
} else {
    Write-Host "  Downloading and installing Ollama for Windows..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile "$env:TEMP\OllamaSetup.exe"
    Start-Process -FilePath "$env:TEMP\OllamaSetup.exe" -ArgumentList "/S" -Wait
    Write-Host "  ✔ Ollama installation complete. (You may need to restart your terminal)." -ForegroundColor Green
}

Write-Host ""
Write-Host "✨ Local AI Toolchain setup is complete!" -ForegroundColor Green
Write-Host "Use 'huggingface-cli login' to authenticate if needed." -ForegroundColor DarkGray
Write-Host "Use 'ollama run llama3' to quickly test a local model." -ForegroundColor DarkGray
Write-Host ""
