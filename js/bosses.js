/**
 * @file bosses.js
 * Everything a boss needs beyond its drop table, in one place: display name, category,
 * rolls per kill, which matrix models it, the settings shown in the UI, how those settings
 * adjust drop rates, and which items a setting locks. Bosses without an entry use the defaults.
 *
 * Setting shapes:
 * - number: { key, type: 'number', label, default, min?, max?, disabledWhen?(state), disabledValue? }
 * - toggle: { key, type: 'toggle', label, options: [{ value, label, tone? }] }; the first option is the default.
 * Each setting's `key` is the property name its `adjust` function reads from the state.
 */

import * as modifiers from './modifiers.js';

export const CATEGORY_ORDER = [
    'Bosses', 'Skilling', 'Minigame', 'Slayer', 'Wilderness', 'God Wars Dungeon', 'The Forgotten Four', 'Raids'
];

const DEFAULT_DEFINITION = {
    category: 'Bosses',
    rolls: 1,
    matrix: 'master',
    settings: [],
    adjust: null,
    lockItems: null
};

const toggle = (key, label, options) => ({ key, type: 'toggle', label, options });
const contribution = { key: 'contrib', type: 'number', label: 'Contribution %', default: 100, min: 0, max: 100 };

const forgottenFour = {
    category: 'The Forgotten Four',
    adjust: modifiers.adjustRatesForDT2,
    settings: [
        toggle('isAwakened', 'Variant', [
            { value: false, label: 'Standard' },
            { value: true, label: 'Awakened (3x uniques)', tone: 'accent' }
        ])
    ]
};

const DEFINITIONS = {
    // Bosses
    barrows_chests: { name: 'Barrows', matrix: 'barrows' },
    hueycoatl: { name: 'The Hueycoatl' },
    royal_titans: {
        name: 'The Royal Titans',
        adjust: modifiers.adjustRatesForTitans,
        settings: [
            toggle('target', 'Target', [
                { value: 'branda', label: 'Branda', tone: 'fire' },
                { value: 'eldric', label: 'Eldric', tone: 'ice' }
            ]),
            toggle('action', 'Loot', [
                { value: 'loot', label: 'Standard' },
                { value: 'sacrifice', label: 'Sacrifice (2x pet)', tone: 'accent' }
            ]),
            contribution
        ],
        lockItems: (state) => state.action === 'sacrifice' ? ['Bran'] : null
    },
    the_nightmare: {
        adjust: modifiers.adjustRatesForNightmare,
        settings: [
            toggle('variant', 'Mode', [
                { value: 'standard', label: 'Standard' },
                { value: 'phosani', label: "Phosani's Nightmare", tone: 'accent' }
            ]),
            {
                key: 'teamSize', type: 'number', label: 'Team size', default: 5, min: 1, max: 80,
                disabledWhen: (state) => state.variant === 'phosani', disabledValue: 1
            }
        ]
    },
    yama: { adjust: modifiers.adjustRatesForYama, settings: [contribution] },
    doom_of_mokhaiotl: {
        adjust: modifiers.adjustRatesForDoom,
        settings: [{ key: 'delveLevel', type: 'number', label: 'Deepest delve level per run (2–15)', default: 9, min: 2, max: 15 }]
    },
    zulrah: { rolls: 2 },
    maggot_king: {
        adjust: modifiers.adjustRatesForMaggotKing,
        settings: [
            toggle('loot', 'Loot', [
                { value: 'stomach', label: 'Open stomach (standard)' },
                { value: 'eggs', label: 'Take eggs (2.3x pet)', tone: 'accent' }
            ])
        ],
        lockItems: (state) => state.loot === 'eggs' ? ['Maggot marquess'] : null
    },

    // Skilling
    wintertodt: {
        category: 'Skilling',
        adjust: modifiers.adjustRatesForWintertodt,
        settings: [{ key: 'points', type: 'number', label: 'Points per game', default: 750, min: 500 }]
    },
    tempoross: {
        category: 'Skilling',
        adjust: modifiers.adjustRatesForTempoross,
        settings: [{ key: 'points', type: 'number', label: 'Points per game', default: 4000, min: 0 }]
    },
    zalcano: { category: 'Skilling', adjust: modifiers.adjustRatesForZalcano, settings: [contribution] },
    hespori: { category: 'Skilling' },

    // Minigame
    the_gauntlet: { category: 'Minigame' },
    the_corrupted_gauntlet: { category: 'Minigame' },
    the_fight_caves: { category: 'Minigame' },
    the_inferno: { category: 'Minigame' },
    fortis_colosseum: {
        category: 'Minigame',
        adjust: modifiers.adjustRatesForColosseum,
        settings: [
            toggle('isSacrificing', 'Quivers', [
                { value: false, label: 'Keep (standard)' },
                { value: true, label: 'Sacrifice for pet chance', tone: 'accent' }
            ])
        ]
    },

    // Slayer
    abyssal_sire: { category: 'Slayer' },
    alchemical_hydra: { category: 'Slayer' },
    araxxor: {
        category: 'Slayer',
        adjust: modifiers.adjustRatesForAraxxor,
        settings: [
            toggle('isSacrificing', 'Corpse', [
                { value: false, label: 'Harvest (standard)' },
                { value: true, label: 'Destroy (2x pet)', tone: 'accent' }
            ])
        ],
        lockItems: (state) => state.isSacrificing ? ['Nid'] : null
    },
    cerberus: { category: 'Slayer' },
    demonic_gorilla: { category: 'Slayer' },
    grotesque_guardians: { category: 'Slayer', rolls: 2 },
    kraken: { category: 'Slayer' },
    shellbane_gryphon: { category: 'Slayer' },
    thermonuclear_smoke_devil: { category: 'Slayer' },
    tormented_demon: { category: 'Slayer' },

    // Wilderness
    artio: { category: 'Wilderness' },
    callisto: { category: 'Wilderness' },
    calvarion: { category: 'Wilderness', name: "Calvar'ion" },
    chaos_elemental: { category: 'Wilderness' },
    chaos_fanatic: { category: 'Wilderness' },
    crazy_archaeologist: { category: 'Wilderness' },
    scorpia: { category: 'Wilderness' },
    spindel: { category: 'Wilderness' },
    venenatis: { category: 'Wilderness' },
    vetion: { category: 'Wilderness', name: "Vet'ion" },

    // God Wars Dungeon
    commander_zilyana: { category: 'God Wars Dungeon' },
    general_graardor: { category: 'God Wars Dungeon' },
    kree_arra: { category: 'God Wars Dungeon', name: "Kree'arra" },
    kril_tsutsaroth: { category: 'God Wars Dungeon', name: "K'ril Tsutsaroth" },
    nex: { category: 'God Wars Dungeon' },

    // The Forgotten Four
    vardorvis: forgottenFour,
    duke_sucellus: forgottenFour,
    the_whisperer: forgottenFour,
    the_leviathan: forgottenFour,

    // Raids: points inputs are the player's own points, so results are a personal chance
    chambers_of_xeric: {
        category: 'Raids',
        adjust: modifiers.adjustRatesForCox,
        settings: [{ key: 'points', type: 'number', label: 'Your points per raid', default: 30000, min: 0 }]
    },
    theatre_of_blood: {
        category: 'Raids',
        adjust: modifiers.adjustRatesForTob,
        settings: [
            { key: 'size', type: 'number', label: 'Team size', default: 3, min: 1, max: 5 },
            { key: 'deaths', type: 'number', label: 'Team deaths', default: 0, min: 0 }
        ]
    },
    tombs_of_amascut: {
        category: 'Raids',
        adjust: modifiers.adjustRatesForToa,
        settings: [
            { key: 'level', type: 'number', label: 'Raid level', default: 150, min: 0, max: 600 },
            // The total shown in-game; the adjuster subtracts the 5,000 every player starts with
            { key: 'points', type: 'number', label: 'Your total points (in-game)', default: 15000, min: 0 }
        ]
    }
};

const MINOR_WORDS = new Set(['of', 'the']);

function formatBossName(key) {
    return key.split('_')
        .map((word, i) => (i > 0 && MINOR_WORDS.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function getBossDefinition(key) {
    return { ...DEFAULT_DEFINITION, name: formatBossName(key), ...DEFINITIONS[key] };
}

export function getDefaultState(definition) {
    return Object.fromEntries(definition.settings.map(s => [s.key, s.type === 'toggle' ? s.options[0].value : s.default]));
}

/** Groups boss keys by category in CATEGORY_ORDER, each group sorted by display name. */
export function groupBossesByCategory(bossKeys) {
    const groups = new Map(CATEGORY_ORDER.map(category => [category, []]));

    bossKeys.forEach(key => {
        const { category, name } = getBossDefinition(key);
        groups.get(category).push({ key, name });
    });

    return [...groups]
        .filter(([, bosses]) => bosses.length > 0)
        .map(([category, bosses]) => [category, bosses.sort((a, b) => a.name.localeCompare(b.name))]);
}

export const DEFINED_BOSS_KEYS = Object.keys(DEFINITIONS);

// Wiki files for bosses whose page image isn't a portrait of the boss (a logo, a location or a scene).
// Raids and minigames use their final boss. download_icons.js uses each boss page's own image otherwise.
const WIKI_IMAGE_OVERRIDES = {
    barrows_chests: 'Dharok_the_Wretched.png',
    chambers_of_xeric: 'Great_Olm.png',
    fortis_colosseum: 'Sol_Heredit.png',
    grotesque_guardians: 'Dusk.png',
    moons_of_peril: 'Blood_Moon.png',
    the_corrupted_gauntlet: 'Corrupted_Hunllef.png',
    the_fight_caves: 'TzTok-Jad.png',
    the_gauntlet: 'Crystalline_Hunllef.png',
    the_inferno: 'TzKal-Zuk.png',
    royal_titans: 'Branda_the_Fire_Queen.png',
    theatre_of_blood: 'Verzik_Vitur.png',
    tombs_of_amascut: "Tumeken's_Warden.png",
    wintertodt: 'Phoenix_(follower).png' // the Wintertodt has no clean portrait on the Wiki, so its pet stands in
};

// Bosses whose portrait follows a setting: each value listed here shows its own Wiki file, with the
// portrait id "<boss>-<value>"; the setting's other values show the boss's main portrait
const PORTRAIT_VARIANTS = {
    royal_titans: { setting: 'target', files: { eldric: 'Eldric_the_Ice_King.png' } }
};

/** Lists the extra portraits that setting variants need: [{ id, wikiImage }]. */
export const listPortraitVariants = () => Object.entries(PORTRAIT_VARIANTS).flatMap(([key, { files }]) =>
    Object.entries(files).map(([value, wikiImage]) => ({ id: `${key}-${value}`, wikiImage })));

/** Gets the portrait to show for a boss with the given settings: the boss key, or "<key>-<value>" for a variant. */
export function getPortraitId(key, state) {
    const variant = PORTRAIT_VARIANTS[key];
    const value = variant && state[variant.setting];
    return variant?.files[value] ? `${key}-${value}` : key;
}

const VARIANT_FILES = Object.fromEntries(listPortraitVariants().map(({ id, wikiImage }) => [id, wikiImage]));

/** Gets the Wiki file to use for a portrait id, or null to use the boss's Wiki page's own image. */
export const getBossWikiImage = (id) => WIKI_IMAGE_OVERRIDES[id] ?? VARIANT_FILES[id] ?? null;

// Per-boss adjustments to the standardised portrait (see download_icons.js):
// - cropBottom: share of the image's height to cut from the bottom, for a ground disc baked into the Wiki image
//   that would otherwise use up the figure's height
// - scale: multiplies the size the shared rules pick; the portrait still stays within the canvas
const PORTRAIT_TWEAKS = {
    amoxliatl: { cropBottom: 0.13 },
    moons_of_peril: { cropBottom: 0.12 }
};

/** Gets a boss's portrait adjustments: { cropBottom = 0, scale = 1 }. */
export const getBossPortraitTweaks = (key) => ({ cropBottom: 0, scale: 1, ...PORTRAIT_TWEAKS[key] });
