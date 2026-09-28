// Treasure Hoard tables from the 5e Dungeon Master's Guide (ch. 7).
import { CoinKey } from '../core/coins/coins';

export type Dice = readonly [count: number, sides: number];
export type CrBandId = 'cr0-4' | 'cr5-10' | 'cr11-16' | 'cr17';
export type MagicTable = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface CoinFormula {
  denom: CoinKey;
  dice: Dice;
  multiplier: number;
}

export interface ValuablesRoll {
  kind: 'gem' | 'art';
  dice: Dice;
  valueGp: number;
}

export interface MagicRoll {
  table: MagicTable;
  dice: Dice;
}

export interface HoardRow {
  upTo: number;
  valuables?: ValuablesRoll;
  magic: MagicRoll[];
}

export interface CrBand {
  id: CrBandId;
  label: string;
  blurb: string;
  coins: CoinFormula[];
  rows: HoardRow[];
}

const ONE: Dice = [1, 1];

const coin = (denom: CoinKey, dice: Dice, multiplier: number): CoinFormula => ({
  denom,
  dice,
  multiplier,
});
const gems = (dice: Dice, valueGp: number): ValuablesRoll => ({ kind: 'gem', dice, valueGp });
const art = (dice: Dice, valueGp: number): ValuablesRoll => ({ kind: 'art', dice, valueGp });
const magic = (table: MagicTable, dice: Dice): MagicRoll => ({ table, dice });
const row = (upTo: number, valuables?: ValuablesRoll, ...rolls: MagicRoll[]): HoardRow => ({
  upTo,
  valuables,
  magic: rolls,
});

// The catalog has no consumable/permanent split, so each DMG magic item table
// is sampled by the rarity it predominantly holds.
export const MAGIC_TABLE_RARITY: Record<MagicTable, string> = {
  A: 'Common',
  B: 'Uncommon',
  C: 'Rare',
  D: 'Very Rare',
  E: 'Legendary',
  F: 'Uncommon',
  G: 'Rare',
  H: 'Very Rare',
  I: 'Legendary',
};

export const CR_BANDS: readonly CrBand[] = [
  {
    id: 'cr0-4',
    label: 'CR 0–4',
    blurb: 'Kobold dens & bandit caches',
    coins: [coin('cp', [6, 6], 100), coin('sp', [3, 6], 100), coin('gp', [2, 6], 10)],
    rows: [
      row(6),
      row(16, gems([2, 6], 10)),
      row(26, art([2, 4], 25)),
      row(36, gems([2, 6], 50)),
      row(44, gems([2, 6], 10), magic('A', [1, 6])),
      row(52, art([2, 4], 25), magic('A', [1, 6])),
      row(60, gems([2, 6], 50), magic('A', [1, 6])),
      row(65, gems([2, 6], 10), magic('B', [1, 4])),
      row(70, art([2, 4], 25), magic('B', [1, 4])),
      row(75, gems([2, 6], 50), magic('B', [1, 4])),
      row(78, gems([2, 6], 10), magic('C', [1, 4])),
      row(80, art([2, 4], 25), magic('C', [1, 4])),
      row(85, gems([2, 6], 50), magic('C', [1, 4])),
      row(92, art([2, 4], 25), magic('F', [1, 4])),
      row(97, gems([2, 6], 50), magic('F', [1, 4])),
      row(99, art([2, 4], 25), magic('G', ONE)),
      row(100, gems([2, 6], 50), magic('G', ONE)),
    ],
  },
  {
    id: 'cr5-10',
    label: 'CR 5–10',
    blurb: 'Young dragons & giant strongholds',
    coins: [
      coin('cp', [2, 6], 100),
      coin('sp', [2, 6], 1000),
      coin('gp', [6, 6], 100),
      coin('pp', [3, 6], 10),
    ],
    rows: [
      row(4),
      row(10, art([2, 4], 25)),
      row(16, gems([3, 6], 50)),
      row(22, gems([3, 6], 100)),
      row(28, art([2, 4], 250)),
      row(32, art([2, 4], 25), magic('A', [1, 6])),
      row(36, gems([3, 6], 50), magic('A', [1, 6])),
      row(40, gems([3, 6], 100), magic('A', [1, 6])),
      row(44, art([2, 4], 250), magic('A', [1, 6])),
      row(49, art([2, 4], 25), magic('B', [1, 4])),
      row(54, gems([3, 6], 50), magic('B', [1, 4])),
      row(59, gems([3, 6], 100), magic('B', [1, 4])),
      row(63, art([2, 4], 250), magic('B', [1, 4])),
      row(66, art([2, 4], 25), magic('C', [1, 4])),
      row(69, gems([3, 6], 50), magic('C', [1, 4])),
      row(72, gems([3, 6], 100), magic('C', [1, 4])),
      row(74, art([2, 4], 250), magic('C', [1, 4])),
      row(76, art([2, 4], 25), magic('D', ONE)),
      row(78, gems([3, 6], 50), magic('D', ONE)),
      row(79, gems([3, 6], 100), magic('D', ONE)),
      row(80, art([2, 4], 250), magic('D', ONE)),
      row(84, art([2, 4], 25), magic('F', [1, 4])),
      row(88, gems([3, 6], 50), magic('F', [1, 4])),
      row(91, gems([3, 6], 100), magic('F', [1, 4])),
      row(94, art([2, 4], 250), magic('F', [1, 4])),
      row(96, gems([3, 6], 100), magic('G', [1, 4])),
      row(98, art([2, 4], 250), magic('G', [1, 4])),
      row(99, gems([3, 6], 100), magic('H', ONE)),
      row(100, art([2, 4], 250), magic('H', ONE)),
    ],
  },
  {
    id: 'cr11-16',
    label: 'CR 11–16',
    blurb: 'Adult dragons & beholder lairs',
    coins: [coin('gp', [4, 6], 1000), coin('pp', [5, 6], 100)],
    rows: [
      row(3),
      row(6, art([2, 4], 250)),
      row(9, art([2, 4], 750)),
      row(12, gems([3, 6], 500)),
      row(15, gems([3, 6], 1000)),
      row(19, art([2, 4], 250), magic('A', [1, 4]), magic('B', [1, 6])),
      row(23, art([2, 4], 750), magic('A', [1, 4]), magic('B', [1, 6])),
      row(26, gems([3, 6], 500), magic('A', [1, 4]), magic('B', [1, 6])),
      row(29, gems([3, 6], 1000), magic('A', [1, 4]), magic('B', [1, 6])),
      row(35, art([2, 4], 250), magic('C', [1, 6])),
      row(40, art([2, 4], 750), magic('C', [1, 6])),
      row(45, gems([3, 6], 500), magic('C', [1, 6])),
      row(50, gems([3, 6], 1000), magic('C', [1, 6])),
      row(54, art([2, 4], 250), magic('D', [1, 4])),
      row(58, art([2, 4], 750), magic('D', [1, 4])),
      row(62, gems([3, 6], 500), magic('D', [1, 4])),
      row(66, gems([3, 6], 1000), magic('D', [1, 4])),
      row(68, art([2, 4], 250), magic('E', ONE)),
      row(70, art([2, 4], 750), magic('E', ONE)),
      row(72, gems([3, 6], 500), magic('E', ONE)),
      row(74, gems([3, 6], 1000), magic('E', ONE)),
      row(76, art([2, 4], 250), magic('F', ONE), magic('G', [1, 4])),
      row(78, art([2, 4], 750), magic('F', ONE), magic('G', [1, 4])),
      row(80, gems([3, 6], 500), magic('F', ONE), magic('G', [1, 4])),
      row(82, gems([3, 6], 1000), magic('F', ONE), magic('G', [1, 4])),
      row(85, art([2, 4], 250), magic('H', [1, 4])),
      row(88, art([2, 4], 750), magic('H', [1, 4])),
      row(90, gems([3, 6], 500), magic('H', [1, 4])),
      row(92, gems([3, 6], 1000), magic('H', [1, 4])),
      row(94, art([2, 4], 250), magic('I', ONE)),
      row(96, art([2, 4], 750), magic('I', ONE)),
      row(98, gems([3, 6], 500), magic('I', ONE)),
      row(100, gems([3, 6], 1000), magic('I', ONE)),
    ],
  },
  {
    id: 'cr17',
    label: 'CR 17+',
    blurb: 'Ancient wyrms & demon lords',
    coins: [coin('gp', [12, 6], 1000), coin('pp', [8, 6], 1000)],
    rows: [
      row(2),
      row(5, gems([3, 6], 1000), magic('C', [1, 8])),
      row(8, art([1, 10], 2500), magic('C', [1, 8])),
      row(11, art([1, 4], 7500), magic('C', [1, 8])),
      row(14, gems([1, 8], 5000), magic('C', [1, 8])),
      row(22, gems([3, 6], 1000), magic('D', [1, 6])),
      row(30, art([1, 10], 2500), magic('D', [1, 6])),
      row(38, art([1, 4], 7500), magic('D', [1, 6])),
      row(46, gems([1, 8], 5000), magic('D', [1, 6])),
      row(52, gems([3, 6], 1000), magic('E', [1, 6])),
      row(58, art([1, 10], 2500), magic('E', [1, 6])),
      row(63, art([1, 4], 7500), magic('E', [1, 6])),
      row(68, gems([1, 8], 5000), magic('E', [1, 6])),
      row(69, gems([3, 6], 1000), magic('G', [1, 4])),
      row(70, art([1, 10], 2500), magic('G', [1, 4])),
      row(71, art([1, 4], 7500), magic('G', [1, 4])),
      row(72, gems([1, 8], 5000), magic('G', [1, 4])),
      row(74, gems([3, 6], 1000), magic('H', [1, 4])),
      row(76, art([1, 10], 2500), magic('H', [1, 4])),
      row(78, art([1, 4], 7500), magic('H', [1, 4])),
      row(80, gems([1, 8], 5000), magic('H', [1, 4])),
      row(85, gems([3, 6], 1000), magic('I', [1, 4])),
      row(90, art([1, 10], 2500), magic('I', [1, 4])),
      row(95, art([1, 4], 7500), magic('I', [1, 4])),
      row(100, gems([1, 8], 5000), magic('I', [1, 4])),
    ],
  },
];

export const GEM_NAMES: Record<number, readonly string[]> = {
  10: ['Azurite', 'Banded agate', 'Blue quartz', 'Eye agate', 'Hematite', 'Lapis lazuli',
    'Malachite', 'Moss agate', 'Obsidian', 'Rhodochrosite', 'Tiger eye', 'Turquoise'],
  50: ['Bloodstone', 'Carnelian', 'Chalcedony', 'Chrysoprase', 'Citrine', 'Jasper',
    'Moonstone', 'Onyx', 'Quartz', 'Sardonyx', 'Star rose quartz', 'Zircon'],
  100: ['Amber', 'Amethyst', 'Chrysoberyl', 'Coral', 'Garnet', 'Jade', 'Jet', 'Pearl',
    'Spinel', 'Tourmaline'],
  500: ['Alexandrite', 'Aquamarine', 'Black pearl', 'Blue spinel', 'Peridot', 'Topaz'],
  1000: ['Black opal', 'Blue sapphire', 'Emerald', 'Fire opal', 'Opal', 'Star ruby',
    'Star sapphire', 'Yellow sapphire'],
  5000: ['Black sapphire', 'Diamond', 'Jacinth', 'Ruby'],
};

export const ART_NAMES: Record<number, readonly string[]> = {
  25: ['Silver ewer', 'Carved bone statuette', 'Small gold bracelet', 'Cloth-of-gold vestments',
    'Black velvet mask stitched with silver thread', 'Copper chalice with silver filigree',
    'Pair of engraved bone dice', 'Small mirror in a painted wooden frame',
    'Embroidered silk handkerchief', 'Gold locket with a painted portrait inside'],
  250: ['Gold ring set with bloodstones', 'Carved ivory statuette', 'Large gold bracelet',
    'Silver necklace with a gemstone pendant', 'Bronze crown', 'Silk robe with gold embroidery',
    'Large well-made tapestry', 'Brass mug with jade inlay', 'Box of turquoise animal figurines',
    'Gold birdcage with electrum filigree'],
  750: ['Silver chalice set with moonstones', 'Silver-plated longsword with a jet-set hilt',
    'Carved harp of exotic wood with ivory inlay', 'Small gold idol',
    'Gold dragon comb set with red garnets', 'Bottle stopper embossed with gold leaf',
    'Ceremonial electrum dagger with a black pearl pommel', 'Silver and gold brooch',
    'Obsidian statuette with gold fittings', 'Painted gold war mask'],
  2500: ['Fine gold chain set with a fire opal', 'Old masterpiece painting',
    'Silk and velvet mantle set with moonstones', 'Platinum bracelet set with a sapphire',
    'Embroidered glove set with jewel chips', 'Jeweled anklet', 'Gold music box',
    'Gold circlet set with four aquamarines', 'Eye patch with a mock eye of sapphire',
    'Necklace string of small pink pearls'],
  7500: ['Jeweled gold crown', 'Jeweled platinum ring', 'Small gold statuette set with rubies',
    'Gold cup set with emeralds', 'Gold jewelry box with platinum filigree',
    'Painted gold child’s sarcophagus', 'Jade game board with solid gold pieces',
    'Bejeweled ivory drinking horn with gold filigree'],
};
