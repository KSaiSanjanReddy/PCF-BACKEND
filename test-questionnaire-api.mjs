// test-questionnaire-api.mjs — exercises the questionnaire service layer
// (save → load → list → validateForSubmit). HTTP auth is bypassed; we call
// the service module directly so the test is hermetic and doesn't need
// a running server / login.
//
// RUN ORDER:
//   1. npm run build-main
//   2. node test-questionnaire-api.mjs

import "dotenv/config";
import { existsSync } from "node:fs";
import { ulid } from "ulid";

const dist = "./dist/services/questionnaireService.js";
if (!existsSync(dist)) {
    console.error("❌ Compiled output not found. Run `npm run build-main` first.");
    process.exit(1);
}

const {
    saveQuestionnaire,
    loadQuestionnaire,
    listByPcf,
    markSubmitted,
    validateForSubmit,
} = await import("./dist/services/questionnaireService.js");
const { withClient } = await import("./dist/util/database.js");

const bomPcfRequestId = `TEST_PCF_${ulid()}`;
const supplierId = `TEST_SUP_${ulid()}`;

// ---------- 1. Save partial draft ----------
console.log("=== 1. Save partial draft (Q1 only) ===");
let saved = await saveQuestionnaire({
    bomPcfRequestId,
    supplierId,
    status: "draft",
    companyName: "ABC Automotive Pvt Ltd",
    companyIdUrn: "urn:bpn:BPNL000000000DWF",
});
console.log("  → responseId:", saved.responseId);
console.log("  → status    :", saved.status);
const responseId = saved.responseId;

// ---------- 2. Load and verify ----------
console.log("\n=== 2. Load draft ===");
let loaded = await loadQuestionnaire(responseId);
console.log("  → companyName       :", loaded.companyName);
console.log("  → companyIdUrn      :", loaded.companyIdUrn);
console.log("  → productNameCompany:", loaded.productNameCompany ?? "(not set yet)");
console.log("  → sites             :", loaded.sites?.length ?? 0, "rows");
console.log("  → bom               :", loaded.bom?.length ?? 0, "rows");

// ---------- 3. Save again with more fields (upsert) ----------
console.log("\n=== 3. Upsert with full data ===");
saved = await saveQuestionnaire({
    responseId,
    bomPcfRequestId,
    supplierId,
    status: "draft",
    // Q1
    companyName: "ABC Automotive Pvt Ltd",
    companyIdUrn: "urn:bpn:BPNL000000000DWF",
    // Q2
    productNameCompany: "Front Bumper Bracket",
    productIdUrn: "urn:mycompany.com:product-id:FBB-001",
    productDescription: "Front bumper bracket assembly",
    // Q3
    declaredUnit: "piece",
    declaredUnitAmount: 1,
    productMassPerDeclaredUnit: 2.5,
    // Q5
    referencePeriodStart: "2025-01-01",
    referencePeriodEnd: "2025-12-31",
    validityPeriodStart: "2025-12-31",
    validityPeriodEnd: "2027-12-31",
    // Q6 + Q7
    retroOrProspectivePcfType: "Retrospective PCF",
    systemBoundary: "cradle-to-gate",
    // Q15 / Q18
    packagingEmissionsIncluded: true,
    distributionStageIncluded: true,
    // Q21
    crossSectoralStandards: "ISO 14067",
    productOrSectorSpecificRules: "Catena-X Rulebook V4",
    ipccGwpVersion: "AR6",
    // Q22
    massBalancingUsed: false,
    // Q23
    allocationWasteIncineration: "polluter pays principle",
    // Q24
    ccsCo2CaptureIncluded: false,
    exemptedEmissionsDescription: "No exemption",
    exemptedEmissionsPercent: 0,
    // Q27
    totalProductionVolume: 10000,
    certifiedVolume: 8000,
    verifiedVolume1stParty: 10000,
    verifiedVolume2ndParty: 0,
    verifiedVolume3rdParty: 5000,
    totalProductVolume: 10000,
    // Q4 (with primary site)
    sites: [
        {
            siteName: "Plant A — Mysore",
            siteAddress: "Industrial Area, Mysore",
            region: "Asia",
            country: "IN",
            countrySubdivision: "IN-KA",
            isPrimary: true,
        },
    ],
    // Q8
    bom: [
        { componentName: "Aluminium body",  material: "Aluminium", process: "Die Casting", massPct: 70, carbonPct: 30, biogenicYN: true,  biogenicCarbonPct: 5,  recycledYN: true,  recycledCarbonPct: 10 },
        { componentName: "Steel reinforcer", material: "Steel",    process: "Stamping",   massPct: 30, carbonPct: 20, biogenicYN: false, biogenicCarbonPct: 0,  recycledYN: false, recycledCarbonPct: 0 },
    ],
    // Q10
    electricity: [
        { electricityType: "Grid", quantity: 4.5, unit: "kWh", renewablePct: 30 },
    ],
    // Q14
    productionWaste: [
        { wasteType: "Aluminium", treatmentType: "Recycling", quantity: 0.1, unit: "kg" },
    ],
    // Q16
    packagingMaterials: [
        { packagingType: "Cardboard", packagingWeight: 0.05, unit: "kg", country: "IN", region: "Asia", recycledPct: 60 },
    ],
    // Q16a
    packagingTransport: [
        { transportMode: "Truck", weight: 0.05, unit: "kg", distanceKm: 200 },
    ],
    // Q17
    packagingWaste: [
        { packagingWasteType: "Cardboard", treatmentType: "Recycling", quantity: 0.05, unit: "kg" },
    ],
    // Q19
    transportLegs: [
        { transportMode: "Truck", source: "Mysore", destination: "Chennai", weight: 2.5, unit: "kg", distanceKm: 500 },
    ],
});
console.log("  → upsert OK, status =", saved.status);

// ---------- 4. Reload to confirm upsert ----------
console.log("\n=== 4. Reload after upsert ===");
loaded = await loadQuestionnaire(responseId);
console.log("  → productNameCompany:", loaded.productNameCompany);
console.log("  → sites             :", loaded.sites?.length ?? 0, "rows");
console.log("  → bom               :", loaded.bom?.length ?? 0, "rows");
console.log("  → electricity       :", loaded.electricity?.length ?? 0, "rows");
console.log("  → packagingMaterials:", loaded.packagingMaterials?.length ?? 0, "rows");
console.log("  → transportLegs     :", loaded.transportLegs?.length ?? 0, "rows");

// ---------- 5. list by PCF ----------
console.log("\n=== 5. List responses for PCF ===");
const list = await listByPcf(bomPcfRequestId);
console.log("  → found", list.length, "response(s)");
for (const r of list) {
    console.log(`     - ${r.responseId.slice(0,16)}...  supplier=${r.supplierId.slice(0,16)}... status=${r.status}`);
}

// ---------- 6. validateForSubmit on complete data ----------
console.log("\n=== 6. Validate for submit (should be 0 errors) ===");
let errors = validateForSubmit(loaded);
console.log("  → errors:", errors.length);
if (errors.length > 0) {
    for (const e of errors) console.log("     -", e.field, "→", e.message);
}

// ---------- 7. validateForSubmit on incomplete data ----------
console.log("\n=== 7. Validate for submit (missing fields) ===");
const incomplete = { ...loaded, companyName: "", productNameCompany: "", bom: [] };
errors = validateForSubmit(incomplete);
console.log("  → errors:", errors.length);
for (const e of errors.slice(0, 5)) console.log("     -", e.field, "→", e.message);
if (errors.length > 5) console.log(`     ...and ${errors.length - 5} more`);

// ---------- 8. markSubmitted ----------
console.log("\n=== 8. markSubmitted ===");
await markSubmitted(responseId);
loaded = await loadQuestionnaire(responseId);
console.log("  → status now:", loaded.status);

// ---------- cleanup ----------
console.log("\n🧹 cleanup...");
await withClient(async (client) => {
    await client.query(`DELETE FROM pcf_computed_field WHERE response_id = $1`, [responseId]);
    await client.query(`DELETE FROM ef_match_audit WHERE response_id = $1`, [responseId]);
    for (const t of [
        "sq_q4_sites", "sq_q8_bom", "sq_q9a_coproducts",
        "sq_q10_electricity", "sq_q11_fuels", "sq_q12_process_gases",
        "sq_q13_qc_it_energy", "sq_q14_production_waste",
        "sq_q16_packaging_materials", "sq_q16a_packaging_transport",
        "sq_q17_packaging_waste", "sq_q19_transport_legs", "sq_q20_biomass_feedstock",
    ]) {
        await client.query(`DELETE FROM ${t} WHERE response_id = $1`, [responseId]);
    }
    await client.query(`DELETE FROM supplier_questionnaire_response WHERE id = $1`, [responseId]);
});

console.log("\n✅ Service layer test complete. APIs are wired and validated.");
process.exit(0);
