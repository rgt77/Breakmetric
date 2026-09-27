// BreakMetric legacy-derived identity bridge v1.
(function(root){"use strict";const api={};const clean=v=>typeof v==="string"?v.trim():"";
api.resolve=function(row={},context={}){
 const errors=[],checklist=context.checklist;
 if(!Array.isArray(checklist?.cards)) errors.push("normalized checklist required");
 const matches=(checklist?.cards||[]).filter(x=>x.card_number===clean(row.card_number)&&x.player===clean(row.player)&&x.team===clean(row.team));
 if(matches.length!==1) errors.push("legacy row must resolve to one checklist card");
 const printRun=Number(context.print_run);
 if(!Number.isInteger(printRun)||printRun<=0) errors.push("explicit print_run required");
 const hobby=row.hobby||{};
 if(!clean(hobby.parallel_odds_per_pack)) errors.push("legacy odds missing");
 if(errors.length)return Object.freeze({valid:false,errors:Object.freeze(errors)});
 if(!root.BreakMetricVariants?.normalize||!root.BreakMetricOdds?.normalize||!root.BreakMetricOddsChecklist?.link)return Object.freeze({valid:false,errors:Object.freeze(["canonical identity dependencies unavailable"])});\n const card=matches[0];
 const variant=root.BreakMetricVariants.normalize({parallel:row.parallel,serial_numbering:printRun,autograph:clean(row.set).toLowerCase().includes("autograph")},{product_id:card.product_id,card_id:card.card_id});
 const odds=root.BreakMetricOdds.normalize({odds:hobby.parallel_odds_per_pack,opportunities_per_case:Number(hobby.packs_per_case),eligible_subjects:Number(hobby.eligible_base_cards),source_kind:"legacy-derived",assumption:clean(row.assumption)},{product_id:card.product_id,format_id:clean(context.format_id)||"hobby",variant_id:variant.variant_id});
 const link=root.BreakMetricOddsChecklist.link({odds,card,variant,format_id:clean(context.format_id)||"hobby"});
 const expected=Number(row.calculation?.expected_copies_per_case),probability=Number(row.calculation?.probability_at_least_one_in_case);
 if(Number.isFinite(expected)&&Math.abs(expected-odds.expected_copies_per_case)>1e-12)errors.push("expected copies mismatch");
 if(Number.isFinite(probability)&&Math.abs(probability-odds.probability_at_least_one_in_case)>1e-12)errors.push("case probability mismatch");
 return Object.freeze({valid:link.valid&&errors.length===0,errors:Object.freeze([...link.errors,...errors]),card,variant,odds,link});
};
root.BreakMetricLegacyIdentityBridge=Object.freeze(api);})(typeof window!=="undefined"?window:globalThis);
