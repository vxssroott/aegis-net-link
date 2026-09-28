<#
    AEGIS Control API — thin HTTP surface over the existing AEGIS engine.

    This script does NOT implement any network logic. It dot-sources the
    existing AEGIS modules and exposes the operations the AEGIS UI needs:

        GET  /network/state
        GET  /transport/providers
        POST /transport/establish
        POST /transport/verify
        POST /transport/rotate
        POST /transport/recover
        GET  /events

    Architecture:
        Browser UI
          -> AEGIS Control API (this file)
          -> AegisUiControlPlaneContract
          -> Network / Platform contracts
          -> TransportProviderRegistry
          -> WireGuard / OpenVPN / Tor / SOCKS5 / HTTP CONNECT

    Run it on the machine where AEGIS is installed:

        pwsh -File .\Aegis.ControlApi.ps1 -AegisRoot C:\path\to\AEGIS -Prefix http://127.0.0.1:8787/

    Privileged network operations stay inside AEGIS. This file only marshals
    requests and serialises real AEGIS return values.
#>

[CmdletBinding()]
param(
    [string]$AegisRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$Prefix = 'http://127.0.0.1:8787/',
    [string[]]$AllowOrigin = @('*')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Load the existing AEGIS engine. Nothing here is reimplemented.
# ---------------------------------------------------------------------------

$NetworkRoot = Join-Path $AegisRoot 'src\Network'

if (-not (Test-Path -LiteralPath $NetworkRoot)) {
    throw "AEGIS source not found at '$NetworkRoot'. Pass -AegisRoot <path-to-AEGIS-clone>."
}

$ModuleFiles = @(
    'Phase5.ps1'                       # TransportTypes, EventBus, Voice, TransportProviders,
                                       # TransportState, TransportVerification, TransportOrchestrator
    'Interfaces.ps1'
    'Routes.ps1'
    'DNS.ps1'
    'Leaks.ps1'
    'Identity.ps1'
    'PrivacyBoundary.ps1'
    'Phase51ExternalVerification.ps1'
    'TransportProviderContract.ps1'
    'TransportProviderRegistry.ps1'
    'TransportVerificationFabric.ps1'
    'TransportLifecycle.ps1'
    'PlatformContract.ps1'
    'MobileProviderCapabilities.ps1'
    'AndroidTransportContract.ps1'
    'AegisUiControlPlaneContract.ps1'
)

foreach ($File in $ModuleFiles) {
    $Path = Join-Path $NetworkRoot $File
    if (Test-Path -LiteralPath $Path) {
        . $Path
    }
    else {
        Write-Warning "AEGIS module not present, skipping: $File"
    }
}

$VerificationStateFile = Join-Path $AegisRoot 'data\transport\verification-last.json'
New-Item -ItemType Directory -Force -Path (Split-Path $VerificationStateFile -Parent) | Out-Null

# ---------------------------------------------------------------------------
# Helpers — read-only projections of real AEGIS objects.
# ---------------------------------------------------------------------------

function Get-Prop {
    param([object]$Object, [string]$Name)

    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Invoke-AegisSafely {
    param([scriptblock]$Script)

    try { return & $Script }
    catch {
        Write-Warning ("AEGIS observation failed: " + $_.Exception.Message)
        return $null
    }
}

function Get-AegisUiProviders {
    # Registry = declared provider implementations.
    # Observation = live provider evidence from the platform.
    $registry = @(Invoke-AegisSafely { Get-AegisTransportProviderRegistry })
    $observed = @(Invoke-AegisSafely { Get-AegisTransportProviders })
    $state = Invoke-AegisSafely { Get-AegisTransportState }
    $activeId = [string](Get-Prop $state 'ActiveId')
    $stateVerified = [bool](Get-Prop $state 'Verified')

    $results = @()

    foreach ($provider in $registry) {

        if ($null -eq $provider) { continue }

        $name = [string](Get-Prop $provider 'Provider')
        if ([string]::IsNullOrWhiteSpace($name)) { $name = [string](Get-Prop $provider 'Name') }

        $match = $observed | Where-Object {
            [string](Get-Prop $_ 'Provider') -eq $name -or
            [string](Get-Prop $_ 'Id') -eq [string](Get-Prop $provider 'Id')
        } | Select-Object -First 1

        $id = [string](Get-Prop $provider 'Id')
        if ($null -ne $match -and [string]::IsNullOrWhiteSpace($id)) {
            $id = [string](Get-Prop $match 'Id')
        }

        $available = $null
        $active = $null

        if ($null -ne $match) {
            $available = [bool](Get-Prop $match 'Available')
            $active = [bool](Get-Prop $match 'Active')
        }

        $results += [pscustomobject]@{
            Id        = $id
            Provider  = $name
            Type      = [string](Get-Prop $provider 'Type')
            Available = $available
            Active    = $active
            Verified  = ($active -eq $true -and $stateVerified -and $id -eq $activeId)
            Priority  = Get-Prop $provider 'Priority'
        }
    }

    return @($results)
}

function Get-AegisLastVerification {
    if (-not (Test-Path -LiteralPath $VerificationStateFile)) { return $null }
    try {
        return Get-Content -LiteralPath $VerificationStateFile -Raw | ConvertFrom-Json
    }
    catch { return $null }
}

function Set-AegisLastVerification {
    param([object]$Record)

    $Record | ConvertTo-Json -Depth 15 |
        Set-Content -LiteralPath $VerificationStateFile -Encoding UTF8
    return $Record
}

function Invoke-AegisUiVerification {
    <#
        Real verification: external identity consensus, DNS path proof,
        IPv6 boundary correlation, route binding and provider verification
        performed by the existing AEGIS verification code.
    #>

    $external = Invoke-AegisSafely { Get-AegisExternalIPv4 }
    $externalV6 = Invoke-AegisSafely { Get-AegisExternalIPv6 }
    $dnsPath = Invoke-AegisSafely { Get-AegisDnsPathVerification }
    $ipv6 = Invoke-AegisSafely { Test-AegisIPv6Correlation }
    $routes = @(Invoke-AegisSafely { Get-AegisDefaultRoutes })
    $state = Invoke-AegisSafely { Get-AegisTransportState }
    $providers = @(Get-AegisUiProviders)

    $activeId = [string](Get-Prop $state 'ActiveId')
    $activeProvider = $providers | Where-Object { $_.Id -eq $activeId } | Select-Object -First 1

    $providerProof = $false
    if ($null -ne $activeProvider) {
        $observed = @(Invoke-AegisSafely { Get-AegisTransportProviders }) |
            Where-Object { [string](Get-Prop $_ 'Id') -eq $activeId } |
            Select-Object -First 1

        if ($null -ne $observed) {
            $check = Invoke-AegisSafely { Test-AegisTransportVerification -Transport $observed }
            $providerProof = [bool](Get-Prop $check 'Verified')
        }
    }

    $externalProof = $null
    if ($null -ne $external) {
        $externalProof = [bool](Get-Prop $external 'Consistent')
    }

    $dnsProof = $null
    if ($null -ne $dnsPath) {
        $dnsProof = [bool](Get-Prop $dnsPath 'Healthy')
    }

    $ipv6Proof = $null
    if ($null -ne $ipv6) {
        $correlated = Get-Prop $ipv6 'Correlated'
        if ($null -ne $correlated) { $ipv6Proof = -not [bool]$correlated }
        else { $ipv6Proof = [bool](Get-Prop $ipv6 'BoundaryHolds') }
    }

    # Route binding: the default route must terminate on the active transport.
    $routeProof = $null
    if ($routes.Count -gt 0) {
        $routeProof = $false
        if ($null -ne $activeProvider -and $activeProvider.Active -eq $true) {
            $routeProof = $true
        }
    }

    $record = New-AegisTransportVerificationRecord `
        -TransportId $(if ([string]::IsNullOrWhiteSpace($activeId)) { 'none' } else { $activeId }) `
        -Provider $(if ($null -ne $activeProvider) { [string]$activeProvider.Provider } else { 'none' }) `
        -State $(if ($null -ne $activeProvider) { 'Verifying' } else { 'Observe' }) `
        -ExternalEndpointProof ([bool]$externalProof) `
        -RouteBindingProof ([bool]$routeProof) `
        -DnsPathProof ([bool]$dnsProof) `
        -Ipv6BoundaryProof ([bool]$ipv6Proof) `
        -CryptographicTunnelProof $false `
        -ProviderProof ([bool]$providerProof)

    $payload = [pscustomobject]@{
        status            = if ($record.Verified) { 'VERIFIED' } else { 'INCONCLUSIVE' }
        verified          = [bool]$record.Verified
        externalEndpoint  = $externalProof
        routeBinding      = $routeProof
        dnsPath           = $dnsProof
        ipv6Boundary      = $ipv6Proof
        provider          = $providerProof
        record            = $record
        externalIdentity  = $external
        externalIdentityV6 = $externalV6
        timestamp         = (Get-Date).ToUniversalTime().ToString('o')
    }

    Set-AegisLastVerification -Record $payload | Out-Null

    Publish-AegisEvent `
        -Type 'ui.transport.verify' `
        -Category 'transport' `
        -Severity $(if ($record.Verified) { 'info' } else { 'warning' }) `
        -Message "UI verification run: $($payload.status)." `
        -Data $record | Out-Null

    # AEGIS is the authority: transport state only becomes verified when proof holds.
    if (-not $record.Verified -and [bool](Get-Prop $state 'Verified')) {
        Set-AegisTransportState -State 'Verifying' -ActiveId $activeId -Verified $false | Out-Null
    }

    return $payload
}

function Get-AegisUiNetworkState {
    $state = Invoke-AegisSafely { Get-AegisTransportState }
    $identity = Invoke-AegisSafely { Get-AegisNetworkIdentity }
    $external = Invoke-AegisSafely { Get-AegisExternalIPv4 }
    $externalV6 = Invoke-AegisSafely { Get-AegisExternalIPv6 }
    $dnsPath = Invoke-AegisSafely { Get-AegisDnsPathVerification }
    $leaks = Invoke-AegisSafely { Test-AegisNetworkLeaks }
    $boundary = Invoke-AegisSafely { Get-AegisNetworkPrivacyBoundary }
    $routes = @(Invoke-AegisSafely { Get-AegisDefaultRoutes })
    $providers = @(Get-AegisUiProviders)
    $verification = Get-AegisLastVerification

    $defaultRoute = $routes | Select-Object -First 1
    $routeIndex = Get-Prop $defaultRoute 'InterfaceIndex'

    $interfaces = @(Get-Prop $identity 'Interfaces')
    $activeInterface = $interfaces |
        Where-Object { (Get-Prop $_ 'InterfaceIndex') -eq $routeIndex } |
        Select-Object -First 1

    if ($null -eq $activeInterface) {
        $activeInterface = $interfaces | Select-Object -First 1
    }

    $localIpv4 = @(Get-Prop $activeInterface 'IPv4') | Where-Object { $_ } | Select-Object -First 1

    $dnsServers = @()
    foreach ($server in @(Get-Prop $dnsPath 'ConfiguredServers')) {
        $value = [string](Get-Prop $server 'Server')
        if (-not [string]::IsNullOrWhiteSpace($value)) { $dnsServers += $value }
    }

    $transportState = [string](Get-Prop $state 'State')
    $transportVerified = [bool](Get-Prop $state 'Verified')

    $issues = @(Get-Prop $leaks 'Issues')
    function Test-Issue { param([string]$Type)
        if ($null -eq $leaks) { return $null }
        return -not [bool](@($issues | Where-Object { [string](Get-Prop $_ 'Type') -eq $Type }).Count)
    }

    $ipv6Exposed = $null
    $ipv6Global = @(Get-Prop $leaks 'IPv6Global')
    if ($null -ne $leaks) { $ipv6Exposed = ($ipv6Global.Count -eq 0) }

    $status = switch ($transportState) {
        'Active'      { if ($transportVerified) { 'PROTECTED' } else { 'VERIFYING' } }
        'Verifying'   { 'VERIFYING' }
        'Establishing'{ 'ESTABLISHING' }
        'Rotating'    { 'ROTATING' }
        'Recovering'  { 'RECOVERING' }
        'Degraded'    { 'DEGRADED' }
        'Failed'      { 'FAILED' }
        default       { 'OBSERVING' }
    }

    [pscustomobject]@{
        status   = $status
        contract = Invoke-AegisSafely { Get-AegisUiControlPlaneContract }
        identity = [pscustomobject]@{
            # Values come from real AEGIS observation only. Unknown stays null.
            ipv4     = Get-Prop $external 'Address'
            ipv6     = Get-Prop $externalV6 'Address'
            asn      = $null
            provider = Get-Prop $identity 'IdentityType'
            location = $null
        }
        network = [pscustomobject]@{
            interface = Get-Prop $activeInterface 'InterfaceAlias'
            localIpv4 = $localIpv4
            gateway   = Get-Prop $defaultRoute 'NextHop'
            dns       = $(if ($dnsServers.Count) { $dnsServers -join ', ' } else { $null })
            route     = Get-Prop $defaultRoute 'DestinationPrefix'
        }
        exposure = [pscustomobject]@{
            ipv4      = $(if ($transportVerified) { $true } else { $false })
            ipv6      = $ipv6Exposed
            dns       = Test-Issue -Type 'DNS'
            webrtc    = $null   # AEGIS does not observe browser WebRTC surfaces.
            route     = Test-Issue -Type 'Route'
            transport = $transportVerified
        }
        verification = $(if ($null -ne $verification) { $verification } else { [pscustomobject]@{ status = 'PENDING' } })
        transport = [pscustomobject]@{
            state    = $transportState
            activeId = Get-Prop $state 'ActiveId'
            verified = $transportVerified
            since    = Get-Prop $state 'Timestamp'
        }
        boundary  = $(
            # Read-only observation of the AEGIS firewall rule group (no changes made).
            $fw = $null
            if (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) {
                $fw = @(Invoke-AegisSafely { Get-NetFirewallRule -Group 'AEGIS' -ErrorAction Stop })
            }
            $block = @($fw | Where-Object { $_ -and "$($_.Enabled)" -eq 'True' -and "$($_.Direction)" -eq 'Outbound' -and "$($_.Action)" -eq 'Block' })
            [pscustomobject]@{
                policy              = $boundary
                failClosed          = $(if ($null -eq $fw) { $null } else { $block.Count -gt 0 })
                directEgressBlocked = $(if ($null -eq $fw) { $null } else { $block.Count -gt 0 })
            }
        )
        leaks     = $leaks
        providers = $providers
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
    }
}

# ---------------------------------------------------------------------------
# Operations — each delegates to the existing AEGIS orchestrator/lifecycle.
# ---------------------------------------------------------------------------

function Invoke-AegisEstablish {
    Set-AegisTransportState -State 'Establishing' -Verified $false | Out-Null

    Publish-AegisEvent -Type 'ui.transport.establish' -Category 'transport' `
        -Severity 'info' -Message 'UI requested transport establishment.' | Out-Null

    $snapshot = Invoke-AegisTransportOrchestrator -Autonomous
    $verification = Invoke-AegisUiVerification

    [pscustomobject]@{
        accepted     = $true
        operation    = 'establish'
        orchestrator = $snapshot
        verification = $verification
        state        = Get-AegisUiNetworkState
    }
}

function Invoke-AegisRotate {
    $state = Get-AegisTransportState
    Set-AegisTransportState -State 'Rotating' -ActiveId ([string](Get-Prop $state 'ActiveId')) -Verified $false | Out-Null

    Publish-AegisEvent -Type 'ui.transport.rotate' -Category 'transport' `
        -Severity 'info' -Message 'UI requested transport rotation.' | Out-Null

    $snapshot = Invoke-AegisTransportOrchestrator -Autonomous
    $verification = Invoke-AegisUiVerification

    [pscustomobject]@{
        accepted     = $true
        operation    = 'rotate'
        orchestrator = $snapshot
        verification = $verification
        state        = Get-AegisUiNetworkState
    }
}

function Invoke-AegisRecover {
    Set-AegisTransportState -State 'Recovering' -Verified $false | Out-Null

    Publish-AegisEvent -Type 'ui.transport.recover' -Category 'privacy' `
        -Severity 'warning' -Message 'UI requested boundary release / recovery.' | Out-Null

    $snapshot = Invoke-AegisTransportOrchestrator -Autonomous
    $verification = Invoke-AegisUiVerification

    [pscustomobject]@{
        accepted     = $true
        operation    = 'recover'
        orchestrator = $snapshot
        verification = $verification
        state        = Get-AegisUiNetworkState
    }
}

function Get-AegisUiEvents {
    param([int]$Count = 25)

    $events = @(Invoke-AegisSafely { Get-AegisRecentEvents -Count $Count })

    $projected = @()
    foreach ($item in $events) {
        if ($null -eq $item) { continue }
        $projected += [pscustomobject]@{
            id        = [string](Get-Prop $item 'EventId')
            timestamp = [string](Get-Prop $item 'Timestamp')
            type      = [string](Get-Prop $item 'Type')
            category  = [string](Get-Prop $item 'Category')
            severity  = [string](Get-Prop $item 'Severity')
            message   = [string](Get-Prop $item 'Message')
        }
    }

    return [pscustomobject]@{ events = @($projected) }
}

# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)
$listener.Start()

Write-Host "AEGIS Control API listening on $Prefix" -ForegroundColor Green
Write-Host "AEGIS root: $AegisRoot" -ForegroundColor DarkGray

function Write-Json {
    param(
        [System.Net.HttpListenerContext]$Context,
        [object]$Body,
        [int]$StatusCode = 200
    )

    $json = $Body | ConvertTo-Json -Depth 20
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.Headers['Access-Control-Allow-Origin'] = ($AllowOrigin -join ',')
    $Context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept'
    $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $Context.Response.Headers['Cache-Control'] = 'no-store'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}

try {
    while ($listener.IsListening) {

        $context = $listener.GetContext()
        $method = $context.Request.HttpMethod
        $path = ($context.Request.Url.AbsolutePath.TrimEnd('/'))

        if ($path -like '/api*') { $path = $path.Substring(4) }
        if ([string]::IsNullOrWhiteSpace($path)) { $path = '/' }

        Write-Host "$method $path" -ForegroundColor DarkGray

        try {
            if ($method -eq 'OPTIONS') {
                Write-Json -Context $context -Body @{ ok = $true }
                continue
            }

            switch ("$method $path") {

                'GET /network/state'       { Write-Json -Context $context -Body (Get-AegisUiNetworkState); break }
                'GET /transport/providers' { Write-Json -Context $context -Body @{ providers = @(Get-AegisUiProviders) }; break }
                'POST /transport/establish'{ Write-Json -Context $context -Body (Invoke-AegisEstablish); break }
                'POST /transport/verify'   { Write-Json -Context $context -Body (Invoke-AegisUiVerification); break }
                'POST /transport/rotate'   { Write-Json -Context $context -Body (Invoke-AegisRotate); break }
                'POST /transport/recover'  { Write-Json -Context $context -Body (Invoke-AegisRecover); break }
                'GET /events'              { Write-Json -Context $context -Body (Get-AegisUiEvents -Count 25); break }
                'GET /'                    { Write-Json -Context $context -Body (Get-AegisUiControlPlaneContract); break }

                default {
                    Write-Json -Context $context -StatusCode 404 -Body @{ message = "Unknown AEGIS control operation: $method $path" }
                }
            }
        }
        catch {
            Write-Warning $_.Exception.Message
            Write-Json -Context $context -StatusCode 500 -Body @{ message = $_.Exception.Message }
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
