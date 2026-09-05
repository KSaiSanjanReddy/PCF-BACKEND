// test-ef-matching.mjs — exercise the EF Matching Engine against the real
// BAFU 2025 emission_factors table.
//
// RUN ORDER:
//   1. npm run build-main
//   2. node test-ef-matching.mjs
//
// Optional env overrides:
//   TEST_MATERIAL=Aluminium TEST_PROCESS="Die Casting" TEST_COUNTRY=CN ...
//
// What it does:
//   - Spawns a synthetic supplier_questionnaire_response row (so the audit
//     FK is satisfied), runs 3 representative match calls, prints results,
//     then cleans the synthetic rows back out so no junk is left behind.
import "dotenv/config";
import { existsSync } from "node:fs";

const distPath = "./dist/services/efMatchingEngine.js";
if (!existsSync(distPath)) {
    console.error("❌ Compiled output not found. Run `npm run build-main` first.");
    process.exit(1);
}

const { findBestEf } = await import("./dist/services/efMatchingEngine.js");
const { withClient } = await import("./dist/util/database.js");
const { ulid } = await import("ulid");

const TEST_RESPONSE_ID = `test_resp_${ulid()}`;

// Seed a temp response row so ef_match_audit FK is satisfied.
await withClient(async (client) => {
    await client.query(
        `INSERT INTO supplier_questionnaire_response (id, bom_pcf_request_id, supplier_id, status)
         VALUES ($1, 'TEST_PCF', 'TEST_SUP', 'draft')`,
        [TEST_RESPONSE_ID]
    );
});

const testCases = [
    {
        name: "Aluminium die-cast, China, kg, 2025",
        input: {
            activityType: "material",
            material: process.env.TEST_MATERIAL ?? "Aluminium",
            process: process.env.TEST_PROCESS ?? "Die Casting",
            country: process.env.TEST_COUNTRY ?? "CN",
            unit: process.env.TEST_UNIT ?? "kg",
            unitKind: "mass",
            year: parseInt(process.env.TEST_YEAR ?? "2025", 10),
            sourceQuestion: "q8_bom",
            sourceRowId: "fake_row_1",
            responseId: TEST_RESPONSE_ID,
        },
    },
    {
        name: "Steel, India, kg (no process)",
        input: {
            activityType: "material",
            material: "Steel",
            country: "IN",
            unit: "kg",
            unitKind: "mass",
            year: 2025,
            sourceQuestion: "q8_bom",
            sourceRowId: "fake_row_2",
            responseId: TEST_RESPONSE_ID,
        },
    },
    {
        name: "Unobtainium, Mars, kg (should be manual review)",
        input: {
            activityType: "material",
            material: "Unobtainium",
            country: "MARS",
            unit: "kg",
            unitKind: "mass",
            year: 2025,
            sourceQuestion: "q8_bom",
            sourceRowId: "fake_row_3",
            responseId: TEST_RESPONSE_ID,
        },
    },
];

for (const tc of testCases) {
    console.log("\n===", tc.name, "===");
    const start = Date.now();
    try {
        const result = await findBestEf(tc.input);
        const ms = Date.now() - start;
        console.log(`   confidence : ${result.confidence}`);
        console.log(`   score      : ${result.score}`);
        console.log(`   winner     : ${result.winningEfId ?? "(none)"}`);
        if (result.winningRow) {
            const r = result.winningRow;
            console.log(
                `   row        : material=${r.material} / process=${r.process} / country=${r.country_code} / unit=${r.unit} / year=${r.reference_year}`
            );
            console.log(`   kgCO2e/unit: ${r.kgco2e_per_unit}`);
        }
        if (result.alternatives.length > 1) {
            console.log("   alternatives:");
            for (const alt of result.alternatives.slice(0, 3)) {
                console.log(`     - ${alt.efId.slice(0, 24)}... score=${alt.score} breakdown=${JSON.stringify(alt.breakdown)}`);
            }
        }
        console.log(`   audit id   : ${result.auditId}`);
        console.log(`   elapsed    : ${ms}ms`);
    } catch (err) {
        console.error("   ❌ error:", err.message);
    }
}

// Cleanup: drop the temp audit rows + temp response so nothing pollutes prod DB.
await withClient(async (client) => {
    await client.query(`DELETE FROM ef_match_audit WHERE response_id = $1`, [TEST_RESPONSE_ID]);
    await client.query(`DELETE FROM supplier_questionnaire_response WHERE id = $1`, [TEST_RESPONSE_ID]);
});

console.log("\n🧹 cleanup done. Test complete.");
process.exit(0);
