import "dotenv/config";
const { withClient } = await import("./dist/util/database.js");
await withClient(async (client) => {
  const r = await client.query(
    `SELECT id FROM supplier_questionnaire_response WHERE bom_pcf_request_id='TEST_PCF' AND supplier_id='TEST_SUP'`
  );
  for (const row of r.rows) {
    const rid = row.id;
    for (const t of ["pcf_computed_field","ef_match_audit","sq_q8_bom","sq_q10_electricity","sq_q12_process_gases","sq_q14_production_waste","sq_q16_packaging_materials","sq_q17_packaging_waste","sq_q19_transport_legs","sq_q4_sites"]) {
      await client.query(`DELETE FROM ${t} WHERE response_id=$1`, [rid]);
    }
    await client.query(`DELETE FROM supplier_questionnaire_response WHERE id=$1`, [rid]);
    console.log("cleared stale response", rid);
  }
  if (r.rows.length === 0) console.log("no stale rows found");
});
process.exit(0);
