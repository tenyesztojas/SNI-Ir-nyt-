Set-Location $PSScriptRoot

# Minden lock fájl törlése a .git mappában
Get-ChildItem ".git" -Filter "*.lock" -Recurse | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "Törölve: $($_.Name)" -ForegroundColor Yellow
}

git add -A
git commit -m "feat: VmIcon emoji icons + new illustration SVGs"
git push

Write-Host "`nKész! Nyomj Enter-t a bezáráshoz." -ForegroundColor Green
Read-Host
