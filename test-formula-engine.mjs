// test-formula-engine.mjs — seed the MANAGER'S reference test case
// (Front Bumper Bracket, FBB-001) exactly, run the formula engine, print the
// full trace + computed fields, then clean up.
//
// Manager's expected totals (kg CO2e):
//   carbon: total 0.402, fossil 0.365, recycled 0.037, biogenic 0
//   materials 0.7886056 | packaging 0.44379225 | electricity 2.9156352
//   process gas 0.4644  | transport 34.31880048 | waste ~0.00019
//   GRAND TOTAL ≈ 38.93  (was 36.18 before the electricity 3.2 correction)
//
// RUN ORDER:
//   1. npm run build-main
//   2. node run-migration.mjs        (adds the 4 electricity factory columns)
//   3. node test-formula-engine.mjs
import "dotenv/config";
import { existsSync } from "node:fs";

// Turn on the verbose calculation trace BEFORE the engine module loads
// (the DEBUG flag is read once at import time).
process.env.PCF_DEBUG = "1";

const dist = "./dist/services/formulaEngine.js";
if (!existsSync(dist)) {
    console.error("❌ Compiled output not found. Run `npm run build-main` first.");
    process.exit(1);
}

const { computePcfFields } = await import("./dist/services/formulaEngine.js");
const { withClient } = await import("./dist/util/database.js");
const { ulid } = await import("ulid");

const responseId = `test_resp_${ulid()}`;
const siteId = ulid();
const ids = { m1: ulid(), m2: ulid(), m3: ulid(), elec: ulid(), g1: ulid(), g2: ulid(), g3: ulid(), pk1: ulid(), pk2: ulid(), t1: ulid(), t2: ulid(), t3: ulid(), w1: ulid(), pw1: ulid() };

await withClient(async (client) => {
    // ── Main response (Front Bumper Bracket) + factory electricity inputs ──
    await client.query(
        `INSERT INTO supplier_questionnaire_response (
            id, bom_pcf_request_id, supplier_id, status,
            company_name, company_id_urn,
            product_name_company, product_id_urn, product_mass_per_declared_unit,
            declared_unit, declared_unit_amount,
            reference_period_start, reference_period_end,
            co_products_present, packaging_emissions_included, distribution_stage_included,
            ipcc_gwp_version,
            factory_total_energy_kwh, factory_total_weight_kg,
            component_total_weight_kg, component_num_products,
            total_production_volume, certified_volume,
            verified_volume_1st_party, verified_volume_2nd_party, verified_volume_3rd_party,
            total_product_volume
        ) VALUES (
            $1, 'TEST_PCF', 'TEST_SUP', 'draft',
            'ABC Automotive Pvt Ltd', 'BPNL000123',
            'Front Bumper Bracket', 'FBB-001', 2,
            'Piece', 1,
            '2025-01-01', '2025-12-31',
            FALSE, TRUE, TRUE,
            'AR6',
            40000, 25000,
            10000, 5000,
            10000, 8000, 10000, 0, 5000, 10000
        )`,
        [responseId]
    );

    await client.query(
        `INSERT INTO sq_q4_sites (id, response_id, site_name, country, region, country_subdivision, is_primary, row_order)
         VALUES ($1, $2, 'Mysuru Plant', 'IN', 'Asia', 'IN-KA', TRUE, 0)`,
        [siteId, responseId]
    );

    // ── Q8 BOM: 3 materials (Aluminium 75%, Manganese 20%, Iron Ore 5%) ──
    // material text = manager's "Specific type" (so the EF matcher can hit it).
    // material = Category; plus sub_category / group_name / specific_type — the
    // 4-level cascade that pins the exact EF (engine does an exact lookup).
    await client.query(
        `INSERT INTO sq_q8_bom (
            id, response_id, component_name, material, sub_category, group_name, specific_type, process,
            mass_pct, carbon_pct, biogenic_y_n, biogenic_carbon_pct,
            recycled_y_n, recycled_carbon_pct, row_order
         ) VALUES
            ($1, $2, 'Aluminium', 'Metal Materials', 'Aluminium', 'Smelter Cathode Part / Surface Treatment / Welding', 'Welding - Arc, Aluminium (Europe)', NULL, 75, 0.80, FALSE, 0, TRUE, 25, 0),
            ($3, $2, 'Manganese', 'Metal Materials', 'Manganese', 'Ferromanganese (FeMn) / Manganese / Manganese Concentrate', 'Manganese - Regional Supply (RER)', NULL, 20, 85, FALSE, 0, TRUE, 10, 1),
            ($4, $2, 'Iron Ore', 'Minerals & Fillers', 'Minerals', 'Iron Ore', 'Iron Ore - 65% Fe, Ore Concentrate (Global)', NULL, 5, 50, FALSE, 0, FALSE, 0, 2)`,
        [ids.m1, responseId, ids.m2, ids.m3]
    );

    // ── Q10 electricity (factory-allocation model uses the main-row factory fields) ──
    await client.query(
        `INSERT INTO sq_q10_electricity (
            id, response_id, electricity_type, quantity, unit, renewable_pct, row_order
         ) VALUES ($1, $2, 'Electricity Imports (USA)', 0, 'kWh', 0, 0)`,
        [ids.elec, responseId]
    );

    // ── Q12 process gases: CO2 / CH4 / N2O (engine applies AR6 GWP) ──
    await client.query(
        `INSERT INTO sq_q12_process_gases (
            id, response_id, direct_process_gas, quantity, unit, fossil_or_biogenic, row_order
         ) VALUES
            ($1, $2, 'CO₂', 0.3,    'kg', 'fossil', 0),
            ($3, $2, 'CH₄', 0.001,  'kg', 'fossil', 1),
            ($4, $2, 'N₂O', 0.0005, 'kg', 'fossil', 2)`,
        [ids.g1, responseId, ids.g2, ids.g3]
    );

    // ── Q16 packaging: corrugated board + LDPE film ──
    await client.query(
        `INSERT INTO sq_q16_packaging_materials (
            id, response_id, packaging_type, packaging_weight, unit, country, region, recycled_pct, carbon_biogenic_pct, row_order
         ) VALUES
            ($1, $2, 'Packaging - Corrugated Board, Mixed Fibre, Single Wall (Switzerland)', 0.25, 'kg', 'IN', 'Asia', 0, 0, 0),
            ($3, $2, 'Packaging Film - Low-density Polyethylene (Europe)', 0.05, 'kg', 'IN', 'Asia', 0, 0, 1)`,
        [ids.pk1, responseId, ids.pk2]
    );

    // ── Q19 transport: truck → aircraft → truck (mass 2.3 kg per leg) ──
    await client.query(
        `INSERT INTO sq_q19_transport_legs (
            id, response_id, transport_mode, source, destination, weight, unit, distance_km, row_order
         ) VALUES
            ($1, $2, 'Transport - Freight, Lorry, 7.5t-16t Gross Weight, Fleet Average (Europe)', 'Mysore',   'Hyderabad', 2.3, 'kg', 300,   0),
            ($3, $2, 'Operation - Aircraft, Freight (Europe) [Legacy]',                            'Hyderabad','New York',  2.3, 'kg', 8000,  1),
            ($4, $2, 'Transport - Freight, Lorry, 7.5t-16t Gross Weight, Fleet Average (Europe)', 'New York', 'Australia', 2.3, 'kg', 12000, 2)`,
        [ids.t1, responseId, ids.t2, ids.t3]
    );

    // ── Q14 production waste (box) + Q17 packaging waste ──
    await client.query(
        `INSERT INTO sq_q14_production_waste (
            id, response_id, waste_type, treatment_type, quantity, unit, row_order
         ) VALUES ($1, $2, 'Aluminium Fraction - Mechanical Treatment, Shredder Mat. Of Manual Dismantling (Global) [Legacy]', 'Mechanical Treatment', 0.2, 'kg', 0)`,
        [ids.w1, responseId]
    );
    await client.query(
        `INSERT INTO sq_q17_packaging_waste (
            id, response_id, packaging_waste_type, treatment_type, quantity, unit, row_order
         ) VALUES ($1, $2, 'Disposal - Building, Plaster-cardboard Sandwich, To Recycling (Switzerland)', 'Recycling', 0.05, 'kg', 0)`,
        [ids.pw1, responseId]
    );
});

console.log("\n=== Running formula engine (manager's Front Bumper Bracket case) ===\n");
const start = Date.now();
let computed;
try {
    computed = await computePcfFields(responseId);
} catch (err) {
    console.error("❌ engine error:", err.message);
    console.error(err.stack);
    await cleanup();
    process.exit(1);
}
const ms = Date.now() - start;

console.log("\n=== computed fields ===");
console.log(JSON.stringify(computed, null, 2));
console.log(`\n⏱  elapsed: ${ms}ms`);

console.log("\n=== EXPECTED vs engine (manager's numbers) ===");
console.log("  carbon total   expected 0.402");
console.log("  carbon fossil  expected 0.365");
console.log("  carbon recycled expected 0.037");
console.log("  materials      expected 0.7886056   (depends on EF match)");
console.log("  packaging      expected 0.44379225  (depends on EF match)");
console.log("  electricity    expected 2.9156352   (3.2 kWh × 0.9111)");
console.log("  process gas    expected 0.4644      (GWP-based, no EF lookup)");
console.log("  transport      expected 34.31880048 (depends on EF match)");

console.log("\n=== ef_match_audit (which EF was picked per lookup) ===");
await withClient(async (client) => {
    const r = await client.query(
        `SELECT a.source_question, a.winning_ef_id, a.winning_score, a.confidence_band,
                ef.specific_type, ef.dataset_name, ef.geography, ef.unit, ef.gwp_100
           FROM ef_match_audit a
           LEFT JOIN emission_factors ef ON ef.ef_id = a.winning_ef_id
          WHERE a.response_id = $1
          ORDER BY a.source_question`,
        [responseId]
    );
    for (const row of r.rows) {
        const name = row.specific_type || row.dataset_name || "(no match)";
        console.log(
            `  ${String(row.source_question).padEnd(24)} ` +
            `${String(row.confidence_band).padEnd(8)} score=${String(row.winning_score ?? "-").padEnd(5)} ` +
            `→ ${name} | ${row.geography ?? "-"} | ${row.unit ?? "-"} | gwp=${row.gwp_100 ?? "-"}`
        );
    }
});

await cleanup();
console.log("\n🧹 cleanup done.");
process.exit(0);

async function cleanup() {
    await withClient(async (client) => {
        for (const t of [
            "pcf_computed_field", "ef_match_audit",
            "sq_q8_bom", "sq_q10_electricity", "sq_q12_process_gases",
            "sq_q14_production_waste", "sq_q16_packaging_materials",
            "sq_q17_packaging_waste", "sq_q19_transport_legs", "sq_q4_sites",
        ]) {
            await client.query(`DELETE FROM ${t} WHERE response_id = $1`, [responseId]);
        }
        await client.query(`DELETE FROM supplier_questionnaire_response WHERE id = $1`, [responseId]);
    });
}
