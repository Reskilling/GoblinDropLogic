# Wise Goblin | Clan Intelligence Hub & DropLogic

Welcome to the central intelligence hub for the **Wise Goblin** clan. This project serves as a comprehensive resource for Old School RuneScape (OSRS) players, combining curated progression guides, advanced plugin configurations, and our flagship mathematical tool: **DropLogic**.

## Hub Features

The hub is divided into six primary branches:

* **Rank Calculator:** A dedicated external web app (hosted on Vercel) used to calculate and track official clan ranks within Wise Goblin.
* **DropLogic App:** A state-of-the-art drop rate forecaster that perfectly simulates complex boss mechanics.
* **Guides & Tools:** A curated directory of the best external OSRS resources, DPS calculators, high-fidelity boss simulators, and a step-by-step guide for Gearscape bank imports.
* **Plugin Help:** Recommended RuneLite plugin configurations, including exportable JSON radius markers for precise NPC interactions (e.g., Akkha, Zulrah snakelings).
* **Ironman FAQ:** Highly optimized progression routes, early-game logistics, sustainable skilling grinds, and PvM pathing tailored specifically for Ironman accounts.
* **Zugrot's Checklist:** An interactive, tiered progression tracker tailored for Ironman accounts, covering everything from early-game unlocks to master-tier PvM goals.

---

## DropLogic: Advanced Forecasting

Most OSRS calculators rely on basic binomial probability. That works fine for simple, single-roll drops like a Dragon Defender, but it completely falls apart on modern bosses. When you introduce complex mechanics like duplicate protection, hidden sequential rolls, and multiple siloed loot tables, standard calculators produce wildly inaccurate estimates. 

DropLogic solves this by utilizing state-driven mathematics to perfectly simulate the exact mechanics of every boss in the game. It generates a complete probability distribution, showing you exactly what your specific grind will look like from the luckiest spoon to the driest drought.

### Core Mechanics:
* **Accurate Completion Logs:** Calculates the exact kill count required to "green log" a boss, mathematically accounting for the compounding difficulty of securing your final missing piece.
* **Desert Treasure 2 Ready:** Natively handles "invisible roll" mechanics. DropLogic calculates the exact compounding probability of building Vestiges and Chromium Ingots across multiple hidden rolls.
* **True Duplicate Protection:** Built-in logic for Barrows and Moons of Peril perfectly simulates intra-chest and global duplicate protection, providing flawless specific-item and full-set completion rates.
* **Markov Chain Transition Matrices:** Abandons standard binomial math to track conditional probabilities step-by-step using specialized matrix engines (Master, Barrows, and Moons).
* **Realistic Visualizations:** Utilizes a custom non-linear power transformation on chart axes to compress extreme dry streaks, allowing you to easily read the primary probability curve (PMF/CDF).

---

## Architecture & Tech Stack

This project is built with strict adherence to Clean Code principles, utilizing a lightweight, vanilla web stack to ensure lightning-fast load times and zero dependency bloat.

* **Frontend:** HTML5, CSS3 (Custom Properties/Design Tokens)
* **Logic:** Vanilla ES6 JavaScript (ES Modules)
* **Data Visualization:** Chart.js (via CDN) with the Annotation Plugin

### File Structure
```text
📁 GoblinDropLogic
├── 📄 index.html         # Page shell and content for every section
├── 📄 style.css          # Design tokens and responsive layout
├── 📄 download_icons.js  # Downloads item icons from the OSRS Wiki into assets/items
├── 📁 js
│   ├── 📄 app.js         # Entry point and the DropLogic calculator UI
│   ├── 📄 bosses.js      # Per-boss name, category, rolls, matrix, settings and rate adjuster
│   ├── 📄 drops.js       # Boss loot tables and drop rates
│   ├── 📄 data.js        # Normalised item lists and icon paths
│   ├── 📄 modifiers.js   # Pure functions that adjust rates from boss settings
│   ├── 📄 matrix.js      # Markov chain transition matrices (Master and Barrows)
│   ├── 📄 solvers.js     # Simulation loop and statistics (PMF/CDF)
│   ├── 📄 item-grid.js   # Collection log grid: selection, piece counts, captions
│   ├── 📄 settings.js    # Renders boss settings and reads them back
│   ├── 📄 chart.js       # Chart.js rendering
│   ├── 📄 nav.js         # Hash-based navigation (#droplogic, #guides, ...)
│   ├── 📄 checklist.js   # Zugrot's Checklist progress
│   └── 📄 toast.js       # Notifications
├── 📁 assets             # Item icons and resized brand images
└── 📁 tests              # node:test suites for the maths, modifiers and data, plus e2e/ browser checks
```

### Adding a boss
1. Add its drop table to `js/drops.js` and run `npm run icons` to fetch any new icons.
2. If it needs a category, display name, extra rolls or settings, add an entry to `js/bosses.js`. Settings are declared there and passed to the boss's adjuster in `js/modifiers.js` by key.
3. Run `npm test`. The data tests check that the icons exist, that main-table rates don't exceed one roll, and that every adjuster produces valid rates.

---

## Getting Started

Because the Wise Goblin Hub is built entirely in vanilla web technologies, there are no build steps, bundlers, or heavy frameworks required. You can run the app locally in seconds.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Reskilling/GoblinDropLogic.git
   ```

2. **Navigate into the directory:**
   ```bash
   cd GoblinDropLogic
   ```

3. **Launch the application:**
   Because the project uses ES6 Modules (`<script type="module">`), you cannot simply double-click `index.html` to open it via the `file://` protocol due to browser CORS security policies. 
   
   To run it, serve the directory using a local web server. If you use VS Code, simply install the **Live Server** extension, right-click `index.html`, and select "Open with Live Server". 

   Alternatively, using Python:
   ```bash
   python -m http.server 8000
   # Then open http://localhost:8000 in your browser
   ```

4. **Run the tests** (Node.js 20 or later):
   ```bash
   npm test            # maths, modifiers and data; no install needed
   npm install         # once, for the browser tests
   npm run test:e2e    # drives the site in your installed Chrome or Edge
   ```
