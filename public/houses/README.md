# Build Your Houses — shared house renderer

One renderer for web, Android and iOS (Steve, 2026-11-05). Files:

- `house-view.js` — the renderer (plain JS, no dependencies). Full API + rules in its header comment.
- `house-view.html` — a page that loads it. Live at `https://www.binggbongg.com/houses/house-view.html`.
  The apps should **bundle both files** (Android `assets/houses/`, iOS app bundle) and load the local
  copy, so the page works offline and never waits on the network. Re-copy them from here when they change.

The web page `/houses` (src/pages/HousesPage.tsx) loads the same `house-view.js`.

## Query parameters of house-view.html

| param | meaning |
|---|---|
| `lang` | `en` `fil` `tl` `id` `es` `ar` (anything else = English) |
| `sound=0` | start muted (the member's own speaker-button choice is remembered and wins) |
| `speed` | starting speed, parts/sec, 1–20000 (default 380; the member's last speed-bar choice wins) |
| `height` | canvas height px (default 380) |
| `demo=1` | fake data for testing / the feature video: `parts=65500` lifetime, `from=60000` last seen, `live=0` no fake gifts |

Try: `house-view.html?demo=1` · `?demo=1&parts=250000&from=0` (big catch-up) · `?demo=1&parts=59900&from=59000` (house completion).

## Calling it from the app

After the page fires `ready`, call (Android `webView.evaluateJavascript`, iOS `evaluateJavaScript`):

```js
HouseView.setProgress({ lifetimeParts: 65500, lastSeenParts: 60000, theme: 303 % 6 })
```

- `lifetimeParts` = `lifetime_coins` from `fetchMyHouses` / `fetchUserHouses`.
- `lastSeenParts` = the last `partsShown` you saved for this member on this device (own page only).
  Leave it out on a first visit (and on other members' pages): the current house is animated from its start.
- `theme` = the member's `user_id % 6`, so each member's houses have their own colours (the web does this).
- Poll `fetchMyHouses` every ~10 s while the page is visible and call `setProgress({ lifetimeParts })`
  again with the new total: the new coins are queued and laid as new bricks (live gifts).
- Other calls: `HouseView.setSpeed(n)`, `HouseView.mute(true|false)`, `HouseView.toast("+50 · PK Battle")`,
  `HouseView.zoomToNewest()`, `HouseView.fit()`, `HouseView.getState()`.

## Events back to the app

Every event is `{ type, ... }`:

| type | fields | when |
|---|---|---|
| `ready` | — | the renderer is drawn and waiting for `setProgress` |
| `progress` | `partsShown` | at most twice a second while laying, and on `caughtUp` — **save it as lastSeenParts** |
| `houseCompleted` | `house`, `fastForward?` | the 60,000th part of house N was laid (or N houses were skipped by the catch-up rule) |
| `streetCompleted` | `street`, `fastForward?` | 40 houses — a street is finished |
| `caughtUp` | `partsShown` | everything queued has been laid |

Delivered to all of: `window.HouseViewAndroid.onEvent(jsonString)` (Android: `addJavascriptInterface(obj, "HouseViewAndroid")`
with a `@JavascriptInterface fun onEvent(json: String)`), `window.webkit.messageHandlers.houseView.postMessage(obj)`
(iOS: `userContentController.add(handler, name: "houseView")`), `window.HouseViewEvents(obj)` if defined,
`window.parent.postMessage({source:'houseView', ...})` in an iframe, and a `houseview` CustomEvent.

## Catch-up rule (big gaps)

The animation never runs longer than 30 seconds at the chosen speed, and never starts before the start of the
house the target is in (a target exactly on a finished house starts at that house's start, so its completion is
still celebrated). Everything before is placed instantly: finished houses go straight onto the street, with one
"N houses were finished while you were away" notice and one `houseCompleted` / `streetCompleted` event marked
`fastForward: true`. Example: 0 → 250,000 at 380 parts/sec: houses 1–4 appear on the street at once and the last
11,400 parts of house #5 are laid.

## WebView notes

- Enable JavaScript and DOM storage (speed + mute are kept in localStorage).
- Sound needs a user tap first (WebView autoplay rules); the first touch on the page unlocks it.
- The loop stops while the page is hidden; drawing pauses while the house is scrolled off screen.
- Text inside the renderer comes from its own table (en, fil/tl, id, es, ar). Pass `lang=` from the app language.
- Changing either file: bump nothing — the web server sends them with `Cache-Control: no-cache`; the apps ship their copy.
