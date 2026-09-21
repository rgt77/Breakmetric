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
  fs.readFileSync(path.join(root,"src/selectionCoordinator.js"),"utf8"),
  sandbox,
  {filename:"src/selectionCoordinator.js"}
);

const assert=(condition,message)=>{
  if(!condition) throw new Error(message);
};

const coordinator=sandbox.BreakMetricSelectionCoordinator.create();

const first=coordinator.begin("product-a");
assert(coordinator.isCurrent(first,"product-a"),"first product selection should be current");

const second=coordinator.begin("product-b");
assert(!coordinator.isCurrent(first,"product-a"),"newer selection did not invalidate older product operation");
assert(!coordinator.isCurrent(first,"product-b"),"stale product operation matched newer product");
assert(coordinator.isCurrent(second,"product-b"),"latest product selection is not current");

const started=[];
if(coordinator.isCurrent(first,"product-b")) started.push("a");
if(coordinator.isCurrent(second,"product-b")) started.push("b");
assert(started.length===1 && started[0]==="b","stale product continuation was allowed to start analysis");

coordinator.invalidate();
assert(coordinator.snapshot()===null,"selection invalidate left active operation");
assert(!coordinator.isCurrent(second,"product-b"),"invalidated product selection remained current");

const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert(html.includes('selectionCoordinator.begin(item.id)'),"manual product selection does not create selection operation");
assert(
  html.includes('selectionCoordinator.begin(currentProduct.id)'),
  "initial product bootstrap does not create selection operation"
);
assert(
  (html.match(/selectionCoordinator\.isCurrent\(/g)||[]).length>=2,
  "selection continuation guards missing"
);
assert(
  html.includes('"BreakMetricSelectionCoordinator"'),
  "selection coordinator missing from runtime dependency guard"
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "latest product selection wins",
    "stale product operation rejected",
    "stale continuation cannot start analysis",
    "selection invalidation",
    "manual selection guard present",
    "bootstrap selection guard present",
    "runtime dependency guard includes coordinator"
  ]
},null,2));
