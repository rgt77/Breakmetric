import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));

const sandbox={
  console,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Math,
  JSON,
  Map,
  Set
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root,"src/playerDerivation.js"),"utf8"),
  sandbox,
  {filename:"src/playerDerivation.js"}
);

const api=sandbox.BreakMetricPlayerDerivation;
if(!api) throw new Error("player derivation API unavailable");

const manifest=readJson(
  "data/derived/2026-topps-chrome-premier-league-hobby-player-derivation-manifest-v1.json"
);
const inputs=manifest.inputs||{};
const outputs=manifest.outputs||{};

for(const [name,file] of Object.entries({...inputs,...outputs})){
  if(typeof file!=="string" || !file){
    throw new Error("player derivation manifest path missing: "+name);
  }
  if(!fs.existsSync(path.join(root,file))){
    throw new Error("player derivation manifest file missing: "+name+" -> "+file);
  }
}

const base=readJson(inputs.base_checklist);
const mainAutos=readJson(inputs.main_autograph_checklist);
const inserts=readJson(inputs.hobby_insert_checklist);
const specialAutos=readJson(inputs.hobby_special_autograph_checklist);
const odds=readJson(inputs.official_hobby_odds);
const insertMap=readJson(inputs.insert_odds_mapping);
const autographMap=readJson(inputs.autograph_odds_mapping);

const storedIndex=readJson(outputs.player_index);
const storedProbabilities=readJson(outputs.player_probabilities);

const generatedIndex=api.buildPlayerIndex({
  productId:manifest.product_id,
  base,
  mainAutos,
  inserts,
  specialAutos
});
const indexComparison=api.comparePlayerIndex(generatedIndex,storedIndex);

const constants=manifest.constants||{};
const generatedProbabilities=api.buildPlayerProbabilities({
  productId:manifest.product_id,
  playerIndex:generatedIndex,
  odds,
  insertMap,
  autographMap,
  inserts,
  specialAutos,
  mainAutos,
  packsPerCase:Number(constants.packs_per_case),
  boxesPerCase:Number(constants.boxes_per_case)
});
const probabilityComparison=api.comparePlayerProbabilities(
  generatedProbabilities,
  storedProbabilities,
  0.000001
);

const failures=[
  ...indexComparison.errors.map(error=>"player index: "+error),
  ...probabilityComparison.errors.map(error=>"player probabilities: "+error)
];

const generatedPlayerCount=Object.values(generatedIndex.teams||{})
  .reduce((sum,rows)=>sum+(rows||[]).length,0);
const storedPlayerCount=Object.values(storedIndex.teams||{})
  .reduce((sum,rows)=>sum+(rows||[]).length,0);

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  product_id:manifest.product_id,
  format_id:manifest.format_id,
  generator:manifest.generator,
  generated_team_count:Object.keys(generatedIndex.teams||{}).length,
  generated_player_team_pairs:generatedPlayerCount,
  stored_player_team_pairs:storedPlayerCount,
  index_error_count:indexComparison.errors.length,
  probability_error_count:probabilityComparison.errors.length,
  failed_count:failures.length,
  failures
},null,2));

if(failures.length) process.exit(1);
