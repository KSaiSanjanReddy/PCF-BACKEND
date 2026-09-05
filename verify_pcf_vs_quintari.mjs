// verify_pcf_vs_quintari.mjs
// ---------------------------------------------------------------------------
// Side-by-side reconciliation of the two screens for ONE PCF request:
//
//   LEFT  = PCF View page  ->  bom_emission_calculation_engine
//           (Total Materials / Production / Packaging / Waste / Logistics / Grand Total)
//   RIGHT = Quintari        ->  the live Catena-X v9 submodel per component
//           (productionStage / packagingStage / distributionStage pcfIncludingBiogenicUptake)
//
// It proves the master reconciliation:
//   Grand Total (view)  ==  productionStage + packagingStage + distributionStage  (Quintari)
// and prints every value from both screens next to each other, with a
// MATCH / MISMATCH verdict per component + a grand total.
//
// RUN ORDER:
//   1. npm run build-main          (compiles TS -> dist, needed because we import the live engine)
//   2. node verify_pcf_vs_quintari.mjs <PCF_REQUEST_ID>
//        e.g. node verify_pcf_vs_quintari.mjs 01KX0AM6GZ08V5GRVDB8MNP22H
//
// READ-ONLY: only SELECTs + a live recompute-free submodel build. No writes.
// ---------------------------------------------------------------------------
import "dotenv/config";
import { existsSync } from "node:fs";

const TOL = 1e-3; // rounding tolerance (kg CO2e)

const requestId = process.argv[2];
if (!requestId) {
    console.error("❌ Usage: node verify_pcf_vs_quintari.mjs <PCF_REQUEST_ID>");
    process.exit(1);
}

const distSub = "./dist/services/pcfSubmodelService.js";
if (!existsSync(distSub)) {
    console.error("❌ Compiled output not found. Run `npm run build-main` first, then re-run.");
    process.exit(1);
}

const { withClient } = await import("./dist/util/database.js");
const { buildSubmodelsPerComponent } = await import("./dist/services/pcfSubmodelService.js");

const n = (v) => Number(v ?? 0);
const f = (v) => (Number.isFinite(n(v)) ? n(v).toFixed(4) : "—");
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// ---- 1. LEFT side: the stored 5-bucket rows (latest per component) ----------
const buckets = await withClient(async (client) => {
    const r = await client.query(
        `SELECT DISTINCT ON (bom_id)
                bom_id,
                material_value, production_value, packaging_value,
                waste_value, logistic_value, total_pcf_value
           FROM bom_emission_calculation_engine
          WHERE product_bom_pcf_id = $1
          ORDER BY bom_id, id DESC`,
        [requestId]
    );
    return r.rows;
});
const bucketByBom = new Map(buckets.map((b) => [String(b.bom_id), b]));

// ---- 2. RIGHT side: the live Catena-X submodel per component ----------------
let submodels;
try {
    submodels = await buildSubmodelsPerComponent(requestId);
} catch (err) {
    console.error("❌ Could not build Quintari submodels:", err.message);
    process.exit(1);
}

if (submodels.length === 0 && buckets.length === 0) {
    console.error(
        `❌ No calc rows AND no submodels found for request ${requestId}.\n` +
        `   Has "Run PCF Calculation" been executed for this request?`
    );
    process.exit(1);
}

// Pull the stage values out of one component's submodel.
function stagesOf(sm) {
    const stages = sm.submodel?.productLifeCycleStagesAndEmissions?.[0] ?? {};
    const prod = stages.productionStage?.[0] ?? {};
    const pack = stages.packagingStage?.[0] ?? {};
    const dist = stages.distributionStage?.[0] ?? {};
    const carbon = sm.submodel?.carbonContent?.[0] ?? {};
    return {
        PS: n(prod.pcfIncludingBiogenicUptake),
        prodFossil: n(prod.fossilGhgEmissions),
        KS: n(pack.packagingPcfIncludingBiogenicUptake),
        pkgFossil: n(pack.packagingFossilGhgEmissions),
        DS: n(dist.distributionStagePcfIncludingBiogenicUptake),
        distFossil: n(dist.distributionStageFossilGhgEmissions),
        carbonTotal: n(carbon.carbonContentTotal),
    };
}

console.log("\n" + "=".repeat(78));
console.log(`  PCF request:  ${requestId}`);
console.log(`  Components:    ${submodels.length} submodel(s), ${buckets.length} calc row(s)`);
console.log("=".repeat(78));

let anyMismatch = false;
const gt = { M: 0, P: 0, Pk: 0, W: 0, L: 0, T: 0, PS: 0, KS: 0, DS: 0 };

for (const sm of submodels) {
    const bom = String(sm.bomId);
    const b = bucketByBom.get(bom);
    const q = stagesOf(sm);

    console.log(`\n── Component: ${sm.componentName ?? "(unnamed)"}  [bom ${bom}] ${sm.supplierName ? "· " + sm.supplierName : ""}`);

    if (!b) {
        console.log("   ⚠️  No bom_emission_calculation_engine row — PCF View page would show blanks.");
        console.log(`      Quintari stages:  production=${f(q.PS)}  packaging=${f(q.KS)}  distribution=${f(q.DS)}`);
        anyMismatch = true;
        continue;
    }

    const M = n(b.material_value), P = n(b.production_value), Pk = n(b.packaging_value),
          W = n(b.waste_value), L = n(b.logistic_value), T = n(b.total_pcf_value);

    gt.M += M; gt.P += P; gt.Pk += Pk; gt.W += W; gt.L += L; gt.T += T;
    gt.PS += q.PS; gt.KS += q.KS; gt.DS += q.DS;

    // Reconciliation checks (see formulaEngine breakdown):
    //   master:  T  ==  PS + KS + DS
    //   dist:    L  ==  DS
    const qSum = q.PS + q.KS + q.DS;
    const masterOk = Math.abs(T - qSum) <= TOL;
    const distOk = Math.abs(L - q.DS) <= TOL;
    if (!masterOk || !distOk) anyMismatch = true;

    console.log("   " + pad("PCF VIEW PAGE (5 buckets)", 40) + "QUINTARI (Catena-X stages)");
    console.log("   " + pad(`  Total Materials    ${padL(f(M), 12)}`, 40) + `productionStage.fossilGhg   ${padL(f(q.prodFossil), 12)}`);
    console.log("   " + pad(`  Total Production   ${padL(f(P), 12)}`, 40) + `productionStage.pcfIncl     ${padL(f(q.PS), 12)}`);
    console.log("   " + pad(`  Total Packaging    ${padL(f(Pk), 12)}`, 40) + `packagingStage.pcfIncl      ${padL(f(q.KS), 12)}`);
    console.log("   " + pad(`  Total Waste        ${padL(f(W), 12)}`, 40) + `distributionStage.pcfIncl   ${padL(f(q.DS), 12)}`);
    console.log("   " + pad(`  Total Logistics    ${padL(f(L), 12)}`, 40) + `carbonContentTotal (mass!)  ${padL(f(q.carbonTotal), 12)}`);
    console.log("   " + pad(`  Grand Total        ${padL(f(T), 12)}`, 40) + `PS+KS+DS                    ${padL(f(qSum), 12)}`);

    console.log(
        `   → master check  Grand Total (${f(T)}) == PS+KS+DS (${f(qSum)})  : ` +
        (masterOk ? "✅ MATCH" : `❌ MISMATCH (Δ ${f(T - qSum)})`)
    );
    console.log(
        `   → logistics     Total Logistics (${f(L)}) == distributionStage (${f(q.DS)}) : ` +
        (distOk ? "✅ MATCH" : `❌ MISMATCH (Δ ${f(L - q.DS)})`)
    );
}

// Components that have a calc row but no submodel (supplier response missing).
for (const b of buckets) {
    if (!submodels.some((sm) => String(sm.bomId) === String(b.bom_id))) {
        console.log(`\n── bom ${b.bom_id}: has a calc row (Grand Total ${f(b.total_pcf_value)}) but NO submodel — supplier response missing.`);
        anyMismatch = true;
    }
}

// ---- Grand total across all components (what the PCF page header sums) ------
console.log("\n" + "=".repeat(78));
const gtSum = gt.PS + gt.KS + gt.DS;
const gtOk = Math.abs(gt.T - gtSum) <= TOL;
console.log("  PRODUCT TOTAL (all components summed)");
console.log(`    PCF View Grand Total : ${f(gt.T)}   (M ${f(gt.M)} + P ${f(gt.P)} + Pk ${f(gt.Pk)} + W ${f(gt.W)} + L ${f(gt.L)})`);
console.log(`    Quintari PS+KS+DS    : ${f(gtSum)}   (PS ${f(gt.PS)} + KS ${f(gt.KS)} + DS ${f(gt.DS)})`);
console.log(`    → ${gtOk ? "✅ MATCH" : `❌ MISMATCH (Δ ${f(gt.T - gtSum)})`}`);
console.log("=".repeat(78));

console.log(
    "\n" +
    (anyMismatch
        ? "❌ Reconciliation FAILED — see mismatches above. If values look stale, re-run 'Run PCF Calculation'."
        : "✅ All checks passed — the PCF View page and Quintari reconcile.") +
    "\n\nNote: carbonContentTotal is carbon MASS (kg C), NOT a CO2e emission — it is\nshown for reference only and never appears in the Grand Total."
);

process.exit(anyMismatch ? 2 : 0);
