import fs from "node:fs";import {automationStatus} from "./lib/release-automation.mjs";
const args=process.argv.slice(2);const pos=args.indexOf("--package");
if(pos<0)throw new Error("package argument required");
const pkg=JSON.parse(fs.readFileSync(args[pos+1],"utf8"));
const status=automationStatus(process.cwd(),pkg);
process.stdout.write(JSON.stringify({schema_version:1,model:"release-ingestion-plan-v1",status},null,2)+"\n");