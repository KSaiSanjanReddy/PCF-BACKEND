// Resets a PCF request back to the "PCF Calculation" stage so you can re-test
// the Run PCF Calculation button. Usage: node reset_pcf_stage.mjs <bom_pcf_id>
import "dotenv/config";
const { withClient } = await import("./dist/util/database.js");

const bomPcfId = process.argv[2] || "01KW92HAVW5YAT79K8KD3361J4";

await withClient(async (client) => {
  await client.query("BEGIN");
  try {
    // Back to PCF Calculation stage: DQR done, PCF not yet calculated.
    await client.query(
      `UPDATE pcf_request_stages
          SET is_pcf_calculated = FALSE,
              is_result_validation_verified = FALSE,
              is_result_submitted = FALSE,
              pcf_calculated_by = NULL,
              pcf_calculated_date = NULL,
              update_date = NOW()
        WHERE bom_pcf_id = $1`,
      [bomPcfId]
    );
    // Clear any previously written result rows for this request's components.
    await client.query(
      `DELETE FROM bom_emission_calculation_engine
        WHERE bom_id IN (SELECT id FROM bom WHERE bom_pcf_id = $1)`,
      [bomPcfId]
    );
    await client.query("COMMIT");
    console.log("Reset to PCF Calculation stage:", bomPcfId);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Reset failed:", e.message);
  }
});
process.exit(0);
