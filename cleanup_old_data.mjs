// Cleanup: remove all transactional data for PCF requests created BEFORE the
// cutoff (keep July 1, 2026 onward). KEEPS users + master/reference data.
//
// SAFE BY DEFAULT: runs as a DRY RUN (BEGIN → delete → ROLLBACK) and only prints
// what WOULD be deleted. Nothing changes. Pass --confirm to actually COMMIT.
//
//   node cleanup_old_data.mjs            # dry run (safe, shows counts)
//   node cleanup_old_data.mjs --confirm  # real delete (after backup!)
//
// Table lists are derived live from information_schema (no hardcoded names).
import "dotenv/config";
const { withClient } = await import("./dist/util/database.js");

const CONFIRM = process.argv.includes("--confirm");
const CUTOFF = "2026-07-01";

// FK column → which "old id set" it maps to.
const FK_TO_SET = {
    bom_id: "oldBom",
    response_id: "oldResp",
    sgiq_id: "oldSgiq",
    own_emission_id: "oldOwnem",
    product_bom_pcf_id: "oldReq",
    bom_pcf_id: "oldReq",
    bom_pcf_request_id: "oldReq",
};
// Delete grandchildren first, then level-1 parents, then root.
const FK_ORDER = [
    "bom_id", "response_id", "sgiq_id", "own_emission_id", "product_bom_pcf_id",
    "bom_pcf_id", "bom_pcf_request_id",
];

await withClient(async (client) => {
    await client.query("BEGIN");
    try {
        // Disable FK checks for the bulk delete so table order doesn't matter.
        // Safe here because we delete ALL old-set rows across every table, so no
        // row is left referencing a deleted parent. Re-enabled before commit.
        await client.query("SET session_replication_role = 'replica'");
        // ---- old id sets (computed upfront so delete order can't affect them) ----
        const ids = async (sql, col, param) =>
            (await client.query(sql, param)).rows.map((r) => r[col]);
        const oldReq = await ids(`SELECT id FROM bom_pcf_request WHERE created_date < $1`, "id", [CUTOFF]);
        const sets = {
            oldReq,
            oldBom: await ids(`SELECT id FROM bom WHERE bom_pcf_id = ANY($1)`, "id", [oldReq]),
            oldResp: await ids(`SELECT id FROM supplier_questionnaire_response WHERE bom_pcf_request_id = ANY($1)`, "id", [oldReq]),
            oldSgiq: await ids(`SELECT sgiq_id FROM supplier_general_info_questions WHERE bom_pcf_id = ANY($1)`, "sgiq_id", [oldReq]),
            oldOwnem: await ids(`SELECT id FROM own_emission WHERE bom_pcf_id = ANY($1)`, "id", [oldReq]),
        };
        console.log(`Old (before ${CUTOFF}) — requests=${oldReq.length}, boms=${sets.oldBom.length}, ` +
            `responses=${sets.oldResp.length}, sgiq=${sets.oldSgiq.length}, own_emission=${sets.oldOwnem.length}`);

        let total = 0;
        for (const col of FK_ORDER) {
            const setName = FK_TO_SET[col];
            const arr = sets[setName];
            if (!arr || arr.length === 0) continue;
            const tables = (await client.query(
                `SELECT table_name FROM information_schema.columns
                  WHERE table_schema='public' AND column_name=$1 ORDER BY table_name`, [col]
            )).rows.map((r) => r.table_name);
            for (const t of tables) {
                try {
                    const r = await client.query(`DELETE FROM ${t} WHERE ${col} = ANY($1)`, [arr]);
                    if (r.rowCount > 0) { console.log(`  ${t} (${col}): ${r.rowCount}`); total += r.rowCount; }
                } catch (e) { console.log(`  ⚠️ skip ${t} (${col}): ${e.message}`); }
            }
        }

        // ---- root: the old requests themselves ----
        const rr = await client.query(`DELETE FROM bom_pcf_request WHERE created_date < $1`, [CUTOFF]);
        console.log(`  bom_pcf_request: ${rr.rowCount}`); total += rr.rowCount;

        // ---- products: old ones NOT still referenced by a kept (July1+) request ----
        const keepCodes = (await client.query(
            `SELECT DISTINCT product_code FROM bom_pcf_request WHERE created_date >= $1 AND product_code IS NOT NULL`, [CUTOFF]
        )).rows.map((r) => r.product_code);
        const pr = await client.query(
            `DELETE FROM product WHERE created_date < $1 AND (product_code IS NULL OR product_code <> ALL($2))`,
            [CUTOFF, keepCodes]
        );
        console.log(`  product: ${pr.rowCount} (kept product_codes referenced by new requests: ${keepCodes.length})`); total += pr.rowCount;

        // ---- verify the KEEP set is untouched ----
        const keepReq = (await client.query(`SELECT COUNT(*)::int n FROM bom_pcf_request WHERE created_date >= $1`, [CUTOFF])).rows[0].n;
        const keepProd = (await client.query(`SELECT COUNT(*)::int n FROM product WHERE created_date >= $1`, [CUTOFF])).rows[0].n;
        console.log(`\nTOTAL rows ${CONFIRM ? "DELETED" : "that WOULD be deleted"}: ${total}`);
        console.log(`KEEP check — requests from ${CUTOFF}: ${keepReq} | products: ${keepProd} (should stay 3 / 2)`);

        await client.query("SET session_replication_role = 'origin'"); // re-enable FK checks
        if (CONFIRM) { await client.query("COMMIT"); console.log("\n✅ COMMITTED — cleanup applied."); }
        else { await client.query("ROLLBACK"); console.log("\n🧪 DRY RUN — rolled back, NOTHING changed. Re-run with --confirm to apply."); }
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("❌ ROLLBACK (error):", e.message);
    }
});
process.exit(0);
