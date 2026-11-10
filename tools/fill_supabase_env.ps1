# 交互式写入 .env.local（密码不回显、不打印）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env.local"

Write-Host "=== 日汉术语词典 · Supabase 凭据填写 ===" -ForegroundColor Cyan
Write-Host "1) Access Token: https://supabase.com/dashboard/account/tokens"
Write-Host "2) Project Ref: Project Settings -> General -> Reference ID"
Write-Host "3) DB Password: Project Settings -> Database"
Write-Host ""

$token = (Read-Host "粘贴 Access Token (sbp_...)").Trim()
$ref = (Read-Host "粘贴 Project Ref").Trim()
$secure = Read-Host "粘贴数据库密码（不回显）" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if (-not $token -or -not $ref -or -not $password) {
  Write-Host "有项为空，未写入。请重新运行。" -ForegroundColor Red
  exit 1
}

$content = @(
  "# ============================================================",
  "# 日汉术语词典 · local-only settings (never commit)",
  "# ============================================================",
  "SUPABASE_ACCESS_TOKEN=$token",
  "SUPABASE_PROJECT_REF=$ref",
  "SUPABASE_DB_PASSWORD=$password",
  "SUPABASE_URL=",
  "SUPABASE_ANON_KEY=",
  "SUPABASE_SERVICE_ROLE_KEY="
)
Set-Content -Path $envPath -Value $content -Encoding utf8
Write-Host ""
Write-Host "已写入：$envPath" -ForegroundColor Green
Write-Host "（内容不会显示；该文件已被 .gitignore 忽略）" -ForegroundColor DarkGray
Write-Host "现在可以运行：python tools\setup_supabase.py" -ForegroundColor Yellow
