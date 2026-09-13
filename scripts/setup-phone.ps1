$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$localDir = Join-Path $taskRoot '.local'
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
$addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254*' -and
  $_.InterfaceAlias -notmatch 'VMware|vEthernet|VirtualBox|Ethernet 2'
} | Select-Object -ExpandProperty IPAddress)
if ($addresses.Count -eq 0) { throw 'Connect this PC to Wi-Fi or Ethernet first.' }
$lanIp = $addresses[0]
$settingsPath = Join-Path $localDir 'https.json'
$settings = if (Test-Path -LiteralPath $settingsPath) { Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json } else { $null }
if (!$settings -or $settings.address -ne $lanIp -or !(Test-Path -LiteralPath $settings.pfx) -or !(Test-Path -LiteralPath (Join-Path $taskRoot 'public/neurix-local-ca.cer'))) {
  $rootCert = New-SelfSignedCertificate -Type Custom -Subject 'CN=Neurix Local Development' -FriendlyName 'Neurix local HTTPS root' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -KeyUsage CertSign,CRLSign -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(1) -TextExtension @('2.5.29.19={critical}{text}ca=1&pathlength=0')
  $san = '2.5.29.17={text}DNS=localhost&DNS=' + $env:COMPUTERNAME + '&IPAddress=127.0.0.1'
  foreach ($address in $addresses) { $san += '&IPAddress=' + $address }
  $serverCert = New-SelfSignedCertificate -Type Custom -Subject 'CN=Neurix Local Camera' -FriendlyName 'Neurix phone HTTPS' -Signer $rootCert -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddMonths(3) -TextExtension @($san, '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
  $passwordBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($passwordBytes)
  $password = [Convert]::ToBase64String($passwordBytes)
  $pfxPath = Join-Path $localDir 'server.pfx'
  Export-PfxCertificate -Cert $serverCert -FilePath $pfxPath -Password (ConvertTo-SecureString -String $password -AsPlainText -Force) | Out-Null
  $publicCert = Join-Path $taskRoot 'public/neurix-local-ca.cer'
  Export-Certificate -Cert $rootCert -FilePath $publicCert | Out-Null
  # Only the public root certificate is shared with the phone. Its private key
  # stays non-exportable in this Windows user's certificate store.
  @{ pfx = $pfxPath; passphrase = $password; address = $lanIp; rootThumbprint = $rootCert.Thumbprint } | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding Ascii
}
$phonePage = @"
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Neurix on your phone</title>
<style>body{background:#000;color:#fff;font:15px/1.8 system-ui;margin:0;padding:50px 26px;max-width:540px}h1{font-size:25px;font-weight:500}p,li{color:#aaa}a{color:#fff}li{margin:16px 0}.button{display:block;background:#fff;color:#000;text-align:center;padding:14px;border-radius:40px;text-decoration:none;margin:25px 0}</style>
<h1>Neurix on your phone</h1><p>Keep your phone and this PC on the same Wi-Fi. This certificate enables the local camera connection.</p>
<ol><li><a href="/neurix-local-ca.cer">Download the local camera certificate</a>.</li><li>On iPhone: Settings &gt; General &gt; VPN &amp; Device Management. Install the downloaded <strong>Neurix Local Development</strong> profile.</li><li>Settings &gt; General &gt; About &gt; Certificate Trust Settings. Enable full trust for <strong>Neurix Local Development</strong>.</li></ol>
<a class="button" href="https://${lanIp}:3443/vision">Open Neurix Vision</a>
<p>The server must remain running on your PC. To remove this setup later, remove its certificate profile from your phone.</p>
<p><a href="https://support.apple.com/en-us/102390">Apple's certificate instructions</a></p></html>
"@
[System.IO.File]::WriteAllText((Join-Path $taskRoot 'public/phone.html'), $phonePage, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Phone setup: http://${lanIp}:3000/phone.html"
Write-Output "Vision HTTPS: https://${lanIp}:3443/vision"
Write-Output 'Start both servers: npm run dev and npm run dev:phone.'
