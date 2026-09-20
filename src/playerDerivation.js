// BreakMetric player derivation engine v1.
// Rebuilds the Hobby player index and player-category probabilities from
// normalized checklist inputs + explicit Topps odds mappings.

(function(root){
  "use strict";

  const api={};

  function round(value, digits){
    const factor=Math.pow(10,digits);
    return Math.round((Number(value)+Number.EPSILON)*factor)/factor;
  }

  function unique(values){
    return [...new Set(values)];
  }

  function entryKey(entry={}){
    return [
      entry.category||"",
      entry.section||"",
      String(entry.card_number??"")
    ].join("|||");
  }

  function addPlayer(index,{team,player,entry,baseCardNumber=null,designation=null}){
    if(!team || !player) return;
    const key=team+"|||"+player;

    if(!index[key]){
      index[key]={
        team,
        player,
        base_card_number:null,
        designation:null,
        checklist_entries:[]
      };
    }

    if(baseCardNumber!==null && baseCardNumber!==undefined){
      index[key].base_card_number=baseCardNumber;
    }
    if(designation) index[key].designation=designation;
    index[key].checklist_entries.push(entry);
  }

  function finalizePlayer(player){
    const entries=player.checklist_entries;
    const countCategory=category=>
      entries.filter(x=>x.category===category).length;

    return {
      ...player,
      checklist_sections:unique(entries.map(x=>x.section).filter(Boolean)),
      base_entries:countCategory("base"),
      insert_entries:countCategory("insert"),
      autograph_entries:countCategory("autograph"),
      special_autograph_entries:countCategory("special_autograph"),
      multi_subject_entries:entries.filter(x=>x.multi_subject===true).length,
      total_checklist_entries:entries.length
    };
  }

  api.buildPlayerIndex=function({
    productId,
    base,
    mainAutos,
    inserts,
    specialAutos
  }={}){
    const index={};

    for(const card of base?.cards||[]){
      addPlayer(index,{
        team:card.team,
        player:card.player,
        baseCardNumber:card.card_number,
        designation:card.designation||null,
        entry:{
          category:"base",
          section:"Base Cards",
          card_number:String(card.card_number),
          multi_subject:false
        }
      });
    }

    for(const card of mainAutos?.cards||[]){
      addPlayer(index,{
        team:card.team,
        player:card.player,
        entry:{
          category:"autograph",
          section:"Chrome Autographs",
          card_number:String(card.card_number),
          multi_subject:false
        }
      });
    }

    for(const section of inserts?.sections||[]){
      for(const card of section.cards||[]){
        if(!card.team || !card.subject) continue;
        addPlayer(index,{
          team:card.team,
          player:card.subject,
          entry:{
            category:"insert",
            section:section.name,
            card_number:String(card.card_number),
            multi_subject:false
          }
        });
      }
    }

    for(const section of specialAutos?.sections||[]){
      for(const card of section.cards||[]){
        const subjects=Array.isArray(card.subjects) ? card.subjects : [];
        const teams=Array.isArray(card.teams) ? card.teams : [];
        if(!subjects.length || !teams.length) continue;

        if(teams.length===1){
          for(const subject of subjects){
            addPlayer(index,{
              team:teams[0],
              player:subject,
              entry:{
                category:"special_autograph",
                section:section.name,
                card_number:String(card.card_number),
                multi_subject:subjects.length>1
              }
            });
          }
          continue;
        }

        if(teams.length===subjects.length){
          for(let i=0;i<subjects.length;i++){
            addPlayer(index,{
              team:teams[i],
              player:subjects[i],
              entry:{
                category:"special_autograph",
                section:section.name,
                card_number:String(card.card_number),
                multi_subject:subjects.length>1
              }
            });
          }
        }
      }
    }

    const teams={};
    let totalEntries=0;
    let withoutBase=0;

    for(const player of Object.values(index)){
      const finalized=finalizePlayer(player);
      if(!teams[finalized.team]) teams[finalized.team]=[];
      teams[finalized.team].push(finalized);
      totalEntries+=finalized.total_checklist_entries;
      if(finalized.base_card_number===null) withoutBase++;
    }

    return {
      product_id:productId,
      format:"Hobby",
      generated_from:[
        "data/checklists/2026-topps-chrome-premier-league-base.json",
        "data/checklists/2026-topps-chrome-premier-league-chrome-autographs.json",
        "data/checklists/2026-topps-chrome-premier-league-hobby-inserts.json",
        "data/checklists/2026-topps-chrome-premier-league-hobby-special-autographs.json"
      ],
      rules:[
        "No team is inferred when a checklist entry has no team assignment.",
        "Single-team multi-subject cards are attached to each named subject on that team.",
        "Multi-team entries are only mapped subject-by-subject when the source provides parallel subject/team arrays.",
        "Player search uses all mapped Hobby-relevant checklist appearances, not only base cards."
      ],
      summary:{
        mapped_player_team_pairs:Object.keys(index).length,
        mapped_teams:Object.keys(teams).length,
        total_mapped_checklist_entries:totalEntries,
        players_without_base_card:withoutBase
      },
      teams
    };
  };

  function mappingForSection(mappings=[],section,alias={}){
    const normalized=alias[section]||section;
    return mappings.find(map=>
      map.checklist_section===normalized ||
      (Array.isArray(map.checklist_sections) &&
       map.checklist_sections.includes(normalized))
    )||null;
  }

  function mappingPoolSize(mapping,{inserts,specialAutos,mainAutos}={}){
    if(Number(mapping?.pooled_checklist_size)>0){
      return Number(mapping.pooled_checklist_size);
    }
    if(Number(mapping?.checklist_size)>0){
      return Number(mapping.checklist_size);
    }

    const names=Array.isArray(mapping?.checklist_sections)
      ? mapping.checklist_sections
      : [mapping?.checklist_section];

    let size=0;
    for(const name of names.filter(Boolean)){
      if(name==="Chrome Autograph Cards"){
        size+=(mainAutos?.cards||[]).length;
        continue;
      }
      const special=(specialAutos?.sections||[])
        .find(section=>section.name===name);
      if(special){
        size+=(special.cards||[]).length;
        continue;
      }
      const insert=(inserts?.sections||[])
        .find(section=>section.name===name);
      if(insert){
        size+=(insert.cards||[]).length;
      }
    }
    return size;
  }

  function oddsContribution({
    rows=[],
    checklistShare=0,
    packsPerCase=240,
    boxesPerCase=12
  }={}){
    let expected=0;
    let noHit=1;

    for(const row of rows){
      if(row.type==="per_box"){
        const draws=boxesPerCase*Number(row.value||0);
        expected+=draws*checklistShare;
        noHit*=Math.pow(1-checklistShare,draws);
      }else{
        const denominator=Number(row.denominator||0);
        if(!(denominator>0)) continue;
        const p=(1/denominator)*checklistShare;
        expected+=(packsPerCase/denominator)*checklistShare;
        noHit*=Math.pow(1-p,packsPerCase);
      }
    }

    return {
      expected,
      chance:1-noHit
    };
  }

  function combineParts(parts=[]){
    return {
      expected:parts.reduce((sum,x)=>sum+x.expected,0),
      chance:1-parts.reduce((product,x)=>product*(1-x.chance),1)
    };
  }

  function baseProbability(player,odds,{packsPerCase,boxesPerCase}){
    const cardNumber=Number(player.base_card_number);
    if(!Number.isFinite(cardNumber)){
      return {eligible:false,model:null,expected:0,chance:0,modeledEntries:0};
    }

    if(cardNumber===201){
      const rows=(odds?.sections?.hobby_exclusive_card_201||[])
        .map(row=>({...row,type:row.type||"pack_odds"}));
      const part=oddsContribution({
        rows,
        checklistShare:1,
        packsPerCase,
        boxesPerCase
      });
      return {
        eligible:true,
        model:"hobby-exclusive-201",
        ...part,
        modeledEntries:1
      };
    }

    if(cardNumber>=1 && cardNumber<=200){
      const rows=odds?.sections?.base_cards||[];
      const part=oddsContribution({
        rows,
        checklistShare:1/200,
        packsPerCase,
        boxesPerCase
      });
      return {
        eligible:true,
        model:"standard-200",
        ...part,
        modeledEntries:1
      };
    }

    return {eligible:false,model:null,expected:0,chance:0,modeledEntries:0};
  }

  function categoryFromMappings({
    entries=[],
    mappings=[],
    alias={},
    sources={},
    packsPerCase=240,
    boxesPerCase=12
  }={}){
    const groups=new Map();
    const modeledKeys=new Set();

    for(const entry of entries){
      const mapping=mappingForSection(mappings,entry.section,alias);
      if(!mapping) continue;

      const index=mappings.indexOf(mapping);
      if(!groups.has(index)) groups.set(index,{mapping,entries:[]});
      groups.get(index).entries.push(entry);
      modeledKeys.add(entryKey(entry));
    }

    const parts=[];
    for(const {mapping,entries:groupEntries} of groups.values()){
      const poolSize=mappingPoolSize(mapping,sources);
      if(!(poolSize>0)) continue;
      const share=groupEntries.length/poolSize;
      const rows=(mapping.odds_rows||[]).map(row=>({
        ...row,
        type:row.type||"pack_odds"
      }));
      parts.push(oddsContribution({
        rows,
        checklistShare:share,
        packsPerCase,
        boxesPerCase
      }));
    }

    return {
      ...combineParts(parts),
      modeledEntries:modeledKeys.size,
      modeledKeys
    };
  }

  api.buildPlayerProbabilities=function({
    productId,
    playerIndex,
    odds,
    insertMap,
    autographMap,
    inserts,
    specialAutos,
    mainAutos,
    packsPerCase=240,
    boxesPerCase=12
  }={}){
    const teams={};
    const autoAlias={"Chrome Autographs":"Chrome Autograph Cards"};

    for(const [team,players] of Object.entries(playerIndex?.teams||{})){
      teams[team]={};

      for(const player of players){
        const allEntries=player.checklist_entries||[];
        const baseEntries=allEntries.filter(x=>x.category==="base");
        const insertEntries=allEntries.filter(x=>x.category==="insert");
        const autoEntries=allEntries.filter(
          x=>x.category==="autograph" || x.category==="special_autograph"
        );

        const base=baseProbability(player,odds,{packsPerCase,boxesPerCase});
        const insertsResult=categoryFromMappings({
          entries:insertEntries,
          mappings:insertMap?.mappings||[],
          sources:{inserts,specialAutos,mainAutos},
          packsPerCase,
          boxesPerCase
        });
        const autosResult=categoryFromMappings({
          entries:autoEntries,
          mappings:autographMap?.mappings||[],
          alias:autoAlias,
          sources:{inserts,specialAutos,mainAutos},
          packsPerCase,
          boxesPerCase
        });

        const modeledBaseKeys=new Set(
          base.modeledEntries ? baseEntries.map(entryKey) : []
        );
        const modeledAll=new Set([
          ...modeledBaseKeys,
          ...insertsResult.modeledKeys,
          ...autosResult.modeledKeys
        ]);

        const modeledByCategory={
          base:{
            total:baseEntries.length,
            modeled:base.modeledEntries
          },
          inserts:{
            total:insertEntries.length,
            modeled:insertsResult.modeledEntries
          },
          autographs:{
            total:autoEntries.length,
            modeled:autosResult.modeledEntries
          }
        };

        const total=allEntries.length;
        const modeled=modeledAll.size;
        const coveragePercent=total ? (modeled/total)*100 : 0;

        const overallExpected=
          base.expected+insertsResult.expected+autosResult.expected;
        const overallChance=
          1-
          (1-base.chance)*
          (1-insertsResult.chance)*
          (1-autosResult.chance);

        teams[team][player.player]={
          base:{
            eligible:base.eligible,
            model:base.model,
            expected_hits_per_case:round(base.expected,6),
            chance_at_least_one_percent:round(base.chance*100,3)
          },
          inserts:{
            mapped_checklist_cards:insertsResult.modeledEntries,
            expected_hits_per_case:round(insertsResult.expected,6),
            chance_at_least_one_percent:round(insertsResult.chance*100,3)
          },
          autographs:{
            mapped_checklist_cards:autosResult.modeledEntries,
            expected_hits_per_case:round(autosResult.expected,6),
            chance_at_least_one_percent:round(autosResult.chance*100,3)
          },
          overall:{
            expected_modeled_hits_per_case:round(overallExpected,6),
            chance_at_least_one_modeled_hit_percent:
              round(overallChance*100,3),
            categories:["base","inserts","autographs"],
            note:"Combined from modeled category hit probabilities using an independence approximation."
          },
          coverage:{
            metric:"checklist-entry modeling coverage",
            total_relevant_checklist_entries:total,
            modeled_checklist_entries:modeled,
            coverage_percent:round(coveragePercent,3),
            status:
              total && modeled===total
                ? "complete"
                : modeled>0
                  ? "partial"
                  : "none",
            by_category:modeledByCategory,
            unmapped_sections:unique(
              allEntries
                .filter(entry=>!modeledAll.has(entryKey(entry)))
                .map(entry=>entry.section)
                .filter(Boolean)
            ).sort(),
            note:"Coverage measures whether a physical checklist entry is connected to at least one published Hobby odds row. It does not mean every possible variant of that entry has published odds."
          },
          modeling:{
            base_confidence:base.modeledEntries ? "medium" : "none",
            insert_confidence:insertsResult.modeledEntries ? "medium" : "none",
            autograph_confidence:autosResult.modeledEntries ? "medium" : "none"
          }
        };
      }
    }

    return {
      product_id:productId,
      format:"Hobby Case",
      packs_per_case:packsPerCase,
      boxes_per_case:boxesPerCase,
      model:"player-category-probabilities-v2",
      assumptions:[
        "Official Topps Hobby odds are used without inventing missing odds.",
        "Within each mapped checklist pool, eligible physical checklist cards are treated as equally likely unless card-level weighting is published.",
        "The checklist label 'Chrome Autographs' is normalized to the odds-map label 'Chrome Autograph Cards'.",
        "Plural pooled autograph mappings such as Cold Battle are modeled as one shared physical checklist pool.",
        "For pooled common inserts, the five 20-card themes are treated as the published shared 100-card odds pool.",
        "A multi-subject checklist card counts as one physical card for each named player's personal hit probability.",
        "Unresolved team assignments are not inferred.",
        "Overall category hit chance uses an independence approximation.",
        "Checklist-entry modeling coverage measures mapped physical entries, not completeness of all possible parallel variants."
      ],
      teams
    };
  };

  api.comparePlayerIndex=function(generated={},stored={}){
    const errors=[];
    const generatedTeams=Object.keys(generated.teams||{}).sort();
    const storedTeams=Object.keys(stored.teams||{}).sort();

    if(JSON.stringify(generated.summary)!==JSON.stringify(stored.summary)){
      errors.push("player index summary mismatch");
    }
    if(JSON.stringify(generatedTeams)!==JSON.stringify(storedTeams)){
      errors.push("player index team set mismatch");
    }

    for(const team of storedTeams){
      const normalize=players=>(players||[]).map(player=>({
        ...player,
        checklist_entries:[...(player.checklist_entries||[])].sort(
          (a,b)=>entryKey(a).localeCompare(entryKey(b))
        ),
        checklist_sections:[...(player.checklist_sections||[])].sort()
      })).sort((a,b)=>a.player.localeCompare(b.player));

      if(JSON.stringify(normalize(generated.teams?.[team]))!==
         JSON.stringify(normalize(stored.teams?.[team]))){
        errors.push("player index team mismatch: "+team);
      }
    }

    return {valid:errors.length===0,errors};
  };

  api.comparePlayerProbabilities=function(generated={},stored={},tolerance=0.000001){
    const errors=[];
    const teams=unique([
      ...Object.keys(generated.teams||{}),
      ...Object.keys(stored.teams||{})
    ]).sort();

    function compareValue(path,a,b){
      if(typeof a==="number" || typeof b==="number"){
        if(!Number.isFinite(Number(a)) ||
           !Number.isFinite(Number(b)) ||
           Math.abs(Number(a)-Number(b))>tolerance){
          errors.push(path+" mismatch: "+a+" vs "+b);
        }
        return;
      }
      if(JSON.stringify(a)!==JSON.stringify(b)){
        errors.push(path+" mismatch");
      }
    }

    for(const team of teams){
      const players=unique([
        ...Object.keys(generated.teams?.[team]||{}),
        ...Object.keys(stored.teams?.[team]||{})
      ]).sort();

      for(const player of players){
        const g=generated.teams?.[team]?.[player];
        const s=stored.teams?.[team]?.[player];
        if(!g || !s){
          errors.push("missing player probability row: "+team+" / "+player);
          continue;
        }

        for(const category of ["base","inserts","autographs"]){
          for(const key of Object.keys(s[category]||{})){
            compareValue(
              team+" / "+player+" / "+category+" / "+key,
              g[category]?.[key],
              s[category]?.[key]
            );
          }
        }

        for(const key of [
          "expected_modeled_hits_per_case",
          "chance_at_least_one_modeled_hit_percent"
        ]){
          compareValue(
            team+" / "+player+" / overall / "+key,
            g.overall?.[key],
            s.overall?.[key]
          );
        }

        compareValue(
          team+" / "+player+" / coverage",
          g.coverage,
          s.coverage
        );
        compareValue(
          team+" / "+player+" / modeling",
          g.modeling,
          s.modeling
        );
      }
    }

    return {valid:errors.length===0,errors};
  };

  root.BreakMetricPlayerDerivation=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
