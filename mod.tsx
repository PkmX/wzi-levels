/** @jsx JSX */

import { writeAll } from "https://deno.land/std@0.166.0/streams/conversion.ts";
import { Fragment, h as JSX, renderToString } from "https://deno.land/x/jsx@v0.1.5/mod.ts";
import * as CSV from "https://deno.land/x/csv@v0.7.5/mod.ts";
import {
  Cache,
  DigSite,
  Hospital,
  Ingredients,
  Level,
  Location,
  Market,
  MercenaryCamp,
  MultipleStrike,
  Powers,
  Territory,
} from "./levels.ts";

const f = await Deno.open("data.csv");

type CSVObject = { [key: string]: string };

export function parseNumber(s: string): number {
  const matches = s.match(/^(-?\d+(?:\.\d+)?)([KMBT]?)/);
  if (matches) {
    const base = parseFloat(matches[1]);
    switch (matches[2]) {
      case "":
        return base;
      case "K":
        return Math.round(base * 1_000);
      case "M":
        return Math.round(base * 1_000_000);
      case "B":
        return Math.round(base * 1_000_000_000);
      case "T":
        return Math.round(base * 1_000_000_000_000);
    }
  }

  throw `Invalid number: ${s}`;
}

function parseLocation({ "Location": loc, "Location hints": hints }: CSVObject): Location {
  const bonuses = (() => {
    const prefix = "Part of bonuses:";
    if (hints.startsWith(prefix)) {
      return hints.substring(prefix.length).split(", ").map((s) => s.trim());
    } else if (hints == "") {
      return [];
    } else {
      throw `Invalid location hints: ${hints}`;
    }
  })();

  if (loc.startsWith("Territory: ")) {
    return { name: loc.substring(11), bonuses: bonuses };
  } else if (loc.startsWith("Bonus: ")) {
    return { name: loc.substring(7), isBonus: true, bonuses };
  } else {
    throw `Invalid location: ${loc}`;
  }
}

function parseMultipleStrike(s: string): MultipleStrike {
  if (s.includes("QS")) {
    return "QS";
  } else if (s.includes("TS")) {
    return "TS";
  } else if (s.includes("JS")) {
    return "JS";
  } else {
    return "SS";
  }
}

function parseDigsite(row: CSVObject): DigSite {
  const details = row["Details"];
  const matches = details.match(/^Cost: (.+?); Time: (.+?); Type: (.+)$/);

  if (!matches) {
    throw `Invalid dig site: ${details}`;
  }

  const parseRewards = (s: string) => {
    const matches = s.match(/^(?:p(\d+))?\s*(?:c(\d+))?\s*(?:u(\d+))?\s*(?:r(\d+))?\s*(?:e(\d+))?/);
    if (matches) {
      return {
        poor: parseInt(matches[1] ?? 0, 10),
        common: parseInt(matches[2] ?? 0, 10),
        uncommon: parseInt(matches[3] ?? 0, 10),
        rare: parseInt(matches[4] ?? 0, 10),
        epic: parseInt(matches[5] ?? 0, 10),
      };
    }
    throw `Invalid dig site reward: ${s}`;
  };

  return {
    location: parseLocation(row),
    cost: parseNumber(matches[1]),
    time: parseInt(matches[2], 10) * 3600,
    rewards: parseRewards(matches[3]),
  };
}

function parseHospital(row: CSVObject): Hospital {
  const details = row["Details"];
  const matches = details.match(/^Base armies saved: (.+?); Upgrade costs: ?(.*?)$/);
  if (!matches) {
    throw `Invalid hosptial: ${details}`;
  }

  return new Hospital(
    parseNumber(matches[1]),
    matches[2] != "" ? matches[2].split(", ").map(parseNumber) : [],
    parseLocation(row),
  );
}

function parseMarket(row: CSVObject): Market {
  const { "Name": name, "Details": details } = row;
  const prefix = "Resources: ";
  if (!details.startsWith(prefix)) {
    throw `Invalid market: ${details}`;
  }

  return {
    location: parseLocation(row),
    name: name,
    resources: details.substring(prefix.length).split(", ") as [string, string, string, string],
  };
}

function parseMercenaryCamp(row: CSVObject): MercenaryCamp {
  const details = row["Details"];
  const matches = details.match(/^Base mercs: (.+?); Base cost: (.*?)$/);
  if (!matches) {
    throw `Invalid mercenary camp: ${details}`;
  }

  return {
    location: parseLocation(row),
    quantity: parseNumber(matches[1]),
    cost: parseNumber(matches[2]),
  };
}

function parseIngredient(s: string): [string, number] {
  const matches = s.match(/^(.*)? x(\d+(\.\d+)?[KM]?)$/);
  if (!matches) {
    throw `Invalid ingredient: ${s}`;
  }

  return [matches[1], parseNumber(matches[2])];
}

function parseRecipe(row: CSVObject): [string, Ingredients] {
  const { "Name": name, "Details": details } = row;
  const prefix = "Requires: ";
  if (!details.startsWith(prefix)) {
    throw `Invalid recipe: ${details}`;
  }

  const ingredients: Ingredients = new Map();
  for (const i of details.substring(prefix.length).split(", ")) {
    const [name, quantity] = parseIngredient(i);
    ingredients.set(name, quantity);
  }

  return [name, ingredients];
}

function parsePowers(s: string): Powers {
  const powers = new Powers();

  s.split(" ").forEach((p) => {
    const [name, quantity] = p.split("x");
    switch (name) {
      case "TW":
        powers.timeWrap = parseInt(quantity);
        break;
      case "SAC":
        powers.superchargeArmyCamp = parseInt(quantity);
        break;
      case "SM":
        powers.superchargeMine = parseInt(quantity);
        break;
      case "FC":
        powers.freeCache = parseInt(quantity);
        break;
      case "MR":
        powers.marketRaid = parseInt(quantity);
        break;
      case "FB":
        powers.fogBuster = parseInt(quantity);
        break;
      case "IM":
        powers.inspireMercenaries = parseInt(quantity);
        break;
      case "SL":
        powers.skipLevel = parseInt(quantity);
        break;
      case "ML":
        powers.multiLevel = parseInt(quantity);
        break;
      default:
        throw `error: unknown power: ${name}`;
    }
  });

  return powers;
}

const baseAP: Record<number, number> = {
  1: 0.23,
  2: 17.30,
  3: 31.13,
  4: 33.75,
  5: 42.99,
  10005: 128.7,
  6: 43.05,
  7: 50.40,
  8: 53.57,
  10008: 160.39,
  9: 83.95,
  10: 128.77,
  10010: 385.52,
  11: 194.80,
  12: 198.45,
  10012: 594.13,
  13: 201.67,
  14: 231.84,
  15: 298.84,
  10015: 894.66,
  16: 306.80,
  17: 311.35,
  18: 380.81,
  19: 469.45,
  20: 511.70,
  10020: 1531.88,
  21: 538.39,
  22: 562.48,
  10022: 1683.86,
  23: 588.75,
  24: 604.73,
  25: 614.78,
  10025: 1840.41,
  26: 622.67,
  27: 672.21,
  28: 722.30,
  10028: 2162.24,
  29: 878.54,
  30: 1066.45,
  10030: 3192.43,
  31: 1175.30,
  32: 1224.00,
  10032: 3664.00,
  20033: 120.26,
  20034: 134.03,
  20035: 153.51,
  20036: 163.44,
  20037: 247.14,
  20038: 271.15,
  20039: 369.87,
  20040: 437.96,
  20041: 470.79,
  20042: 516.82,
  20043: 636.28,
  20044: 753.4,
  20045: 1298.34,
  20046: 1785.48,
  20047: 4644.78,
  20048: 6752.28,
  20049: 11052.63,
};

const maps: Record<number, string | undefined> = {
  1: "https://i.imgur.com/ohZpUCT.png", // TODO: fogged
  2: "https://i.imgur.com/UvC6a8I.png",
  3: "https://i.imgur.com/UKXVpBE.png",
  4: "https://i.imgur.com/w4NkjZE.png",
  5: "https://i.imgur.com/KHyizW7.png",
  10005: "https://i.imgur.com/YJZtguP.png",
  6: "https://i.imgur.com/lTZTknj.png",
  7: "https://i.imgur.com/4gxq1U4.png",
  8: "https://i.imgur.com/fsRW55h.png",
  10008: "https://i.imgur.com/pNZo05Q.png",
  9: "https://i.imgur.com/PWBZp31.png",
  10: "https://i.imgur.com/upnjf3E.png", // TODO: low resolution
  10010: "https://i.imgur.com/JUnbTyJ.png",
  11: "https://i.imgur.com/UnzsX8w.png",
  12: "https://i.imgur.com/EnXbQYV.png", // TODO: fogged
  10012: "https://i.gyazo.com/f7311d0a2492c13a3de070543042c412.png",
  13: "https://i.imgur.com/g5D9QtX.png", // TODO: fogged
  14: "https://i.imgur.com/Z5KdVqm.png", // TODO: fogged
  15: "https://i.imgur.com/iLsR4we.png",
  10015: "https://i.imgur.com/6EFPXDM.png",
  16: "https://i.imgur.com/gQtWEWL.jpeg",
  17: "https://i.imgur.com/dcJ3DkO.png", // TODO: fogged
  18: "https://i.imgur.com/3crKVSn.png", // TODO: fogged
  19: "https://i.imgur.com/G6XnqqS.png",
  20: "https://i.imgur.com/bw1MgCO.png",
  10020: "https://i.imgur.com/bpwzxlD.png",
  21: "https://i.imgur.com/btnQV6E.png",
  22: "https://i.imgur.com/8bueeXd.png",
  10022: "https://i.ibb.co/KNnjFcX/22b-Scandinavia-Hard.png",
  23: "https://i.imgur.com/Joofzp5.png",
  24: "https://i.imgur.com/ACtMiYb.png",
  25: "https://i.imgur.com/I2sDd3a.png",
  10025: "https://i.ibb.co/CJYG3Fx/25a-Hardened-Rise-and-Fall-of-the-Roman-Empire-HD.png",
  26: "https://i.imgur.com/lhdEb7M.png",
  27: "https://i.imgur.com/Oc1Ejc7.png",
  28: "https://i.imgur.com/4AiqDjD.png",
  10028: "https://i.imgur.com/fhv8eUj.png", // TODO: fogged
  29: "https://i.imgur.com/U7e0ljO.png", // TODO: fogged
  30: "https://i.imgur.com/dzeArrC.png", // TODO: fogged
  10030: "https://i.imgur.com/zcMhmX3.png", // TODO: fogged
  31: "https://i.imgur.com/VJ2rznd.png", // TODO: fogged
  32: "https://i.imgur.com/tHYBCyY.png", // TODO: fogged
  10032: "https://i.imgur.com/aXHHJDg.png", // TODO: fogged
  20033: "https://i.gyazo.com/ee005fdd061f928f36b56cfa926b0d37.png",
  20034: "https://i.imgur.com/Vrlwdg0.png", // TODO: fogged
  20035: "https://i.imgur.com/nCO65QT.png", // TODO: fogged
  20036: "https://i.imgur.com/0t0Ow0p.png", // TODO: fogged
  20037: "https://i.imgur.com/9rB54v2.png", // TODO: fogged
  20038: "https://i.imgur.com/1qNTd94.png", // TODO: fogged
  20039: "https://i.imgur.com/tflSVDO.png", // TODO: fogged
  20040: "https://i.imgur.com/xu3pSDe.png", // TODO: fogged
  20041: "https://i.imgur.com/QCpcDGD.png", // TODO: fogged
  20042: "https://i.imgur.com/XT8lhbq.png", // TODO: fogged
  20043: "https://i.imgur.com/7L8OBHG.png", // TODO: fogged
  20044: "https://i.imgur.com/DAsKHXW.png", // TODO: fogged
  20045: "https://i.imgur.com/uenXbES.png", // TODO: fogged
  20046: "https://i.imgur.com/AAV7j8E.png", // TODO: fogged
  20047: "https://i.imgur.com/oCOmKtP.png", // TODO: fogged
  20048: undefined, // TODO: no map
  20049: "https://i.imgur.com/6RLnaTb.png",
};

const levels: Map<number, Level> = new Map();

for await (const row of CSV.readCSVObjects(f, { lineSeparator: "\r\n" })) {
  const {
    "Level ID": _id,
    "Level Name": levelName,
    "Type": type,
    "Name": name,
    "Details": details,
  } = row;

  const id = parseInt(_id);

  const level = levels.get(id) ?? new Level(levelName, baseAP[id], maps[id]);
  levels.set(id, level);

  if (type == "Dig Sites") {
    level.digSites.push(parseDigsite(row));
  } else if (type == "Hospital") {
    level.hospitals.push(parseHospital(row));
  } else if (type == "Largest Cache") {
    if (name == "Army Cache") {
      level.largestArmyCaches.push({ quantity: parseNumber(details), location: parseLocation(row) });
    } else if (name == "Money Cache") {
      level.largestMoneyCaches.push({ quantity: parseNumber(details), location: parseLocation(row) });
    }
  } else if (type == "Largest Territories") {
    level.largestTerritories.push({
      cost: parseNumber(details),
      location: parseLocation(row),
      ms: parseMultipleStrike(details),
    });
  } else if (type == "Market") {
    level.markets.push(parseMarket(row));
  } else if (type == "Mercenary Camp") {
    level.mercenaryCamps.push(parseMercenaryCamp(row));
  } else if (type == "Meta") {
    if (name == "Total Armies Required") {
      level.totalArmiesRequired = parseNumber(details);
    } else if (name == "Total Base Army Caches") {
      level.totalBaseArmyCaches = parseNumber(details);
    } else if (name == "Total Base Mercenaries") {
      level.totalBaseMercenaries = parseNumber(details);
    } else if (name == "Total Base Mercenaries Costs") {
      level.totalBaseMercenariesCosts = parseNumber(details);
    } else if (name == "Total Base Money Caches") {
      level.totalBaseMoneyCaches = parseNumber(details);
    } else if (name == "Total Base Money Generation Per Sec") {
      level.totalBaseMoneyGeneration = parseNumber(details);
    } else if (name == "Total Hospitals Save per Terr") {
      level.totalHospitalSaves = parseNumber(details);
    } else if (name == "Total Hospitals Upgrade Costs") {
      level.totalHospitalUpgradeCost = parseNumber(details);
    } else if (name == "Total Territories") {
      level.totalTerritories = parseNumber(details);
    } else if (name == "Total Powers Available") {
      if (details) {
        level.powers = parsePowers(details);
      }
    } else {
      throw `Unknown row: ${JSON.stringify(row)}`;
    }
  } else if (type == "Recipe") {
    const [name, ingredients] = parseRecipe(row);
    level.recipes.set(name, [ingredients, parseLocation(row)]);
  } else if (type == "Tech Recipe") {
    const [name, ingredients] = parseRecipe(row);
    const techName = name.startsWith("!MS: ") ? name.substring("!MS: ".length) : name;
    level.techRecipes.set(techName, ingredients);
  } else {
    throw `Unknown row: ${JSON.stringify(row)}`;
  }
}

for (const level of levels.values()) {
  level.largestTerritories.sort((a, b) => b.cost - a.cost);
  level.largestArmyCaches.sort((a, b) => b.quantity - a.quantity);
  level.largestMoneyCaches.sort((a, b) => b.quantity - a.quantity);

  const order = ["Belluminkling", "Mixtup", "Twisometo", "Cleakuwaked", "Bationare", "Miscoutly", "Paidittinicked"];
  level.markets.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

function toAnchorName(s: string): string {
  return s.replaceAll(" ", "-").toLowerCase();
}

function toPageName(s: string): string {
  return s.replaceAll("'", "").replaceAll(/[^0-9a-z]/gi, "-").replaceAll(/-+/g, "-").toLowerCase();
}

function renderNumber(n: number): string {
  if (n >= 1_000_000_000_000) {
    return +(n / 1_000_000_000_000).toFixed(3) + "T";
  } else if (n >= 1_000_000_000) {
    return +(n / 1_000_000_000).toFixed(3) + "B";
  } else if (n >= 1_000_000) {
    return +(n / 1_000_000).toFixed(3) + "M";
  } else if (n >= 1_000) {
    return +(n / 1_000).toFixed(3) + "K";
  }

  return String(n);
}

function renderLevelSelect(myid: number) {
  const renderOption = (id: number, level: Level) =>
    id == myid
      ? <option value={`./${toPageName(level.name)}.html`} selected="">{level.name}</option>
      : <option value={`./${toPageName(level.name)}.html`}>{level.name}</option>;

  return (
    <select id="level-select" onchange="window.location.href=this.value">
      {[...levels.entries()].map(([id, level]) => renderOption(id, level))}
    </select>
  );
}

function renderLocation(location: Readonly<Location>, placement: string) {
  const tooltip = location.bonuses.length == 0
    ? "Not in any bonuses"
    : `Part of bonuses:\n${location.bonuses.map((s) => "• " + s).join("\n")}`;
  return <u data-tooltip={tooltip} data-placement={placement}>{location.name + (location.isBonus ? " (Bonus)" : "")}
  </u>;
}

function renderPowers(powers: Powers) {
  const abbrev = {
    timeWrap: "TW",
    superchargeArmyCamp: "SAC",
    superchargeMine: "SM",
    freeCache: "FC",
    marketRaid: "MR",
    fogBuster: "FB",
    inspireMercenaries: "IM",
    skipLevel: "SL",
    multiLevel: "ML",
  } as const;

  const fullName = {
    timeWrap: "Time Wrap",
    superchargeArmyCamp: "Supercharge Army Camp",
    superchargeMine: "Supercharge Mine",
    freeCache: "Free Cache",
    marketRaid: "Market Raid",
    fogBuster: "Fog Buster",
    inspireMercenaries: "Inspire Mercenaries",
    skipLevel: "Skip Level",
    multiLevel: "Multi Level",
  } as const;

  return (
    <div class="powers">
      {Object.entries(powers).map(([name, n], i) => {
        const p = name as keyof (typeof fullName);

        if (n == 0) {
          return <Fragment></Fragment>;
        }

        return (
          <div class="card">
            <div class="name" data-tooltip={fullName[p]}>{abbrev[p]}</div>
            <div class="quantity">{n}</div>
          </div>
        );
      })}
    </div>
  );
}

function renderLargestTerritories(ts: Readonly<Territory>[]) {
  return (
    <table role="grid" style="flex: 1;">
      <caption>Largest Territories</caption>
      <thead>
        <tr>
          <th scope="col">Location</th>
          <th scope="col">Cost</th>
        </tr>
      </thead>
      <tbody>
        {ts.map((t) => (
          <tr>
            <td>{renderLocation(t.location, "top")}</td>
            <td>{renderNumber(t.cost)} ({t.ms})</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderLargestCaches(ts: Readonly<Cache>[], id: string, caption: string) {
  return (
    <table id={id} role="grid" style="flex: 1;">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Location</th>
          <th scope="col">Size</th>
        </tr>
      </thead>
      <tbody>
        {ts.map((t) => (
          <tr>
            <td>{renderLocation(t.location, "top")}</td>
            <td>{renderNumber(t.quantity)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderHospitals(hospitals: Readonly<Hospital>[]) {
  if (hospitals.length == 0) {
    return undefined;
  }

  const maxLevel = hospitals.reduce((acc, h) => Math.max(acc, h.maxLevel), 1);

  return (
    <figure>
      <table role="grid">
        <thead>
          <tr>
            <th scope="col">Location</th>
            {[...Array(maxLevel).keys()].map((i) => <th scope="col">L{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {hospitals.map((h) => (
            <tr>
              <td>{renderLocation(h.location, "right")}</td>
              <td>
                {renderNumber(h.baseArmySaved)}
                <br />
                <small>&nbsp;</small>
              </td>
              {h.upgradeCosts.map((cost, i) => {
                const level = i + 2;
                return (
                  <td>
                    {renderNumber(h.armySavedAtLevel(level))}
                    <br />
                    <small>(${renderNumber(cost)})</small>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function renderMarkets(markets: Readonly<Market>[]) {
  if (markets.length == 0) {
    return undefined;
  }

  const renderMarket = (market: Readonly<Market>) => (
    <tr id={toAnchorName(market.name)}>
      <td style="font-weight: bold;">{market.name}</td>
      <td>
        <ul class="market-resources">
          {market.resources.map((res) => <li class="market-resource">{res}</li>)}
        </ul>
      </td>
      <td>{renderLocation(market.location, "left")}</td>
    </tr>
  );

  return (
    <figure>
      <table role="grid">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" style="text-align: center;">Resources</th>
            <th scope="col">Location</th>
          </tr>
        </thead>
        <tbody>
          {markets.map(renderMarket)}
        </tbody>
      </table>
    </figure>
  );
}

function findMarketForResource(markets: Market[], res: string): Market | undefined {
  return markets.find((m) => m.resources.includes(res));
}

function transpose<T>(a: T[][]): T[][] {
  return Object.keys(a[0]).map((c) => a.map((r) => r[Number(c)]));
}

const fullTechTree = transpose([
  [
    "Drafting",
    "Basic Recruitment",
    "Billboards",
    "Radio Commercials",
    "TV Commercials",
    "College Recruiters",
    "High School Recruiters",
    "Middle School Recruiters",
    "Offer Veteran Benefits",
    "I WANT YOU posters",
    "Soldier Cloning",
    "Quantum Cloning",
  ],
  [
    undefined,
    "Increase Taxes on Corporations",
    undefined,
    "Mandatory draft",
    undefined,
    "Tariffs",
    undefined,
    "Enforce Mandatory draft",
    undefined,
    "Close loopholes",
  ],
  [
    "Barehand Mining",
    "Pickaxes",
    "Torches",
    "Mine Carts",
    "Lanterns",
    "Headlamps",
    "Drills",
    "TNT",
    "Mega TNT",
  ],
  [
    undefined,
    "Increase Taxes on the Rich",
    undefined,
    "Increase Sales Tax",
    undefined,
    "Enforce the Use Tax",
    undefined,
    "Increase Taxes on the Poor",
  ],
  [
    "Faster Smelters",
    "Faster Crafters",
    "Efficient Smelters",
    "Efficient Crafters",
    "Smelt Dupe",
    "Craft Dupe",
    "Smelt Smelt Smelt",
    "Craft Craft Craft",
    "Bigger Smelter",
    "Crunch time",
  ],
  [
    undefined,
    undefined,
    "Basic negotiations",
    "Advanced negotiations",
    "Assert dominance",
    "Break a few shins",
  ],
  [
    "Basic Marketing",
    "Intern Salesman",
    "Incentive Program",
    "Price Collusion",
    "Faster Construction",
    "Prefab Assembly",
  ],
  [
    undefined,
    undefined,
    "Window display on busy street",
    "Bait and switch tactics",
    "Medicine Refinement",
    "Tell your workers that it's cash",
    "Hire Actual Doctors",
  ],
  [
    undefined,
    "Infrastructure Upgrades",
    "Cost Cutting",
    "Drill Sergeant pay cuts",
    "Cut Veteran's Benefits",
  ],
  [
    undefined,
    "Logistics",
    "Better Trucks",
    "Bigger Trucks",
    "Something about Trucks",
    "Mother Trucker",
  ],
]);

function renderTechRecipes(techRecipes: Level["techRecipes"], markets: Market[]) {
  if (techRecipes.size == 0) {
    return undefined;
  }

  const techTree = fullTechTree.map((row) => row.map((tech) => tech && techRecipes.has(tech) ? tech : undefined))
    .filter((row) => !row.every((e) => e == undefined));

  const renderTech = (tech: string | undefined) => {
    if (!tech || !techRecipes.has(tech)) {
      return <td></td>;
    }

    return (
      <td>
        <strong>{tech}</strong>
        <br />
        {[...techRecipes.get(tech)!.entries()].map(([res, n]) => {
          const market = markets.find((m) => m.resources.includes(res));
          if (market) {
            return (
              <a href={`#${toAnchorName(market.name)}`} class="resource">
                {renderNumber(n)} {res}
              </a>
            );
          } else {
            return (
              <a href={`#${toAnchorName(res)}`} class="resource missing">
                {renderNumber(n)} {res}
              </a>
            );
          }
        })}
      </td>
    );
  };

  return (
    <figure>
      <table role="grid" id="tech-recipes">
        <tbody>
          {techTree.map((row) => row.every((e) => e == undefined) ? "" : <tr>{row.map(renderTech)}</tr>)}
        </tbody>
      </table>
    </figure>
  );
}

function renderMercenaryCamps(mcs: MercenaryCamp[], totalMerc: number, totalCost: number) {
  return (
    <table role="grid">
      <thead>
        <tr>
          <th scope="col">Location</th>
          <th scope="col">Armies</th>
          <th scope="col">Cost</th>
          <th scope="col">Total Cost</th>
        </tr>
      </thead>
      <tbody>
        {mcs.map((mc) => (
          <tr>
            <td>{renderLocation(mc.location, "right")}</td>
            <td>{renderNumber(mc.quantity)}</td>
            <td>{renderNumber(mc.cost)}</td>
            <td>{renderNumber(mc.quantity * mc.cost)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{renderNumber(totalMerc)}</td>
          <td>
            <em data-tooltip="Average Cost">{(totalCost / totalMerc).toFixed(2)}</em>
          </td>
          <td>{renderNumber(totalCost)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function renderDigSites(digSites: DigSite[]) {
  if (digSites.length == 0) {
    return undefined;
  }

  const renderTime = (t: number) => {
    const d = Math.floor(t / 86400);
    t %= 86400;
    const h = Math.floor(t / 3600);
    t %= 3600;
    const m = Math.floor(t / 60);
    t %= 60;
    const f = (n: number, u: string) => n != 0 ? `${n}${u}` : "";
    return [f(d, "d"), f(h, "h"), f(m, "m"), f(t, "s")].join(" ");
  };

  const toCommonEquivalent = (
    r: DigSite["rewards"],
  ) => (r.epic * 125 + r.rare * 25 + r.uncommon * 5 + r.common + r.poor / 5);

  const totalRewards = digSites.reduce(
    (acc, { rewards }) => acc + toCommonEquivalent(rewards),
    0,
  ) / 100;

  return (
    <figure>
      <table id="dig-sites" role="grid">
        <thead>
          <tr>
            <th scope="col" rowspan="2">Location</th>
            <th scope="col" rowspan="2">Cost</th>
            <th scope="col" rowspan="2">Time</th>
            <th scope="col" colspan="5">Rewards</th>
          </tr>
          <tr>
            <th>E</th>
            <th>R</th>
            <th>U</th>
            <th>C</th>
            <th>P</th>
          </tr>
        </thead>
        <tbody>
          {digSites.map(({ location, cost, time, rewards: { epic, rare, uncommon, common, poor } }) => (
            <tr>
              <td>{renderLocation(location, "right")}</td>
              <td>{renderNumber(cost)}</td>
              <td>{renderTime(time)}</td>
              <td>{epic != 0 ? <span class="epic">{epic}%</span> : "-"}</td>
              <td>{rare != 0 ? <span class="rare">{rare}%</span> : "-"}</td>
              <td>{uncommon != 0 ? <span class="uncommon">{uncommon}%</span> : "-"}</td>
              <td>{common != 0 ? <span class="common">{common}%</span> : "-"}</td>
              <td>{poor != 0 ? <span class="poor">{poor}%</span> : "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{renderNumber(digSites.reduce((acc, d) => acc + d.cost, 0))}</td>
            <td>{renderTime(digSites.reduce((acc, d) => acc + d.time, 0))}</td>
            <td colspan="5">{totalRewards.toFixed(2)} Commons</td>
          </tr>
        </tfoot>
      </table>
    </figure>
  );
}

function renderRecipes(recipes: Map<string, [Ingredients, Location]>, markets: Market[]) {
  if (recipes.size == 0) {
    return undefined;
  }

  return (
    <table role="grid">
      <thead>
        <tr>
          <th scope="col">Recipe</th>
          <th scope="col">Ingredients</th>
          <th scope="col">Location</th>
        </tr>
      </thead>
      <tbody>
        {[...recipes.entries()].map(([name, [ingredients, location]]) => (
          <tr id={toAnchorName(name)}>
            <td>{name}</td>
            <td>
              {[...ingredients.entries()].map(([res, n]) => {
                const market = markets.find((m) => m.resources.includes(res));
                if (market) {
                  return (
                    <a href={`#${toAnchorName(market.name)}`} class="resource available">
                      {renderNumber(n)} {res}
                    </a>
                  );
                } else if (recipes.has(res)) {
                  return (
                    <a href={`#${toAnchorName(res)}`} class="resource">
                      {renderNumber(n)} {res}
                    </a>
                  );
                } else {
                  return <span class="resource">{renderNumber(n)} {res}</span>;
                }
              })}
            </td>
            <td>{renderLocation(location, "left")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderPage(title: string, header: JSX.Element, content: JSX.Element) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@1.5.6/css/pico.classless.min.css" />
        <link rel="stylesheet" href="./styles.css" />
        <script defer="" src="index.min.js"></script>
      </head>
      <body>
        <nav style="padding: 1em 2em 0 2em;">
          {header}
        </nav>
        <main>
          {content}
        </main>
        <footer style="display: flex; justify-content: space-between;">
          <small>
            Made by <u data-tooltip="PkmX#6818">PkmX</u> · Level data by <u data-tooltip="FiveSmith#2635">FiveSmith</u>
            {" "}
            · Map screenshots by <u data-tooltip="Maak#3906">Muli</u> and forum{" "}
            <a href="https://www.warzone.com/Forum/677028-superfog-screenshots">thread</a>
          </small>
          <small>
            <a href="https://github.com/PkmX/wzi-levels">GitHub</a>
          </small>
        </footer>
      </body>
    </html>
  );
}

function renderLevelHtml(id: number, level: Level) {
  const header = (
    <Fragment>
      <ul>
        <li>
          <a class={"title" + (level.name.length > 15 ? " smaller" : "")} href="./index.html">{level.name}</a>
        </li>
      </ul>
      <ul>
        <li>
          {renderLevelSelect(id)}
        </li>
      </ul>
    </Fragment>
  );

  const content = (
    <Fragment>
      <section class="cards">
        <div class="card">
          <div class="heading">{renderNumber(level.totalArmiesRequired)}</div>
          <div class="subheading">Armies Required</div>
        </div>
        <div class="card">
          <div class="heading">{level.totalTerritories}</div>
          <div class="subheading">Territories</div>
        </div>
        <div class="card">
          <div class="heading">{level.ap}</div>
          <div class="subheading">Base AP</div>
        </div>
        <a href="#largest-army-caches" class="card">
          <div class="heading">{renderNumber(level.totalBaseArmyCaches)}</div>
          <small>({(level.totalBaseArmyCaches / level.totalArmiesRequired * 100).toFixed(2)}%)</small>
          <div class="subheading">Base Armies from Caches</div>
        </a>
        <a href="#mercenary-camps" class="card">
          <div class="heading">{renderNumber(level.totalBaseMercenaries)}</div>
          <small>({(level.totalBaseMercenaries / level.totalArmiesRequired * 100).toFixed(2)}%)</small>
          <div class="subheading">Base Mercenaries</div>
        </a>
        <a href="#hospitals" class="card">
          <div class="heading">{renderNumber(level.totalHospitalSaves)}</div>
          <small>(Cost: ${renderNumber(level.totalHospitalUpgradeCost)})</small>
          <div class="subheading">Max Saves per Hospital</div>
        </a>
        <a href="#largest-money-caches" class="card">
          <div class="heading">{renderNumber(level.totalBaseMoneyCaches)}</div>
          <div class="subheading">Base Money from Caches</div>
        </a>
        <div class="card">
          <div class="heading">{renderNumber(level.totalBaseMoneyGeneration)}</div>
          <div class="subheading">Base Money Generation</div>
        </div>
        <a href="#dig-sites" class="card">
          <div class="heading">{renderNumber(level.digSites.length)}</div>
          <div class="subheading">{level.digSites.length > 1 ? "Dig Sites" : "Dig Site"}</div>
        </a>
        <a href="#markets" class="card">
          <div class="heading">{renderNumber(level.markets.length)}</div>
          <div class="subheading">{level.markets.length > 1 ? "Markets" : "Market"}</div>
        </a>
        <a href="#tech-recipes" class="card">
          <div class="heading">{renderNumber(level.techRecipes.size)}</div>
          <div class="subheading">Tech Recipes</div>
        </a>
        <div class="card">
          <div class="heading">
            {level.map ? <a href={level.map} target="_blank">Map</a> : "No Map :("}
          </div>
        </div>
      </section>
      <section>
        <h2>Powers</h2>
        {renderPowers(level.powers)}
      </section>
      <section>
        <h2>Largest Territories</h2>
        <div class="cache-tables">
          {renderLargestTerritories(level.largestTerritories)}
          {renderLargestCaches(level.largestArmyCaches, "largest-army-caches", "Largest Army Caches")}
          {renderLargestCaches(level.largestMoneyCaches, "largest-money-caches", "Largest Money Caches")}
        </div>
      </section>
      <section id="hospitals">
        <h2>Hospitals ({level.hospitals.length})</h2>
        {renderHospitals(level.hospitals)}
      </section>
      <section id="markets">
        <h2>Markets ({level.markets.length})</h2>
        {renderMarkets(level.markets)}
      </section>
      <section id="tech-recipes">
        <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: baseline;">
          <h2>Tech Recipes</h2>
          <div>
            <input id="ms-checkbox" type="checkbox" role="switch">
            </input>
            <abbr data-tooltip="Only show techs relevant to the market strategy" data-placement="left">MS Only</abbr>
          </div>
        </div>
        {renderTechRecipes(level.techRecipes, level.markets)}
      </section>
      <section id="mercenary-camps">
        <h2>Mercenary Camps ({level.mercenaryCamps.length})</h2>
        {renderMercenaryCamps(level.mercenaryCamps, level.totalBaseMercenaries, level.totalBaseMercenariesCosts)}
      </section>
      <section id="dig-sites">
        <h2>Dig Sites ({level.digSites.length})</h2>
        {renderDigSites(level.digSites)}
      </section>
      <section id="recipes">
        <h2>Recipes</h2>
        {renderRecipes(level.recipes, level.markets)}
      </section>
    </Fragment>
  );

  return renderPage(`${level.name}: Warzone Idle Level Stats`, header, content);
}

function renderIndexHtml() {
  const header = (
    <Fragment>
      <ul>
        <li>
          <h1 style="margin-bottom: 0;">Warzone Idle Level Data</h1>
        </li>
      </ul>
    </Fragment>
  );

  const content = (
    <Fragment>
      <table role="grid">
        <thead>
          <tr>
            <td>Level</td>
            <td>Base AP</td>
            <td>Total Armies</td>
            <td colspan="2">Total Mercenaries</td>
            <td colspan="2">Total Army Caches</td>
            <td>Hospitals</td>
            <td>Markets</td>
            <td>Dig Sites</td>
          </tr>
        </thead>
        <tbody>
          {[...levels.values()].map((level) => (
            <tr>
              <td>
                <a href={`./${toPageName(level.name)}.html`}>{level.name}</a>
              </td>
              <td>{level.ap}</td>
              <td>{renderNumber(level.totalArmiesRequired)}</td>
              <td>{renderNumber(level.totalBaseMercenaries)}</td>
              <td>
                <small>{(level.totalBaseMercenaries / level.totalArmiesRequired * 100).toFixed(2)}%</small>
              </td>
              <td>{renderNumber(level.totalBaseArmyCaches)}</td>
              <td>
                <small>{(level.totalBaseArmyCaches / level.totalArmiesRequired * 100).toFixed(2)}%</small>
              </td>
              <td>{level.hospitals.length}</td>
              <td>{level.markets.length}</td>
              <td>{level.digSites.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Fragment>
  );

  return renderPage("Warzone Idle Level Stats", header, content);
}

Deno.mkdirSync("./dist", { recursive: true });

async function writeToFile(path: string, content: string) {
  const file = await Deno.open(path, { create: true, write: true, truncate: true });
  const bytes = new TextEncoder().encode(content);
  await writeAll(file, bytes);
}

for (const [id, level] of levels.entries()) {
  await writeToFile(
    `./dist/${toPageName(level.name)}.html`,
    "<!doctype html>" + await renderToString(renderLevelHtml(id, level)),
  );
}

await writeToFile(`./dist/index.html`, `<!doctype html>` + await renderToString(renderIndexHtml()));
