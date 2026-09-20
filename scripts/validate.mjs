import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const failures = [];
const checks = [];
const pass = (name, condition, detail = "") => {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(detail ? name + ": " + detail : name);
};
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const json = p => JSON.parse(read(p));
const exists = p => typeof p === "string" && fs.existsSync(path.join(root, p));

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? walk(rel) : [rel];
  });
}

// Every committed JSON file must parse.
for (const file of walk("data").filter(file => file.endsWith(".json"))) {
  try {
    json(file);
  } catch (error) {
    failures.push(`JSON parse failed: ${file}: ${error.message}`);
  }
}
pass("all data JSON parses", !failures.some(x => x.startsWith("JSON parse failed")));

const catalog = json("data/products/catalog.json");
pass("product catalog has products", Array.isArray(catalog.products) && catalog.products.length > 0);

for (const product of catalog.products || []) {
  pass(`product id present: ${product.id || "unknown"}`, Boolean(product.id));
  if (product.status === "ready") {
    pass(`ready product data route exists: ${product.id}`, exists(product.product_data), product.product_data);
    pass(`ready product integrity route exists: ${product.id}`, exists(product.integrity_data), product.integrity_data);
    pass(`ready product format route exists: ${product.id}`, exists(product.format_data), product.format_data);

    if (exists(product.product_data) && exists(product.format_data)) {
      const metadata = json(product.product_data);
      const formats = json(product.format_data);
      pass(`metadata id matches catalog: ${product.id}`, metadata.id === product.id);
      pass(`format product id matches catalog: ${product.id}`, formats.product_id === product.id);

      for (const format of formats.formats || []) {
        if (format.status !== "ready") continue;
        pass(`ready format integrity exists: ${product.id}/${format.id}`, exists(format.integrity_data), format.integrity_data);
        pass(`ready format has analysis data: ${product.id}/${format.id}`, Boolean(format.analysis_data));
        for (const [key, route] of Object.entries(format.analysis_data || {})) {
          pass(`analysis route exists: ${product.id}/${format.id}/${key}`, exists(route), route);
        }

        const unit = format.analysis_unit || {};
        const cfg = format.configuration || {};
        pass(`analysis unit is one case: ${product.id}/${format.id}`, unit.type === "case" && Number(unit.cases) === 1);
        pass(`box math: ${product.id}/${format.id}`, Number(unit.boxes) === Number(cfg.boxes_per_case));
        pass(`pack math: ${product.id}/${format.id}`, Number(unit.packs) === Number(cfg.boxes_per_case) * Number(cfg.packs_per_box));
        pass(`card math: ${product.id}/${format.id}`, Number(unit.cards) === Number(unit.packs) * Number(cfg.cards_per_pack));
      }
    }
  }
}

// Compile the inline app without executing browser globals.
const html = read("index.html");
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
try {
  new vm.Script(inline, { filename: "index.inline.js" });
  pass("inline application JavaScript compiles", true);
} catch (error) {
  pass("inline application JavaScript compiles", false, error.message);
}

// Hardening invariants.
pass("atomic spot state enabled", html.includes('breakmetric_spot_state'));
pass("legacy spot-price writes removed", !html.includes('localStorage.setItem("breakmetric_spot_price"'));
pass("FX conversion is staged", html.includes("Fetch every rate first"));
pass("EV beta disclosure present", html.includes("EV and ROI remain beta"));
pass("combined probability approximation disclosed", html.includes("independence approximation"));
pass("skip link present", html.includes('class="skip-link"'));
pass("version is v1.1.1", html.includes("BreakMetric v1.1.1"));

console.log(JSON.stringify({
  result: failures.length ? "fail" : "pass",
  check_count: checks.length,
  failed_count: failures.length,
  failures
}, null, 2));

if (failures.length) process.exit(1);
