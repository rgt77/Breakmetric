import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync("index.html","utf8");
const headers=fs.readFileSync("_headers","utf8");

const boxIndex=html.indexOf("1 · Choose box type");
const teamIndex=html.indexOf("2 · Choose team");
const playerIndex=html.indexOf("3 · Choose player");
const priceIndex=html.indexOf("4 · Spot price");

assert.ok(boxIndex>=0,"box type step missing");
assert.ok(teamIndex>boxIndex,"team step must follow box type");
assert.ok(playerIndex>teamIndex,"player step must follow team");
assert.ok(priceIndex>playerIndex,"spot price must follow player");

assert.match(
  html,
  /#productStage\{display:none!important\}/,
  "release/product chooser must stay hidden"
);
assert.doesNotMatch(
  html,
  /id="analysisContext"/,
  "redundant analysis context summary must not return"
);
assert.doesNotMatch(
  html,
  /class="analysis-context"/,
  "redundant analysis context styling hook must not return"
);

assert.match(
  headers,
  /\/\n\s+Cache-Control: no-store/,
  "root document must be no-store"
);
assert.match(
  headers,
  /\/index\.html\n\s+Cache-Control: no-store/,
  "index document must be no-store"
);

console.log(JSON.stringify({
  result:"pass",
  flow:["box-type","team","player","spot-price"],
  release_stage_visible:false,
  redundant_context_visible:false,
  root_html_cache:"no-store"
},null,2));
