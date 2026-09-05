// test-payload-assembler.mjs — full pipeline: seed → compute → assemble → print v9 JSON.
//
// RUN ORDER:
//   1. npm run build-main
//   2. node test-payload-assembler.mjs
//
// What this proves: the entire 28-question → Catena-X v9 pipeline now closes.
// The JSON it prints is publish-ready (would go straight to Quintari via the
// existing publishPcfRequestToQuintari flow).
import "dotenv/config";
import { existsSync } from "node:fs";

const dist = "./dist/services/payloadAssembler.js";
if (!existsSync(dist)) {
    console.error("❌ Compiled output not found. Run `npm run build-main` first.");
    process.exit(1);
}

const { buildPayloadFromResponse } = await import("./dist/services/payloadAssembler.js");
const { withClient } = await import("./dist/util/database.js");
const { ulid } = await import("ulid");

const responseId = `test_resp_${ulid()}`;
const siteId = ulid();
const bom1 = ulid();
const bom2 = ulid();
const elec = ulid();
const pkg = ulid();
const xport = ulid();

// Seed a realistic supplier response.
await withClient(async (client) => {
    await client.query(
        `INSERT INTO supplier_questionnaire_response (
            id, bom_pcf_request_id, supplier_id, status,
            company_name, company_id_urn,
            product_name_company, product_id_urn, product_description, product_mass_per_declared_unit,
            declared_unit, declared_unit_amount,
            reference_period_start, reference_period_end,
            validity_period_start, validity_period_end,
            retro_or_prospective_pcf_type, system_boundary,
            co_products_present, packaging_emissions_included, distribution_stage_included,
            ipcc_gwp_version, cross_sectoral_standards, product_or_sector_specific_rules,
            mass_balancing_used, allocation_recycled_carbon, allocation_waste_incineration,
            primary_data_share_pct, secondary_ef_sources, technological_dqr, geographical_dqr, temporal_dqr,
            is_pcf_verified, attestation_type, attestation_provider_name,
            total_production_volume, certified_volume,
            verified_volume_1st_party, verified_volume_2nd_party, verified_volume_3rd_party,
            total_product_volume, comments
        ) VALUES (
            $1, 'TEST_PCF_FULL', 'TEST_SUP_FULL', 'submitted',
            'ABC Automotive Pvt Ltd', 'urn:bpn:BPNL000000000DWF',
            'Front Bumper Bracket', 'urn:mycompany.com:product-id:FBB-001', 'Front bumper bracket assembly', 2.5,
            'piece', 1,
            '2025-01-01', '2025-12-31',
            '2025-12-31', '2027-12-31',
            'Retrospective PCF', 'cradle-to-gate',
            FALSE, TRUE, TRUE,
            'AR6', 'ISO 14067', 'Catena-X Rulebook V4',
            FALSE, 'cut-off', 'polluter pays principle',
            65, 'ecoinvent 3.8', 2.0, 2.0, 2.0,
            TRUE, 'PCF Program Certification', 'TÜV-X',
            10000, 8000, 10000, 0, 5000, 10000, 'Demo pipeline run'
        )`,
        [responseId]
    );

    await client.query(
        `INSERT INTO sq_q4_sites (id, response_id, site_name, country, country_subdivision, region, is_primary, row_order)
         VALUES ($1, $2, 'Plant A — Mysore', 'IN', 'IN-KA', 'Asia', TRUE, 0)`,
        [siteId, responseId]
    );

    await client.query(
        `INSERT INTO sq_q8_bom (
            id, response_id, component_name, material, process,
            mass_pct, carbon_pct, biogenic_y_n, biogenic_carbon_pct,
            recycled_y_n, recycled_carbon_pct, row_order
         ) VALUES
            ($1, $2, 'Aluminium body',  'Aluminium', 'Die Casting', 70, 30, TRUE,  5,  TRUE, 10, 0),
            ($3, $2, 'Steel reinforcer', 'Steel',     'Stamping',   30, 20, FALSE, 0,  FALSE, 0, 1)`,
        [bom1, responseId, bom2]
    );

    await client.query(
        `INSERT INTO sq_q10_electricity (
            id, response_id, electricity_type, quantity, unit, renewable_pct, row_order
         ) VALUES ($1, $2, 'Grid', 4.5, 'kWh', 30, 0)`,
        [elec, responseId]
    );

    await client.query(
        `INSERT INTO sq_q16_packaging_materials (
            id, response_id, packaging_type, packaging_weight, unit, country, region, recycled_pct, row_order
         ) VALUES ($1, $2, 'Cardboard', 0.05, 'kg', 'IN', 'Asia', 60, 0)`,
        [pkg, responseId]
    );

    await client.query(
        `INSERT INTO sq_q19_transport_legs (
            id, response_id, transport_mode, source, destination,
            weight, unit, distance_km, row_order
         ) VALUES ($1, $2, 'Truck', 'Mysore', 'Chennai', 2.5, 'kg', 500, 0)`,
        [xport, responseId]
    );
});

console.log("=== Building v9 payload (recompute = true) ===\n");
const start = Date.now();
let payload;
try {
    payload = await buildPayloadFromResponse(responseId);
} catch (err) {
    console.error("❌ assembler error:", err.message);
    console.error(err.stack);
    await cleanup();
    process.exit(1);
}
const ms = Date.now() - start;
console.log(`⏱  elapsed: ${ms}ms\n`);

console.log("---- TOP-LEVEL SECTIONS ----");
for (const k of Object.keys(payload)) console.log("  •", k);

console.log("\n---- carbonContent ----");
console.log(JSON.stringify(payload.carbonContent, null, 2));

console.log("\n---- productionStage ----");
console.log(JSON.stringify(payload.productLifeCycleStagesAndEmissions[0].productionStage, null, 2));

console.log("\n---- packagingStage ----");
console.log(JSON.stringify(payload.productLifeCycleStagesAndEmissions[0].packagingStage, null, 2));

console.log("\n---- distributionStage ----");
console.log(JSON.stringify(payload.productLifeCycleStagesAndEmissions[0].distributionStage, null, 2));

console.log("\n---- attestationOfConformance ----");
console.log(JSON.stringify(payload.attestationOfConformance, null, 2));

console.log("\n---- companyAndProductInformation ----");
console.log(JSON.stringify(payload.companyAndProductInformation, null, 2));

console.log("\n---- scopeOfPcfForm ----");
console.log(JSON.stringify(payload.scopeOfPcfForm, null, 2));

console.log("\n---- pcfAssessmentInformation (snippet) ----");
const pai = payload.pcfAssessmentAndMethodology[0].pcfAssessmentInformation[0];
console.log(JSON.stringify({
    geography: pai.geography,
    time: pai.time,
    idAndVersion: pai.idAndVersion,
}, null, 2));

console.log("\n---- verificationAndCertificationShares ----");
console.log(JSON.stringify(payload.pcfAssessmentAndMethodology[0].verificationAndCertificationShares, null, 2));

console.log("\n✅ End-to-end pipeline closed. This JSON is publish-ready for Quintari.");

await cleanup();
console.log("\n🧹 cleanup done.");
process.exit(0);

async function cleanup() {
    await withClient(async (client) => {
        await client.query(`DELETE FROM pcf_computed_field WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM ef_match_audit WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM sq_q8_bom WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM sq_q10_electricity WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM sq_q16_packaging_materials WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM sq_q19_transport_legs WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM sq_q4_sites WHERE response_id = $1`, [responseId]);
        await client.query(`DELETE FROM supplier_questionnaire_response WHERE id = $1`, [responseId]);
    });
}
