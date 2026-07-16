<#
.SYNOPSIS
    Liest die CDP-Informationen aller physischen Netzwerkadapter
    aller ESXi-Hosts eines vCenters aus.

.DESCRIPTION
    Das Skript:
    - fragt vCenter und Benutzername interaktiv ab
    - öffnet eine sichere Passwortabfrage
    - verbindet sich per VMware PowerCLI
    - liest alle ESXi-Hosts aus
    - ruft die Network-Hints für alle physischen Adapter ab
    - exportiert die Ergebnisse als CSV
    - verwendet Semikolon als Trennzeichen
    - verwendet Windows-1252 als Zeichenkodierung

.VORAUSSETZUNGEN
    VMware PowerCLI:
    Install-Module VMware.PowerCLI -Scope CurrentUser
#>

# ============================================================================
# Einstellungen
# ============================================================================

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$defaultOutputDirectory = [Environment]::GetFolderPath("Desktop")

$viConnection = $null
$results = [System.Collections.Generic.List[object]]::new()


# ============================================================================
# Hilfsfunktionen
# ============================================================================

function ConvertTo-CleanText {
    <#
    .SYNOPSIS
        Wandelt einen Wert in einen bereinigten einzeiligen Text um.
    #>

    param (
        [Parameter()]
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value) {
        return ""
    }

    if ($Value -is [System.Array]) {
        $text = $Value -join ", "
    }
    else {
        $text = [string]$Value
    }

    return ([regex]::Replace($text, "\s+", " ")).Trim()
}


function Export-Windows1252Csv {
    <#
    .SYNOPSIS
        Exportiert Objekte als CSV mit Windows-1252-Kodierung.
    #>

    param (
        [Parameter(Mandatory)]
        [object[]]$InputObject,

        [Parameter(Mandatory)]
        [string]$Path
    )

    # Für PowerShell Core die Codepage-Unterstützung registrieren.
    if ($PSVersionTable.PSEdition -eq "Core") {
        try {
            [System.Text.Encoding]::RegisterProvider(
                [System.Text.CodePagesEncodingProvider]::Instance
            )
        }
        catch {
            Write-Verbose "Windows-1252-Codepage-Provider war bereits registriert."
        }
    }

    $encoding = [System.Text.Encoding]::GetEncoding(1252)

    $csvContent = $InputObject |
        ConvertTo-Csv `
            -Delimiter ";" `
            -NoTypeInformation

    [System.IO.File]::WriteAllLines(
        $Path,
        $csvContent,
        $encoding
    )
}


# ============================================================================
# PowerCLI laden
# ============================================================================

try {
    Import-Module VMware.PowerCLI -ErrorAction Stop
}
catch {
    Write-Error @"
VMware PowerCLI konnte nicht geladen werden.

Installation:
Install-Module VMware.PowerCLI -Scope CurrentUser

Fehler:
$($_.Exception.Message)
"@

    exit 1
}


# ============================================================================
# Benutzereingaben
# ============================================================================

$vCenter = Read-Host "vCenter-Server eingeben"

if ([string]::IsNullOrWhiteSpace($vCenter)) {
    Write-Error "Es wurde kein vCenter-Server angegeben."
    exit 1
}

$vCenterShortName = ($vCenter -split "\.")[0]
$csvFileName = "${vCenterShortName}_ESXi_CDP_Information_$timestamp.csv"

$username = Read-Host "Benutzername eingeben, z. B. user@vsphere.local"

if ([string]::IsNullOrWhiteSpace($username)) {
    Write-Error "Es wurde kein Benutzername angegeben."
    exit 1
}

$credential = Get-Credential `
    -UserName $username `
    -Message "Passwort für $username am vCenter $vCenter eingeben"

$outputDirectoryInput = Read-Host `
    "Ausgabeordner eingeben [Enter = $defaultOutputDirectory]"

if ([string]::IsNullOrWhiteSpace($outputDirectoryInput)) {
    $outputDirectory = $defaultOutputDirectory
}
else {
    $outputDirectory = $outputDirectoryInput.Trim('"')
}

try {
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        $null = New-Item `
            -Path $outputDirectory `
            -ItemType Directory `
            -Force
    }

    $outputDirectory = (
        Resolve-Path -LiteralPath $outputDirectory
    ).Path
}
catch {
    Write-Error "Der Ausgabeordner konnte nicht erstellt oder geöffnet werden: $($_.Exception.Message)"
    exit 1
}

$csvPath = Join-Path `
    -Path $outputDirectory `
    -ChildPath $csvFileName


# ============================================================================
# Verbindung und CDP-Abfrage
# ============================================================================

try {
    Write-Information "" -InformationAction Continue
    Write-Information "Verbinde mit vCenter $vCenter ..." -InformationAction Continue

    $viConnection = Connect-VIServer `
        -Server $vCenter `
        -Credential $credential `
        -ErrorAction Stop

    Write-Information "Verbindung erfolgreich hergestellt." -InformationAction Continue
    Write-Information "" -InformationAction Continue

    $vmHosts = Get-VMHost |
        Sort-Object Name

    if (-not $vmHosts) {
        throw "Im vCenter wurden keine ESXi-Hosts gefunden."
    }

    Write-Information "$($vmHosts.Count) ESXi-Host(s) gefunden." -InformationAction Continue
    Write-Information "" -InformationAction Continue

    $hostNumber = 0

    foreach ($vmHost in $vmHosts) {
        $hostNumber++

        Write-Progress `
            -Activity "CDP-Informationen werden ausgelesen" `
            -Status "Host $hostNumber von $($vmHosts.Count): $($vmHost.Name)" `
            -PercentComplete (($hostNumber / $vmHosts.Count) * 100)

        Write-Information "[$hostNumber/$($vmHosts.Count)] $($vmHost.Name)" `
            -InformationAction Continue

        $clusterName = ""

        try {
            $cluster = Get-Cluster `
                -VMHost $vmHost `
                -ErrorAction SilentlyContinue |
                Select-Object -First 1

            if ($cluster) {
                $clusterName = $cluster.Name
            }
        }
        catch {
            $clusterName = ""
        }

        # Bei nicht erreichbaren Hosts kann QueryNetworkHint nicht ausgeführt werden.
        if ($vmHost.ConnectionState -ne "Connected") {
            $results.Add(
                [PSCustomObject]@{
                    vCenter             = $vCenter
                    Cluster             = $clusterName
                    VMHost              = $vmHost.Name
                    HostConnectionState = $vmHost.ConnectionState
                    PhysicalAdapter     = ""
                    LinkStatus          = ""
                    MACAddress          = ""
                    CDPDeviceID         = ""
                    CDPPortID           = ""
                    CDPManagementIP     = ""
                    CDPSwitchAddress    = ""
                    CDPHardwarePlatform = ""
                    CDPSoftwareVersion  = ""
                    CDPNativeVLAN       = ""
                    CDPMTU              = ""
                    CDPAvailable        = $false
                    QueryStatus         = "Übersprungen"
                    ErrorMessage        = "ESXi-Host ist nicht verbunden."
                }
            )

            Write-Warning "$($vmHost.Name) ist nicht verbunden und wurde übersprungen."
            continue
        }

        try {
            $networkSystem = Get-View `
                -Id $vmHost.ExtensionData.ConfigManager.NetworkSystem `
                -ErrorAction Stop

            # Leeres String-Array bedeutet: Hinweise für alle physischen NICs abfragen.
            $networkHints = $networkSystem.QueryNetworkHint(
                [string[]]@()
            )

            # Physische Adapter zusätzlich auslesen, um MAC und Linkstatus zu erhalten.
            $physicalAdapters = Get-VMHostNetworkAdapter `
                -VMHost $vmHost `
                -Physical `
                -ErrorAction Stop

            foreach ($physicalAdapter in $physicalAdapters) {
                $hint = $networkHints |
                    Where-Object {
                        $_.Device -eq $physicalAdapter.Name
                    } |
                    Select-Object -First 1

                $cdp = $null

                if ($hint) {
                    $cdp = $hint.ConnectedSwitchPort
                }

                $cdpAvailable = $null -ne $cdp

                $results.Add(
                    [PSCustomObject]@{
                        vCenter             = $vCenter
                        Cluster             = $clusterName
                        VMHost              = $vmHost.Name
                        HostConnectionState = $vmHost.ConnectionState
                        PhysicalAdapter     = $physicalAdapter.Name
                        LinkStatus          = if ($physicalAdapter.BitRatePerSec -gt 0) {
                            "Up"
                        }
                        else {
                            "Down"
                        }
                        MACAddress          = $physicalAdapter.Mac
                        CDPDeviceID         = ConvertTo-CleanText $cdp.DevId
                        CDPPortID           = ConvertTo-CleanText $cdp.PortId
                        CDPManagementIP     = ConvertTo-CleanText $cdp.MgmtAddr
                        CDPSwitchAddress    = ConvertTo-CleanText $cdp.Address
                        CDPHardwarePlatform = ConvertTo-CleanText $cdp.HardwarePlatform
                        CDPSoftwareVersion  = ConvertTo-CleanText $cdp.SoftwareVersion
                        CDPNativeVLAN       = ConvertTo-CleanText $cdp.Vlan
                        CDPMTU              = ConvertTo-CleanText $cdp.Mtu
                        CDPAvailable        = $cdpAvailable
                        QueryStatus         = if ($cdpAvailable) {
                            "CDP-Daten gefunden"
                        }
                        else {
                            "Keine CDP-Daten"
                        }
                        ErrorMessage        = ""
                    }
                )
            }

            Write-Information `
                "  $($physicalAdapters.Count) physische Adapter ausgelesen." `
                -InformationAction Continue
        }
        catch {
            $errorMessage = $_.Exception.Message

            $results.Add(
                [PSCustomObject]@{
                    vCenter             = $vCenter
                    Cluster             = $clusterName
                    VMHost              = $vmHost.Name
                    HostConnectionState = $vmHost.ConnectionState
                    PhysicalAdapter     = ""
                    LinkStatus          = ""
                    MACAddress          = ""
                    CDPDeviceID         = ""
                    CDPPortID           = ""
                    CDPManagementIP     = ""
                    CDPSwitchAddress    = ""
                    CDPHardwarePlatform = ""
                    CDPSoftwareVersion  = ""
                    CDPNativeVLAN       = ""
                    CDPMTU              = ""
                    CDPAvailable        = $false
                    QueryStatus         = "Fehler"
                    ErrorMessage        = $errorMessage
                }
            )

            Write-Warning "Abfrage für $($vmHost.Name) fehlgeschlagen: $errorMessage"
        }
    }

    Write-Progress `
        -Activity "CDP-Informationen werden ausgelesen" `
        -Completed

    if ($results.Count -eq 0) {
        throw "Es wurden keine Ergebnisse erzeugt."
    }

    $sortedResults = $results |
        Sort-Object VMHost, PhysicalAdapter

    Export-Windows1252Csv `
        -InputObject $sortedResults `
        -Path $csvPath

    Write-Information "" -InformationAction Continue
    Write-Information "Export erfolgreich abgeschlossen." -InformationAction Continue
    Write-Information "Anzahl CSV-Zeilen: $($sortedResults.Count)" -InformationAction Continue
    Write-Information "CSV-Datei:" -InformationAction Continue
    Write-Information $csvPath -InformationAction Continue

    Write-Information "" -InformationAction Continue
    Write-Information "Vorschau:" -InformationAction Continue

    $sortedResults |
        Select-Object `
            VMHost,
            PhysicalAdapter,
            LinkStatus,
            CDPDeviceID,
            CDPPortID,
            CDPManagementIP,
            QueryStatus |
        Format-Table -AutoSize
}
catch {
    Write-Error "Das Skript wurde mit einem Fehler beendet: $($_.Exception.Message)"
}
finally {
    if ($viConnection) {
        Write-Information "" -InformationAction Continue
        Write-Information "Trenne die vCenter-Verbindung ..." -InformationAction Continue

        Disconnect-VIServer `
            -Server $viConnection `
            -Confirm:$false `
            -ErrorAction SilentlyContinue

        Write-Information "vCenter-Verbindung wurde getrennt." -InformationAction Continue
    }
}
