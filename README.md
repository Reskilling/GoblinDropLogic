# Wise Goblin Clan Hub and DropLogic

The Wise Goblin site at [thewisegoblin.com](https://thewisegoblin.com) collects Old School RuneScape (OSRS) guides, RuneLite plugin help and an Ironman checklist for the clan, along with DropLogic, a calculator that forecasts how many kills you need to finish a boss's collection log.

This README is for clan members who want to know what the site covers, and for contributors who want to run it locally, add a boss or change the code.

## What's on the site

The site has six sections:

* **DropLogic:** forecasts your odds of finishing a boss's collection log, modelling the boss's real loot mechanics rather than a single drop rate.
* **Guides & Tools:** a directory of external OSRS resources, such as DPS calculators and boss simulators, plus a step-by-step guide to importing your bank into Gearscape.
* **Plugin Help:** recommended RuneLite plugins, and radius-marker JSON you can copy for Zulrah snakelings and Akkha.
* **Ironman FAQ:** progression routes, early-game food and money, skilling loops and PvM pathing for Ironman accounts.
* **Zugrot's Checklist:** a tiered Ironman progress tracker that saves your ticks in your browser.
* **Rank Calculator:** a separate app, hosted on Vercel, that works out clan ranks.

## How DropLogic works

A single drop rate is enough for one item, like a Dragon Defender. It isn't enough for a whole collection log: items share loot tables, some sets have duplicate protection, and some items need several hidden rolls. DropLogic models those mechanics for 69 bosses, raids and minigames, and shows the full spread of outcomes, from the luckiest finish to the longest dry streak.

DropLogic models the following:

* **Whole-log completion:** the KC to finish every item you select, including the slow last missing piece.
* **Shared loot tables:** items on the same table can't drop together; independent drops, such as pets and jars, roll separately.
* **Duplicate protection:** sets like the abyssal bludgeon, Moons of Peril armour and Sunfire armour award a piece you're missing on every hit.
* **Hidden rolls:** Desert Treasure II vestiges need three hidden rolls each.
* **Boss settings:** raid points and levels, team size, contribution, Awakened and Phosani's variants, and sacrifice options adjust the rates.
* **Exact probabilities:** a Markov chain tracks the odds kill by kill through transition matrices (`js/matrix.js`), so results are calculated rather than estimated from random trials.

Results appear as a headline figure, a chart of the chance of finishing on each KC and the chance you've finished by each KC, and the KC by which 25%, 50%, 75%, 90% and 99% of players are done. The KC axis spreads out early kills so the start of the curve stays readable next to the long tail.

### Assumptions

Results are only as good as the inputs, and DropLogic simplifies a few mechanics:

* Drop rates and item names come from the OSRS Wiki and can change with game updates.
* Each boss covers its notable uniques and pet, not every collection log slot. You usually get common supplies and minor items, such as Zulrah's scales and teleport scrolls, long before the uniques, and completion-count rewards, such as raid shrouds, aren't drops.
* Raid results are personal: CoX and ToA use your own points, and ToB assumes an even share of the team's points.
* CoX extra uniques past the 65.7% cap, and Barrows' rule against duplicates within one chest, aren't modelled.
* Fortis Colosseum counts one full 12-wave run as one kill.

## Tech stack

The site is plain HTML, CSS and JavaScript modules, with no build step or framework:

* **Pages and styles:** `index.html` and `style.css`, with design tokens as CSS custom properties.
* **Logic:** ES modules in `js/`.
* **Charts:** Chart.js and its annotation plugin, loaded from the jsDelivr CDN when you choose a boss, pinned to exact versions with integrity hashes.
* **Fonts:** Inter and Big Shoulders Display, self-hosted in `assets/fonts/` under the SIL Open Font License.

### File structure

```text
GoblinDropLogic/
├── index.html          # Page shell and content for every section
├── style.css           # Design tokens and responsive layout
├── audit_rates.js      # Checks every drop rate against the OSRS Wiki's drop database
├── download_icons.js   # Downloads item icons and boss portraits from the OSRS Wiki
├── js/
│   ├── app.js          # Entry point and the DropLogic calculator UI
│   ├── bosses.js       # Per-boss name, category, rolls, matrix, settings and rate adjuster
│   ├── drops.js        # Boss loot tables and drop rates
│   ├── data.js         # Normalised item lists and icon paths
│   ├── modifiers.js    # Pure functions that adjust rates from boss settings
│   ├── matrix.js       # Markov chain transition matrices (master and Barrows)
│   ├── solvers.js      # Kill-by-kill probability solver and statistics (PMF/CDF)
│   ├── item-grid.js    # Collection log grid: selection, piece counts, captions, undo
│   ├── settings.js     # Renders boss settings and reads them back
│   ├── chart.js        # Loads Chart.js on demand and draws the results chart
│   ├── nav.js          # Hash-based navigation (#droplogic, #guides, ...)
│   ├── goals.js        # Zugrot's Checklist goals by tier
│   ├── checklist.js    # Renders the checklist and saves progress
│   ├── copy-code.js    # Copy buttons on code blocks
│   └── toast.js        # Notifications
├── assets/
│   ├── bosses/         # Boss portraits, standardised by download_icons.js
│   ├── brand/          # Logo, resized hero images and the link-preview image
│   ├── fonts/          # Self-hosted fonts and their licences
│   └── items/          # Item icons
└── tests/              # node:test suites for the maths, modifiers and data, plus e2e/ browser checks
```

## Run it locally

Before you begin, install [Node.js](https://nodejs.org/) 20 or later. You need it for the tests; any static file server can run the site itself.

1. Clone the repository and go into its directory:

   ```bash
   git clone https://github.com/Reskilling/GoblinDropLogic.git
   cd GoblinDropLogic
   ```

2. Start a local web server in the directory. The site uses ES modules, which browsers don't load from `file://` URLs, so opening `index.html` directly doesn't work. With Python, run:

   ```bash
   python -m http.server 8000
   ```

   If you use VS Code, the **Live Server** extension works too: right-click `index.html` and select **Open with Live Server**.

3. Open `http://localhost:8000` in your browser. The landing page shows the Wise Goblin logo and the section buttons.

4. Run the unit tests for the maths, modifiers and data. They need no install:

   ```bash
   npm test
   ```

5. Optional: run the browser tests, which drive the site in your installed Chrome or Edge:

   ```bash
   npm install
   npm run test:e2e
   ```

   The last line of the output reads `All checks passed`.

## Add a boss

1. Add the boss's drop table to `js/drops.js`, then fetch its item icons and portrait. The script needs the image library sharp, so run `npm install` once first:

   ```bash
   npm install
   npm run icons
   ```

   The script trims each portrait, scales it to the same visual weight as the others and stands it on a shared floor line, so every boss looks like part of one set.

2. If the boss needs a category, display name, extra rolls or settings, add an entry to `js/bosses.js`. Settings declared there reach the boss's adjuster in `js/modifiers.js` by key.
3. Check the new portrait in `assets/bosses/`. The script uses the image from the boss's Wiki page. If that's a logo or a location rather than the boss, add the right Wiki file to `WIKI_IMAGE_OVERRIDES` in `js/bosses.js`, delete the boss's files from `assets/bosses/` and `.cache/bosses/`, and run `npm run icons` again.

   To re-process every portrait after changing the standardising settings in `download_icons.js`, run `node download_icons.js --rebuild`. It works from the cached Wiki originals, so nothing is downloaded again.
4. Check the new rates against the Wiki's drop database. The audit prints only the items that don't match, which you then compare with the Wiki by hand (some have a known reason, such as a rate that varies with raid level):

   ```bash
   npm run audit-rates
   ```

   Run it again after game updates that change drop rates.
5. Run `npm test`. The data tests check that the icons and portraits exist, that main-table rates don't exceed one roll, and that every adjuster produces valid rates.

## Add a JavaScript file

When you add a module to `js/`, also add a `<link rel="modulepreload">` line for it to the `<head>` of `index.html`. The site works without it, but the browser then fetches that file only after the file that imports it, which slows the first load.
