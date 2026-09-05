import { withClient } from "../util/database.js";
import { ulid } from "ulid";

// ============================================================
// DQR for the V3 (28-Q) questionnaire.
//
// The legacy DQR page reads 50 per-question dqr_* tables that only the old
// scope-1-4 questionnaire populates, so for a V3 request it shows "0 data
// points". This module derives one rateable DQR data point per V3 emission
// line (sq_q8_bom / sq_q10_electricity / sq_q12 / sq_q14 / sq_q16 / sq_q17 /
// sq_q19) and returns it in the EXACT shape the existing page consumes:
//   { qv8: [ { sgiq_id, source_row_id, response_id, data, ter_*, ... } ], qv10: [...], ... }
// Saved ratings live in one new table, dqr_v3_rating, keyed by
// (response_id, source_row_id). Keys are prefixed "qv" so they pass the page's
// `key.startsWith('q')` filter without colliding with legacy q9/q16/... keys.
// ============================================================

// One entry per emission-line table we expose as DQR data points. `build`
// turns a DB row into the `data` object the page parses for its display label
// (formatDataPointDisplay keys on component_name / material_type / waste_type /
// transport_mode / energy_type / name).
type V3Source = {
    key: string;          // qv8, qv10, ... (the response key the page renders)
    table: string;        // emission-line table
    build: (r: any) => Record<string, any>;
};

const V3_SOURCES: V3Source[] = [
    {
        key: "qv8",
        table: "sq_q8_bom",
        build: (r) => ({
            component_name: r.component_name,
            material_type: r.material,
            type: r.specific_type,
            process: r.process,
            mass_pct: r.mass_pct,
        }),
    },
    {
        key: "qv10",
        table: "sq_q10_electricity",
        build: (r) => ({
            energy_type: r.electricity_type,
            name: r.electricity_type,
            generator_type: r.generator_type,
            quantity: r.quantity,
            unit: r.unit,
            renewable_pct: r.renewable_pct,
        }),
    },
    {
        key: "qv12",
        table: "sq_q12_process_gases",
        build: (r) => ({
            name: r.direct_process_gas,
            type: r.direct_process_gas,
            quantity: r.quantity,
            unit: r.unit,
            fossil_or_biogenic: r.fossil_or_biogenic,
        }),
    },
    {
        key: "qv14",
        table: "sq_q14_production_waste",
        build: (r) => ({
            component_name: r.component_name,
            waste_type: r.waste_type,
            treatment: r.treatment_type,
            quantity: r.quantity,
            unit: r.unit,
        }),
    },
    {
        key: "qv16",
        table: "sq_q16_packaging_materials",
        build: (r) => ({
            component_name: r.component_name,
            material_type: r.packaging_type,
            process: r.process_type,
            quantity: r.packaging_weight,
            unit: r.unit,
        }),
    },
    {
        key: "qv17",
        table: "sq_q17_packaging_waste",
        build: (r) => ({
            component_name: r.component_name,
            waste_type: r.packaging_waste_type,
            treatment: r.treatment_type,
            quantity: r.quantity,
            unit: r.unit,
        }),
    },
    {
        key: "qv19",
        table: "sq_q19_transport_legs",
        build: (r) => ({
            component_name: r.component_name,
            transport_mode: r.transport_mode,
            from: r.source,
            to: r.destination,
            distance_km: r.distance_km,
            weight: r.weight,
            unit: r.unit,
        }),
    },
];

// Map a V3 response (bom_pcf_request_id + supplier_id) onto an sgiq row.
// Returns null when this sgiq has no V3 questionnaire response (i.e. it is a
// legacy request) so the caller can fall back to the legacy DQR service.
async function resolveV3Response(
    client: any,
    sgiq_id: string
): Promise<{ responseId: string; bomPcfId: string; supId: string } | null> {
    const sgiq = await client.query(
        `SELECT bom_pcf_id, sup_id FROM supplier_general_info_questions WHERE sgiq_id = $1 LIMIT 1`,
        [sgiq_id]
    );
    if (sgiq.rowCount === 0) return null;
    const { bom_pcf_id, sup_id } = sgiq.rows[0];

    const resp = await client.query(
        `SELECT id FROM supplier_questionnaire_response
          WHERE bom_pcf_request_id = $1 AND supplier_id = $2
          ORDER BY created_date DESC NULLS LAST
          LIMIT 1`,
        [bom_pcf_id, sup_id]
    );
    if (resp.rowCount === 0) return null;

    return { responseId: resp.rows[0].id, bomPcfId: bom_pcf_id, supId: sup_id };
}

const TAG_FIELDS = [
    "ter_tag_type", "ter_tag_value", "ter_data_point",
    "tir_tag_type", "tir_tag_value", "tir_data_point",
    "gr_tag_type", "gr_tag_value", "gr_data_point",
    "c_tag_type", "c_tag_value", "c_data_point",
    "pds_tag_type", "pds_tag_value", "pds_data_point",
];

/**
 * Returns DQR data points for a V3 questionnaire in the page's expected shape,
 * or null when the sgiq is not a V3 request (caller falls back to legacy).
 */
export async function getV3DqrDataPoints(sgiq_id: string): Promise<Record<string, any[]> | null> {
    return withClient(async (client: any) => {
        const v3 = await resolveV3Response(client, sgiq_id);
        if (!v3) return null;

        const { responseId } = v3;
        const out: Record<string, any[]> = {};

        for (const src of V3_SOURCES) {
            // Each emission line LEFT JOINs its saved rating (dqr_v3_rating) and
            // its EF-match audit row so the assessor sees which factor was picked.
            // ef_match_audit can hold MORE THAN ONE row per emission line (the
            // formula engine appends a fresh audit row every time it runs — e.g.
            // at submit and again on "Run PCF Calculation"). A plain LEFT JOIN
            // would then emit one DQR data point per audit row (duplicates). Use
            // a LATERAL that keeps only the most recent audit row per line.
            const sql = `
                SELECT e.*,
                       ${TAG_FIELDS.map((f) => `r.${f} AS rating_${f}`).join(",\n                       ")},
                       a.winning_ef_id   AS ef_id,
                       a.confidence_band AS ef_confidence,
                       ef.specific_type  AS ef_name,
                       ef.geography      AS ef_geography,
                       ef.unit           AS ef_unit
                  FROM ${src.table} e
                  LEFT JOIN dqr_v3_rating r
                         ON r.response_id = e.response_id AND r.source_row_id = e.id
                  LEFT JOIN LATERAL (
                        SELECT winning_ef_id, confidence_band
                          FROM ef_match_audit
                         WHERE response_id = e.response_id AND source_row_id = e.id
                         ORDER BY matched_at DESC
                         LIMIT 1
                  ) a ON TRUE
                  LEFT JOIN emission_factors ef
                         ON ef.ef_id = a.winning_ef_id
                 WHERE e.response_id = $1
                 ORDER BY e.row_order ASC, e.created_date ASC`;

            const { rows } = await client.query(sql, [responseId]);

            out[src.key] = rows.map((row: any) => {
                const data = src.build(row);
                // Surface the matched EF as read-only context for the assessor.
                if (row.ef_name) {
                    data.matched_ef = row.ef_name;
                    data.ef_geography = row.ef_geography;
                    data.ef_confidence = row.ef_confidence;
                }
                // Display fallback: if the supplier left the descriptive fields
                // blank, label the card by its specific type / matched EF so it is
                // never a generic "(row)".
                if (!data.component_name && !data.name && !data.material_type &&
                    !data.waste_type && !data.transport_mode && !data.energy_type) {
                    data.name = row.specific_type || row.ef_name || row.group_name || undefined;
                }

                const item: Record<string, any> = {
                    // Order matters: getRecordUniqueId() returns the first non-sgiq
                    // *_id, so source_row_id (unique per line) must precede response_id.
                    sgiq_id,
                    source_row_id: row.id,
                    response_id: row.response_id,
                    source_question: src.key,
                    data: JSON.stringify(data),
                };
                // Saved rating tags (null when not yet rated).
                for (const f of TAG_FIELDS) item[f] = row[`rating_${f}`] ?? null;
                return item;
            });
        }

        return out;
    });
}

const V3_KEYS = new Set(V3_SOURCES.map((s) => s.key));

export function isV3DqrType(type: string): boolean {
    return V3_KEYS.has(type);
}

/**
 * Upsert V3 DQR ratings for one question type, then — if every emission line of
 * the response is now rated — advance the PCF-request workflow past DQR.
 */
export async function updateV3DqrRating(
    type: string,
    records: any[],
    updated_by: string
) {
    return withClient(async (client: any) => {
        await client.query("BEGIN");
        try {
            const results: any[] = [];
            let responseId: string | null = null;
            let sgiqId: string | null = null;

            for (const record of records) {
                const {
                    response_id,
                    source_row_id,
                    sgiq_id,
                    data,
                    ...tags
                } = record;

                if (!response_id || !source_row_id) {
                    throw new Error("response_id and source_row_id are required");
                }
                responseId = response_id;
                sgiqId = sgiq_id ?? sgiqId;

                const cols = TAG_FIELDS.filter((f) => tags[f] !== undefined);
                const setAssignments = cols.map((f) => `${f} = EXCLUDED.${f}`).join(", ");

                const insertCols = [
                    "id", "response_id", "source_question", "source_row_id", "sgiq_id", "data",
                    ...cols,
                    "created_by", "updated_by",
                ];
                const insertVals = [
                    ulid(), response_id, type, source_row_id, sgiq_id ?? null, data ?? null,
                    ...cols.map((f) => tags[f] ?? null),
                    updated_by, updated_by,
                ];
                const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(", ");

                const sql = `
                    INSERT INTO dqr_v3_rating (${insertCols.join(", ")})
                    VALUES (${placeholders})
                    ON CONFLICT (response_id, source_row_id) DO UPDATE
                    SET ${setAssignments ? setAssignments + ", " : ""}
                        data = COALESCE(EXCLUDED.data, dqr_v3_rating.data),
                        updated_by = EXCLUDED.updated_by,
                        update_date = NOW()
                    RETURNING *;`;

                const { rows } = await client.query(sql, insertVals);
                if (rows[0]) results.push(rows[0]);
            }

            if (responseId) {
                await maybeCompleteV3Dqr(client, responseId, updated_by);
            }

            await client.query("COMMIT");
            return results;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    });
}

// When every emission line of the response carries a PDS rating, mark the DQR
// stage complete and advance the 8-stage tracker to PCF Calculation. PDS is the
// last dimension the assessor sets, mirroring the legacy completeness signal.
async function maybeCompleteV3Dqr(client: any, responseId: string, updated_by: string) {
    const totalQ = V3_SOURCES.map(
        (s) => `SELECT COUNT(*)::int AS n FROM ${s.table} WHERE response_id = $1`
    ).join(" UNION ALL ");
    const totalRes = await client.query(`SELECT COALESCE(SUM(n),0)::int AS total FROM (${totalQ}) t`, [responseId]);
    const totalLines = totalRes.rows[0]?.total ?? 0;

    const ratedRes = await client.query(
        `SELECT COUNT(*)::int AS rated FROM dqr_v3_rating
          WHERE response_id = $1 AND pds_tag_type IS NOT NULL`,
        [responseId]
    );
    const rated = ratedRes.rows[0]?.rated ?? 0;

    // Not finished yet (or nothing to rate) — leave the workflow where it is.
    if (totalLines === 0 || rated < totalLines) return;

    const resp = await client.query(
        `SELECT bom_pcf_request_id, supplier_id FROM supplier_questionnaire_response WHERE id = $1`,
        [responseId]
    );
    if (resp.rowCount === 0) return;
    const { bom_pcf_request_id: bomPcfId, supplier_id: supId } = resp.rows[0];

    // (1) Per-supplier DQR rating stage row (the bridge never created one).
    const existing = await client.query(
        `SELECT id FROM pcf_request_data_rating_stage WHERE bom_pcf_id = $1 AND sup_id = $2 LIMIT 1`,
        [bomPcfId, supId]
    );
    if (existing.rowCount === 0) {
        await client.query(
            `INSERT INTO pcf_request_data_rating_stage
                (id, bom_pcf_id, sup_id, submitted_by, is_submitted, completed_date, created_date, update_date)
             VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW(), NOW())`,
            [ulid(), bomPcfId, supId, updated_by]
        );
    } else {
        await client.query(
            `UPDATE pcf_request_data_rating_stage
                SET is_submitted = TRUE, completed_date = NOW(), submitted_by = $3, update_date = NOW()
              WHERE bom_pcf_id = $1 AND sup_id = $2`,
            [bomPcfId, supId, updated_by]
        );
    }

    // (2) Advance the 8-stage tracker to PCF Calculation. We mark ONLY DQR
    // complete here — PCF Calculation stays its own explicit stage so the user
    // runs it deliberately (it is not auto-skipped). Do not set is_pcf_calculated.
    await client.query(
        `UPDATE pcf_request_stages
            SET is_dqr_completed = TRUE,
                dqr_completed_by = $2,
                dqr_completed_date = NOW(),
                update_date = NOW()
          WHERE bom_pcf_id = $1`,
        [bomPcfId, updated_by]
    );
}
