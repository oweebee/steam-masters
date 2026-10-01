$pair = "mcp:SteamMCP2026!"
$auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ Authorization = "Basic $auth" }

# Ouvrir le flux SSE et le laisser ouvert (les reponses JSON-RPC arrivent dessus, pas sur les POST)
$req = [System.Net.HttpWebRequest]::Create("https://steammasters-mcp.obsidianspoon.com/sse")
$req.Headers.Add("Authorization", "Basic $auth")
$req.Method = "GET"
$resp = $req.GetResponse()
$stream = $resp.GetResponseStream()
$reader = New-Object System.IO.StreamReader($stream)

$lines = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
$ps = [PowerShell]::Create()
[void]$ps.AddScript({
  param($reader, $lines)
  while (-not $reader.EndOfStream) {
    $l = $reader.ReadLine()
    if ($l) { [void]$lines.Add($l) }
  }
}).AddArgument($reader).AddArgument($lines)
$handle = $ps.BeginInvoke()

function Wait-Line($pattern, $timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $found = $lines | Where-Object { $_ -match $pattern } | Select-Object -Last 1
    if ($found) { return $found }
    Start-Sleep -Milliseconds 200
  }
  return $null
}

$sidLine = Wait-Line "session_id=" 8
if (-not $sidLine) { Write-Host "Pas de session_id, verifie le mot de passe."; exit 1 }
$sid = ($sidLine -split "session_id=")[1].Trim()
$msgUrl = "https://steammasters-mcp.obsidianspoon.com/messages/?session_id=$sid"

function Send-Rpc($body) {
  [System.IO.File]::WriteAllText("$env:TEMP\mcp_body.json", ($body | ConvertTo-Json -Depth 10 -Compress))
  Invoke-RestMethod -Uri $msgUrl -Headers $headers -Method POST -ContentType "application/json" -InFile "$env:TEMP\mcp_body.json" | Out-Null
}

Send-Rpc @{ jsonrpc="2.0"; id=1; method="initialize"; params=@{ protocolVersion="2024-11-05"; capabilities=@{}; clientInfo=@{ name="ps"; version="1.0" } } }
[void](Wait-Line '"id":1' 5)
Send-Rpc @{ jsonrpc="2.0"; method="notifications/initialized" }
Start-Sleep -Milliseconds 300

$sql = 'SELECT migration_name, finished_at, rolled_back_at, logs FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 8;'
Send-Rpc @{ jsonrpc="2.0"; id=2; method="tools/call"; params=@{ name="execute_sql"; arguments=@{ sql=$sql } } }
$resultLine = Wait-Line '"id":2' 10

Write-Host "----- RESULTAT -----"
Write-Host $resultLine

$ps.Stop(); $ps.Dispose(); $reader.Close(); $stream.Close(); $resp.Close()
