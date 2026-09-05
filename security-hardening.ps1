param(
    [switch]$ApplyFix,
    [switch]$Commit,
    [string]$CommitMessage = "chore: apply non-breaking npm security fixes"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Fail($msg) {
    Write-Host ""
    Write-Host "HIBA: $msg" -ForegroundColor Red
    exit 1
}

function Run($cmd) {
    Write-Host "> $cmd" -ForegroundColor DarkGray
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Fail "A parancs hibával állt le: $cmd"
    }
}

Step "Git repository ellenőrzése"
Run "git rev-parse --is-inside-work-tree"
$branch = (git branch --show-current).Trim()
Write-Host "Branch: $branch"

Step "Build-melléktermék visszaállítása"
$trackedBuildInfo = git ls-files --error-unmatch tsconfig.tsbuildinfo 2>$null
if ($LASTEXITCODE -eq 0) {
    git restore tsconfig.tsbuildinfo 2>$null
}

Step "Kiinduló állapot"
git status --short

Step "Telepített Next.js verzió"
Run "npm ls next"

if ($ApplyFix) {
    Step "Nem breaking npm audit javítások"
    Write-Host "FONTOS: a script SOHA nem használ --force kapcsolót." -ForegroundColor Yellow
    Run "npm audit fix"
} else {
    Step "npm audit fix kihagyva"
    Write-Host "Javításhoz futtasd majd: .\security-hardening.ps1 -ApplyFix"
}

Step "TypeScript ellenőrzés"
Run "npx tsc --noEmit"

Step "Production build"
Run "npm run build"

Step "Védett Útvonal tesztek"
Run "npm run test:vedett-route"

Step "tsconfig.tsbuildinfo újbóli visszaállítása"
$trackedBuildInfo = git ls-files --error-unmatch tsconfig.tsbuildinfo 2>$null
if ($LASTEXITCODE -eq 0) {
    git restore tsconfig.tsbuildinfo 2>$null
}

Step "Diff formázási ellenőrzés"
git diff --check
if ($LASTEXITCODE -ne 0) {
    Fail "git diff --check hibát talált."
}

Step "Aktuális npm audit"
npm audit
$auditExit = $LASTEXITCODE
if ($auditExit -ne 0) {
    Write-Host ""
    Write-Host "Az npm audit még talált sérülékenységet. Ez nem feltétlenül blokkoló;" -ForegroundColor Yellow
    Write-Host "breaking/force javítást a script szándékosan nem végez." -ForegroundColor Yellow
}

Step "Módosított tracked fájlok"
$tracked = @(git status --short | Where-Object { $_ -notmatch '^\?\?' })
if ($tracked.Count -eq 0) {
    Write-Host "Nincs módosított tracked fájl."
} else {
    $tracked | ForEach-Object { Write-Host $_ }
}

Step "Dependency diff"
git diff -- package.json package-lock.json

if ($Commit) {
    Step "Biztonságos, célzott commit"
    $allowed = @(
        "package.json",
        "package-lock.json"
    )

    $changedFiles = @(git diff --name-only)
    $unexpected = @($changedFiles | Where-Object { $_ -notin $allowed })

    if ($unexpected.Count -gt 0) {
        Write-Host "A commit leállt, mert a dependency fájlokon kívül más tracked fájl is módosult:" -ForegroundColor Yellow
        $unexpected | ForEach-Object { Write-Host " - $_" }
        Write-Host "Ezeket előbb külön ellenőrizd."
        exit 2
    }

    if ($changedFiles.Count -eq 0) {
        Write-Host "Nincs mit commitolni."
    } else {
        Run "git add package.json package-lock.json"
        Run ('git commit -m "' + $CommitMessage.Replace('"','\"') + '"')
        Write-Host "Commit elkészült." -ForegroundColor Green
    }
}

Step "Végső állapot"
git status --short

Write-Host ""
Write-Host "KÉSZ." -ForegroundColor Green
Write-Host "A script nem futtatott npm audit fix --force parancsot és nem pusholt Gitre."
