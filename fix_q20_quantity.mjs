// fix_q20_quantity.mjs
// -------------------------------------------------------------------
// One-off: the Q20 biomass quantity was entered as 2500 kg for a 2.5 kg
// product, producing a huge biogenic-uptake (negative PCF). This updates
// that one row's quantity to a realistic value. READ + single UPDATE only.
//
// RUN:  node fix_q20_quantity.mjs <RESPONSE_ID> <NEW_QTY>
//   e.g. node fix_q20_quantity.mjs 01KXDFCJ84N2F5P0AJ6837Z8HK 0.2
//
// Then click "Run PCF Calculation" again in the app.
// -------------------------------------------------------------------
import "dotenv/config";

const responseId = process.argv[2];
const newQty = process.argv[3];

if (!responseId || newQty === undefined) {
    console.error("❌ Usage: node fix_q20_quantity.mjs <RESPONSE_ID> <NEW_QTY>");
    process.exit(1);
}

const { withClient } = await import("./dist/util/database.js");

await withClient(async (client) => {
    const before = await client.query(
        `SELECT id, biomass_feedstock_type, quantity, unit
           FROM sq_q20_biomass_feedstock
          WHERE response_id = $1`,
        [responseId]
    );

    if (before.rows.length === 0) {
        console.error(`❌ No Q20 rows found for response ${responseId}`);
        process.exit(1);
    }

    console.log("BEFORE:");
    for (const r of before.rows) {
        console.log(`   [${r.id}] ${r.biomass_feedstock_type}  quantity=${r.quantity} ${r.unit ?? ""}`);
    }

    const upd = await client.query(
        `UPDATE sq_q20_biomass_feedstock
            SET quantity = $2
          WHERE response_id = $1`,
        [responseId, newQty]
    );

    const after = await client.query(
        `SELECT id, biomass_feedstock_type, quantity, unit
           FROM sq_q20_biomass_feedstock
          WHERE response_id = $1`,
        [responseId]
    );

    console.log(`\n✅ Updated ${upd.rowCount} row(s). AFTER:`);
    for (const r of after.rows) {
        console.log(`   [${r.id}] ${r.biomass_feedstock_type}  quantity=${r.quantity} ${r.unit ?? ""}`);
    }
    console.log("\n👉 Now click 'Run PCF Calculation' again in the app to recompute.");
});
