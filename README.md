# DropLogic

DropLogic is an advanced drop rate forecaster for Old School RuneScape (OSRS). 

Most OSRS calculators use basic probability math. That works fine for simple drops like a Dragon Defender, but it completely falls apart on modern bosses. When you introduce mechanics like duplicate protection, hidden sequential rolls, and multiple loot tables, standard calculators will give you wildly inaccurate estimates. 

DropLogic solves this by using state-driven mathematics to perfectly simulate the exact mechanics of every boss in the game. It doesn't just tell you the average; it shows you exactly what your specific grind will look like.

## Key Features

* **Accurate Completion Logs:** Calculates the exact time it takes to "green log" a boss, accounting for the fact that you will likely go dry on your final missing piece.
* **Desert Treasure 2 Ready:** Natively handles "invisible roll" mechanics. It calculates the exact compounding probability of building Vestiges and Chromium Ingots.
* **True Duplicate Protection:** Built-in logic for Barrows and Moons of Peril perfectly simulates intra-chest and global duplicate protection, giving you flawless specific-item and full-set completion rates.
* **Realistic Visualizations:** The interface utilizes a non-linear chart to compress extreme dry streaks, allowing you to easily read the primary probability curve while still seeing the worst-case scenarios.

## How the Math Works

Under the hood, DropLogic abandons standard binomial probability. Instead, it uses custom **Markov Chain transition matrices**. 

By building a simulated "state space" of your inventory, the calculator can track conditional probabilities. It routes complex scenarios through three specialized engines:

1. **The Master Matrix:** Handles standard boss tables and mutually exclusive drops.
2. **The Barrows Matrix:** A hypergeometric engine that compounds probabilities to account for multiple brothers dying in a single run.
3. **The Moons Matrix:** Simulates independent, siloed loot pools running concurrently to ensure perfect duplicate protection math.

## Getting Started

DropLogic is built entirely in vanilla web technologies (HTML, CSS, JavaScript). There are no build steps, bundlers, or heavy frameworks required.

```bash
# Clone the repository
git clone [https://github.com/yourusername/droplogic.git](https://github.com/yourusername/droplogic.git)

# Navigate into the directory
cd droplogic
```

To run the application, open the project folder in your preferred code editor and serve `index.html` using a local web server (such as the Live Server extension for VS Code). This is required to allow the browser to securely load the modular JavaScript files.

## Codebase Architecture

If you want to modify the application or review the math, the codebase is separated by concern:

```text
droplogic/
├── index.html       # Semantic UI markup
├── style.css        # CSS variables, responsive grid constraints, and visual theme
└── js/
    ├── app.js       # Main controller, handles DOM interactions and Chart.js
    ├── data.js      # Formats Wiki URLs and scopes items to their specific bosses
    ├── drops.js     # Master configuration dictionary for all boss drop tables
    ├── matrix.js    # The Markov chain matrix generators
    └── solvers.js   # Simulation loop calculating the exact CDF and PMF
```

## Adding New Bosses

Anyone can contribute new bosses or update drop rates by modifying `js/drops.js`. To ensure the math engines process new items correctly, apply the following schema to your item objects:

```javascript
"boss_name": {
    "12345": { 
        name: "Item Name", 
        rate: 1/128, 
        
        // "main" for shared drop tables, "tertiary" for independent rolls (pets/jars)
        type: "main", 
        
        // (Optional) Triggers hidden sequential roll logic (e.g., 3 for an Ultor Vestige)
        pieces: 3,    
        
        // (Optional) Triggers siloed duplicate-protection logic (e.g., "blood" or "eclipse")
        pool: "blood", 
        
        // UI display order
        order: 1 
    }
}
```
