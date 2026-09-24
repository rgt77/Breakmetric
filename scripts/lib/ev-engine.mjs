const finite=v=>Number.isFinite(Number(v));
const round=(v,d=8)=>{const f=10**d;return Math.round(Number(v)*f)/f;};
export const contribution=(copies,value)=>finite(copies)&&Number(copies)>=0&&finite(value)&&Number(value)>=0?round(Number(copies)*Number(value)):null;
export const roi=(ev,price)=>finite(ev)&&finite(price)&&Number(price)>0?round((Number(ev)-Number(price))/Number(price)*100):null;
export const probabilityAtLeastOne=expected=>finite(expected)&&Number(expected)>=0?round((1-Math.exp(-Number(expected)))*100):null;
export function aggregate(rows=[]){let ev=0,copies=0,valued=0;for(const r of rows){const c=contribution(r.expected_copies_per_case,r.market_value_usd);if(c===null)continue;ev+=c;copies+=Number(r.expected_copies_per_case);valued++;}return {ev_usd:round(ev),expected_copies_per_case:round(copies),probability_at_least_one_pct:probabilityAtLeastOne(copies),valued_contribution_count:valued,total_contribution_count:rows.length,coverage_pct:rows.length?round(100*valued/rows.length):0};}
export const breakEvenPrice=ev=>finite(ev)&&Number(ev)>=0?round(Number(ev)):null;
export const netValue=(ev,price)=>finite(ev)&&finite(price)&&Number(price)>0?round(Number(ev)-Number(price)):null;
export const valueMultiple=(ev,price)=>finite(ev)&&finite(price)&&Number(price)>0?round(Number(ev)/Number(price)):null;
export const coverageStatus=pct=>Number(pct)>=95?"high":Number(pct)>=75?"medium":"low";
export const analysisReady=result=>Number(result.coverage_pct)>=95&&Number(result.valued_contribution_count)>0;
export function analyzeSpot(rows=[],spotPrice=null){const result=aggregate(rows);return {...result,spot_price_usd:finite(spotPrice)&&Number(spotPrice)>0?Number(spotPrice):null,roi_pct:roi(result.ev_usd,spotPrice)};}
