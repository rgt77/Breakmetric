import fs from "node:fs";import path from "node:path";
const root=process.cwd(),issues=[],warnings=[];
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const json=p=>JSON.parse(read(p));
const exists=p=>fs.existsSync(path.join(root,p));
for(const tag of html.matchAll(/<[^>]+>/g)){if(tag[0].includes("${")||tag[0].includes("item."))continue;const names=[...tag[0].matchAll(/\\s([a-zA-Z_:][-\\w:.]*)\\s*=/g)].map(x=>x[1]);for(const n of new Set(names))if(names.filter(x=>x===n).length>1)issues.push("duplicate-html-attribute:"+n);}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
for(const id of new Set(ids))if(ids.filter(x=>x===id).length>1)issues.push("duplicate-html-id:"+id);
for(const tag of html.matchAll(/<[^>]+>/g)){const names=[...tag[0].matchAll(/\s([a-zA-Z_:][-\w:.]*)\s*=/g)].map(x=>x[1]);for(const n of new Set(names))if(names.filter(x=>x===n).length>1)issues.push("duplicate-html-attribute:"+n);}
for(const src of html.matchAll(/<script[^>]+src="([^"]+)"/g)){if(!/^https?:/.test(src[1])){const local=src[1].split("?")[0].split("#")[0];if(!exists(local))issues.push("missing-script:"+src[1]);}}
const registry=json("data/releases/index.json"),releaseIds=new Set();
for(const r of registry.releases||[]){if(releaseIds.has(r.id))issues.push("duplicate-release:"+r.id);releaseIds.add(r.id);if(!exists(r.formats_file))issues.push("missing-formats:"+r.id);for(const p of Object.values(r.collector_configs||{}))if(!exists(p))issues.push("missing-collector-config:"+p);}
if(!releaseIds.has(registry.default_release_id))issues.push("missing-default-release");
for(const file of ["scripts/validate-release-package.mjs","scripts/validate-market-evidence.mjs","scripts/validate-release-registry-runtime.mjs","scripts/validate-ev-engine.mjs","scripts/validate-data-quality.mjs","scripts/validate-performance.mjs","scripts/validate-mobile.mjs"])if(!exists(file))issues.push("missing-validator:"+file);
if(!exists("scripts/validate-production-hardening.mjs"))issues.push("production-hardening-validator-missing");
if(!exists("src/productionGuard.js"))issues.push("production-runtime-guard-missing");
const collector=read("scripts/run-market-collector.mjs");if(collector.includes('"2026 Topps Chrome Premier League"'))issues.push("collector-hardcoded-release");if(!collector.includes("retry_http_statuses.includes"))issues.push("collector-retry-policy-not-enforced");if(!collector.includes("fairnessCounts.team"))issues.push("collector-fairness-not-enforced");
const queue=json("ops/collector/acquisition-priority-v1.json");if(!queue.generated_at)warnings.push("collector-queue-freshness-unverifiable");
const loader=read("src/dataLoader.js");if(!loader.includes("api.pruneCache(40)"))issues.push("runtime-cache-bound-not-enforced");
const ev=read("scripts/validate-ev-engine.mjs");const asserts=(ev.match(/assert\./g)||[]).length,declared=Number(ev.match(/checks:(\d+)/)?.[1]);if(declared!==asserts)issues.push("ev-test-count-mismatch:"+declared+"!="+asserts);
for(const file of fs.readdirSync(path.join(root,"data/releases")).filter(x=>x.endsWith("-hobby.json"))){const d=json("data/releases/"+file);if(d.model!=="release-data-package-v1")continue;if(d.status==="ready"&&!Object.values(d.readiness||{}).every(Boolean))issues.push("premature-ready:"+file);for(const [k,p] of Object.entries(d.required_components||{}))if(d.readiness?.[k]===true&&!exists(p))issues.push("ready-component-missing:"+file+":"+k);}
const out={schema_version:1,model:"codebase-audit-v1",status:issues.length?"failed":"passed",issue_count:issues.length,warning_count:warnings.length,issues,warnings};
process.stdout.write(JSON.stringify(out,null,2)+"\\n");if(issues.length)process.exitCode=1;