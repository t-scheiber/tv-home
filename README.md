# TV Home

A custom home screen and a Home Assistant control panel for an LG webOS 6 TV that is not rooted. Both are plain HTML, CSS and JavaScript apps, sideloaded through the TV's Developer Mode.

The home screen (`launcher/`) shows the date and clock, status chips from Home Assistant (room temperature, how many lights are on, door lock state), a "Continue watching" row from a Jellyfin server through the Moonfin app, a dock of app tiles, an input picker and a Share WiFi screen with a QR code. The panel (`panel/`) shows room tiles (lights, blinds, window sensor, heating, fan), scene buttons, now-playing controls for Home Assistant media players, and door controls for an intercom and a smart lock. It also has a doorbell view that Home Assistant can open when someone rings.

Author: Thomas Scheiber

## How it works

Build. `build.ps1` reads `.env` and a JSON config file, resolves secrets, and copies each app and `shared/` into `dist/`. It writes a `config.js` next to each app (`window.TVH_CONFIG = {...}`) and patches the app ID and vendor in `appinfo.json`. It then runs `ares-package` to produce one `.ipk` per app. `-StageOnly` stops before packaging so you can inspect `dist/launcher` and `dist/panel`.

Install without root. `ares-install` pushes the `.ipk` files to a TV that has the Developer Mode app running and is registered with `ares-setup-device`. Nothing on the TV is modified. The apps are ordinary sideloaded web apps. `ha/tv_devmode.yaml` renews the Developer Mode session every night, because LG removes sideloaded apps when it expires.

Replacing LG's home screen. A TV without root cannot change its launcher, so Home Assistant does it: `ha/tv_home.yaml` opens the custom home screen whenever LG's home app comes to the front (Home button, closing an app, power on). "Open LG's home screen" in the launcher's Back menu turns on a helper boolean that lets LG's screen through until another app opens or ten minutes pass.

Talking to Home Assistant. `shared/core.js` opens a WebSocket to `<TVH_HA_URL>/api/websocket` and authenticates with a long-lived access token. It sends `subscribe_entities` for the entity IDs the config mentions and applies the compressed `a`, `c` and `r` updates to a local state map. Button presses become `call_service` messages. If the connection drops it reconnects with a delay that doubles from 2 to 30 seconds.

Jellyfin. At build time the script finds the Jellyfin user (by name, else the first administrator) with the API key and bakes the user ID into the config. At run time the launcher fetches resume and next-up items every five minutes, and a card opens Moonfin on that item.

Screenshot tool. `tools/tvshot.mjs` connects to the Developer Mode remote inspector on port 9998 of the TV and speaks the Chrome DevTools protocol. It can send arrow, Enter and Back keys, run a JavaScript expression in the app, and save a PNG.

## Repository layout

```
launcher/   home screen app (index.html, app.js, style.css, appinfo.json)
panel/      smart home panel app (same layout)
shared/     code and styles loaded by both apps: core.js (Home Assistant client,
            Jellyfin client, Luna calls, remote-control focus), icons.js, base.css
ha/         Home Assistant YAML copies with example entity IDs
tools/      tvshot.mjs, the screenshot and inspect tool
build.ps1   configuration, packaging and install
```

`shared/core.js` also holds the spatial navigation for the remote: arrow keys move focus to the nearest focusable element, OK activates, Back closes overlays. With the Magic Remote pointer, hovering focuses and clicking activates. Calls to webOS system services go through `PalmServiceBridge` (Luna). Outside a TV, app launches are logged to the console instead of failing.

## Setup

You need:

- Windows PowerShell 5.1 or PowerShell 7. The build draws the app icons with System.Drawing, so it is Windows only.
- The webOS CLI: `npm i -g @webos-tools/cli`.
- An LG webOS TV with the Developer Mode app running, registered with `ares-setup-device`.
- Home Assistant with a long-lived access token and the TV integration (`webostv`).
- Optional: the 1Password CLI (`op`) for secrets, a Jellyfin server with Moonfin on the TV, and Node.js 22 or newer for the screenshot tool.

Then:

```powershell
Copy-Item .env.example .env
Copy-Item config.example.json config.local.json
Copy-Item wifi.example.json wifi.local.json   # optional, for Share WiFi
# edit all three, then
.\build.ps1 -NoInstall     # build the .ipk files only
.\build.ps1                # build and install both apps
.\build.ps1 -Launch        # also open the home screen
```

`.env`, `config.local.json`, `wifi.local.json`, `dist/` and `*.ipk` are git-ignored. A variable that is already set in the shell wins over `.env`. A secret value that starts with `op://` is read with `op read` at build time. Any other value is used as it is.

### Variables in .env

| Variable | Meaning |
|---|---|
| `TVH_TV_DEVICE` | Device name from `ares-setup-device`, used by install and launch |
| `TVH_TV_HOST` | Address of the TV, used only by `tools/tvshot.mjs` |
| `TVH_HA_URL` | Base URL of Home Assistant as the TV reaches it |
| `TVH_HA_TOKEN` | Long-lived access token, literal or `op://` reference |
| `TVH_HA_LG_HOME_PASS_ENTITY` | The `input_boolean` created by `ha/tv_home.yaml` |
| `TVH_JELLYFIN_URL` | Jellyfin base URL; empty turns the Moonfin row off |
| `TVH_JELLYFIN_API_KEY` | Jellyfin API key, literal or `op://` reference |
| `TVH_JELLYFIN_USER_NAME` | Jellyfin user to show; empty picks the first administrator |
| `TVH_JELLYFIN_USER_ID` | Jellyfin user ID; if set, the build skips the lookup |
| `TVH_PANEL_KEY` | Remote key shown in the hint for opening the panel |
| `TVH_LAUNCHER_APP_ID` | App ID of the home screen |
| `TVH_PANEL_APP_ID` | App ID of the panel |
| `TVH_VENDOR` | Vendor name written to both `appinfo.json` files |
| `TVH_CONFIG_FILE` | Path of the JSON file with rooms, entities, dock and scenes |
| `TVH_WIFI_FILE` | Path of the JSON file with WiFi name, password and QR path |

Scalars and secrets sit in `.env` because they are flat and change per machine. Rooms, tiles, scenes and the dock are nested lists, so they stay in JSON. In that file a string such as `${TVH_PANEL_APP_ID}` is replaced with the `.env` value, so the dock entry for the panel follows the app ID.

### config.local.json

`config.example.json` has three sections. `home` feeds the status chips on the home screen. `dock` lists the app tiles by webOS app ID; tiles for apps that are not installed are hidden. `panel` holds the tiles (`light`, `cover`, `binary`, `climate`, `fan`), the scenes (any Home Assistant service call), the media players and the door entities. Use your own entity IDs everywhere.

Hold OK for 1.5 seconds on any door button to trigger it. The hint on the home screen assumes you mapped the panel to that remote key in the TV's Quick Access settings. Home Assistant can open the doorbell view by launching the panel with `{"view": "door"}`.

## The Home Assistant side

The files in `ha/` are copies of what runs in Home Assistant, with example entity IDs. Copy them and change the names.

- `tv_home.yaml` goes in `/config/packages/`. It creates the pass helper and four automations: replace LG home with the custom one, show it at power on, reset the pass, and open the doorbell view when the intercom event fires. Replace `media_player.living_room_tv` with your `webostv` entity, `event.front_door_ring` with your doorbell event, and the two app IDs with the values from `.env`.
- `tv_devmode.yaml` goes in `/config/packages/`. It calls LG's renewal URL at 04:17 and creates a persistent notification if that fails. The URL comes from `!secret lg_tv_devmode_renew_url`, so put it in `secrets.yaml`.
- `movie_night.yaml` is the body of `script.movie_night`. It turns off every Hue light outside two areas, then dims the living room. Change the area IDs in `variables`.

The scripts the panel calls (`open_front_door`, `unlatch_flat_door`, `resume_spotify`) are not in this repo. Create them in Home Assistant and name them in `config.local.json`.

## Limitations

- The Home Assistant token and the Jellyfin key are written in clear text into `config.js` inside each `.ipk`. Use a token that is limited in what it can do, and do not share the packages.
- The build is Windows only (PowerShell and System.Drawing).
- The Jellyfin user is looked up once at build time. Rebuild after changing it.
- The WiFi QR code is not generated. `wifi.local.json` needs the SVG path of a QR code you made yourself, and the password is stored in the package.
- The code targets Chromium 79 (webOS 6): no `?.`, no `??`, no flex `gap`.
- Only the tile types listed above exist. A tile of another type renders as a dash.
- Developer Mode must stay alive. If renewal fails, LG removes the apps.
- The UI text is English and not configurable apart from titles in the config file.
- There are no automated tests.
