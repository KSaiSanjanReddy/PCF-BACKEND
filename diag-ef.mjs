// diag-ef.mjs — read-only: show what emission_factors rows exist for each of
// the manager's test-case materials, so we can see (a) whether the right rows
// exist and (b) their actual gwp_100 vs the manager's expected EF.
//   RUN: node diag-ef.mjs
import "dotenv/config";
const { withClient } = await import("./dist/util/database.js");

// term = ILIKE search, expected = manager's EF value for reference.
const probes = [
    { label: "Aluminium / Welding", expected: 0.1095, terms: ["%aluminium%welding%", "%welding%aluminium%", "%aluminium%"] },
    { label: "Manganese",           expected: 1.5578, terms: ["%manganese%regional%", "%manganese%"] },
    { label: "Iron Ore",            expected: 0.0130, terms: ["%iron ore%65%", "%iron ore%"] },
    { label: "Electricity Imports USA", expected: 0.9111, terms: ["%electricity imports%usa%", "%electricity imports%"] },
    { label: "Corrugated Board",    expected: 1.2180, terms: ["%corrugated%"] },
    { label: "LDPE Film",           expected: 2.7859, terms: ["%low-density polyethylene%", "%ldpe%", "%polyethylene%film%"] },
    { label: "Truck/Lorry freight", expected: 0.4326, terms: ["%lorry%7.5%16%", "%freight%lorry%", "%truck%"] },
    { label: "Aircraft freight",    expected: 1.2000, terms: ["%aircraft%freight%", "%aircraft%"] },
];

await withClient(async (client) => {
    for (const p of probes) {
        console.log(`\n========== ${p.label}  (manager EF = ${p.expected}) ==========`);
        let found = false;
        for (const term of p.terms) {
            const r = await client.query(
                `SELECT domain, specific_type, geography, unit, gwp_100
                   FROM emission_factors
                  WHERE specific_type ILIKE $1 OR dataset_name ILIKE $1
                  ORDER BY gwp_100 DESC
                  LIMIT 6`,
                [term]
            );
            if (r.rows.length > 0) {
                console.log(`  term "${term}" → ${r.rows.length} rows:`);
                for (const row of r.rows) {
                    console.log(`     [${row.domain}] ${row.specific_type} | ${row.geography} | ${row.unit} | gwp=${row.gwp_100}`);
                }
                found = true;
                break; // first term that hits is enough
            }
        }
        if (!found) console.log(`  ❌ no rows for any term`);
    }
});
process.exit(0);
