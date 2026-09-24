function canonicalVariant(value){
  const name=String(value||"").trim();
  if(name==="Frozenfractors") return "Frozenfractor";
  if(/^(Aqua|Blue|Green|Purple|Gold|Orange|Black|Red) Wave$/.test(name)){
    return name+" Refractor";
  }
  return name;
}

export function buildUnvaluedCollectionTasks({
  product,
  inventory,
  provenance,
  baseOdds,
  insertMap,
  autoMap,
  inserts,
  mainAutos,
  specialAutos,
  format,
  formatId="hobby"
}){
  const hobby=(format.formats||[]).find(row=>row.id===formatId);
  if(!hobby||hobby.status!=="ready") throw new Error("Ready Hobby format missing");
  const packsPerCase=Number(hobby.analysis_unit?.packs);
  const boxesPerCase=Number(hobby.analysis_unit?.boxes);
  if(!(packsPerCase>0)||!(boxesPerCase>0)) throw new Error("Hobby case dimensions missing");

  const insertSetNames=new Set(
    (insertMap.mappings||[])
      .flatMap(mapping=>mapping.checklist_sections||[mapping.checklist_section])
      .filter(Boolean)
  );
  const categoryFor=entry=>
    entry.set==="Base Cards"
      ?"base_parallels"
      :insertSetNames.has(entry.set)
        ?"inserts"
        :"autographs";
  const key=({category,team,set,card_number,parallel})=>
    [category,team,set,String(card_number),parallel].join("|");

  const valued=new Set();
  for(const entry of provenance.entries||[]){
    const category=categoryFor(entry);
    const matches=(inventory.cards||[]).filter(card=>
      card.team===entry.team &&
      card.category===category &&
      card.set===entry.set &&
      card.canonical_variants?.includes(entry.parallel) &&
      (!entry.player||card.subjects?.includes(entry.player))
    );
    if(matches.length!==1){
      throw new Error("Cannot resolve provenance contribution "+entry.card_id+" -> "+matches.length);
    }
    valued.add(key({
      category,
      team:entry.team,
      set:entry.set,
      card_number:matches[0].card_number,
      parallel:entry.parallel
    }));
  }

  const mappingForSet=(mappings,set)=>
    (mappings||[]).find(mapping=>
      mapping.checklist_section===set ||
      (mapping.checklist_sections||[]).includes(set)
    )||null;

  const poolSize=mapping=>{
    if(Number(mapping?.pooled_checklist_size)>0) return Number(mapping.pooled_checklist_size);
    if(Number(mapping?.checklist_size)>0) return Number(mapping.checklist_size);
    const names=mapping?.checklist_sections||[mapping?.checklist_section];
    let count=0;
    for(const name of names.filter(Boolean)){
      if(name==="Chrome Autograph Cards"){
        count+=(mainAutos.cards||[]).length;
        continue;
      }
      const special=(specialAutos.sections||[]).find(section=>section.name===name);
      if(special){
        count+=(special.cards||[]).length;
        continue;
      }
      const insert=(inserts.sections||[]).find(section=>section.name===name);
      if(insert) count+=(insert.cards||[]).length;
    }
    return count;
  };

  const expectedFromOddsRow=(row,pool)=>{
    if(!(pool>0)) throw new Error("Invalid odds pool size");
    const type=row.type||row.odds_type||"pack_odds";
    let totalExpected=0;
    if(type==="per_box"){
      const quantity=Number(row.value??row.quantity??0);
      if(!(quantity>0)) throw new Error("Invalid per-box odds row");
      totalExpected=boxesPerCase*quantity;
    }else{
      const denominator=Number(row.denominator||0);
      if(!(denominator>0)) throw new Error("Invalid pack-odds row");
      totalExpected=packsPerCase/denominator;
    }
    return totalExpected/pool;
  };

  const round=value=>Math.round(Number(value)*1e8)/1e8;

  const slotOdds=(card,parallel)=>{
    if(card.category==="base_parallels"){
      const cardNumber=Number(card.card_number);
      const rows=cardNumber===201
        ?(baseOdds.hobby_exclusive_card_201||[])
        :(baseOdds.base_cards||[]);
      const row=rows.find(item=>canonicalVariant(item.name)===parallel);
      if(!row) throw new Error("Base odds row missing: "+card.card_number+" / "+parallel);
      const pool=cardNumber===201?1:200;
      return {
        expected_copies_per_case:round(expectedFromOddsRow(row,pool)),
        odds_pool_size:pool,
        odds_basis:row.odds_type==="per_box"
          ?String(row.quantity)+" per box"
          :"1:"+String(row.denominator)+" per pack"
      };
    }
    const mappings=card.category==="inserts"?insertMap.mappings:autoMap.mappings;
    const mapping=mappingForSet(mappings,card.set);
    if(!mapping) throw new Error("Odds mapping missing: "+card.set);
    const row=(mapping.odds_rows||[]).find(item=>canonicalVariant(item.variant)===parallel);
    if(!row) throw new Error("Mapped odds row missing: "+card.set+" / "+parallel);
    const pool=poolSize(mapping);
    return {
      expected_copies_per_case:round(expectedFromOddsRow(row,pool)),
      odds_pool_size:pool,
      odds_basis:(row.type||"pack_odds")==="per_box"
        ?String(row.value)+" per box"
        :"1:"+String(row.denominator)+" per pack"
    };
  };

  const tasks=[];
  for(const card of inventory.cards||[]){
    for(const parallel of card.canonical_variants||[]){
      const slotKey=key({
        category:card.category,
        team:card.team,
        set:card.set,
        card_number:card.card_number,
        parallel
      });
      if(valued.has(slotKey)) continue;
      const odds=slotOdds(card,parallel);
      tasks.push({
        task_id:[
          product,
          formatId,
          card.team,
          card.category,
          card.set,
          String(card.card_number),
          parallel
        ].join("::"),
        team:card.team,
        category:card.category,
        set:card.set,
        card_number:String(card.card_number),
        subjects:[...(card.subjects||[])],
        parallel,
        expected_copies_per_case:odds.expected_copies_per_case,
        odds_basis:odds.odds_basis,
        odds_pool_size:odds.odds_pool_size,
        collection_priority_score:odds.expected_copies_per_case,
        status:"unvalued"
      });
    }
  }

  tasks.sort((a,b)=>
    b.collection_priority_score-a.collection_priority_score ||
    a.team.localeCompare(b.team) ||
    a.category.localeCompare(b.category) ||
    a.set.localeCompare(b.set) ||
    a.card_number.localeCompare(b.card_number,undefined,{numeric:true}) ||
    a.parallel.localeCompare(b.parallel)
  );
  tasks.forEach((task,index)=>task.rank=index+1);

  return {
    eligible_slot_count:Number(inventory.summary?.eligible_contribution_count||0),
    valued_slot_count:valued.size,
    unvalued_slot_count:tasks.length,
    tasks
  };
}
