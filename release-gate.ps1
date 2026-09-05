param(
    [string]$ExpectedBranch = "chore/security-upgrade-next-15",
    [string]$ExpectedTag = "vedett-karrier-security-rc1"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Failures = @()
$Warnings = @()

function Pass($m) { Write-Host "[PASS] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow; $script:Warnings += $m }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red; $script:Failures += $m }
function Section($m) { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Cyan }

Section "Repository"
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -eq 0) { Pass "Git repository elérhető." } else { Fail "Nem Git repository." }

$branch = (git branch --show-current).Trim()
if ($branch -eq $ExpectedBranch) { Pass "Branch: $branch" } else { Warn "Aktuális branch: $branch; elvárt: $ExpectedBranch" }

Section "Node.js"
$node = (node --version).Trim()
Write-Host "Node: $node"
if ($node -match '^v(\d+)\.') {
    $major = [int]$Matches[1]
    if ($major -ge 22) { Pass "Node >=22 teljesül." } else { Fail "Node 22+ szükséges." }
    if ($major -eq 24) { Pass "Node 24.x egyezik a Vercel runtime-mal." } else { Warn "Lokálisan nem Node 24.x fut." }
} else { Fail "Node verzió nem értelmezhető." }

Section "Kulcs dependency-k"
$pkg = Get-Content .\package.json -Raw | ConvertFrom-Json

if ($pkg.dependencies.'@supabase/ssr' -eq "0.12.6") { Pass "@supabase/ssr 0.12.6" } else { Fail "@supabase/ssr eltérés." }
if ($pkg.dependencies.'@supabase/supabase-js' -eq "2.115.0") { Pass "@supabase/supabase-js 2.115.0" } else { Fail "@supabase/supabase-js eltérés." }

$nextJson = npm ls next --json 2>$null | ConvertFrom-Json
$nextVersion = $nextJson.dependencies.next.version
Write-Host "Next.js: $nextVersion"
if ($nextVersion -match '^15\.5\.(\d+)$' -and [int]$Matches[1] -ge 24) {
    Pass "Next.js jóváhagyott 15.5.x security szint."
} else {
    Fail "Nem jóváhagyott Next.js verzió: $nextVersion"
}

Section "RC tag"
$head = (git rev-parse HEAD).Trim()
$tagCommit = git rev-list -n 1 $ExpectedTag 2>$null
if (-not $tagCommit) {
    Fail "Hiányzik az RC tag: $ExpectedTag"
} else {
    $tagCommit = $tagCommit.Trim()
    Write-Host "HEAD: $head"
    Write-Host "$ExpectedTag : $tagCommit"
    if ($head -eq $tagCommit) { Pass "HEAD = RC tag." } else { Warn "HEAD eltér az RC tagtől; élesítés előtt új RC tag ajánlott." }
}

Section "Working tree"
$tracked = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
$untracked = @(git status --porcelain | Where-Object { $_ -match '^\?\?' })
if ($tracked.Count -eq 0) { Pass "Nincs módosított tracked fájl." } else { Fail "Van módosított tracked fájl."; $tracked | ForEach-Object { Write-Host "  $_" } }
if ($untracked.Count -gt 0) { Warn "$($untracked.Count) untracked fájl van; ezek nem blokkolnak." }

Section "TypeScript"
npx tsc --noEmit
if ($LASTEXITCODE -eq 0) { Pass "TypeScript." } else { Fail "TypeScript." }

Section "Production build"
npm run build
if ($LASTEXITCODE -eq 0) { Pass "Production build." } else { Fail "Production build." }

git ls-files --error-unmatch tsconfig.tsbuildinfo *> $null
if ($LASTEXITCODE -eq 0) { git restore tsconfig.tsbuildinfo *> $null }

Section "Védett Útvonal tesztek"
npm run test:vedett-route
if ($LASTEXITCODE -eq 0) { Pass "Védett Útvonal regresszió." } else { Fail "Védett Útvonal regresszió." }

Section "Diff integrity"
git diff --check
if ($LASTEXITCODE -eq 0) { Pass "git diff --check" } else { Fail "git diff --check" }

Section "npm audit"
$auditRaw = npm audit --json 2>$null
try {
    $audit = $auditRaw | ConvertFrom-Json
    $names = @()
    if ($audit.vulnerabilities) { $names = @($audit.vulnerabilities.PSObject.Properties.Name) }

    if ($names.Count -eq 0) {
        Pass "npm audit: 0 finding."
    } else {
        Write-Host "Findingok: $($names -join ', ')"
        $allowed = @("postcss", "next")
        $unexpected = @($names | Where-Object { $_ -notin $allowed })
        if ($unexpected.Count -eq 0) {
            Warn "Csak a dokumentált Next/PostCSS transitive finding maradt. npm audit fix --force TILOS."
        } else {
            Fail "Nem jóváhagyott audit finding: $($unexpected -join ', ')"
        }
    }
} catch {
    Fail "npm audit JSON nem feldolgozható."
}

Section "Végső working tree"
$trackedAfter = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
if ($trackedAfter.Count -eq 0) { Pass "A gate nem hagyott tracked módosítást." } else { Fail "A gate után tracked módosítás maradt." }

Write-Host ""
Write-Host "==============================================" -ForegroundColor White
if ($Failures.Count -eq 0) {
    Write-Host "READY FOR PRODUCTION" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor White
    Write-Host "Technikai gate: PASS" -ForegroundColor Green
    if ($Warnings.Count -gt 0) {
        Write-Host "Figyelmeztetések:" -ForegroundColor Yellow
        $Warnings | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    }
    Write-Host "A script nem merge-el, nem deployol, nem pushol, és nem futtat --force audit fixet."
    exit 0
} else {
    Write-Host "NOT READY FOR PRODUCTION" -ForegroundColor Red
    Write-Host "==============================================" -ForegroundColor White
    Write-Host "Blokkolók:" -ForegroundColor Red
    $Failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}
