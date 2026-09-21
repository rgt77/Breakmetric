import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const sandbox={
  console,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Set,
  Map,
  Math,
  JSON
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);

vm.runInContext(
  fs.readFileSync(path.join(root,"src/marketRecordCoordinator.js"),"utf8"),
  sandbox,
  {filename:"src/marketRecordCoordinator.js"}
);

const assert=(condition,message)=>{
  if(!condition) throw new Error(message);
};

const coordinator=sandbox.BreakMetricMarketRecordCoordinator.create();

const first=coordinator.begin({
  productId:"release-a",
  formatId:"hobby",
  team:"Chelsea"
});
assert(
  coordinator.isCurrent(first,{
    productId:"release-a",
    formatId:"hobby",
    team:"Chelsea"
  }),
  "initial market context should be current"
);

const second=coordinator.begin({
  productId:"release-b",
  formatId:"hobby",
  team:"Chelsea"
});
assert(
  !coordinator.isCurrent(first,{
    productId:"release-b",
    formatId:"hobby",
    team:"Chelsea"
  }),
  "same team on a newer product accepted stale market load"
);
assert(
  coordinator.isCurrent(second,{
    productId:"release-b",
    formatId:"hobby",
    team:"Chelsea"
  }),
  "newer product market context is not current"
);

const third=coordinator.begin({
  productId:"release-b",
  formatId:"breaker",
  team:"Chelsea"
});
assert(
  !coordinator.isCurrent(second,{
    productId:"release-b",
    formatId:"breaker",
    team:"Chelsea"
  }),
  "same team/product on a newer format accepted stale market load"
);

const fourth=coordinator.begin({
  productId:"release-b",
  formatId:"breaker",
  team:"Arsenal"
});
assert(
  !coordinator.isCurrent(third,{
    productId:"release-b",
    formatId:"breaker",
    team:"Arsenal"
  }),
  "newer team accepted stale market load"
);
assert(
  coordinator.isCurrent(fourth,{
    productId:"release-b",
    formatId:"breaker",
    team:"Arsenal"
  }),
  "latest market context is not current"
);

coordinator.invalidate();
assert(coordinator.snapshot()===null,"market context invalidate left active operation");
assert(
  !coordinator.isCurrent(fourth,{
    productId:"release-b",
    formatId:"breaker",
    team:"Arsenal"
  }),
  "invalidated market operation remained current"
);

const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert(
  html.includes("BreakMetricMarketRecordCoordinator.create()"),
  "market coordinator is not instantiated"
);
assert(
  html.includes("productId: currentProduct?.id || \"\"") &&
  html.includes("formatId: selectedFormat || \"\"") &&
  html.includes("team: team.value || \"\""),
  "market record context does not include product, format and team"
);
assert(
  (html.match(/marketRecordCoordinator\.isCurrent\(/g)||[]).length>=2,
  "market record stale success/error guards are incomplete"
);
assert(
  html.includes("marketRecordCoordinator.invalidate();"),
  "market record reset does not invalidate active load"
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "same-team cross-product race rejection",
    "same-team cross-format race rejection",
    "team race rejection",
    "latest context accepted",
    "reset invalidation",
    "UI context includes product+format+team",
    "stale success/error guards present"
  ]
},null,2));
