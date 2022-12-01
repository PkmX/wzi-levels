export type Location = {
  name: string;
  isBonus?: true;
  bonuses: string[];
};

export type MultipleStrike = "SS" | "JS" | "TS" | "QS";

export type Territory = {
  cost: number;
  location: Location;
  ms: MultipleStrike;
};

export type Cache = {
  quantity: number;
  location: Location;
};

export type Ingredients = Map<string, number>;

export type MercenaryCamp = {
  location: Location;
  quantity: number;
  cost: number;
};

export type Market = {
  location: Location;
  name: string;
  resources: [string, string, string, string];
};

export type DigSite = {
  location: Location;
  cost: number;
  time: number;
  rewards: {
    poor: number;
    common: number;
    uncommon: number;
    rare: number;
    epic: number;
  };
};

export class Hospital {
  declare private __nominal: void;
  constructor(public baseArmySaved: number, public upgradeCosts: number[], public location: Location) {}

  get maxLevel() {
    return this.upgradeCosts.length + 1;
  }

  armySavedAtLevel(level: number) {
    return this.baseArmySaved * (0.3 * level * level + 0.7);
  }
}

export class Powers {
  timeWrap = 0;
  superchargeArmyCamp = 0;
  superchargeMine = 0;
  freeCache = 0;
  marketRaid = 0;
  fogBuster = 0;
  inspireMercenaries = 0;
  skipLevel = 0;
  multiLevel = 0;
}

export class Level {
  declare private __nominal: void;

  constructor(
    public name = "",
    public ap = 0,
    public map: string | undefined = undefined,
    public largestArmyCaches = new Array<Cache>(),
    public largestMoneyCaches = new Array<Cache>(),
    public largestTerritories = new Array<Territory>(),
    public totalArmiesRequired = 0,
    public totalBaseArmyCaches = 0,
    public totalBaseMercenaries = 0,
    public totalBaseMercenariesCosts = 0,
    public totalBaseMoneyCaches = 0,
    public totalBaseMoneyGeneration = 0,
    public totalHospitalSaves = 0,
    public totalHospitalUpgradeCost = 0,
    public totalTerritories = 0,
    public recipes = new Map<string, [Ingredients, Location]>(),
    public techRecipes = new Map<string, Ingredients>(),
    public mercenaryCamps = new Array<MercenaryCamp>(),
    public markets = new Array<Market>(),
    public digSites = new Array<DigSite>(),
    public hospitals = new Array<Hospital>(),
    public powers = new Powers(),
  ) {}

  get marketResources() {
    return this.markets.flatMap((m) => m.resources);
  }
}
