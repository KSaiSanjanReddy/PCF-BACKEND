import { withClient } from "../util/database.js";
import { ulid } from "ulid";
import { computePcfFields, mpnMatches } from "./formulaEngine.js";

// ============================================================
// "Run PCF Calculation" for the V3 (28-Q) questionnaire.
//
// For multi-component requests, each BOM (material_number / MPN) gets its OWN
// formula-engine run filtered to that MPN — never one combined total stamped
// onto every component.
// ============================================================

export type V3CalcResult = {
    v3: boolean;
    componentsCalculated: number;
    grandTotal: number;
};

// kg / g / t → tonnes, matching the engine's freight basis (t·km EFs).
function toTonnes(weight: number, unit?: string | null): number {
    const u = (unit ?? "").toLowerCase();
    if (u.includes("ton") || u === "t") return weight;
    if (u === "g" || u.includes("gram")) return weight / 1e6;
    return weight / 1000; // kg default
}

type ComponentWork = {
    bomId: string;
    mpn: string;
    productMassKg: number;
    // summary buckets
    material_value: number;
    production_value: number;
    packaging_value: number;
    waste_value: number;
    logistic_value: number;
    total_pcf_value: number;
    // detail source
    main: any;
    efByRow: Record<string, number>; // source_row_id → EF (gwp_100)
    q8: any[];
    q10: any[];
    q19: any[];
};

function rowMpn(row: any): string {
    return String(
        row?.mpn ??
            row?.product_id_or_mpn ??
            row?.packaging_product_id_or_mpn ??
            row?.mpn_code ??
            "",
    ).trim();
}

function massFromSnapshot(formSnapshot: any, mpn: string): number {
    let snap = formSnapshot;
    if (typeof snap === "string") {
        try {
            snap = JSON.parse(snap);
        } catch {
            return 0;
        }
    }
    const items = Array.isArray(snap?.product?.q3_items) ? snap.product.q3_items : [];
    const hit = items.find(
        (r: any) =>
            mpnMatches(r?.material_number, mpn) ||
            mpnMatches(r?.product_id, mpn) ||
            mpnMatches(r?.mpn, mpn),
    );
    const n = Number(hit?.declared_mass);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

async function collectComponent(
    bomPcfId: string,
    supplierId: string,
    materialNumber: string | null | undefined,
    weightGms: number | null | undefined,
): Promise<ComponentWork | null> {
    const meta = await withClient(async (client: any) => {
        const r = await client.query(
            `SELECT id, product_mass_per_declared_unit, form_snapshot
               FROM supplier_questionnaire_response
              WHERE bom_pcf_request_id = $1 AND supplier_id = $2
              ORDER BY created_date DESC NULLS LAST LIMIT 1`,
            [bomPcfId, supplierId],
        );
        return r.rowCount > 0 ? r.rows[0] : null;
    });
    if (!meta?.id) return null;

    const responseId = meta.id as string;
    const mpn = String(materialNumber ?? "").trim();

    // Declared mass for THIS component only (never reuse another MPN's mass).
    let productMassKg = mpn ? massFromSnapshot(meta.form_snapshot, mpn) : 0;
    if (!(productMassKg > 0) && weightGms != null && Number(weightGms) > 0) {
        productMassKg = Number(weightGms) / 1000;
    }
    if (!(productMassKg > 0)) {
        productMassKg = Number(meta.product_mass_per_declared_unit) || 0;
    }

    // Per-MPN engine run — do not overwrite response-level pcf_computed_field.
    const computed = await computePcfFields(responseId, {
        mpn: mpn || undefined,
        productMass: productMassKg > 0 ? productMassKg : undefined,
        persist: false,
    });
    const b = computed.breakdown;
    const material_value = b?.materials ?? 0;
    const production_value = b?.production ?? computed.productionStage.pcfIncludingBiogenicUptake;
    const packaging_value = b?.packaging ?? computed.packagingStage.pcfIncludingBiogenicUptake;
    const waste_value = b?.waste ?? 0;
    const logistic_value = b?.logistics ?? computed.distributionStage.pcfIncludingBiogenicUptake;

    return withClient(async (client: any) => {
        const main = (
            await client.query(
                `SELECT product_mass_per_declared_unit, factory_total_energy_kwh,
                        factory_total_weight_kg, component_total_weight_kg, component_num_products
                   FROM supplier_questionnaire_response WHERE id = $1`,
                [responseId],
            )
        ).rows[0];

        // Override mass shown in production detail with this component's mass.
        if (main) main.product_mass_per_declared_unit = productMassKg;

        const efRows = await client.query(
            `SELECT DISTINCT ON (a.source_row_id) a.source_row_id, ef.gwp_100
               FROM ef_match_audit a
               LEFT JOIN emission_factors ef ON ef.ef_id = a.winning_ef_id
              WHERE a.response_id = $1
              ORDER BY a.source_row_id, a.matched_at DESC`,
            [responseId],
        );
        const efByRow: Record<string, number> = {};
        for (const r of efRows.rows) efByRow[r.source_row_id] = Number(r.gwp_100) || 0;

        const q8All = (
            await client.query(
                `SELECT id, material, specific_type, mass_pct, product_id_or_mpn FROM sq_q8_bom
                  WHERE response_id = $1 ORDER BY row_order ASC, created_date ASC`,
                [responseId],
            )
        ).rows;
        const q10All = (
            await client.query(
                `SELECT id, electricity_type, mpn FROM sq_q10_electricity
                  WHERE response_id = $1 ORDER BY row_order ASC, created_date ASC`,
                [responseId],
            )
        ).rows;
        const q19All = (
            await client.query(
                `SELECT id, transport_mode, source, destination, weight, unit, distance_km, product_id_or_mpn
                   FROM sq_q19_transport_legs
                  WHERE response_id = $1 ORDER BY row_order ASC, created_date ASC`,
                [responseId],
            )
        ).rows;

        const q8 = mpn
            ? q8All.filter((r: any) => mpnMatches(rowMpn(r), mpn))
            : q8All;
        const q10 = mpn
            ? q10All.filter((r: any) => mpnMatches(rowMpn(r), mpn))
            : q10All;
        const q19 = mpn
            ? q19All.filter((r: any) => mpnMatches(rowMpn(r), mpn))
            : q19All;

        return {
            bomId: "",
            mpn,
            productMassKg,
            material_value,
            production_value,
            packaging_value,
            waste_value,
            logistic_value,
            total_pcf_value:
                material_value + production_value + packaging_value + waste_value + logistic_value,
            main,
            efByRow,
            q8,
            q10,
            q19,
        };
    });
}

// Writes all result + detail rows for one component (inside a transaction).
async function writeComponent(client: any, w: ComponentWork, bomPcfId: string) {
    const { bomId } = w;
    const productMass = Number(w.productMassKg) || Number(w.main?.product_mass_per_declared_unit) || 0;
    const factoryEnergy = Number(w.main?.factory_total_energy_kwh) || 0;
    const factoryWeight = Number(w.main?.factory_total_weight_kg) || 0;

    // ---- summary (Footprint Overview) ----
    await client.query(
        `DELETE FROM bom_emission_calculation_engine WHERE bom_id = $1 AND product_id IS NULL`,
        [bomId],
    );
    await client.query(
        `INSERT INTO bom_emission_calculation_engine
            (id, bom_id, product_id, product_bom_pcf_id, material_value, production_value,
             packaging_value, logistic_value, waste_value, total_pcf_value)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)`,
        [
            ulid(),
            bomId,
            bomPcfId,
            w.material_value,
            w.production_value,
            w.packaging_value,
            w.logistic_value,
            w.waste_value,
            w.total_pcf_value,
        ],
    );

    // ---- material detail (Emissions Breakdown) ----
    await client.query(
        `DELETE FROM bom_emission_material_calculation_engine WHERE bom_id = $1 AND product_id IS NULL`,
        [bomId],
    );
    for (const row of w.q8) {
        const massPct = Number(row.mass_pct) || 0;
        const compMass = productMass * (massPct / 100);
        const ef = w.efByRow[row.id] ?? 0;
        await client.query(
            `INSERT INTO bom_emission_material_calculation_engine
                (id, bom_id, product_id, product_bom_pcf_id, material_type,
                 material_composition, material_composition_weight, material_emission_factor, material_emission)
             VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8)`,
            [
                ulid(),
                bomId,
                bomPcfId,
                row.specific_type || row.material || "Material",
                massPct,
                compMass,
                ef,
                compMass * ef,
            ],
        );
    }

    // ---- production detail (Allocation tab) ----
    const perUnitKwh =
        factoryEnergy > 0 && factoryWeight > 0 && productMass > 0
            ? (productMass * factoryEnergy) / factoryWeight
            : 0;
    const elecEf = w.q10.length > 0 ? (w.efByRow[w.q10[0].id] ?? 0) : 0;
    await client.query(
        `DELETE FROM bom_emission_production_calculation_engine WHERE bom_id = $1 AND product_id IS NULL`,
        [bomId],
    );
    await client.query(
        `INSERT INTO bom_emission_production_calculation_engine
            (id, bom_id, product_id, product_bom_pcf_id, component_weight_kg, allocation_methodology,
             total_electrical_energy_consumed_at_factory_level_kWh, total_energy_consumed_at_factory_level_kWh,
             total_weight_produced_at_factory_level_kg, no_of_products_current_component_produced,
             total_weight_of_current_component_produced_kg, production_electricity_energy_use_per_unit_kWh,
             emission_factor_of_electricity)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
            ulid(),
            bomId,
            bomPcfId,
            productMass,
            "Physical",
            factoryEnergy,
            factoryEnergy,
            factoryWeight,
            Number(w.main?.component_num_products) || 0,
            Number(w.main?.component_total_weight_kg) || 0,
            perUnitKwh,
            elecEf,
        ],
    );

    // ---- logistics: routes + per-leg emissions ----
    await client.query(
        `DELETE FROM mode_of_transport_used_for_transportation_questions WHERE bom_id = $1`,
        [bomId],
    );
    await client.query(
        `DELETE FROM bom_emission_logistic_calculation_engine WHERE bom_id = $1 AND product_id IS NULL`,
        [bomId],
    );
    for (const leg of w.q19) {
        const dist = Number(leg.distance_km) || 0;
        const weight = Number(leg.weight) || 0;
        const tonnes = toTonnes(weight, leg.unit);
        const ef = w.efByRow[leg.id] ?? 0;
        const legEmission = dist * tonnes * ef;

        await client.query(
            `INSERT INTO mode_of_transport_used_for_transportation_questions
                (motuft_id, bom_id, product_bom_pcf_id, mode_of_transport, weight_transported,
                 source_point, drop_point, distance)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                ulid(),
                bomId,
                bomPcfId,
                leg.transport_mode ?? null,
                weight != null ? String(weight) : null,
                leg.source ?? null,
                leg.destination ?? null,
                dist != null ? String(dist) : null,
            ],
        );
        await client.query(
            `INSERT INTO bom_emission_logistic_calculation_engine
                (id, bom_id, product_id, product_bom_pcf_id, mode_of_transport, mass_transported_kg,
                 mass_transported_ton, distance_km, transport_mode_emission_factor_value_kg_co2e_t_km,
                 leg_wise_transport_emissions_per_unit_kg_co2e)
             VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)`,
            [ulid(), bomId, bomPcfId, leg.transport_mode ?? null, weight, tonnes, dist, ef, legEmission],
        );
    }

    await client.query(`UPDATE bom SET is_bom_calculated = TRUE WHERE id = $1`, [bomId]);
}

/**
 * Compute + persist V3 PCF results (summary + all detail tables) for every BOM
 * component of a request, then advance the workflow to Result Validation.
 * Returns { v3: false } when the request has no V3 questionnaire responses.
 */
export async function runV3PcfCalculation(
    bomPcfId: string,
    userId: string,
): Promise<V3CalcResult> {
    const components: {
        id: string;
        supplier_id: string;
        material_number: string | null;
        weight_gms: number | null;
    }[] = await withClient(
        async (client: any) =>
            (
                await client.query(
                    `SELECT id, supplier_id, material_number, weight_gms
                       FROM bom WHERE bom_pcf_id = $1`,
                    [bomPcfId],
                )
            ).rows,
    );

    const work: ComponentWork[] = [];
    for (const comp of components) {
        if (!comp.supplier_id) continue;
        const w = await collectComponent(
            bomPcfId,
            comp.supplier_id,
            comp.material_number,
            comp.weight_gms != null ? Number(comp.weight_gms) : null,
        );
        if (!w) continue;
        w.bomId = comp.id;
        work.push(w);
        console.log(
            `[pcfCalcV3] bom=${comp.id} mpn=${w.mpn || "(none)"} mass=${w.productMassKg}kg ` +
                `total=${w.total_pcf_value} ` +
                `(mat=${w.material_value} prod=${w.production_value} pkg=${w.packaging_value} ` +
                `waste=${w.waste_value} log=${w.logistic_value})`,
        );
    }

    if (work.length === 0) return { v3: false, componentsCalculated: 0, grandTotal: 0 };

    let grandTotal = 0;
    await withClient(async (client: any) => {
        await client.query("BEGIN");
        try {
            for (const w of work) {
                await writeComponent(client, w, bomPcfId);
                grandTotal += w.total_pcf_value;
            }
            await client.query(
                `UPDATE pcf_request_stages
                    SET is_pcf_calculated = TRUE, pcf_calculated_by = $2,
                        pcf_calculated_date = NOW(), update_date = NOW()
                  WHERE bom_pcf_id = $1`,
                [bomPcfId, userId],
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    });

    return { v3: true, componentsCalculated: work.length, grandTotal };
}
