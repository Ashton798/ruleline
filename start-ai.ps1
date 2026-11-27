param([switch]$Auto)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root
$null = [System.Reflection.Assembly]::LoadWithPartialName('System.Security')
$configDir = Join-Path $env:LOCALAPPDATA 'Ruleline'
$keyPath = Join-Path $configDir 'zhipu-key.dat'

if (-not $Auto) {
    Write-Host 'Ruleline AI 本机配置'
    Write-Host '密钥输入不显示，使用 Windows 当前账户加密后保存在本机。'
    Write-Host 'AI 请求会发送规则或对话，服务商可能收费。不要将私钥或助记词输入 AI。'
    Write-Host '当前使用智谱开放平台 GLM-5.3-Flash，API 调用按量计费。'
    $secret = Read-Host '请输入智谱开放平台 API Key（不是百炼密钥）' -AsSecureString
    if ($secret.Length -eq 0) { $secret.Dispose(); Write-Host '未输入密钥。'; exit 1 }
    try {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try {
            $keyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
            $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($keyText)
            $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($keyBytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
            [System.IO.File]::WriteAllBytes($keyPath,$encrypted)
        } finally {
            if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
            if ($keyBytes) { [Array]::Clear($keyBytes,0,$keyBytes.Length) }
            $keyText = $null
        }
    } finally { $secret.Dispose() }
    Write-Host '密钥已加密保存。请关闭旧的 Ruleline AI 服务，重新启动本项目以加载新密钥。'
}
if (-not [System.IO.File]::Exists($keyPath)) { if ($Auto) { [Console]::Error.WriteLine('Ruleline AI: saved key unavailable.') }; exit 0 }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), 4399)
try { $listener.Start() } catch { if ($Auto) { [Console]::Error.WriteLine('Ruleline AI: port 4399 unavailable.') }; exit 0 } finally { $listener.Stop() }

$keyBytes = $null
try {
    $encrypted = [System.IO.File]::ReadAllBytes($keyPath)
    $keyBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $env:AI_API_KEY = [System.Text.Encoding]::UTF8.GetString($keyBytes)
    $env:AI_PROVIDER = '智谱 AI'
    $env:AI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
    $env:AI_MODEL = 'glm-5.3-flash'
    $env:AI_VISION_MODEL = 'glm-5.3-flash'
    $env:AI_PORT = '4399'
    if (-not $env:HTTPS_PROXY -and -not $env:https_proxy) {
        try {
            $proxyAddress = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy([Uri]$env:AI_BASE_URL)
            if ($proxyAddress -and $proxyAddress.Host -ne ([Uri]$env:AI_BASE_URL).Host) { $env:HTTPS_PROXY = $proxyAddress.AbsoluteUri }
        } catch {}
    }
    if (-not $Auto) { Write-Host 'AI 服务正在运行。本窗口关闭后，项目下次启动会自动恢复。' }
    & node.exe --use-env-proxy 'server/agent.mjs'
} finally {
    if ($keyBytes) { [Array]::Clear($keyBytes,0,$keyBytes.Length) }
    Remove-Item Env:AI_API_KEY -ErrorAction SilentlyContinue
}
