// One-time backfill: mark every BOM component that already has a V3 calc-engine
// result as `is_bom_calculated = TRUE`. The Analytics Center reports all filter
// on this flag; the V3 "Run PCF Calculation" used to compute results without
// setting it (now fixed going forward — this catches the already-calculated ones).
//
// SAFE BY DEFAULT: dry run (BEGIN → update → ROLLBACK) prints the count only.
// Pass --confirm to actually COMMIT.
//
//   node backfill_bom_calculated.mjs            # dry run (safe)
//   node backfill_bom_calculated.mjs --confirm  # apply
import "dotenv/config";
const { withClient } = await import("./dist/util/database.js");

const CONFIRM = process.argv.includes("--confirm");

await withClient(async (client) => {
    await client.query("BEGIN");
    try {
        const upd = await client.query(
            `UPDATE bom SET is_bom_calculated = TRUE
              WHERE id IN (SELECT DISTINCT bom_id FROM bom_emission_calculation_engine WHERE product_id IS NULL)
                AND is_bom_calculated = FALSE`
        );
        const now = (await client.query(
            `SELECT COUNT(*)::int n FROM bom WHERE is_bom_calculated = TRUE`
        )).rows[0].n;
        console.log(`BOMs ${CONFIRM ? "updated" : "that WOULD be updated"}: ${upd.rowCount}`);
        console.log(`Total is_bom_calculated=TRUE after: ${now}`);

        if (CONFIRM) { await client.query("COMMIT"); console.log("\n✅ COMMITTED — reports will now show these components."); }
        else { await client.query("ROLLBACK"); console.log("\n🧪 DRY RUN — rolled back, nothing changed. Re-run with --confirm to apply."); }
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("❌ ROLLBACK (error):", e.message);
    }
});
process.exit(0);
