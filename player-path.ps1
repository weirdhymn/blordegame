<#
  BLORSE API smoke test — walks the full player path against a running server.

  Prereqs:
    1. Seed a database:   $env:DATABASE_URL='file:./.data/blorse'; corepack pnpm --filter @blorse/server seed
    2. Start the server:  $env:DATABASE_URL='file:./.data/blorse'; corepack pnpm --filter @blorse/server start
    (full walkthrough in RUNNING.md)

  Usage (from the repo root):
    powershell -ExecutionPolicy Bypass -File .\player-path.ps1
    powershell -ExecutionPolicy Bypass -File .\player-path.ps1 -BaseUrl http://127.0.0.1:3071
#>
param([string]$BaseUrl = 'http://127.0.0.1:3001')

$ErrorActionPreference = 'Stop'
function J($o) { $o | ConvertTo-Json -Depth 6 -Compress }

# 0) health
$h = Invoke-RestMethod "$BaseUrl/health"
"0) health      -> $($h.status)"

# 1) LOG IN as the seeded account.  (To SIGN UP instead: same body to POST /auth/register.)
$login = Invoke-RestMethod "$BaseUrl/auth/login" -Method Post -ContentType 'application/json' -Body (J @{ username = 'tester'; password = 'horsehorse1' }) -SessionVariable sess
"1) login       -> herd '$($login.herd.name)', cubes=$($login.herd.cubes)"

# 2) WHO AM I (the session cookie now rides in `$sess`)
$me = Invoke-RestMethod "$BaseUrl/me" -WebSession $sess
$herdId = $me.herd.id
"2) /me         -> user=$($me.user.username), herd=$herdId"

# 3) MY HORSES -> the seeded starter (Bay 'Clementine')
$horses = Invoke-RestMethod "$BaseUrl/herds/$herdId/horses" -WebSession $sess
$starter = $horses | Where-Object { $_.name -eq 'Clementine' } | Select-Object -First 1
"3) my horses   -> count=$($horses.Count); starter=$($starter.id) ($($starter.name), $($starter.lifeStage))"

# 4) Mint an unrelated adult MATE so we can breed.
#    NOTE: POST /horses is a dev/test affordance — in the real game new horses come from
#    the Tavern (recruit) or adventures (wild encounters), not free minting.
$mate = Invoke-RestMethod "$BaseUrl/horses" -Method Post -ContentType 'application/json' -WebSession $sess -Body (J @{ genotype = @{ E = 'ee'; A = 'aa' }; lifeStage = 'adult' })
"4) mint mate   -> $($mate.id)"

# 5) BREEDING ODDS (punnett preview)
$odds = Invoke-RestMethod "$BaseUrl/breed/odds?a=$($starter.id)&b=$($mate.id)" -WebSession $sess
"5) breed odds  -> related=$($odds.related), outcomes=$($odds.distribution.Count), method=$($odds.method)"

# 6) BREED the two adults -> a white foal
$breed = Invoke-RestMethod "$BaseUrl/breed" -Method Post -ContentType 'application/json' -WebSession $sess -Body (J @{ parentA = $starter.id; parentB = $mate.id })
"6) breed       -> viable=$($breed.viable), foal=$($breed.foal.id) ($($breed.foal.lifeStage))"

# 7) ADVENTURE in Green Grass (open from the start; Dusty Dunes & Weird Woods unlock via quests)
$adv = Invoke-RestMethod "$BaseUrl/adventure" -Method Post -ContentType 'application/json' -WebSession $sess -Body (J @{ regionId = 'green-grass'; party = @($starter.id, $mate.id) })
"7) adventure   -> successes=$($adv.successes)/$($adv.encounters.Count), loot kinds=$($adv.loot.Count), wild->tavern=$($adv.wild.toTavern)"

# 8) THE TAVERN (empty until an adventure rolls a wild horse into it — it's probabilistic)
$tav = Invoke-RestMethod "$BaseUrl/tavern" -WebSession $sess
"8) tavern      -> $($tav.Count) horse(s) available to recruit"

# 9) THE JOURNAL (entries accrue from the daily autonomy tick; may be empty on day one)
$jrn = Invoke-RestMethod "$BaseUrl/journal" -WebSession $sess
"9) journal     -> $($jrn.Count) entr(ies)"

"`nDONE - full player path exercised against $BaseUrl"
