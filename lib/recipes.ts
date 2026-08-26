/* ---------------------------------------------------------------------------
 * Recipes, and where their numbers come from.
 *
 * Every macro on this page is COMPUTED from an ingredient table, not typed in
 * next to the recipe. That matters more than it sounds: asserted nutrition
 * numbers are exactly the kind of thing that looks authoritative and is quietly
 * wrong, and a language model will produce them all day without complaint. Here
 * the only hand-entered figures are per-100g values for whole foods, which are
 * checkable against any food database, and the calorie count is derived from
 * the macros by Atwater factors (4/4/9) so a recipe can never disagree with
 * itself.
 *
 * Portions are raw-or-cooked as labelled. Whole-food values vary by brand and
 * by how something is cooked — treat these as good estimates, not lab results.
 * ------------------------------------------------------------------------- */

interface Food {
  /** Per 100g: protein, carbohydrate, fat — in grams. */
  p: number;
  c: number;
  f: number;
  label: string;
}

const FOODS = {
  chicken: { p: 31, c: 0, f: 3.6, label: "chicken breast, cooked" },
  turkeyMince: { p: 27, c: 0, f: 7, label: "turkey mince (7% fat), cooked" },
  salmon: { p: 20, c: 0, f: 13, label: "salmon fillet" },
  tuna: { p: 24, c: 0, f: 1, label: "tuna in water, drained" },
  egg: { p: 12.6, c: 1.1, f: 10.6, label: "whole egg" },
  eggWhite: { p: 11, c: 0.7, f: 0.2, label: "egg white" },
  greekYogurt: { p: 10, c: 4, f: 0.4, label: "0% Greek yogurt" },
  cottageCheese: { p: 11, c: 3.4, f: 4.3, label: "low-fat cottage cheese" },
  paneer: { p: 18, c: 3.4, f: 20, label: "paneer" },
  tofu: { p: 17, c: 2, f: 9, label: "firm tofu" },
  soyaChunks: { p: 52, c: 33, f: 0.5, label: "soya chunks, dry" },
  whey: { p: 80, c: 7, f: 5, label: "whey protein" },
  milk: { p: 3.4, c: 5, f: 0.1, label: "skimmed milk" },
  oats: { p: 13, c: 60, f: 7, label: "rolled oats" },
  rice: { p: 2.7, c: 28, f: 0.3, label: "basmati rice, cooked" },
  roti: { p: 13.7, c: 72, f: 2.5, label: "wholewheat flour" },
  bread: { p: 13, c: 43, f: 3.5, label: "wholemeal bread" },
  lentils: { p: 9, c: 20, f: 0.4, label: "lentils, cooked" },
  chickpeas: { p: 8.9, c: 27, f: 2.6, label: "chickpeas, cooked" },
  kidneyBeans: { p: 8.7, c: 22.8, f: 0.5, label: "kidney beans, cooked" },
  sweetPotato: { p: 1.6, c: 20, f: 0.1, label: "sweet potato" },
  broccoli: { p: 2.8, c: 7, f: 0.4, label: "broccoli" },
  spinach: { p: 2.9, c: 3.6, f: 0.4, label: "spinach" },
  banana: { p: 1.1, c: 23, f: 0.3, label: "banana" },
  berries: { p: 0.7, c: 14, f: 0.3, label: "frozen berries" },
  peanutButter: { p: 25, c: 20, f: 50, label: "peanut butter" },
  almonds: { p: 21, c: 22, f: 49, label: "almonds" },
  chia: { p: 17, c: 42, f: 31, label: "chia seeds" },
  oliveOil: { p: 0, c: 0, f: 100, label: "olive oil" },
  honey: { p: 0.3, c: 82, f: 0, label: "honey" },
  onionTomato: { p: 1.2, c: 6, f: 0.2, label: "onion & tomato" },
} satisfies Record<string, Food>;

type FoodKey = keyof typeof FOODS;

export type RecipeKind = "shake" | "meal" | "snack";

interface RecipeDef {
  id: string;
  name: string;
  kind: RecipeKind;
  minutes: number;
  vegetarian: boolean;
  /** Why this one earns its place, in a sentence. */
  note: string;
  ingredients: [FoodKey, number][];
  method: string[];
}

const RECIPES: RecipeDef[] = [
  {
    id: "chicken-rice",
    name: "Chicken, rice and broccoli bowl",
    kind: "meal",
    minutes: 25,
    vegetarian: false,
    note: "The unglamorous default. Cook three portions at once and the week stops being a decision.",
    ingredients: [
      ["chicken", 180],
      ["rice", 200],
      ["broccoli", 150],
      ["oliveOil", 10],
    ],
    method: [
      "Season the chicken hard — paprika, garlic, salt — and pan-fry 6 minutes a side.",
      "Rice on, broccoli steamed over it for the last 5 minutes.",
      "Rest the chicken 3 minutes before slicing, or the juice ends up on the board.",
    ],
  },
  {
    id: "post-lift-shake",
    name: "Post-lift shake",
    kind: "shake",
    minutes: 2,
    vegetarian: true,
    note: "Two minutes, drinkable when you don't feel like eating. The banana is there for the carbohydrate, not the flavour.",
    ingredients: [
      ["whey", 30],
      ["banana", 100],
      ["milk", 300],
      ["peanutButter", 15],
    ],
    method: [
      "Liquid in the blender first, powder second — it stops the whey welding to the base.",
      "Ice if you're drinking it straight away.",
    ],
  },
  {
    id: "mass-shake",
    name: "Heavy shake, for when eating is the problem",
    kind: "shake",
    minutes: 3,
    vegetarian: true,
    note: "For gaining, or a training day you can't get food into. Calorie-dense on purpose — this is not a light option.",
    ingredients: [
      ["whey", 40],
      ["oats", 60],
      ["milk", 400],
      ["peanutButter", 20],
      ["banana", 120],
    ],
    method: [
      "Blend the oats dry for ten seconds first, or the texture is gritty.",
      "Everything else in, blend 30 seconds.",
    ],
  },
  {
    id: "yogurt-bowl",
    name: "Greek yogurt protein bowl",
    kind: "snack",
    minutes: 3,
    vegetarian: true,
    note: "Over 40g of protein without cooking anything. The whey stirred through thickens it.",
    ingredients: [
      ["greekYogurt", 250],
      ["berries", 80],
      ["whey", 15],
      ["almonds", 15],
      ["honey", 10],
    ],
    method: [
      "Stir the whey into the yogurt a spoonful at a time — dumped in at once it clumps.",
      "Berries and almonds on top.",
    ],
  },
  {
    id: "overnight-oats",
    name: "Protein overnight oats",
    kind: "snack",
    minutes: 5,
    vegetarian: true,
    note: "Made the night before, so a 6am session isn't trained fasted by accident.",
    ingredients: [
      ["oats", 60],
      ["milk", 200],
      ["greekYogurt", 100],
      ["whey", 20],
      ["chia", 10],
      ["berries", 60],
    ],
    method: [
      "Everything in a jar, stir, fridge overnight.",
      "It thickens more than you expect — add milk in the morning if needed.",
    ],
  },
  {
    id: "paneer-bhurji",
    name: "Paneer bhurji with roti",
    kind: "meal",
    minutes: 20,
    vegetarian: true,
    note: "High protein without meat. Paneer carries real fat, so it sits better on a training day than a rest day.",
    ingredients: [
      ["paneer", 150],
      ["onionTomato", 120],
      ["spinach", 80],
      ["roti", 60],
      ["oliveOil", 8],
    ],
    method: [
      "Onion and tomato down first with cumin, green chilli and turmeric.",
      "Crumble the paneer in for the last 4 minutes only — cooked long it goes rubbery.",
      "Spinach folded through at the end to wilt.",
    ],
  },
  {
    id: "rajma-rice",
    name: "Rajma with rice",
    kind: "meal",
    minutes: 30,
    vegetarian: true,
    note: "Cheap, filling, and the fibre is genuinely useful when calories are down.",
    ingredients: [
      ["kidneyBeans", 220],
      ["onionTomato", 150],
      ["rice", 180],
      ["oliveOil", 8],
    ],
    method: [
      "Tinned beans are fine. Onion, ginger, garlic, tomato, then the beans with a splash of their liquid.",
      "Simmer 15 minutes so it thickens rather than sits in water.",
    ],
  },
  {
    id: "soya-curry",
    name: "Soya chunk curry with rice",
    kind: "meal",
    minutes: 25,
    vegetarian: true,
    note: "The highest protein per rupee on this list, by a distance.",
    ingredients: [
      ["soyaChunks", 60],
      ["onionTomato", 150],
      ["rice", 150],
      ["oliveOil", 8],
    ],
    method: [
      "Boil the chunks 5 minutes, then squeeze them out properly — waterlogged soya tastes of nothing.",
      "Into a standard onion-tomato masala, simmer 10 minutes.",
    ],
  },
  {
    id: "tuna-chickpea",
    name: "Tuna and chickpea salad",
    kind: "meal",
    minutes: 8,
    vegetarian: false,
    note: "No cooking at all. The one that gets eaten on the days nothing else does.",
    ingredients: [
      ["tuna", 150],
      ["chickpeas", 150],
      ["spinach", 60],
      ["oliveOil", 10],
      ["onionTomato", 80],
    ],
    method: [
      "Drain both tins well.",
      "Lemon, olive oil, plenty of black pepper. Better after ten minutes sitting.",
    ],
  },
  {
    id: "salmon-sweet-potato",
    name: "Salmon, sweet potato and greens",
    kind: "meal",
    minutes: 35,
    vegetarian: false,
    note: "The fat here is the point — oily fish twice a week is one of the few dietary lines with broad agreement behind it.",
    ingredients: [
      ["salmon", 150],
      ["sweetPotato", 250],
      ["broccoli", 150],
      ["oliveOil", 5],
    ],
    method: [
      "Sweet potato in wedges, 200°C, 30 minutes.",
      "Salmon skin-side down in a hot dry pan 4 minutes, then 2 minutes off the heat.",
    ],
  },
  {
    id: "egg-scramble",
    name: "Egg and egg-white scramble on toast",
    kind: "meal",
    minutes: 10,
    vegetarian: true,
    note: "Whole eggs for taste, whites for the protein without the calories. Breakfast that isn't cereal.",
    ingredients: [
      ["egg", 100],
      ["eggWhite", 120],
      ["spinach", 60],
      ["bread", 80],
    ],
    method: [
      "Low heat, keep them moving, off the pan while they still look underdone.",
      "Spinach wilted in at the end.",
    ],
  },
  {
    id: "cottage-cheese",
    name: "Cottage cheese, berries and almonds",
    kind: "snack",
    minutes: 2,
    vegetarian: true,
    note: "Slow-digesting protein — the standard answer for the last thing before bed.",
    ingredients: [
      ["cottageCheese", 200],
      ["berries", 80],
      ["almonds", 20],
    ],
    method: ["Assemble. That's it."],
  },
  {
    id: "tofu-stirfry",
    name: "Tofu and lentil stir-fry",
    kind: "meal",
    minutes: 20,
    vegetarian: true,
    note: "Vegan, and still lands over 50g of protein — the lentils do more of that work than the tofu.",
    ingredients: [
      ["tofu", 200],
      ["lentils", 150],
      ["broccoli", 150],
      ["oliveOil", 10],
      ["rice", 120],
    ],
    method: [
      "Press the tofu 10 minutes under something heavy, then cube and fry hard until the edges colour.",
      "Add the vegetables and lentils, soy and chilli, two minutes only.",
    ],
  },
];

export interface Recipe {
  id: string;
  name: string;
  kind: RecipeKind;
  minutes: number;
  vegetarian: boolean;
  note: string;
  method: string[];
  ingredients: { label: string; grams: number }[];
  protein: number;
  carbs: number;
  fat: number;
  kcal: number;
  /** Protein per 100 kcal — how efficiently it spends the day's budget. */
  proteinDensity: number;
}

function build(def: RecipeDef): Recipe {
  let p = 0;
  let c = 0;
  let f = 0;
  const ingredients = def.ingredients.map(([key, grams]) => {
    const food = FOODS[key];
    p += (food.p * grams) / 100;
    c += (food.c * grams) / 100;
    f += (food.f * grams) / 100;
    return { label: food.label, grams };
  });
  // Atwater factors, so kcal can never contradict the macros above it.
  const kcal = Math.round(p * 4 + c * 4 + f * 9);
  const protein = Math.round(p);
  return {
    ...def,
    ingredients,
    protein,
    carbs: Math.round(c),
    fat: Math.round(f),
    kcal,
    proteinDensity: Math.round((protein / kcal) * 100 * 10) / 10,
  };
}

export const ALL_RECIPES: Recipe[] = RECIPES.map(build);

export function recipesFor(filter: {
  kind?: RecipeKind | "all";
  vegetarianOnly?: boolean;
  maxMinutes?: number;
}): Recipe[] {
  return ALL_RECIPES.filter(
    (r) =>
      (!filter.kind || filter.kind === "all" || r.kind === filter.kind) &&
      (!filter.vegetarianOnly || r.vegetarian) &&
      (!filter.maxMinutes || r.minutes <= filter.maxMinutes)
  ).sort((a, b) => b.proteinDensity - a.proteinDensity);
}
