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

for(const file of ["src/fxCoordinator.js","src/runtimeGuard.js"]){
  vm.runInContext(
    fs.readFileSync(path.join(root,file),"utf8"),
    sandbox,
    {filename:file}
  );
}

const assert=(condition,message)=>{
  if(!condition) throw new Error(message);
};

const fx=sandbox.BreakMetricFxCoordinator.create();

const initial=fx.begin("initial","SEK");
assert(fx.isCurrent(initial,"SEK"),"initial FX operation should be current");

const first=fx.begin("conversion","EUR");
assert(!fx.isCurrent(initial,"SEK"),"new conversion did not invalidate initial FX request");
assert(fx.isCurrent(first,"EUR"),"first conversion should be current");

const second=fx.begin("conversion","GBP");
assert(!fx.isCurrent(first,"EUR"),"newer conversion did not invalidate older conversion");
assert(!fx.isCurrent(first,"GBP"),"stale conversion matched a new target");
assert(fx.isCurrent(second,"GBP"),"latest conversion is not current");
assert(!fx.isCurrent(second,"USD"),"latest conversion accepted wrong current currency");

const beforeInvalidate=fx.epoch();
fx.invalidate();
assert(fx.snapshot()===null,"FX coordinator invalidate left active operation");
assert(fx.epoch()===beforeInvalidate+1,"FX coordinator invalidate did not advance epoch");
assert(!fx.isCurrent(second,"GBP"),"invalidated FX operation remained current");

sandbox.BreakMetricOne={};
sandbox.BreakMetricTwo={};
const ready=sandbox.BreakMetricRuntimeGuard.check([
  "BreakMetricOne",
  "BreakMetricTwo"
]);
assert(ready.valid,"runtime guard rejected available modules");
assert(ready.available_count===2,"runtime guard available count wrong");

const missing=sandbox.BreakMetricRuntimeGuard.check([
  "BreakMetricOne",
  "BreakMetricMissing",
  "BreakMetricMissing"
]);
assert(!missing.valid,"runtime guard accepted a missing module");
assert(missing.missing.length===1 && missing.missing[0]==="BreakMetricMissing","runtime guard missing list wrong");
assert(
  sandbox.BreakMetricRuntimeGuard.message(missing).includes("BreakMetricMissing"),
  "runtime guard message omitted missing module"
);

const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert(
  html.includes('src/runtimeContracts.js?v=2'),
  "index does not force clients onto runtime contracts v2"
);
assert(html.includes("fxCoordinator.begin(\"conversion\", nextCurrency)"),"currency change is not coordinated");
assert(html.includes("fxCoordinator.begin(\"initial\", initialCurrency)"),"initial FX load is not coordinated");
assert(
  (html.match(/fxCoordinator\.isCurrent\(/g)||[]).length>=5,
  "FX stale-result guards are incomplete"
);
assert(html.includes("fxTransitionPending = true"),"FX pending state is not activated");
assert(html.includes("fxTransitionPending = false"),"FX pending state is not cleared");
assert(
  html.includes("BreakMetric could not start because required application modules failed to load."),
  "runtime fatal-load message missing"
);
assert(
  html.includes("runtimeDependencyReport.missing.join"),
  "runtime dependency failure detail missing"
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "initial FX invalidated by user conversion",
    "latest FX conversion wins",
    "stale success/failure token rejection",
    "FX coordinator invalidation",
    "runtime dependency success",
    "runtime dependency missing-module detection",
    "runtime fatal-load UI contract",
    "runtime contracts script cache-bust"
  ]
},null,2));
