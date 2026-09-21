import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const product="2026-topps-chrome-premier-league";
const check=process.argv.includes("--check");
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";

const paths={
  base:"data/checklists/"+product+"-base.json",
  inserts:"data/checklists/"+product+"-hobby-inserts.json",
  mainAutos:"data/checklists/"+product+"-chrome-autographs.json",
  specialAutos:"data/checklists/"+product+"-hobby-special-autographs.json",
  baseOdds:"data/odds/"+product+"-hobby-base.json",
  insertMap:"data/mappings/"+product+"-hobby-insert-odds-map.json",
  autoMap:"data/mappings/"+product+"-hobby-autograph-odds-map.json",
  teamEv:"data/derived/"+product+"-team-ev-progress.json",
  provenance:"data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json",
  inventory:"data/derived/"+product+"-hobby-ev-eligible-inventory-v1.json",
  scope:"data/derived/"+product+"-hobby-team-ev-scope-v2.json"
};

const base=readJson(paths.base);
const inserts=readJson(paths.inserts);
const mainAutos=readJson(paths.mainAutos);
const specialAutos=readJson(paths.specialAutos);
const baseOdds=readJson(paths.baseOdds);
const insertMap=readJson(paths.insertMap);
const autoMap=readJson(paths.autoMap);
const teamEv=readJson(paths.teamEv);
const provenance=readJson(paths.provenance);

const canonicalVariant=value=>{
  const name=String(value||"").trim();
  if(name==="Frozenfractors") return "Frozenfractor";
  if(/^(Aqua|Blue|Green|Purple|Gold|Orange|Black|Red) Wave$/.test(name)){
    return name+" Refractor";
  }
  return name;
};

const subjectsFor=card=>{
  if(Array.isArray(card?.subjects)) return card.subjects.filter(Boolean);
  return [card?.subject||card?.player].filter(Boolean);
};

const teamsFor=card=>{
  if(typeof card?.team==="string" && card.team) return [card.team];
  if(Array.isArray(card?.teams)) return card.teams.filter(Boolean);
  return [];
};

const cards=[];
const excluded=[];

function addEligible({category,set,card,variants,team,source}){
  const canonicalVariants=variants.map(row=>canonicalVariant(row.variant??row.name));
  cards.push({
    category,
    set,
    card_number:String(card.card_number),
    team,
    subjects:subjectsFor(card),
    source,
    source_variants:variants.map(row=>String(row.variant??row.name)),
    canonical_variants:canonicalVariants,
    eligible_contribution_count:canonicalVariants.length
  });
}

function addExcluded({category,set,card,variants,reason,source}){
  excluded.push({
    category,
    set,
    card_number:String(card.card_number),
    teams:teamsFor(card),
    subjects:subjectsFor(card),
    reason,
    source,
    potential_contribution_count:variants.length,
    canonical_variants:variants.map(row=>canonicalVariant(row.variant??row.name))
  });
}

for(const card of base.cards||[]){
  const number=Number(card.card_number);
  const variants=number===201
    ? (baseOdds.hobby_exclusive_card_201||[])
        .filter(row=>String(row.name)!=="Base")
    : (baseOdds.base_cards||[]);
  addEligible({
    category:"base_parallels",
    set:"Base Cards",
    card,
    variants,
    team:card.team,
    source:number===201?"hobby-exclusive-card-201-odds":"base-card-odds"
  });
}

const insertSections=new Map((inserts.sections||[]).map(section=>[section.name,section]));
for(const mapping of insertMap.mappings||[]){
  const sections=mapping.checklist_sections||[mapping.checklist_section];
  for(const sectionName of sections){
    const section=insertSections.get(sectionName);
    if(!section) throw new Error("Insert mapping references missing section: "+sectionName);
    for(const card of section.cards||[]){
      const teams=teamsFor(card);
      if(teams.length!==1){
        addExcluded({
          category:"inserts",
          set:sectionName,
          card,
          variants:mapping.odds_rows||[],
          reason:teams.length>1?"multi-team":"team-unresolved",
          source:"insert-odds-map"
        });
        continue;
      }
      addEligible({
        category:"inserts",
        set:sectionName,
        card,
        variants:mapping.odds_rows||[],
        team:teams[0],
        source:"insert-odds-map"
      });
    }
  }
}

const mainAutoMapping=(autoMap.mappings||[])
  .find(row=>row.checklist_section==="Chrome Autograph Cards");
if(!mainAutoMapping) throw new Error("Chrome Autograph Cards mapping missing");

for(const card of mainAutos.cards||[]){
  addEligible({
    category:"autographs",
    set:"Chrome Autograph Cards",
    card,
    variants:mainAutoMapping.odds_rows||[],
    team:card.team,
    source:"autograph-odds-map"
  });
}

const specialSections=new Map(
  (specialAutos.sections||[]).map(section=>[section.name,section])
);
for(const mapping of (autoMap.mappings||[]).filter(row=>row!==mainAutoMapping)){
  const sections=mapping.checklist_sections||[mapping.checklist_section];
  for(const sectionName of sections){
    const section=specialSections.get(sectionName);
    if(!section) throw new Error("Autograph mapping references missing section: "+sectionName);
    for(const card of section.cards||[]){
      const teams=teamsFor(card);
      if(teams.length!==1){
        addExcluded({
          category:"autographs",
          set:sectionName,
          card,
          variants:mapping.odds_rows||[],
          reason:teams.length>1?"multi-team":"team-unresolved",
          source:"autograph-odds-map"
        });
        continue;
      }
      addEligible({
        category:"autographs",
        set:sectionName,
        card,
        variants:mapping.odds_rows||[],
        team:teams[0],
        source:"autograph-odds-map"
      });
    }
  }
}

cards.sort((a,b)=>
  a.team.localeCompare(b.team) ||
  a.category.localeCompare(b.category) ||
  a.set.localeCompare(b.set) ||
  a.card_number.localeCompare(b.card_number)
);
excluded.sort((a,b)=>
  a.category.localeCompare(b.category) ||
  a.set.localeCompare(b.set) ||
  a.card_number.localeCompare(b.card_number)
);

const canonicalTeams=[...new Set((base.cards||[]).map(card=>card.team))].sort();
const categories=["base_parallels","inserts","autographs"];
const byTeam={};
for(const team of canonicalTeams){
  byTeam[team]={};
  for(const category of categories){
    const rows=cards.filter(row=>row.team===team && row.category===category);
    byTeam[team][category]={
      eligible_card_count:rows.length,
      eligible_contribution_count:rows.reduce(
        (sum,row)=>sum+Number(row.eligible_contribution_count||0),
        0
      )
    };
  }
}

const categoryCounts=Object.fromEntries(categories.map(category=>[
  category,
  cards
    .filter(row=>row.category===category)
    .reduce((sum,row)=>sum+Number(row.eligible_contribution_count||0),0)
]));

const inventory={
  schema_version:1,
  product_id:product,
  format_id:"hobby",
  analysis_unit:"12-box case",
  generated_at:"2026-09-21",
  model:"ev-eligible-inventory-v1",
  denominator_unit:"card × modeled odds variant contribution slot",
  definition:"Every single-team checklist card with an explicitly mapped Hobby odds row contributes one EV-eligible slot per modeled variant. Base Cards excludes the ordinary non-parallel Base card. Multi-team and team-unresolved cards are excluded under the active break-allocation policy.",
  source_files:{
    base_checklist:paths.base,
    insert_checklist:paths.inserts,
    main_autograph_checklist:paths.mainAutos,
    special_autograph_checklist:paths.specialAutos,
    base_odds:paths.baseOdds,
    insert_odds_mapping:paths.insertMap,
    autograph_odds_mapping:paths.autoMap
  },
  rules:[
    "A slot is an eligible card/variant contribution, not an EV-weighted share.",
    "Coverage percentage counts valued slots divided by enumerated eligible slots.",
    "Coverage percentage does not estimate what percentage of economic EV has been captured.",
    "Only variants with stored published Hobby odds are eligible.",
    "Base Cards includes parallels only; ordinary Base is excluded from the base_parallels category.",
    "Multi-team cards are excluded until an explicit break-allocation rule exists.",
    "Cards with no explicit team remain excluded; no team is inferred."
  ],
  summary:{
    team_count:canonicalTeams.length,
    eligible_card_count:cards.length,
    eligible_contribution_count:cards.reduce(
      (sum,row)=>sum+Number(row.eligible_contribution_count||0),
      0
    ),
    category_eligible_contribution_count:categoryCounts,
    excluded_card_count:excluded.length,
    excluded_potential_contribution_count:excluded.reduce(
      (sum,row)=>sum+Number(row.potential_contribution_count||0),
      0
    )
  },
  teams:byTeam,
  cards,
  excluded
};

const insertSectionNames=new Set(
  (insertMap.mappings||[]).flatMap(mapping=>
    mapping.checklist_sections||[mapping.checklist_section]
  )
);
const categoryForContribution=entry=>{
  if(entry.set==="Base Cards") return "base_parallels";
  if(insertSectionNames.has(entry.set)) return "inserts";
  return "autographs";
};

const valuedByTeam={};
for(const entry of provenance.entries||[]){
  const category=categoryForContribution(entry);
  valuedByTeam[entry.team]??={base_parallels:0,inserts:0,autographs:0};
  valuedByTeam[entry.team][category]++;
}

const round4=value=>Math.round(Number(value)*10000)/10000;
const scopeTeams={};
for(const team of canonicalTeams){
  const teamCategories={};
  let eligibleTotal=0;
  let valuedTotal=0;

  for(const category of categories){
    const denominator=Number(byTeam[team][category].eligible_contribution_count||0);
    const valued=Number(valuedByTeam[team]?.[category]||0);
    if(valued>denominator){
      throw new Error(
        "Valued contributions exceed eligible denominator: "+
        team+" / "+category+" / "+valued+" > "+denominator
      );
    }
    const status=
      denominator===0 ? "not-applicable" :
      valued===0 ? "not-started" :
      valued===denominator ? "complete" :
      "partial";
    const percentage=denominator>0 ? round4(valued/denominator*100) : null;
    teamCategories[category]={
      status,
      eligible_card_count:Number(byTeam[team][category].eligible_card_count||0),
      eligible_contribution_count:denominator,
      valued_contribution_count:valued,
      remaining_contribution_count:Math.max(0,denominator-valued),
      coverage_percent:percentage
    };
    eligibleTotal+=denominator;
    valuedTotal+=valued;
  }

  const coverageComplete=categories.every(category=>
    ["complete","not-applicable"].includes(teamCategories[category].status)
  );
  const evRow=teamEv.teams?.[team]||null;
  const committedValued=Number(evRow?.valued_card_count||0);
  if(committedValued!==valuedTotal){
    throw new Error(
      "Team EV valued count mismatch: "+team+
      " / scope "+valuedTotal+" / team EV "+committedValued
    );
  }
  if(Boolean(evRow?.coverage_complete)!==coverageComplete){
    if(evRow?.coverage_complete===true || coverageComplete===true){
      throw new Error("Team EV coverage_complete mismatch: "+team);
    }
  }

  scopeTeams[team]={
    coverage_complete:coverageComplete,
    denominator_status:"enumerated",
    eligible_contribution_count:eligibleTotal,
    valued_contribution_count:valuedTotal,
    remaining_contribution_count:Math.max(0,eligibleTotal-valuedTotal),
    coverage_percent:eligibleTotal>0
      ? round4(valuedTotal/eligibleTotal*100)
      : null,
    categories:teamCategories
  };
}

const scope={
  schema_version:2,
  product_id:product,
  format_id:"hobby",
  analysis_unit:"12-box case",
  generated_at:"2026-09-21",
  model:"team-ev-scope-v2",
  denominator_source:paths.inventory,
  denominator_unit:"card × modeled odds variant contribution slot",
  percentage_semantics:"Count-based slot coverage only; not EV-weighted economic completeness.",
  scope_definition:"All single-team Hobby EV-eligible base parallels, inserts and autographs with modeled published odds. Multi-team and team-unresolved cards remain excluded.",
  required_categories:categories,
  rules:[
    "Category status describes valuation progress, not probability coverage.",
    "eligible_contribution_count is enumerated from checklist cards × mapped published Hobby odds variants.",
    "valued_contribution_count must reconcile to committed EV contribution rows.",
    "coverage_percent = valued_contribution_count / eligible_contribution_count × 100.",
    "coverage_percent is count-based and must not be interpreted as percentage of total economic EV captured.",
    "A zero-denominator category is not-applicable.",
    "Team coverage_complete can be true only when every required category is complete or not-applicable.",
    "Multi-team cards remain excluded under the active break-allocation policy."
  ],
  summary:{
    team_count:canonicalTeams.length,
    eligible_contribution_count:inventory.summary.eligible_contribution_count,
    valued_contribution_count:(provenance.entries||[]).length,
    teams_with_progress:canonicalTeams.filter(
      team=>scopeTeams[team].valued_contribution_count>0
    ).length,
    complete_team_count:canonicalTeams.filter(
      team=>scopeTeams[team].coverage_complete
    ).length
  },
  teams:scopeTeams
};

function writeOrCheck(target,value){
  const full=path.join(root,target);
  const content=stable(value);
  if(check){
    if(!fs.existsSync(full) || fs.readFileSync(full,"utf8")!==content){
      throw new Error("Generated file is stale: "+target);
    }
  }else{
    fs.writeFileSync(full,content);
  }
}

writeOrCheck(paths.inventory,inventory);
writeOrCheck(paths.scope,scope);

console.log(JSON.stringify({
  result:check?"pass":"written",
  eligible_card_count:inventory.summary.eligible_card_count,
  eligible_contribution_count:inventory.summary.eligible_contribution_count,
  category_eligible_contribution_count:categoryCounts,
  excluded_card_count:inventory.summary.excluded_card_count,
  excluded_potential_contribution_count:
    inventory.summary.excluded_potential_contribution_count,
  chelsea:scope.teams.Chelsea
},null,2));
