import fs from "node:fs";import path from "node:path";
const root=process.cwd(),issues=[],warnings=[];const read=p=>fs.readFileSync(path.join(root,p),"utf8"),json=p=>JSON.parse(read(p)),exists=p=>fs.existsSync(path.join(root,p));const must=(v,c)=>{if(!v)issues.push(c);};
const html=read("index.html"),catalog=json("data/products/catalog.json"),registry=json("data/releases/index.json");
must(catalog.products.length===registry.releases.length,"catalog-registry-count-drift");
for(const r of registry.releases){const p=catalog.products.find(x=>x.id===r.id);must(Boolean(p),"release-missing-from-ui:"+r.id);if(p){must(p.format_data===r.formats_file,"format-path-drift:"+r.id);must((r.status==="pending")===(p.status==="pending"),"release-status-drift:"+r.id);}}
const ready=catalog.products.filter(x=>x.status==="ready");must(ready.length>=1,"no-analysis-ready-release");
for(const p of ready){must(Boolean(p.product_data&&exists(p.product_data)),"ready-product-data-missing:"+p.id);must(Boolean(p.integrity_data&&exists(p.integrity_data)),"ready-integrity-data-missing:"+p.id);const formats=json(p.format_data);for(const f of formats.formats||[]){if(f.status!=="ready")continue;must(Boolean(f.analysis_data),"ready-format-analysis-data-missing:"+p.id+"::"+f.id);for(const [k,v] of Object.entries(f.analysis_data||{}))must(typeof v==="string"&&exists(v),"analysis-path-missing:"+p.id+"::"+f.id+"::"+k);}}
for(const id of ["productGrid","formatGrid","teamGrid","playerGrid","price","currency","breakMetricResult","bmResultEv","bmResultRoi"])must(html.includes('id="'+id+'"'),"ui-contract-missing:"+id);
for(const token of ["BreakMetricSelectionCoordinator","BreakMetricResultsView","BreakMetricProductionGuard","BreakMetricDataLoader","BreakMetricStorage"])must(html.includes(token),"runtime-module-not-wired:"+token);
const results=read("src/resultsView.js");must(results.includes("coverage_complete===true"),"ev-coverage-gate-missing");must(results.includes("roi_eligible===true"),"roi-evidence-gate-missing");must(results.includes("ROI exposed before readiness"),"roi-fail-closed-validation-missing");
const obs=json("data/collection/2026-topps-chrome-premier-league-market-observations-v1.json");if(obs.generated_at===null)warnings.push("reference-market-observations-not-live-collected");
const queue=json("ops/collector/acquisition-priority-v1.json");if(queue.generated_at==null)warnings.push("collector-queue-freshness-unverifiable");
const out={schema_version:1,model:"full-system-validation-v1",status:issues.length?"failed":"passed",issue_count:issues.length,warning_count:warnings.length,release_count:registry.releases.length,ready_release_count:ready.length,issues,warnings,fail_closed:true};
process.stdout.write(JSON.stringify(out,null,2)+"\n");if(issues.length)process.exitCode=1;
