<#
  BLORSE API smoke test — walks the full player path against a running server using only
  real player actions (the two granted starter horses; no dev minting).

  Prereqs:
    1. Seed a database:   $env:DATABASE_URL='file:./.data/blorse'; corepack pnpm --filter @blorse/server seed
    2. Start the server:  $env:DATABASE_URL='file:./.data/blorse'; corepack pnpm --filter @blorse/server start
    (full walkthrough in RUNNING.md)

  Usage (from the repo root):
    powershell -ExecutionPolicy Bypass -File .\player-path.ps1
    powershell -ExecutionPolicy Bypass -File .\player-path.ps1 -BaseUrl http://127.0.0.1:3071

  Best run against a freshly-seeded DB; breed/adventure have cozy cooldowns, so a second run
  on the same data will report those steps as on-cooldown rather than acting again.
#>
param([string]$BaseUrl = 'http://127.0.0.1:3001')

$ErrorActionPreference = 'Stop'
$api = "$BaseUrl/api" # the API is mounted under /api; /health stays at the root
function J($o) { $o | ConvertTo-Json -Depth 6 -Compress }

# 0) health
$h = Invoke-RestMethod "$BaseUrl/health"
"0) health      -> $($h.status)"

# 1) LOG IN as the seeded account.  (To SIGN UP instead: same body to POST /api/auth/register;
#    in production that also needs a valid inviteCode field.)
$login = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' -Body (J @{ username = 'tester'; password = 'horsehorse1' }) -SessionVariable sess
"1) login       -> herd '$($login.herd.name)', cubes=$($login.herd.cubes)"

# 2) WHO AM I (the session cookie now rides in `$sess`)
$me = Invoke-RestMethod "$api/me" -WebSession $sess
$herdId = $me.herd.id
"2) /me         -> user=$($me.user.username), herd=$herdId"

# 3) MY HORSES -> the two granted starter adults
$horses = Invoke-RestMethod "$api/herds/$herdId/horses" -WebSession $sess
$adults = @($horses | Where-Object { $_.lifeStage -eq 'adult' })
$a = $adults[0]; $b = $adults[1]
"3) my horses   -> count=$($horses.Count); breeding pair = $($a.name) x $($b.name)"

# 4) BREEDING ODDS (punnett preview)
$odds = Invoke-RestMethod "$api/breed/odds?a=$($a.id)&b=$($b.id)" -WebSession $sess
"4) breed odds  -> related=$($odds.related), outcomes=$($odds.distribution.Count), method=$($odds.method)"

# 5) BREED the two starters -> a white foal
try {
  $breed = Invoke-RestMethod "$api/breed" -Method Post -ContentType 'application/json' -WebSession $sess -Body (J @{ parentA = $a.id; parentB = $b.id })
  "5) breed       -> viable=$($breed.viable), foal=$($breed.foal.id) ($($breed.foal.lifeStage))"
} catch {
  "5) breed       -> skipped: $($_.Exception.Message) (parents on cooldown? re-seed a clean DB)"
}

# 6) ADVENTURE in Green Grass (open from the start; Dusty Dunes & Weird Woods unlock via quests)
try {
  $adv = Invoke-RestMethod "$api/adventure" -Method Post -ContentType 'application/json' -WebSession $sess -Body (J @{ regionId = 'green-grass'; party = @($a.id, $b.id) })
  "6) adventure   -> successes=$($adv.successes)/$($adv.encounters.Count), loot kinds=$($adv.loot.Count), wild->tavern=$($adv.wild.toTavern)"
} catch {
  "6) adventure   -> skipped: $($_.Exception.Message) (party on cooldown? re-seed a clean DB)"
}

# 7) THE TAVERN (empty until an adventure rolls a wild horse into the shared pool)
$tav = Invoke-RestMethod "$api/tavern" -WebSession $sess
"7) tavern      -> $($tav.Count) horse(s) available to recruit"

# 8) THE JOURNAL (entries accrue from the daily autonomy tick; may be empty on day one)
$jrn = Invoke-RestMethod "$api/journal" -WebSession $sess
"8) journal     -> $($jrn.Count) entr(ies)"

"`nDONE - full player path exercised against $BaseUrl"
