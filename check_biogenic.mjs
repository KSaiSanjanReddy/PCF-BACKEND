// READ-ONLY: shows biogenicCarbonContent OLD vs NEW for a response, using the
// real Q8 (sq_q8_bom) data. No writes. Run: node check_biogenic.mjs [responseId]
import * as dotenv from "dotenv";
import pkg from "pg";
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD, port: Number(process.env.DB_PORT) || 5432, ssl: false,
});
const RID = process.argv[2] || "01KX0AQ7428XDWTA2X1K74XVM1";
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v)); return Number.isFinite(n) ? n : 0; };

const c = await pool.connect();
try {
  const main = (await c.query(
    `SELECT product_name_company, product_mass_per_declared_unit FROM supplier_questionnaire_response WHERE id=$1`, [RID]
  )).rows[0];
  if (!main) { console.log("No response", RID); process.exit(0); }
  const productMass = num(main.product_mass_per_declared_unit);
  console.log(`Product: ${main.product_name_company}   productMass = ${productMass} kg\n`);

  const rows = (await c.query(`SELECT * FROM sq_q8_bom WHERE response_id=$1`, [RID])).rows;
  console.log(`Q8 materials: ${rows.length}\n`);

  let oldBio = 0, newBio = 0;
  for (const r of rows) {
    const massPct = num(r.mass_pct), carbonPct = num(r.carbon_pct), bioPct = num(r.biogenic_carbon_pct);
    const componentMass = productMass * (massPct / 100);
    const isBio = !!r.biogenic_y_n;
    const oldC = isBio ? componentMass * (carbonPct/100) * (bioPct/100) : 0; // 3-factor (old)
    const newC = isBio ? componentMass * (bioPct/100) : 0;                    // 2-factor (new)
    oldBio += oldC; newBio += newC;
    console.log(`  ${r.material || "(material)"}: mass%=${massPct} carbon%=${carbonPct} biogenic%=${bioPct} biogenic?=${JSON.stringify(r.biogenic_y_n)}`);
    console.log(`     material kg = ${componentMass.toFixed(6)}  | OLD bio=${oldC.toFixed(6)}  NEW bio=${newC.toFixed(6)}`);
  }
  console.log(`\n=== biogenicCarbonContent ===`);
  console.log(`OLD (3-factor, mass×carbon%×biogenic%) = ${oldBio.toFixed(6)}`);
  console.log(`NEW (2-factor, mass×biogenic%)         = ${newBio.toFixed(6)}`);
} finally { c.release(); await pool.end(); }
