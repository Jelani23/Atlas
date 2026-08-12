$backendPath = Join-Path (Get-Location) "backend"

if (-not (Test-Path $backendPath)) {
    Write-Host "❌ Could not find backend folder at: $backendPath" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Atlas Backend Reference Search" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$patterns = @(
    "deterministicExtractor",
    "deterministicExtractor\.extract",
    "deterministic.*extract",
    "require\(.*deterministic",
    "from .*deterministic"
)

foreach ($pattern in $patterns) {
    Write-Host ""
    Write-Host ">>> Searching for: $pattern" -ForegroundColor Yellow
    Write-Host ""

    $results = Get-ChildItem `
        -Path $backendPath `
        -Recurse `
        -File `
        -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch "\\node_modules\\" -and
            $_.FullName -notmatch "\\\.git\\"
        } |
        Select-String `
            -Pattern $pattern `
            -CaseSensitive:$false `
            -ErrorAction SilentlyContinue

    if ($results) {
        foreach ($result in $results) {
            Write-Host "$($result.Path):$($result.LineNumber)" -ForegroundColor Green
            Write-Host "    $($result.Line.Trim())"
        }
    }
    else {
        Write-Host "    No matches found." -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Additional extractor-related files" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Get-ChildItem `
    -Path $backendPath `
    -Recurse `
    -File `
    -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch "\\node_modules\\" -and
        $_.FullName -notmatch "\\\.git\\" -and
        $_.Name -match "extract|memory"
    } |
    ForEach-Object {
        Write-Host $_.FullName -ForegroundColor Green
    }

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Search complete." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan