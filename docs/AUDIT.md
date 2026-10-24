# Content Recommender — Audit: bugs, suggested fixes and improvements

> Fix plan (phases, the no-feature-loss rule, decisions): [`CoverMaker/docs/FIX-PLAN.md`](https://github.com/jeffersoncgo/CoverMaker/blob/main/docs/FIX-PLAN.md).

> Code review at `e397ccb`. 🔎 = code reading, 🧪 = reproduced.
> Status: ✅ fixed · ◐ partly.
> The app depends on `CoverMaker/js/jellyfin.js` and on several files from `jeffersoncgo/cdn` (copied into `js/vendor/`
> since 2026-10-23); the problems of those libraries are in `CoverMaker/docs/AUDIT.md` (`CM-xx`) and
> `cdn/docs/AUDIT.md` (`CDN-xx`).

## Summary

| ID | Sev. | Where | Problem |
|---|---|---|---|
| CR-14 ✅ | **Critical** | `script.js:326` + `CoverMaker/js/jellyfin.js:754` | **No recommendation shows up since 2025-12-01**: the `AbortSignal` lands in the `tempLimit` parameter 🧪 |
| CR-01 ✅ | High | `script.js:190` | "Played" history frozen at the first load (cache without a `UserData` refresh) 🔎 |
| CR-02 ✅ | High | `jellyfin.js` dependency | Servers with the Meilisearch plugin: items arrive without `UserData` (nothing "played") or libraries do not even load 🔎 |
| CR-03 ✅ | High | `script.js:64-71` | XSS: item name interpolated into `innerHTML` and into an attribute 🔎 |
| CR-04 ✅ | High | `script.js:251`, `index.html:43` | Plain-text password in `localStorage` and in IndexedDB (shared origin) 🔎 |
| CR-05 ✅ | High | `index.html:59-68` | Remote scripts from other repositories with no version and no SRI 🔎 |
| CR-06 ◐ | Medium | `findSimilar.js:102-121,411-427` | The "strict" taste profile practically turns into just "rating > X" 🧪/🔎 |
| CR-07 ✅ | Medium | `findSimilar.js:1-12`, `README.md` | Actors/directors/studios/critic rating do not go into the score (the README says they do) 🔎 |
| CR-08 ✅ | Medium | `script_infinity_scroll.js`, `script.js:98-100` | Scroll triggers concurrent batches; an empty result wipes the whole page 🔎 |
| CR-09 ✅ | Medium | `script.js:211-214` | The type filter (`IncludeItemsTypes`) is never applied 🔎 |
| CR-10 ✅ | Medium | `script.js:69,144,233` | Exceptions: null `CommunityRating`, Load More in non-strict mode, clean memory without login 🔎 |
| CR-11 ◐ | Low | `findSimilar.js:127-133,232`, `jellyfin.js:662-664` | Non-ASCII titles lose tokens; biased shuffle; `isPlayed` with the wrong field 🔎 |
| CR-12 ✅ | Low | `findSimilar.js:387,430,451`, `style.css:255-258` | Image requested at 480×270 and shown in a 180×270 portrait card 🔎 |
| CR-13 ✅ | Low | `README.md`, `index.html` | Documentation and small HTML/accessibility details 🔎 |

---

### CR-14 — No recommendations since 2025-12-01 (Critical) 🧪 — ✅ fixed in `CoverMaker/js/jellyfin.js` (2026-10-23; published, and in this app's `js/vendor/jellyfin.js`)

`getList` calls `jellyfin.searchItems('', '', {})` with three arguments. The `Controller` appends the `AbortSignal` as
the last argument, which lands in `searchItems`' 4th parameter — `tempLimit`, added to CoverMaker's `jellyfin.js` on
2025-12-01 (`adc260c`). So `mLimit = tempLimit || limit` becomes the `AbortSignal` and `items.slice(0, 0 + signal)`
returns `[]`: played and unplayed lists come back empty and the app shows "No recommendations found". Reproduced with a
mock Jellyfin server (55 items, 19 played): the published version showed 0 recommendations; with the fix, 6 by taste +
3 groups × 6.

**Fix (made in CoverMaker):** `tempLimit` only applies if it is a positive number. CoverMaker's callers pass a number
or `null`, so nothing changes for them. This app now uses its own copy (`js/vendor/jellyfin.js`, `CR-05`), which has the
fix.

### CR-01 — "Played" status does not refresh (High) 🔎 — ✅ fixed (2026-10-23)

`new Jellyfin(server, username, password, events)` (`script.js:190`) does not pass the 5th argument `needsUserData`
(default `false`). In `jellyfin.js`, when the library is cached with the same item count, it is loaded from IndexedDB
and `updateLibraryUserData` returns without doing anything if `needsUserData` is false. Result: what was played after
the first load is **not** recognized — the app keeps recommending items already seen and the taste profile does not
evolve, until the library's item count changes or the user cleans the memory.

```js
window.jellyfin = new Jellyfin(server, username, password, { … }, /* needsUserData */ true);
```

Since the cache is shared with CoverMaker (same origin, same `<Server.Id>` database), it is also worth storing the date
of the last `UserData` refresh and using `minDateLastSavedForUser` to fetch only what changed.

### CR-02 — Meilisearch (High) 🔎 — ✅ fixed (2026-10-23)

When the server has the Meilisearch plugin, `jellyfin.js` loads the items through Meilisearch
(`loadLibraryItemsMeiliSearch`), which **brings no `UserData`** → `isPlayed` is false for everything → "Watch some
Contents to get recommendations!". For non-admin users, the Meilisearch setup fails and the libraries do not load
(details in `CM-08`). Fixes: with CR-01 applied, `updateLibraryUserData` fills in `UserData` after the load; and in
`jellyfin.js`, fall back to the "vanilla" load when Meilisearch fails.

### CR-03 — XSS in the cards (High) 🔎 — ✅ fixed (2026-10-23)

```js
ContentCard.innerHTML = `<img src="${imageUrl}" alt="${Content.Name} cover" …> … <h3>${Content.Name}</h3>`;
```

Names come from metadata (NFO, *scrapers*, manual editing). A title with `"` breaks the `alt` attribute and allows
injecting `onerror=…`. Build it with the DOM:

```js
const img = document.createElement('img');
img.src = Content.ImageUrl || noImage;
img.alt = `${Content.Name} cover`;
img.onerror = () => { img.onerror = null; img.src = noImage; };
const h3 = document.createElement('h3'); h3.textContent = Content.Name;
```

The same applies to `showLoadingLibraries` and `addVideoposter` in `jellyfin.js` (see `CM-06`).

### CR-04 — Credentials (High) 🔎 — ✅ fixed (2026-10-23)

`saveFieldsToStorage` writes `localStorage.password` and `#Password` has `save` (`pageMemory` writes the value to
IndexedDB). The fields come prefilled with `admin`/`password`. Since the user `jeffersoncgo`'s apps on GitHub Pages
share the origin, any page on `jeffersoncgo.github.io` can read those keys. Keep only the `AccessToken` returned by the
login (and the `UserId`), not the password; leave the fields empty by default.

What was done: the login keeps only the token session (`localStorage.jellyfinAuth`); an old saved password is used once
to get the token and then deleted; a new **Sign out** button ends the session on the server.

### CR-05 — Unversioned remote dependencies (High) 🔎 — ✅ fixed (2026-10-23) (copies in `js/vendor/`)

`index.html:59-68` loads `cdn/js/*.js` and `CoverMaker/js/jellyfin.js` straight from the published `main`. Any refactor
in those repositories (renaming a method, changing the `Jellyfin` constructor signature, changing `Controller.wrap`)
breaks this app without warning, and there is no SRI. Options, from the simplest to the most robust:

1. Copy the files into `vendor/` (as CoverMaker does) and update them on purpose.
2. Pin by commit/tag through jsDelivr: `https://cdn.jsdelivr.net/gh/jeffersoncgo/cdn@<tag>/js/controller.js` + `integrity`.
3. Move `jellyfin.js` into the `cdn` repository (it is a shared library, not CoverMaker code) and version it.

### CR-06 — "Strict" taste search (Medium) 🧪/🔎 — ◐ (2026-10-23) — fixes with no effect on the result; the operators stayed as they are (they change the recommendations: user decision)

`extractSearchProfileFromWatched` and the use of `SearchEngine` have several mismatches:

- `operator: 'between'` (line 118) does not exist in `SearchEngine` (which uses `'..'`): the year filter is ignored.
- `operator: 'all'` with the **7** most frequent genres requires an item to have all 7 at once — practically none
  does; the same for the 7 tags. In practice only the rating filter (`>`) scores.
- `search(…, sort, useSingleAppearance)` (lines 418 and 427): `SearchEngine.search`'s 4th parameter is `isLaxQuery`,
  not `useSingleAppearance`.
- The requested sort (`CommunityRating desc, ProductionYear desc`) did not happen because of `CDN-05` (checked in Node).
- `extractSearchProfileFromWatched(watched, 7)` (line 411) uses the implicit global `watched` instead of the
  `watchedContents` parameter.
- `window.tasteProfile ??=` and `window.profileQueries ??=` mean the profile is never recomputed in non-strict mode.

Suggestion:

```js
profile.push({ operator: 'any', fields: ['Genres'], queries: top(genreFreq, 3) });
profile.push({ operator: '..',  fields: ['ProductionYear'], queries: [avgYear - 5, avgYear + 5] });
…
const recs = searchEngine.search(unwatchedContents, profileQueries, undefined, /* isLaxQuery */ true);
```

### CR-07 — Weights declared and not used (Medium) 🔎 — ✅ fixed (2026-10-23)

What was done: the README describes only the factors that are used (genres, tags, community rating, year, title); the unused weights stay in `WEIGHTS`, commented as "not used yet".

`WEIGHTS.CRITIC_RATING`, `ACTOR`, `DIRECTOR_WRITER` and `STUDIO` are not used in `calculateSimilarity`, and the
Jellyfin client does not even request `People`/`CriticRating`/`Studios` with enough `Fields`. The README described the
score with those factors. Either implement them (request `Fields=People,Studios,CriticRating` and add a Jaccard of
people/studios), or remove them from the README and from the `WEIGHTS` object.

### CR-08 — Infinite scroll (Medium) 🔎 — ✅ fixed (2026-10-23)

- The `scroll` listener has no "loading" lock: every event near the end calls `getSugestions` again → several
  simultaneous batches and repeated/out-of-order groups. Use a flag
  (`if (loading) return; loading = true; … finally loading = false`) or an `IntersectionObserver` on a sentinel at the
  end of the list.
- `displayRecommendations([])` does `recommendationsContainer.innerHTML = '…No recommendations found…'`, also wiping
  the taste section and the groups already shown. For extra batches, just do not append anything.
- The first load uses `useSingleAppearance = false` and the scroll uses the default `true`.

### CR-09 — Type filter never applied (Medium) 🔎 — ✅ fixed (2026-10-23) (filtered when the lists are built)

`onLoginSuccess` only sets `IncludeItemsTypes = ["Audio", "Video", "Book", "Movie", "Series"]` if
`window.jellyfin.onLibraryLoad` exists — but `onLibraryLoad` is an event (`jellyfin.events.onLibraryLoad`), not a
method. The assignment never happens. Set `IncludeItemsTypes` right after creating the instance (before `getLibraries`).

### CR-10 — Exceptions (Medium) 🔎 — ✅ fixed (2026-10-23)

- `Content.CommunityRating !== undefined ? Content.CommunityRating.toFixed(2)` (line 69) breaks with `null`, and the
  error replaces the whole container with the error message. Use `Number.isFinite(Content.CommunityRating)`.
- **Load More** (line 144) reads `window.recommendations.length`, which only exists in strict mode.
- **Clean Saved Memory** without login: `jellyfin` does not exist → `ReferenceError` (line 233). Use
  `window.jellyfin?.cleanDb()` and also clear `localStorage`/`pageMemory`.
- `ContentGrid` (line 136) is assigned without a declaration (implicit global).

### CR-11 — Algorithm details (Low) 🔎 — ◐ (2026-10-23) — tokenizer, shuffle, `isPlayed` and account switch; `makeContentUrl` keeps the external address (it is what the user typed)

- `tokenizeName` removes everything outside `a-z0-9`: "Ação" becomes `"ao"`, Japanese/Korean titles end up with no
  tokens. Use `name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u)`.
- `selectRandomContents` uses `sort(() => 0.5 - Math.random())` (biased distribution); use Fisher-Yates.
- `usedWatchedIds`/`usedUnwatchedIds` are globals and are never reset (switching user/server inherits the state).
- `jellyfin.isPlayed` compares `item.CollectionType != "BoxSet"`, but items have `Type`; and `PlayedPercentage` is not
  kept in the cache, so the "≥ 70 %" rule never applies.
- `makeContentUrl` uses `Server.ExternalAddress` even when the app chose the local address as the fastest.

### CR-12 — Image size (Low) 🔎 — ✅ fixed (2026-10-23) — size; `noImage` is still on placehold.co

`jellyfin.makeImageUrl(Content.Id)` uses the `480×270` default (landscape) and the card shows the image in portrait
(~180×270, `object-fit: cover`). Request the card's aspect ratio, for example `makeImageUrl(Content.Id, 360, 540, 80)`.
`noImage` depends on `placehold.co`; a local SVG avoids the external request.

### CR-13 — Documentation and HTML (Low) 🔎 — ✅ fixed (2026-10-23)

What was done: README fixed (`git clone`, local server, dependencies, token login); HTML comment fixed; focus moves to the first field when the user opens a window; "Clean Saved Memory" asks for confirmation; cards with `role="link"` and an accessible name.

- README: describes actors/directors/studios/critic rating in the score (CR-07); the `git clone` uses
  `Content-recommender` (the repository is `content-recommender`); it does not mention the remote dependencies nor
  Meilisearch.
- `index.html:58` comment with a typo ("Scripts should bered…"); the login window has `role="dialog"`/`aria-modal` but
  no focus management; the "Clean Saved Memory" button does not ask for confirmation.
- The cards have `tabindex="0"` but no `role="link"`; prefer wrapping the card in an `<a href>`.

---

## Recommended improvements

1. **Pin dependencies** (CR-05, done with `js/vendor/`) and, ideally, move `jellyfin.js` into a versioned `cdn`.
2. **Right data**: `needsUserData = true` (done), request `Fields=People,Studios,CriticRating,UserData`, and incremental
   sync with `minDateLastSavedForUser`.
3. **Explain the recommendation**: show on the card why it was recommended (shared genres/tags, same director), which
   also helps tune `WEIGHTS`.
4. **Settings in the UI**: anchors, items per anchor, threshold and editable weights (saved in `localStorage`).
5. **Filter by library/type** (movies × series) and exclude items with `UserData.IsFavorite`/already started, if
   wanted.
6. **Algorithm tests**: `findSimilar.js` is pure (except `jellyfin.makeImageUrl`); inject the URL function and test
   with a fixed catalog in `node --test`.
