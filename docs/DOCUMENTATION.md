# Content Recommender — Technical documentation

> Written from the source code (revision `e397ccb`, updated with the 2026-10-23 fixes). Problems and suggested fixes
> are in [`AUDIT.md`](AUDIT.md).

## 1. Overview

A static page that connects to a **Jellyfin** server, splits what the user has already played from what they have not
and shows recommendations in two sections:

1. **"Based on Your General Watched Content"** — an aggregated taste profile (genres/tags) applied to the whole unplayed
   catalog; **Load More** button.
2. **"Because you watched X"** — for a few played titles picked at random, the most similar unplayed items; more groups
   appear with infinite *scroll*.

Published at `https://jeffersoncgo.github.io/content-recommender/`. No build, no backend.

## 2. Files

| File | Role |
|---|---|
| `index.html` | Header, login window (`#loginBox`), recommendations container and script loading |
| `style.css` | Dark theme, responsive card grid (≤ 768 px and ≤ 480 px) |
| `script.js` | Login, collecting played/unplayed items, rendering the cards |
| `findSimilar.js` | Similarity and taste algorithms |
| `script_infinity_scroll.js` | Fetches more "Because you watched" groups when nearing the end of the page (one batch at a time) |
| `js/vendor/` | Copies of the dependencies (below) |

### Dependencies (copies in `js/vendor/`, since 2026-10-23)

```
js/vendor/common.js        ← jeffersoncgo/cdn        js/common.js         utils, String/Array extensions
js/vendor/base.js          ← jeffersoncgo/cdn        js/base.js           JCGWeb
js/vendor/object.js        ← jeffersoncgo/cdn        js/object.js         searchInArray (used by the Jellyfin client)
js/vendor/controller.js    ← jeffersoncgo/cdn        js/controller.js     Controller (searchItems debounce)
js/vendor/observer.js      ← jeffersoncgo/cdn        js/observer.js       Observer (used by pageMemory)
js/vendor/pagememory.js    ← jeffersoncgo/cdn        js/pagememory.js     persistence of the [save] fields
js/vendor/windowsHandle.js ← jeffersoncgo/CoverMaker js/windowsHandle.js  showWindow/hideWindow
js/vendor/fetchqueue.js    ← jeffersoncgo/cdn        js/fetchqueue.js     FetchQueue
js/vendor/jellyfin.js      ← jeffersoncgo/CoverMaker js/jellyfin.js       Jellyfin class (login, API, IndexedDB cache, Meilisearch)
js/vendor/search.js        ← jeffersoncgo/cdn        js/search.js         SearchEngine (taste recommendation, strict mode)
https://cdnjs.cloudflare.com/.../font-awesome/6.7.2    icons (with SRI)
```

They used to be loaded live from the other repositories' GitHub Pages: any push there changed (and could break) this
app without warning (`CR-05`). Now updating is a conscious step: when one of these files changes at its source, copy it
to `js/vendor/` with the same content and run this app's tests (see the checklist in `CoverMaker/docs/FIX-PLAN.md`).

## 3. Flow

```
page load
 ├─ loadFieldsFromStorage()                       server (+ username/password only from old versions, used once)
 └─ DOMContentLoaded
     ├─ saved session (Jellyfin.getSavedAuth) or old credentials? → InitializeJellyfin() │ otherwise → shows #loginBox
     └─ new pageMemory().init()                    restores the [save] fields

InitializeJellyfin(explicitLogin)                  explicitLogin = Connect button
 └─ new Jellyfin(server, user, pass, events, true, { preferCredentials: explicitLogin })
     │                                             (CoverMaker's class: token or password login, getLibraries, cache)
     ├─ onLoginSuccess → forgetSavedPassword()     deletes the old username/password; shows "Sign out"
     └─ Sign out → jellyfin.logout() + reload      POST /Sessions/Logout, deletes the saved session
     └─ onLibraryLoad
         ├─ updateTestesSugestions(true)           "Based on Your General Watched Content" section
         └─ updateRecommendations()                "Because you watched" section (3 anchors × 6 items)
```

`getList(…, 'Played'|'Unplayed')` sets `searchParams.PlayedOnly/UnplayedOnly`, `limit = 999999` and calls
`jellyfin.searchItems('', '', {})`, which joins the items of every loaded library and filters with
`jellyfin.isPlayed(item)` (`UserData.Played`, `PlayCount > 0` or `PlayedPercentage ≥ 70`; never for collections).

Each card opens `${Server.ExternalAddress}/web/#/details?id=<Id>&serverId=<ServerId>` in a new tab
(click, Enter or Space).

## 4. "Because you watched" algorithm (`findSimilar`)

`findSimilar(played, unplayed, anchorCount = 10, perAnchor = 7, useSingleAppearance = true)`

1. Removes from the unplayed list the items that have `UserData.Played`.
2. **Rarity** of each genre/tag across the whole catalog: `log((N + 1) / (freq + 1))` (IDF style).
3. Draws a played anchor not used yet (`usedWatchedIds`, global across calls) and scores each candidate:

| Component | Computation | Weight (`WEIGHTS`) |
|---|---|---|
| Genres | Rarity-weighted Jaccard: `Σ rarity(shared) / Σ rarity(union)` | `GENRE = 4` |
| Tags | same | `TAG = 4` |
| Community rating | `max(0, 1 − |Δ| / 10)` (only if both have a rating) | `COMMUNITY_RATING = 3` |
| Year | `max(0, 1 − |Δ| / 80)` (only if both have a year) | `PRODUCTION_YEAR = 2` |
| Title words | `|shared| / max(|A|, |B|)` (Unicode letter/number tokens, accents removed, without "the/part/season/episode") | `NAME = 3` |
| Title prefix | +weight if one title starts with the other | `START_WITH = 6` |

   `score = Σ(component × weight) / Σ(applicable weights) × 100`. Candidates with `score > 15` stay, sorted, up to
   `perAnchor`. `CRITIC_RATING`, `ACTOR`, `DIRECTOR_WRITER` and `STUDIO` are declared but **not used**.
4. With `useSingleAppearance = true`, a recommended item does not show up again for another anchor (`usedUnwatchedIds`).
5. Repeats until it has `anchorCount` groups or runs out of attempts (`2 × played`).

Output: `[{ Name, Id, Recommendations: [{ Name, Id, Genres, CommunityRating, ProductionYear, similarityScore, ImageUrl }] }]`.

## 5. "By taste" algorithm (`getTasteBasedContentfindSimilar`)

**Taste profile** (`buildTasteProfile`): the share of each genre and tag among the played items.

**Score** (`computeTasteSimilarity`):

```
genreScore = Σ share(item genre)
tagScore   = Σ share(item tag) × 1.25
penalty    = 0.85 ^ (genreCount − 4)   if the item has more than 4 genres, otherwise 1
score      = min(1, (0.65 × genreScore + 0.35 × tagScore) × penalty) × 100
```

- **Non-strict mode**: scores the whole unplayed catalog and returns the best `limit` ones (the full list also goes to
  `window.recommendations`, for **Load More**).
- **Strict mode** (used by the app): builds search queries from the played items
  (`extractSearchProfileFromWatched`: the 7 most frequent genres and 7 tags with the `all` operator, average year ± 5,
  rating > `max(average − 0.5, 6)`), filters the played items with `SearchEngine`, recomputes the profile on that
  subset, filters the unplayed items with the new queries and sorts by the score above. The full result goes to
  `window.recommendations` and the **Load More** button shows 6 more per click.
- In practice (`CR-06`, kept on purpose): the search runs in *lax* mode (adds points per query); `all` with 7 genres
  almost never matches and `between` is not a `SearchEngine` operator (it uses `..`), so **only the minimum rating
  filters**. Fixing this changes the recommendations — it is left for the user to decide, testing on the real library.
- Recommended types: `Audio`, `Video`, `Book`, `Movie`, `Series` (`RECOMMENDABLE_TYPES` in `script.js`). The filter is
  applied when the lists are built, not at load time: the library cache is shared with CoverMaker, and loading fewer
  types here would make each app reload the other's cache on every visit.
- The "played" status is refreshed on every load (`needsUserData = true`), even with the library coming from the cache.

## 6. Configuration

| What | Where |
|---|---|
| Similarity weights | `WEIGHTS` in `findSimilar.js` |
| Maximum year difference considered | `MAX_YEAR_DIFF = 80` |
| Minimum threshold | `similarityScore > 15` in `findSimilarForOne` |
| Anchors and items per anchor | `ContentsToCheck = 3`, `similarsToShow = 6` in `script.js` |
| Items per Load More click | `similarsToShow` |
| Default image | `noImage` (placehold.co) |
| Card image size | `POSTER_WIDTH × POSTER_HEIGHT = 360 × 540` (portrait, 2× the card), quality 80, in `findSimilar.js` |

## 7. Storage

| Where | Key | Content |
|---|---|---|
| `localStorage` | `server` | Server address |
| `localStorage` | `jellyfinAuth` | Session `{ server, serverId, userId, token }` (`Jellyfin` class; never the password) |
| `localStorage` | `username`, `password` | Only from old versions: used once to get the token, then deleted |
| IndexedDB `pageMemoryDB` | Page URL | `[save]` fields (only the server; username and password are no longer saved) |
| IndexedDB `<Server.Id>` | `Tags`, `Genres`, `Studios`, `<libraryId>` | Library cache (`Jellyfin` class) |

Since CoverMaker and this app are on the same origin (`jeffersoncgo.github.io`), this data is **shared** between them.
**Clean Saved Memory** asks for confirmation, resets the page memory (`memory.reset()`) and calls `jellyfin.cleanDb()`
(deletes the Jellyfin cache and reloads); it also works before logging in.

## 8. Tests

`node --test "tests/*.test.js"` (Node 20+): syntax, dependencies in `js/vendor/` present and loaded by `index.html`,
tokenizer and shuffle. With `cdn` and `CoverMaker` cloned next to it, it also checks that the copies are identical to
the originals. Runs in CI on every push (`.github/workflows/tests.yml`). Browser tests:
`CoverMaker/tests/browser/cr_auth.js`.

## 9. Running locally

```bash
git clone https://github.com/jeffersoncgo/content-recommender.git
cd content-recommender
python3 -m http.server 8080    # open http://localhost:8080/
```

The browser must reach Jellyfin directly (same network/VPN) and the server must allow CORS for the app's origin.
