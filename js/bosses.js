/**
 * @file bosses.js
 * Everything a boss needs beyond its drop table, in one place: display name, category,
 * rolls per kill, which matrix models it, the settings shown in the UI, how those settings
 * adjust drop rates, and which items a setting locks. Bosses without an entry use the defaults.
 *
 * Setting shapes:
 * - number: { key, type: 'number', label, default, min?, max?, disabledWhen?(state), disabledValue? }
 * - toggle: { key, type: 'toggle', options: [{ value, label, tone? }] }; the first option is the default.
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

const toggle = (key, options) => ({ key, type: 'toggle', options });
const contribution = { key: 'contrib', type: 'number', label: 'Contribution %', default: 100, min: 0, max: 100 };

const forgottenFour = {
    category: 'The Forgotten Four',
    adjust: modifiers.adjustRatesForDT2,
    settings: [
        toggle('isAwakened', [
            { value: false, label: 'Standard variant' },
            { value: true, label: 'Awakened variant (3x uniques)', tone: 'accent' }
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
            toggle('target', [
                { value: 'branda', label: 'Target: Branda', tone: 'fire' },
                { value: 'eldric', label: 'Target: Eldric', tone: 'ice' }
            ]),
            toggle('action', [
                { value: 'loot', label: 'Loot: standard' },
                { value: 'sacrifice', label: 'Loot: sacrifice (2x pet)', tone: 'accent' }
            ]),
            contribution
        ],
        lockItems: (state) => state.action === 'sacrifice' ? ['Bran'] : null
    },
    the_nightmare: {
        adjust: modifiers.adjustRatesForNightmare,
        settings: [
            toggle('variant', [
                { value: 'standard', label: 'Standard mode' },
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
        settings: [{ key: 'delveLevel', type: 'number', label: 'Delve level (2–15)', default: 9, min: 2, max: 15 }]
    },
    zulrah: { rolls: 2 },

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

    // Minigame
    the_corrupted_gauntlet: { category: 'Minigame' },
    the_fight_caves: { category: 'Minigame' },
    the_inferno: { category: 'Minigame' },
    fortis_colosseum: {
        category: 'Minigame',
        adjust: modifiers.adjustRatesForColosseum,
        settings: [
            toggle('isSacrificing', [
                { value: false, label: 'Keep quivers (standard)' },
                { value: true, label: 'Sacrifice quivers for pet chance', tone: 'accent' }
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
            toggle('isSacrificing', [
                { value: false, label: 'Harvest corpse (standard)' },
                { value: true, label: 'Destroy corpse (2x pet)', tone: 'accent' }
            ])
        ],
        lockItems: (state) => state.isSacrificing ? ['Nid'] : null
    },
    cerberus: { category: 'Slayer' },
    demonic_gorilla: { category: 'Slayer' },
    grotesque_guardians: { category: 'Slayer', rolls: 2 },
    kraken: { category: 'Slayer' },
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
            { key: 'points', type: 'number', label: 'Your points per raid', default: 15000, min: 0 }
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
