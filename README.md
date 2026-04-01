# Wise Goblin | Clan Intelligence Hub & DropLogic

Welcome to the central intelligence hub for the **Wise Goblin** clan. This project serves as a comprehensive resource for Old School RuneScape (OSRS) players, combining curated progression guides, advanced plugin configurations, and our flagship mathematical tool: **DropLogic**.

## 🗂️ Hub Features

The hub is divided into four primary intelligence branches:

* **Rank Calculator:** A dedicated external web app (hosted on Vercel) used to calculate and track official clan ranks within Wise Goblin.
* **DropLogic App:** A state-of-the-art drop rate forecaster that perfectly simulates complex boss mechanics.
* **Guides & Tools:** A curated directory of the best external OSRS resources, DPS calculators, high-fidelity boss simulators, and a step-by-step guide for Gearscape bank imports.
* **Plugin Help:** Recommended RuneLite plugin configurations, including exportable JSON radius markers for precise NPC interactions (e.g., Akkha, Zulrah snakelings).
* **Ironman FAQ:** Highly optimized progression routes, early-game logistics, sustainable skilling grinds, and PvM pathing tailored specifically for Ironman accounts.

---

## 🎲 DropLogic: Advanced Forecasting

Most OSRS calculators rely on basic binomial probability. That works fine for simple, single-roll drops like a Dragon Defender, but it completely falls apart on modern bosses. When you introduce complex mechanics like duplicate protection, hidden sequential rolls, and multiple siloed loot tables, standard calculators produce wildly inaccurate estimates. 

DropLogic solves this by utilizing state-driven mathematics to perfectly simulate the exact mechanics of every boss in the game. It generates a complete probability distribution, showing you exactly what your specific grind will look like from the luckiest spoon to the driest drought.

### DropLogic Core Mechanics:
* **Accurate Completion Logs:** Calculates the exact kill count required to "green log" a boss, mathematically accounting for the compounding difficulty of securing your final missing piece.
* **Desert Treasure 2 Ready:** Natively handles "invisible roll" mechanics. DropLogic calculates the exact compounding probability of building Vestiges and Chromium Ingots across multiple hidden rolls.
* **True Duplicate Protection:** Built-in logic for Barrows and Moons of Peril perfectly simulates intra-chest and global duplicate protection, providing flawless specific-item and full-set completion rates.
* **Markov Chain Transition Matrices:** Abandons standard binomial math to track conditional probabilities step-by-step using specialized matrix engines (Master, Barrows, and Moons).
* **Realistic Visualizations:** Utilizes a custom non-linear power transformation on chart axes to compress extreme dry streaks, allowing you to easily read the primary probability curve (PMF/CDF).

## 🚀 Getting Started

The Wise Goblin Hub is built entirely in vanilla web technologies (HTML, CSS, JavaScript). There are no build steps, bundlers, or heavy frameworks required.

```bash
# Clone the repository
git clone [https://github.com/Reskilling/GoblinDropLogic](https://github.com/Reskilling/GoblinDropLogic)

# Navigate into the directory
cd GoblinDropLogic