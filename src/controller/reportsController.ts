import { ulid } from 'ulid';
import { withClient } from '../util/database.js';
import { generateResponse } from '../util/genRes.js';
import {
    generatePcfReportPdfBuffer,
    type PcfReportComponent,
    type PcfReportSupplierAppendix,
} from '../helper/pcfReportPdfGenerator.js';

export async function getProductFootPrint(req: any, res: any) {
    const {
        code,
        material_number,
        component_name,
        production_location,
        manufacturer,
        component_category,

        supplier_code,
        supplier_name,

        material_type, // material_emission.material_type
        mode_of_transport, // transportation_details.mode_of_transport

        search,

        from_date,
        to_date
    } = req.query;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    return withClient(async (client: any) => {
        try {

            // ----- BOM LEVEL FILTERS -----
            if (code) {
                conditions.push(`b.code ILIKE $${paramIndex++}`);
                values.push(`%${code}%`);
            }
            if (material_number) {
                conditions.push(`b.material_number ILIKE $${paramIndex++}`);
                values.push(`%${material_number}%`);
            }
            if (component_name) {
                conditions.push(`b.component_name ILIKE $${paramIndex++}`);
                values.push(`%${component_name}%`);
            }
            if (production_location) {
                conditions.push(`b.production_location ILIKE $${paramIndex++}`);
                values.push(`%${production_location}%`);
            }
            if (manufacturer) {
                conditions.push(`b.manufacturer ILIKE $${paramIndex++}`);
                values.push(`%${manufacturer}%`);
            }
            if (component_category) {
                conditions.push(`b.component_category ILIKE $${paramIndex++}`);
                values.push(`%${component_category}%`);
            }

            // ----- SUPPLIER FILTERS -----
            if (supplier_code) {
                conditions.push(`sd.code ILIKE $${paramIndex++}`);
                values.push(`%${supplier_code}%`);
            }
            if (supplier_name) {
                conditions.push(`sd.supplier_name ILIKE $${paramIndex++}`);
                values.push(`%${supplier_name}%`);

            }

            // ----- MATERIAL EMISSION FILTER -----
            if (material_type) {
                conditions.push(`
                    EXISTS (
                        SELECT 1
                        FROM bom_emission_material_calculation_engine mem
                        WHERE mem.bom_id = b.id
                          AND mem.material_type ILIKE $${paramIndex++}
                    )
                `);
                values.push(`%${material_type}%`);
            }

            // ----- TRANSPORTATION FILTER -----
            if (mode_of_transport) {
                conditions.push(`
                    EXISTS (
                        SELECT 1
                        FROM mode_of_transport_used_for_transportation_questions mt
                        WHERE mt.bom_id = b.id
                          AND mt.mode_of_transport ILIKE $${paramIndex++}
                    )
                `);
                values.push(`%${mode_of_transport}%`);
            }

            // ----- SEARCH ACROSS MULTIPLE FIELDS -----
            if (search) {
                conditions.push(`
                    (
                        b.code ILIKE $${paramIndex}
                        OR b.material_number ILIKE $${paramIndex}
                        OR b.component_name ILIKE $${paramIndex}
                        OR b.production_location ILIKE $${paramIndex}
                        OR b.manufacturer ILIKE $${paramIndex}
                        OR b.component_category ILIKE $${paramIndex}
                        OR sd.code ILIKE $${paramIndex}
                        OR sd.supplier_name ILIKE $${paramIndex}
                    )
                `);
                values.push(`%${search}%`);
                paramIndex++;
            }


            // ----- DATE RANGE -----
            if (from_date) {
                conditions.push(`b.created_date >= $${paramIndex++}::date`);
                values.push(from_date);
            }
            if (to_date) {
                conditions.push(`b.created_date < ($${paramIndex++}::date + INTERVAL '1 day')`);
                values.push(to_date);
            }

            const query = `
SELECT
    b.id,
    b.component_name,
    b.weight_gms,
    b.total_weight_gms,
    b.economic_ratio,

    jsonb_build_object(
        'code', sd.code,
        'supplier_name', sd.supplier_name
    ) AS supplier_details,

    (
        SELECT jsonb_build_object(
            'allocation_methodology', mep.allocation_methodology
        )
        FROM bom_emission_production_calculation_engine mep
        WHERE mep.bom_id = b.id AND mep.product_id IS NULL
        LIMIT 1
    ) AS production_emission_calculation,

    (
        SELECT jsonb_build_object(
            'material_value',   pcfe.material_value,
            'production_value', pcfe.production_value,
            'packaging_value',  pcfe.packaging_value,
            'waste_value',      pcfe.waste_value,
            'logistic_value',   pcfe.logistic_value,
            'total_pcf_value',  pcfe.total_pcf_value
        )
        FROM bom_emission_calculation_engine pcfe
        WHERE pcfe.bom_id = b.id AND pcfe.product_id IS NULL
        LIMIT 1
    ) AS pcf_total_emission_calculation,

    COALESCE(transport.transportation_details, '[]'::jsonb) AS transportation_details

FROM bom b
LEFT JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('mode_of_transport', mt.mode_of_transport)) AS transportation_details
    FROM mode_of_transport_used_for_transportation_questions mt
    WHERE mt.bom_id = b.id
      AND mt.mode_of_transport IS NOT NULL
) transport ON TRUE

WHERE b.is_bom_calculated = TRUE
${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
ORDER BY b.created_date DESC;
`;

            const result = await client.query(query, values);

            const totalCount = result.rows.length;

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    totalCount,
                    data: result.rows
                })
            );

        } catch (error: any) {
            console.error("Error fetching BOM list:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch BOM list"
            });
        }
    });
}

export async function getSupplierFootPrint(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,

        code,
        material_number,
        component_name,
        production_location,
        manufacturer,
        component_category,
        material_name,
        supplier_code,
        supplier_name,
        search,

        from_date,
        to_date
    } = req.query;

    const limit = Number(pageSize);
    const page = Number(pageNumber) > 0 ? Number(pageNumber) : 1;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    return withClient(async (client: any) => {
        try {

            if (code) {
                conditions.push(`b.code ILIKE $${paramIndex++}`);
                values.push(`%${code}%`);
            }

            if (material_number) {
                conditions.push(`b.material_number ILIKE $${paramIndex++}`);
                values.push(`%${material_number}%`);
            }

            if (component_name) {
                conditions.push(`b.component_name ILIKE $${paramIndex++}`);
                values.push(`%${component_name}%`);
            }

            if (production_location) {
                conditions.push(`b.production_location ILIKE $${paramIndex++}`);
                values.push(`%${production_location}%`);
            }

            if (manufacturer) {
                conditions.push(`b.manufacturer ILIKE $${paramIndex++}`);
                values.push(`%${manufacturer}%`);
            }

            if (component_category) {
                conditions.push(`b.component_category ILIKE $${paramIndex++}`);
                values.push(`%${component_category}%`);
            }

            if (material_name) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM bom_emission_material_calculation_engine bmce
      WHERE bmce.bom_id = b.id AND bmce.product_id IS NULL
        AND bmce.material_type ILIKE $${paramIndex++}
    )
  `);
                values.push(`%${material_name}%`);
            }

            // ----- SUPPLIER FILTERS -----
            if (supplier_code) {
                conditions.push(`sd.code ILIKE $${paramIndex++}`);
                values.push(`%${supplier_code}%`);
            }
            if (supplier_name) {
                conditions.push(`sd.supplier_name ILIKE $${paramIndex++}`);
                values.push(`%${supplier_name}%`);
            }


            if (search) {
                conditions.push(`
    (
      b.material_number ILIKE $${paramIndex}
      OR b.component_name ILIKE $${paramIndex}
      OR b.production_location ILIKE $${paramIndex}
      OR b.manufacturer ILIKE $${paramIndex}
      OR b.component_category ILIKE $${paramIndex}
    )
  `);
                values.push(`%${search}%`);
                paramIndex++;
            }


            if (from_date) {
                conditions.push(`b.created_date >= $${paramIndex++}::date`);
                values.push(from_date);
            }

            if (to_date) {
                conditions.push(
                    `b.created_date < ($${paramIndex++}::date + INTERVAL '1 day')`
                );
                values.push(to_date);
            }

            const query = `
SELECT
    b.id,
    b.code,
    b.bom_pcf_id,
    b.material_number,
    b.component_name,
    b.qunatity,
    b.production_location,
    b.manufacturer,
    b.weight_gms,
    b.total_weight_gms,
    b.component_category,
    b.price,
    b.total_price,
    b.economic_ratio,
    b.supplier_id,
    b.created_date,
    arp.annual_reporting_period,
    materials.recycled_content_percentage,
    COALESCE(spcf.supplier_total_pcf_emission, 0) AS supplier_total_pcf_emission,

    /* ---------- SUPPLIER DETAILS ---------- */
    jsonb_build_object(
        'sup_id', sd.sup_id,
        'code', sd.code,
        'supplier_name', sd.supplier_name,
        'supplier_email', sd.supplier_email
    ) AS supplier_details,

    /* ---------- Manufacturing site(s) — V3 questionnaire ---------- */
    COALESCE(sites.sites, '[]'::jsonb) AS sites,

    /* ---------- Materials — V3 BOM material breakdown ---------- */
    COALESCE(materials.materials, '[]'::jsonb) AS materials,

    /* ---------- Electricity — V3 production energy ---------- */
    COALESCE(electricity.electricity, '[]'::jsonb) AS electricity

FROM bom b

LEFT JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

/* Supplier-level total PCF emission across all their components. */
LEFT JOIN LATERAL (
    SELECT SUM(bece.total_pcf_value)::numeric AS supplier_total_pcf_emission
    FROM bom b2
    JOIN bom_emission_calculation_engine bece
        ON bece.bom_id = b2.id AND bece.product_id IS NULL
    WHERE b2.supplier_id = b.supplier_id
) spcf ON TRUE

/* Reporting period from the supplier's questionnaire header. */
LEFT JOIN LATERAL (
    SELECT sgiq.annual_reporting_period
    FROM supplier_general_info_questions sgiq
    WHERE sgiq.bom_pcf_id = b.bom_pcf_id
      AND sgiq.sup_id = b.supplier_id AND sgiq.own_emission_id IS NULL
    ORDER BY sgiq.created_date ASC
    LIMIT 1
) arp ON TRUE

/* Manufacturing site(s) from the V3 questionnaire (sq_q4_sites). */
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'site_name', s.site_name,
        'region', s.region,
        'country', s.country,
        'location', COALESCE(s.region, s.country)
    )) AS sites
    FROM supplier_questionnaire_response r
    JOIN sq_q4_sites s ON s.response_id = r.id
    WHERE r.bom_pcf_request_id = b.bom_pcf_id AND r.supplier_id = b.supplier_id
) sites ON TRUE

/* Materials from the V3 BOM material calc engine (type, composition %, EF, emission). */
LEFT JOIN LATERAL (
    SELECT
        jsonb_agg(jsonb_build_object(
            'material_name', bmce.material_type,
            'percentage', bmce.material_composition,
            'material_weight_kg', bmce.material_composition_weight,
            'emission_factor', COALESCE(bmce.material_emission_factor::numeric, 0),
            'emission', ROUND(COALESCE(bmce.material_emission::numeric, 0), 6)
        )) AS materials,
        MAX(rc.recycled_pct)::numeric AS recycled_content_percentage
    FROM bom_emission_material_calculation_engine bmce
    LEFT JOIN LATERAL (
        SELECT MAX(q8.recycled_carbon_pct) AS recycled_pct
        FROM supplier_questionnaire_response r
        JOIN sq_q8_bom q8 ON q8.response_id = r.id
        WHERE r.bom_pcf_request_id = b.bom_pcf_id AND r.supplier_id = b.supplier_id
    ) rc ON TRUE
    WHERE bmce.bom_id = b.id AND bmce.product_id IS NULL
) materials ON TRUE

/* Electricity from the V3 production calc engine + questionnaire source type. */
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'energy_source', COALESCE(elec.electricity_type, 'Grid Electricity'),
        'energy_type', COALESCE(elec.electricity_type, 'Electricity'),
        'quantity', ROUND(COALESCE(mep.production_electricity_energy_use_per_unit_kWh::numeric, 0), 6),
        'unit', 'kWh',
        'emission_factor', COALESCE(mep.emission_factor_of_electricity::numeric, 0)
    )) AS electricity
    FROM bom_emission_production_calculation_engine mep
    LEFT JOIN LATERAL (
        SELECT sq.electricity_type
        FROM supplier_questionnaire_response r
        JOIN sq_q10_electricity sq ON sq.response_id = r.id
        WHERE r.bom_pcf_request_id = b.bom_pcf_id AND r.supplier_id = b.supplier_id
        ORDER BY sq.row_order ASC, sq.created_date ASC
        LIMIT 1
    ) elec ON TRUE
    WHERE mep.bom_id = b.id AND mep.product_id IS NULL
) electricity ON TRUE

WHERE b.is_bom_calculated = TRUE
${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
LIMIT $${paramIndex++} OFFSET $${paramIndex++};
`;

            values.push(limit);
            values.push(offset);
            const result = await client.query(query, values);

            const rows = result.rows;
            const totalCount = rows.length > 0 ? rows.length : 0;

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    page,
                    pageSize: limit,
                    totalCount,
                    data: result.rows
                })
            );

        } catch (error: any) {
            console.error("Error fetching Supplier Footprint:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch Supplier Footprint"
            });
        }
    });
}

export async function getMaterialFootPrint(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,

        search,                // global search
        from_date,              // date range start
        to_date,                // date range end

        code,
        material_number,
        component_name,
        production_location,
        manufacturer,
        component_category,
        supplier_code,
        supplier_name,
        material_name
    } = req.query;

    const limit = Number(pageSize);
    const page = Number(pageNumber) > 0 ? Number(pageNumber) : 1;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    return withClient(async (client: any) => {
        try {

            if (code) {
                conditions.push(`b.code ILIKE $${idx++}`);
                values.push(`%${code}%`);
            }

            if (material_number) {
                conditions.push(`b.material_number ILIKE $${idx++}`);
                values.push(`%${material_number}%`);
            }

            if (component_name) {
                conditions.push(`b.component_name ILIKE $${idx++}`);
                values.push(`%${component_name}%`);
            }

            if (production_location) {
                conditions.push(`b.production_location ILIKE $${idx++}`);
                values.push(`%${production_location}%`);
            }

            if (manufacturer) {
                conditions.push(`b.manufacturer ILIKE $${idx++}`);
                values.push(`%${manufacturer}%`);
            }

            if (component_category) {
                conditions.push(`b.component_category ILIKE $${idx++}`);
                values.push(`%${component_category}%`);
            }

            if (supplier_code) {
                conditions.push(`sd.code ILIKE $${idx++}`);
                values.push(`%${supplier_code}%`);
            }

            if (supplier_name) {
                conditions.push(`sd.supplier_name ILIKE $${idx++}`);
                values.push(`%${supplier_name}%`);
            }

            if (material_name) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM bom_emission_material_calculation_engine bmce
      WHERE bmce.bom_id = b.id AND bmce.product_id IS NULL
      AND bmce.material_type ILIKE $${idx++}
    )
  `);
                values.push(`%${material_name}%`);
            }


            if (search) {
                conditions.push(`
    (
      b.code ILIKE $${idx}
      OR b.material_number ILIKE $${idx}
      OR b.component_name ILIKE $${idx}
      OR b.production_location ILIKE $${idx}
      OR b.manufacturer ILIKE $${idx}
      OR b.component_category ILIKE $${idx}
      OR sd.code ILIKE $${idx}
      OR sd.supplier_name ILIKE $${idx}
      OR EXISTS (
          SELECT 1
          FROM bom_emission_material_calculation_engine bmce
          WHERE bmce.bom_id = b.id AND bmce.product_id IS NULL
          AND bmce.material_type ILIKE $${idx}
      )
    )
  `);
                values.push(`%${search}%`);
                idx++;
            }


            if (from_date) {
                conditions.push(`b.created_date >= $${idx++}::date`);
                values.push(from_date);
            }

            if (to_date) {
                conditions.push(
                    `b.created_date < ($${idx++}::date + INTERVAL '1 day')`
                );
                values.push(to_date);
            }


            const query = `
SELECT
    b.id,
    b.code,
    b.material_number,
    b.bom_pcf_id,
    b.component_name,
    b.qunatity,
    b.production_location,
    b.manufacturer,
    b.detail_description,
    b.weight_gms,
    b.total_weight_gms,
    b.component_category,
    b.price,
    b.total_price,
    b.economic_ratio,
    b.supplier_id,
    b.is_weight_gms,
    b.created_date,

    /* ---------- SUPPLIER DETAILS ---------- */
    jsonb_build_object(
        'sup_id', sd.sup_id,
        'code', sd.code,
        'supplier_name', sd.supplier_name,
        'supplier_email', sd.supplier_email
    ) AS supplier_details,

    /* ---------- Materials — V3 BOM material breakdown ---------- */
    COALESCE(materials.materials, '[]'::jsonb) AS materials


FROM bom b

LEFT JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

/* Materials from the V3 BOM material calc engine (type, composition %, EF,
   emission). Reporting year comes from the questionnaire header; recycled % from
   the V3 BOM rows (sq_q8_bom). */
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'material_name', bmce.material_type,
            'percentage', bmce.material_composition,
            'unit', 'Kg',
            'year', sgi.annual_reporting_period,
            'bom_weight_kg', (b.weight_gms::numeric / 1000),
            'recycled_percentage', COALESCE(rc.recycled_pct, 0),
            'emission_factor_used', COALESCE(bmce.material_emission_factor::numeric, 0),
            'emission_in_co2_eq', ROUND(COALESCE(bmce.material_emission::numeric, 0), 6)
        )
    ) AS materials
    FROM bom_emission_material_calculation_engine bmce
    LEFT JOIN supplier_general_info_questions sgi
        ON sgi.bom_pcf_id = b.bom_pcf_id AND sgi.own_emission_id IS NULL
    LEFT JOIN LATERAL (
        SELECT MAX(q8.recycled_carbon_pct) AS recycled_pct
        FROM supplier_questionnaire_response r
        JOIN sq_q8_bom q8 ON q8.response_id = r.id
        WHERE r.bom_pcf_request_id = b.bom_pcf_id AND r.supplier_id = b.supplier_id
    ) rc ON TRUE
    WHERE bmce.bom_id = b.id AND bmce.product_id IS NULL
) materials ON TRUE

WHERE b.is_bom_calculated = TRUE
${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
LIMIT $${idx++} OFFSET $${idx++};
`;

            values.push(limit);
            values.push(offset);
            const result = await client.query(query, values);

            // Flatten: one row per material line instead of one row per BOM
            const flatRows: any[] = [];
            for (const row of result.rows) {
                const materials = Array.isArray(row.materials) ? row.materials : [];
                if (materials.length === 0) {
                    flatRows.push({
                        ...row,
                        material_name: null,
                        material_percentage: null,
                        recycled_percentage: null,
                        material_weight_kg: null,
                        emission_factor_used: null,
                        emission_in_co2_eq: null,
                        materials: undefined
                    });
                } else {
                    for (const mat of materials) {
                        const weightKg = row.weight_gms ? (row.weight_gms / 1000) : 0;
                        const matPercentage = mat.percentage ? Number(mat.percentage) : 0;
                        flatRows.push({
                            ...row,
                            material_name: mat.material_name || null,
                            material_percentage: matPercentage,
                            recycled_percentage: mat.recycled_percentage ?? null,
                            material_weight_kg: matPercentage > 0 ? Number((weightKg * matPercentage / 100).toFixed(6)) : null,
                            emission_factor_used: mat.emission_factor_used ?? null,
                            emission_in_co2_eq: mat.emission_in_co2_eq ?? null,
                            materials: undefined
                        });
                    }
                }
            }

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    page,
                    pageSize: limit,
                    totalCount: flatRows.length,
                    data: flatRows
                })
            );

        } catch (error: any) {
            console.error("Error fetching Material Footprint:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch Material Footprint"
            });
        }
    });
}

export async function getElectricityFootPrint(req: any, res: any) {

    const {
        pageNumber = 1,
        pageSize = 20,

        code,
        material_number,
        component_name,
        production_location,
        manufacturer,
        component_category,
        material_name,
        supplier_code,
        supplier_name,
        search,

        from_date,
        to_date
    } = req.query;

    const limit = Number(pageSize);
    const page = Number(pageNumber) > 0 ? Number(pageNumber) : 1;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    return withClient(async (client: any) => {
        try {

            if (code) {
                conditions.push(`b.code ILIKE $${paramIndex++}`);
                values.push(`%${code}%`);
            }

            if (material_number) {
                conditions.push(`b.material_number ILIKE $${paramIndex++}`);
                values.push(`%${material_number}%`);
            }

            if (component_name) {
                conditions.push(`b.component_name ILIKE $${paramIndex++}`);
                values.push(`%${component_name}%`);
            }

            if (production_location) {
                conditions.push(`b.production_location ILIKE $${paramIndex++}`);
                values.push(`%${production_location}%`);
            }

            if (manufacturer) {
                conditions.push(`b.manufacturer ILIKE $${paramIndex++}`);
                values.push(`%${manufacturer}%`);
            }

            if (component_category) {
                conditions.push(`b.component_category ILIKE $${paramIndex++}`);
                values.push(`%${component_category}%`);
            }

            if (material_name) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM bom_emission_material_calculation_engine bmce
      WHERE bmce.bom_id = b.id AND bmce.product_id IS NULL
        AND bmce.material_type ILIKE $${paramIndex++}
    )
  `);
                values.push(`%${material_name}%`);
            }

            // ----- SUPPLIER FILTERS -----
            if (supplier_code) {
                conditions.push(`sd.code ILIKE $${paramIndex++}`);
                values.push(`%${supplier_code}%`);
            }
            if (supplier_name) {
                conditions.push(`sd.supplier_name ILIKE $${paramIndex++}`);
                values.push(`%${supplier_name}%`);
            }


            if (search) {
                conditions.push(`
    (
      b.material_number ILIKE $${paramIndex}
      OR b.component_name ILIKE $${paramIndex}
      OR b.production_location ILIKE $${paramIndex}
      OR b.manufacturer ILIKE $${paramIndex}
      OR b.component_category ILIKE $${paramIndex}
    )
  `);
                values.push(`%${search}%`);
                paramIndex++;
            }


            if (from_date) {
                conditions.push(`b.created_date >= $${paramIndex++}::date`);
                values.push(from_date);
            }

            if (to_date) {
                conditions.push(
                    `b.created_date < ($${paramIndex++}::date + INTERVAL '1 day')`
                );
                values.push(to_date);
            }

            const query = `
SELECT
    b.id,
    b.code,
    b.bom_pcf_id,
    b.material_number,
    b.component_name,
    b.qunatity,
    b.production_location,
    b.manufacturer,
    b.weight_gms,
    b.total_weight_gms,
    b.component_category,
    b.price,
    b.total_price,
    b.economic_ratio,
    b.supplier_id,
    b.created_date,
    arp.annual_reporting_period,

    /* ---------- SUPPLIER DETAILS ---------- */
    jsonb_build_object(
        'sup_id', sd.sup_id,
        'code', sd.code,
        'supplier_name', sd.supplier_name,
        'supplier_email', sd.supplier_email
    ) AS supplier_details,

    /* ---------- ELECTRICITY (V3 production calc engine) ---------- */
    COALESCE(qelec.elec_energy, '[]'::jsonb) AS "elec_energy"

FROM bom b

LEFT JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

LEFT JOIN LATERAL (
    SELECT
        SUM(bece.total_pcf_value)::numeric AS supplier_total_pcf_emission
    FROM bom b2
    JOIN bom_emission_calculation_engine bece
        ON bece.bom_id = b2.id AND bece.product_id IS NULL
    WHERE b2.supplier_id = b.supplier_id
) spcf ON TRUE

LEFT JOIN LATERAL (
    SELECT sgiq.annual_reporting_period
    FROM supplier_general_info_questions sgiq
    WHERE sgiq.bom_pcf_id = b.bom_pcf_id
      AND sgiq.sup_id = b.supplier_id AND sgiq.own_emission_id IS NULL
    ORDER BY sgiq.created_date ASC
    LIMIT 1
) arp ON TRUE


/* ---------- ELECTRICITY (V3 production calc engine) ----------
   The old scope-2/scope-3 energy detail tables are empty under V3. Production
   electricity (per-unit kWh + EF) is written per-bom by the calc engine; the
   electricity source/type comes from the V3 questionnaire (sq_q10_electricity). */
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'energy_source', COALESCE(elec.electricity_type, 'Grid Electricity'),
            'energy_type', COALESCE(elec.electricity_type, 'Electricity'),
            'quantity', ROUND(COALESCE(mep.production_electricity_energy_use_per_unit_kWh::numeric, 0), 6),
            'unit', 'kWh',
            'emission_factor', COALESCE(mep.emission_factor_of_electricity::numeric, 0),
            'calculated_emission', ROUND(
                COALESCE(mep.production_electricity_energy_use_per_unit_kWh::numeric, 0)
                * COALESCE(mep.emission_factor_of_electricity::numeric, 0), 6),
            'source_section', 'Production Electricity'
        )
    ) AS elec_energy
    FROM bom_emission_production_calculation_engine mep
    LEFT JOIN LATERAL (
        SELECT sq.electricity_type
        FROM supplier_questionnaire_response r
        JOIN sq_q10_electricity sq ON sq.response_id = r.id
        WHERE r.bom_pcf_request_id = b.bom_pcf_id
        ORDER BY sq.row_order ASC, sq.created_date ASC
        LIMIT 1
    ) elec ON TRUE
    WHERE mep.bom_id = b.id AND mep.product_id IS NULL
) qelec ON TRUE

WHERE b.is_bom_calculated = TRUE
${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
LIMIT $${paramIndex++} OFFSET $${paramIndex++};
`;

            values.push(limit);
            values.push(offset);
            const result = await client.query(query, values);

            // Flatten: one row per electricity record (from the V3 production engine)
            const flatRows: any[] = [];
            for (const row of result.rows) {
                const allEnergy = Array.isArray(row.elec_energy) ? row.elec_energy : [];

                if (allEnergy.length === 0) {
                    flatRows.push({
                        ...row,
                        electricity_source: null,
                        energy_type: null,
                        energy_quantity: null,
                        energy_unit: null,
                        emission_factor: null,
                        calculated_emission: null,
                        source_section: null,
                        elec_energy: undefined
                    });
                } else {
                    for (const e of allEnergy) {
                        flatRows.push({
                            ...row,
                            electricity_source: e.energy_source || null,
                            energy_type: e.energy_type || null,
                            energy_quantity: e.quantity ?? null,
                            energy_unit: e.unit || null,
                            emission_factor: e.emission_factor ?? null,
                            calculated_emission: e.calculated_emission ?? null,
                            source_section: e.source_section || null,
                            elec_energy: undefined
                        });
                    }
                }
            }

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    page,
                    pageSize: limit,
                    totalCount: flatRows.length,
                    data: flatRows
                })
            );

        } catch (error: any) {
            console.error("Error fetching Electricity Footprint:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch Electricity Footprint"
            });
        }
    });
}

export async function getTransportationFootPrint(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,

        search,              // global search
        from_date,           // date range
        to_date,

        code,
        material_number,
        component_name,
        production_location,
        manufacturer,
        component_category,

        supplier_code,
        supplier_name,

        mode_of_transport
    } = req.query;

    const limit = Number(pageSize);
    const page = Number(pageNumber) > 0 ? Number(pageNumber) : 1;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    return withClient(async (client: any) => {
        try {

            if (code) {
                conditions.push(`b.code ILIKE $${idx++}`);
                values.push(`%${code}%`);
            }

            if (material_number) {
                conditions.push(`b.material_number ILIKE $${idx++}`);
                values.push(`%${material_number}%`);
            }

            if (component_name) {
                conditions.push(`b.component_name ILIKE $${idx++}`);
                values.push(`%${component_name}%`);
            }

            if (production_location) {
                conditions.push(`b.production_location ILIKE $${idx++}`);
                values.push(`%${production_location}%`);
            }

            if (manufacturer) {
                conditions.push(`b.manufacturer ILIKE $${idx++}`);
                values.push(`%${manufacturer}%`);
            }

            if (component_category) {
                conditions.push(`b.component_category ILIKE $${idx++}`);
                values.push(`%${component_category}%`);
            }

            // ---------- SUPPLIER ----------
            if (supplier_code) {
                conditions.push(`sd.code ILIKE $${idx++}`);
                values.push(`%${supplier_code}%`);
            }

            if (supplier_name) {
                conditions.push(`sd.supplier_name ILIKE $${idx++}`);
                values.push(`%${supplier_name}%`);
            }


            if (from_date) {
                conditions.push(`b.created_date >= $${idx++}::date`);
                values.push(from_date);
            }

            if (to_date) {
                conditions.push(
                    `b.created_date < ($${idx++}::date + INTERVAL '1 day')`
                );
                values.push(to_date);
            }

            // ---------- TRANSPORT ----------
            if (mode_of_transport) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM mode_of_transport_used_for_transportation_questions ec
      WHERE ec.bom_id = b.id
        AND ec.mode_of_transport ILIKE $${idx++}
    )
  `);
                values.push(`%${mode_of_transport}%`);
            }

            if (search) {
                conditions.push(`
    (
      b.code ILIKE $${idx}
      OR b.material_number ILIKE $${idx}
      OR b.component_name ILIKE $${idx}
      OR b.production_location ILIKE $${idx}
      OR b.manufacturer ILIKE $${idx}
      OR b.component_category ILIKE $${idx}
      OR sd.code ILIKE $${idx}
      OR sd.supplier_name ILIKE $${idx}
      OR EXISTS (
          SELECT 1
          FROM mode_of_transport_used_for_transportation_questions ec
          WHERE ec.bom_id = b.id
            AND ec.mode_of_transport ILIKE $${idx}
      )
    )
  `);
                values.push(`%${search}%`);
                idx++;
            }

            const query = `
SELECT
    b.id,
    b.code,
    b.material_number,
    b.component_name,
    b.qunatity,
    b.production_location,
    b.manufacturer,
    b.detail_description,
    b.weight_gms,
    b.total_weight_gms,
    b.component_category,
    b.price,
    b.total_price,
    b.economic_ratio,
    b.supplier_id,
    b.is_weight_gms,
    b.created_date,
    arp.annual_reporting_period,

    /* ---------- SUPPLIER DETAILS ---------- */
    jsonb_build_object(
        'sup_id', sd.sup_id,
        'code', sd.code,
        'supplier_name', sd.supplier_name,
        'supplier_email', sd.supplier_email
    ) AS supplier_details,

     /* ---------- Transport legs — V3 logistic engine ---------- */
    COALESCE(legs.transport_legs, '[]'::jsonb) AS "transport_legs"
FROM bom b

LEFT JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

LEFT JOIN LATERAL (
    SELECT sgiq.annual_reporting_period
    FROM supplier_general_info_questions sgiq
    WHERE sgiq.bom_pcf_id = b.bom_pcf_id
      AND sgiq.sup_id = b.supplier_id
      AND sgiq.own_emission_id IS NULL
    ORDER BY sgiq.created_date ASC
    LIMIT 1
) arp ON TRUE


/* Transport legs from the V3 logistic calc engine. */
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
       jsonb_build_object(
    'motuft_id', ec.motuft_id,
    'stoie_id', ec.stoie_id,
    'mode_of_transport', ec.mode_of_transport,
    'weight_transported', ec.weight_transported,
    'source_point', ec.source_point,
    'drop_point', ec.drop_point,
    'distance', ec.distance,

    /* ---------- NUMERIC VALUES ---------- */
    'distance_numeric',
    COALESCE(
        regexp_replace(ec.distance, '[^0-9\.]', '', 'g')::numeric,
        0
    ),

    'weight_numeric_kg',
    COALESCE(
        regexp_replace(ec.weight_transported, '[^0-9\.]', '', 'g')::numeric,
        0
    ),

    /* ---------- EMISSION FACTOR ---------- */
    'emission_factor_used',
    COALESCE(mef.transport_mode_emission_factor_value_kg_co2e_t_km::numeric, 0),

    /* ---------- WEIGHT IN TONS (ton-km) ---------- */
    'weight_in_tons',
    ROUND(
        (
            COALESCE(regexp_replace(ec.weight_transported, '[^0-9\.]', '', 'g')::numeric, 0) / 1000
        )
        *
        COALESCE(regexp_replace(ec.distance, '[^0-9\.]', '', 'g')::numeric, 0),
        6
    ),

    /* ---------- TRANSPORTED EMISSION ---------- */
    'transported_emission',
    ROUND(COALESCE(mef.leg_wise_transport_emissions_per_unit_kg_co2e::numeric, 0), 6)
)
    ) AS transport_legs
    /* ---------- V3: transport legs are written directly against the bom by the
       PCF calc engine (the old sgiq→scope_three chain is empty under V3). ---------- */
    FROM mode_of_transport_used_for_transportation_questions ec
    /* ---------- per-leg EF + emission from the unified PCF logistic engine.
       Match by bom + distance. ---------- */
    LEFT JOIN LATERAL (
        SELECT bl.transport_mode_emission_factor_value_kg_co2e_t_km,
               bl.leg_wise_transport_emissions_per_unit_kg_co2e
        FROM bom_emission_logistic_calculation_engine bl
        WHERE bl.bom_id = b.id
          AND bl.distance_km = COALESCE(regexp_replace(ec.distance, '[^0-9\.]', '', 'g')::numeric, 0)
        ORDER BY bl.created_date DESC
        LIMIT 1
    ) mef ON TRUE
    WHERE ec.bom_id = b.id
) legs ON TRUE

WHERE b.is_bom_calculated = TRUE
${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
LIMIT $${idx++} OFFSET $${idx++};
`;

            values.push(limit);
            values.push(offset);
            const result = await client.query(query, values);

            // Flatten: one row per transport leg
            const flatRows: any[] = [];
            for (const row of result.rows) {
                const transports = Array.isArray(row.transport_legs) ? row.transport_legs : [];
                if (transports.length === 0) {
                    flatRows.push({
                        ...row,
                        transport_mode: null,
                        source_point: null,
                        drop_point: null,
                        weight_transported: null,
                        weight_in_tons: null,
                        distance_km: null,
                        emission_factor: null,
                        total_emission: null,
                        transport_legs: undefined
                    });
                } else {
                    for (const t of transports) {
                        flatRows.push({
                            ...row,
                            transport_mode: t.mode_of_transport || null,
                            source_point: t.source_point || null,
                            drop_point: t.drop_point || null,
                            weight_transported: t.weight_transported || null,
                            weight_in_tons: t.weight_in_tons ?? null,
                            distance_km: t.distance || null,
                            emission_factor: t.emission_factor_used ?? null,
                            total_emission: t.transported_emission ?? null,
                            transport_legs: undefined
                        });
                    }
                }
            }

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    page,
                    pageSize: limit,
                    totalCount: flatRows.length,
                    data: flatRows
                })
            );

        } catch (error: any) {
            console.error("Error fetching Transportation Footprint:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch Transportation Footprint"
            });
        }
    });
}

export async function getPackagingFootPrint(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,

        code,
        material_number,
        component_name,
        production_location,
        manufacturer,
        component_category,

        supplier_code,
        supplier_name,

        packagin_type,
        energy_purchased,
        energy_type,

        search,
        from_date,
        to_date
    } = req.query;

    const limit = Number(pageSize);
    const page = Number(pageNumber) > 0 ? Number(pageNumber) : 1;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;


    return withClient(async (client: any) => {
        try {


            if (code) {
                conditions.push(`b.code ILIKE $${idx++}`);
                values.push(`%${code}%`);
            }

            if (material_number) {
                conditions.push(`b.material_number ILIKE $${idx++}`);
                values.push(`%${material_number}%`);
            }

            if (component_name) {
                conditions.push(`b.component_name ILIKE $${idx++}`);
                values.push(`%${component_name}%`);
            }

            if (production_location) {
                conditions.push(`b.production_location ILIKE $${idx++}`);
                values.push(`%${production_location}%`);
            }

            if (manufacturer) {
                conditions.push(`b.manufacturer ILIKE $${idx++}`);
                values.push(`%${manufacturer}%`);
            }

            if (component_category) {
                conditions.push(`b.component_category ILIKE $${idx++}`);
                values.push(`%${component_category}%`);
            }

            if (supplier_code) {
                conditions.push(`sd.code ILIKE $${idx++}`);
                values.push(`%${supplier_code}%`);
            }

            if (supplier_name) {
                conditions.push(`sd.supplier_name ILIKE $${idx++}`);
                values.push(`%${supplier_name}%`);
            }


            if (packagin_type) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM supplier_questionnaire_response r
      JOIN sq_q16_packaging_materials pm ON pm.response_id = r.id
      WHERE r.bom_pcf_request_id = b.bom_pcf_id
        AND r.supplier_id = b.supplier_id
        AND pm.packaging_type ILIKE $${idx++}
    )
  `);
                values.push(`%${packagin_type}%`);
            }


            if (energy_purchased) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM energy_consumption_for_qsixtyseven_questions ec
      JOIN scope_three_other_indirect_emissions_questions stoie
        ON stoie.stoie_id = ec.stoie_id
      JOIN supplier_general_info_questions sgiq
        ON sgiq.sgiq_id = stoie.sgiq_id AND sgiq.own_emission_id IS NULL
      WHERE sgiq.bom_pcf_id = b.bom_pcf_id
        AND ec.energy_purchased ILIKE $${idx++}
    )
  `);
                values.push(`%${energy_purchased}%`);
            }

            if (energy_type) {
                conditions.push(`
    EXISTS (
      SELECT 1
      FROM energy_consumption_for_qsixtyseven_questions ec
      JOIN scope_three_other_indirect_emissions_questions stoie
        ON stoie.stoie_id = ec.stoie_id
      JOIN supplier_general_info_questions sgiq
        ON sgiq.sgiq_id = stoie.sgiq_id AND sgiq.own_emission_id IS NULL
      WHERE sgiq.bom_pcf_id = b.bom_pcf_id
        AND ec.energy_type ILIKE $${idx++}
    )
  `);
                values.push(`%${energy_type}%`);
            }

            if (search) {
                conditions.push(`
    (
      b.code ILIKE $${idx}
      OR b.material_number ILIKE $${idx}
      OR b.component_name ILIKE $${idx}
      OR b.production_location ILIKE $${idx}
      OR b.manufacturer ILIKE $${idx}
      OR b.component_category ILIKE $${idx}
      OR sd.code ILIKE $${idx}
      OR sd.supplier_name ILIKE $${idx}

      OR EXISTS (
        SELECT 1
        FROM supplier_questionnaire_response r
        JOIN sq_q16_packaging_materials pm ON pm.response_id = r.id
        WHERE r.bom_pcf_request_id = b.bom_pcf_id
          AND r.supplier_id = b.supplier_id
          AND (pm.packaging_type ILIKE $${idx} OR pm.process_type ILIKE $${idx})
      )
    )
  `);
                values.push(`%${search}%`);
                idx++;
            }

            if (from_date) {
                conditions.push(`b.created_date >= $${idx++}::date`);
                values.push(from_date);
            }

            if (to_date) {
                conditions.push(
                    `b.created_date < ($${idx++}::date + INTERVAL '1 day')`
                );
                values.push(to_date);
            }

            const query = `
SELECT
    b.id,
    b.code,
    b.material_number,
    b.component_name,
    b.qunatity,
    b.production_location,
    b.manufacturer,
    b.detail_description,
    b.weight_gms,
    b.total_weight_gms,
    b.component_category,
    b.price,
    b.total_price,
    b.economic_ratio,
    b.supplier_id,
    b.is_weight_gms,
    b.created_date,
    arp.annual_reporting_period,

    /* ---------- SUPPLIER DETAILS ---------- */
    jsonb_build_object(
        'sup_id', sd.sup_id,
        'code', sd.code,
        'supplier_name', sd.supplier_name,
        'supplier_email', sd.supplier_email
    ) AS supplier_details,

    /* ---------- PACKAGING (V3) ---------- */
    COALESCE(packaging.packaging_lines, '[]'::jsonb) AS "packaging_lines"


FROM bom b

LEFT JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

LEFT JOIN LATERAL (
    SELECT sgiq.annual_reporting_period
    FROM supplier_general_info_questions sgiq
    WHERE sgiq.bom_pcf_id = b.bom_pcf_id
      AND sgiq.sup_id = b.supplier_id AND sgiq.own_emission_id IS NULL
    ORDER BY sgiq.created_date ASC
    LIMIT 1
) arp ON TRUE


/* ---------- PACKAGING (V3 questionnaire: sq_q16_packaging_materials) ----------
   Packaging lines (type, treatment, recycled %) come from the V3 questionnaire;
   the per-line EF is resolved from the calc audit trail (ef_match_audit →
   emission_factors by the packaging row id). Emission @0.25/0.5 kg = weight × EF. */
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'packagin_type', pm.packaging_type,
            'treatment_type', pm.process_type,
            'percentage_of_recycled_content_used_in_packaging', pm.recycled_pct,
            'emission_factor', COALESCE(ef.gwp_100::numeric, 0),
            'emission_0_25', ROUND(0.25 * COALESCE(ef.gwp_100::numeric, 0), 6),
            'emission_0_5', ROUND(0.5 * COALESCE(ef.gwp_100::numeric, 0), 6)
        )
    ) AS packaging_lines
    FROM supplier_questionnaire_response r
    JOIN sq_q16_packaging_materials pm ON pm.response_id = r.id
    LEFT JOIN LATERAL (
        SELECT ef2.gwp_100
        FROM ef_match_audit a
        LEFT JOIN emission_factors ef2 ON ef2.ef_id = a.winning_ef_id
        WHERE a.source_row_id = pm.id
        ORDER BY a.matched_at DESC
        LIMIT 1
    ) ef ON TRUE
    WHERE r.bom_pcf_request_id = b.bom_pcf_id
      AND r.supplier_id = b.supplier_id
) packaging ON TRUE

WHERE b.is_bom_calculated = TRUE
${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
ORDER BY b.created_date DESC
LIMIT $${idx++} OFFSET $${idx++};
`;

            values.push(limit);
            values.push(offset);

            const result = await client.query(query, values);

            // Flatten: one row per packaging material line (from the V3 questionnaire)
            const flatRows: any[] = [];
            for (const row of result.rows) {
                const packaging = Array.isArray(row.packaging_lines) ? row.packaging_lines : [];

                if (packaging.length === 0) {
                    flatRows.push({
                        ...row,
                        packaging_type: null,
                        treatment_type: null,
                        packaging_recyclability: null,
                        energy_type: null,
                        emission_factor: null,
                        emission_0_25: null,
                        emission_0_5: null,
                        packaging_lines: undefined
                    });
                } else {
                    for (const pkg of packaging) {
                        flatRows.push({
                            ...row,
                            packaging_type: pkg.packagin_type || null,
                            treatment_type: pkg.treatment_type || null,
                            packaging_recyclability: pkg.percentage_of_recycled_content_used_in_packaging ?? null,
                            energy_type: null,
                            emission_factor: pkg.emission_factor ?? null,
                            emission_0_25: pkg.emission_0_25 ?? null,
                            emission_0_5: pkg.emission_0_5 ?? null,
                            packaging_lines: undefined
                        });
                    }
                }
            }

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    page,
                    pageSize: limit,
                    totalCount: flatRows.length,
                    data: flatRows
                })
            );

        } catch (error: any) {
            console.error("Error fetching Packaging Footprint:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch Packaging Footprint"
            });
        }
    });
}

export async function getSupplierDqrRatingReport(req: any, res: any) {
    const { pageNumber = 1, pageSize = 20 } = req.query;

    return withClient(async (client: any) => {

        const page = Number(pageNumber) > 0 ? Number(pageNumber) : 1;
        const limit = Number(pageSize) > 0 ? Number(pageSize) : 20;
        const offset = (page - 1) * limit;

        try {
            const query = `
               WITH supplier_sgiq AS (
    SELECT
        sgiq.sgiq_id,
        sgiq.sup_id,
        sup.supplier_name,
        sup.code AS supplier_code,
        sup.supplier_email,
        sgiq.own_emission_id
    FROM supplier_general_info_questions sgiq
    JOIN pcf_request_data_rating_stage prdrs
        ON prdrs.bom_pcf_id = sgiq.bom_pcf_id
       AND prdrs.sup_id = sgiq.sup_id
    JOIN supplier_details sup
        ON sup.sup_id = sgiq.sup_id
    WHERE prdrs.is_submitted = TRUE
),

dqr_union AS (

    /* Unified DQR ratings from the V3 questionnaire (dqr_v3_rating). The numeric
       1–5 score is in *_data_point; NULL where a dimension isn't rated for that
       row, so AVG ignores it. */
    SELECT
        ss.sup_id,
        CASE WHEN v.ter_data_point ~ '^[1-5]$' THEN v.ter_data_point::int ELSE NULL END AS ter,
        CASE WHEN v.tir_data_point ~ '^[1-5]$' THEN v.tir_data_point::int ELSE NULL END AS tir,
        CASE WHEN v.gr_data_point  ~ '^[1-5]$' THEN v.gr_data_point::int  ELSE NULL END AS gr,
        CASE WHEN v.c_data_point   ~ '^[1-5]$' THEN v.c_data_point::int   ELSE NULL END AS c,
        CASE WHEN v.pds_data_point ~ '^[1-5]$' THEN v.pds_data_point::int ELSE NULL END AS pds
    FROM dqr_v3_rating v
    JOIN supplier_sgiq ss ON ss.sgiq_id = v.sgiq_id
),
 dqr_scores AS (
    SELECT
        du.sup_id,
        ROUND(AVG(du.ter)::numeric, 2) AS total_average_value_ter,
        ROUND(AVG(du.tir)::numeric, 2) AS total_average_value_tir,
        ROUND(AVG(du.gr)::numeric, 2)  AS total_average_value_gr,
        ROUND(AVG(du.c)::numeric, 2)   AS total_average_value_c,
        ROUND(AVG(du.pds)::numeric, 2) AS total_average_value_pds,
        /* Overall = mean of the dimension averages that actually have rated
           points (a dimension with no rated points is excluded, not counted
           as 0), so the score isn't dragged down by un-rated dimensions. */
        ROUND(
            ( COALESCE(AVG(du.ter), 0) + COALESCE(AVG(du.tir), 0) + COALESCE(AVG(du.gr), 0)
            + COALESCE(AVG(du.c), 0) + COALESCE(AVG(du.pds), 0) )
            / NULLIF(
                (CASE WHEN AVG(du.ter) IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN AVG(du.tir) IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN AVG(du.gr)  IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN AVG(du.c)   IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN AVG(du.pds) IS NOT NULL THEN 1 ELSE 0 END), 0),
        2) AS overall_dqr_score
    FROM dqr_union du
    GROUP BY du.sup_id
)

SELECT
    ds.sup_id,
    ss.supplier_name,
    ss.supplier_code,
    ss.supplier_email,
    ds.total_average_value_ter,
    ds.total_average_value_tir,
    ds.total_average_value_gr,
    ds.total_average_value_c,
    ds.total_average_value_pds,
    ds.overall_dqr_score,
    CASE
        WHEN ds.overall_dqr_score <= 1.5 THEN '1 (Very Good)'
        WHEN ds.overall_dqr_score <= 2.5 THEN '2 (Good)'
        WHEN ds.overall_dqr_score <= 3.5 THEN '3 (Fair)'
        WHEN ds.overall_dqr_score <= 4.5 THEN '4 (Poor)'
        ELSE '5 (Very Poor)'
    END AS criterion,
    CASE
        WHEN ds.overall_dqr_score <= 1.5 THEN 'Fully representative, verified, recent, primary data'
        WHEN ds.overall_dqr_score <= 2.5 THEN 'High representativeness, partly verified'
        WHEN ds.overall_dqr_score <= 3.5 THEN 'Moderate accuracy, based on industry averages'
        WHEN ds.overall_dqr_score <= 4.5 THEN 'Outdated, estimated, or incomplete data'
        ELSE 'Non-representative / missing key data'
    END AS meaning_description
FROM dqr_scores ds
JOIN supplier_sgiq ss ON ss.sup_id = ds.sup_id AND ss.own_emission_id IS NULL
ORDER BY ds.overall_dqr_score DESC 
LIMIT ${limit} OFFSET ${offset};


            `;

            const result = await client.query(query);

            const rows = result.rows;
            const totalCount = rows.length > 0 ? rows.length : 0;

            return res.send(
                generateResponse(true, "Success!", 200, {
                    page,
                    pageSize: limit,
                    totalCount,
                    data: result.rows
                })
            );

        } catch (error: any) {
            console.error("❌ Error fetching supplier DQR rating:", error);
            return res.send(
                generateResponse(false, error.message, 500, null)
            );
        }
    });
}

export async function upsertFavoriteReports(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const {
                user_id,
                is_product_footprint = false,
                is_supplier_footprint = false,
                is_material_footprint = false,
                is_electricity_footprint = false,
                is_transportation_footprint = false,
                is_packaging_footprint = false,
                is_dqr_rating_footprint = false
            } = req.body;

            if (!user_id) {
                return res.status(400).send({
                    success: false,
                    message: "user_id is required"
                });
            }

            const query = `
                INSERT INTO favorite_reports (
                    fr_id,
                    user_id,
                    is_product_footprint,
                    is_supplier_footprint,
                    is_material_footprint,
                    is_electricity_footprint,
                    is_transportation_footprint,
                    is_packaging_footprint,
                    is_dqr_rating_footprint
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9
                )
                ON CONFLICT (user_id)
                DO UPDATE SET
                    is_product_footprint = EXCLUDED.is_product_footprint,
                    is_supplier_footprint = EXCLUDED.is_supplier_footprint,
                    is_material_footprint = EXCLUDED.is_material_footprint,
                    is_electricity_footprint = EXCLUDED.is_electricity_footprint,
                    is_transportation_footprint = EXCLUDED.is_transportation_footprint,
                    is_packaging_footprint = EXCLUDED.is_packaging_footprint,
                    is_dqr_rating_footprint = EXCLUDED.is_dqr_rating_footprint,
                    update_date = CURRENT_TIMESTAMP
                RETURNING *;
            `;

            const values = [
                ulid(),              // fr_id
                user_id,
                is_product_footprint,
                is_supplier_footprint,
                is_material_footprint,
                is_electricity_footprint,
                is_transportation_footprint,
                is_packaging_footprint,
                is_dqr_rating_footprint
            ];

            const result = await client.query(query, values);

            return res.status(200).send({
                success: true,
                message: "Favorite reports saved successfully",
                data: result.rows[0]
            });

        } catch (error: any) {
            console.error("Favorite reports error:", error);
            return res.status(500).send({
                success: false,
                message: error.message
            });
        }
    });
}

export async function getFavoriteReportsByUserId(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { user_id } = req.query;

            if (!user_id) {
                return res.status(400).send({
                    success: false,
                    message: "user_id is required"
                });
            }

            const result = await client.query(
                `
                SELECT
                    fr_id,
                    user_id,
                    is_product_footprint,
                    is_supplier_footprint,
                    is_material_footprint,
                    is_electricity_footprint,
                    is_transportation_footprint,
                    is_packaging_footprint,
                    is_dqr_rating_footprint,
                    created_by,
                    updated_by,
                    update_date,
                    created_date
                FROM favorite_reports
                WHERE user_id = $1
                LIMIT 1
                `,
                [user_id]
            );

            /* ---------- if no record ---------- */
            if (result.rowCount === 0) {
                return res.status(200).send({
                    success: true,
                    message: "No favorite reports found",
                    data: {
                        user_id,
                        is_product_footprint: false,
                        is_supplier_footprint: false,
                        is_material_footprint: false,
                        is_electricity_footprint: false,
                        is_transportation_footprint: false,
                        is_packaging_footprint: false,
                        is_dqr_rating_footprint: false
                    }
                });
            }

            return res.status(200).send({
                success: true,
                message: "Favorite reports fetched successfully",
                data: result.rows[0]
            });

        } catch (error: any) {
            console.error("Fetch favorite reports error:", error);
            return res.status(500).send({
                success: false,
                message: error.message
            });
        }
    });
}

// ============================================================
// Generate PCF Product Carbon Footprint Report (PDF)
// Aggregates data from bom_pcf_request, bom, and bom_emission_*
// calculation tables, then renders a branded PDF report.
// Available only for PCF requests in 'Completed' status.
// ============================================================
export async function generatePcfReportPdf(req: any, res: any) {
    const pcfRequestId = req.params?.pcfRequestId || req.params?.id;
    if (!pcfRequestId) {
        return res.status(400).send(generateResponse(false, "pcfRequestId is required", 400, null));
    }

    return withClient(async (client: any) => {
        try {
            // 1. PCF request header
            const pcfRes = await client.query(
                `SELECT pcf.id, pcf.code, pcf.request_title, pcf.request_organization,
                        pcf.status, pcf.product_code, pcf.model_version,
                        pcf.overall_pcf, pcf.created_date, pcf.created_by,
                        u.user_name AS submitted_by,
                        pcat.name AS product_category_name,
                        ccat.name AS component_category_name
                 FROM bom_pcf_request pcf
                 LEFT JOIN users_table u ON u.user_id = pcf.created_by
                 LEFT JOIN product_category pcat ON pcat.id = pcf.product_category_id
                 LEFT JOIN component_category ccat ON ccat.id = pcf.component_category_id
                 WHERE pcf.id = $1
                 LIMIT 1`,
                [pcfRequestId]
            );
            if (pcfRes.rows.length === 0) {
                return res.status(404).send(generateResponse(false, "PCF request not found", 404, null));
            }
            const pcf = pcfRes.rows[0];

            const status = String(pcf.status || "").toLowerCase().trim();
            if (status !== "completed") {
                return res.status(400).send(generateResponse(false,
                    "Report is available only for completed PCF requests", 400, null));
            }

            // 2. BOM components for this PCF
            // Suppliers live in supplier_details (sup_id PK), not users_table.
            // Prefer organization_name from the questionnaire so the BOM name
            // matches the appendix supplier headers.
            const bomRes = await client.query(
                `SELECT b.id, b.code, b.material_number, b.component_name,
                        b.qunatity AS quantity, b.weight_gms, b.total_weight_gms,
                        b.supplier_id,
                        COALESCE(sgiq.organization_name,
                                 sd.supplier_company_name,
                                 sd.supplier_name) AS supplier_name,
                        sd.supplier_email
                 FROM bom b
                 LEFT JOIN supplier_details sd ON sd.sup_id = b.supplier_id
                 LEFT JOIN supplier_general_info_questions sgiq
                        ON sgiq.sup_id = b.supplier_id
                       AND sgiq.bom_pcf_id = b.bom_pcf_id
                 WHERE b.bom_pcf_id = $1
                 ORDER BY b.id ASC`,
                [pcfRequestId]
            );

            // 3. Per-BOM emission totals (lifecycle phase split)
            // The calc engine tables only populate bom_id (not product_bom_pcf_id),
            // so filter via the bom table.
            const calcRes = await client.query(
                `SELECT e.bom_id, e.material_value, e.production_value,
                        e.packaging_value, e.logistic_value, e.waste_value,
                        e.total_pcf_value
                 FROM bom_emission_calculation_engine e
                 INNER JOIN bom b ON b.id = e.bom_id
                 WHERE b.bom_pcf_id = $1 AND e.product_id IS NULL`,
                [pcfRequestId]
            );
            const calcByBom = new Map<string, any>();
            for (const r of calcRes.rows) calcByBom.set(r.bom_id, r);

            // 4. Production breakdown for Scope 1/2 split
            const prodRes = await client.query(
                `SELECT e.bom_id,
                        e.production_electricity_energy_use_per_unit_kWh AS elec_kwh,
                        e.production_heat_energy_use_per_unit_kWh AS heat_kwh,
                        e.production_cooling_energy_use_per_unit_kWh AS cool_kwh,
                        e.production_steam_energy_use_per_unit_kWh AS steam_kwh,
                        e.emission_factor_of_electricity AS ef_elec,
                        e.emission_factor_of_heat AS ef_heat,
                        e.emission_factor_of_cooling AS ef_cool,
                        e.emission_factor_of_steam AS ef_steam
                 FROM bom_emission_production_calculation_engine e
                 INNER JOIN bom b ON b.id = e.bom_id
                 WHERE b.bom_pcf_id = $1`,
                [pcfRequestId]
            );
            const prodByBom = new Map<string, any>();
            for (const r of prodRes.rows) prodByBom.set(r.bom_id, r);

            // 5. Build per-component emission rows
            const components: PcfReportComponent[] = bomRes.rows.map((b: any) => {
                const calc = calcByBom.get(b.id) || {};
                const prod = prodByBom.get(b.id) || {};
                const num = (v: any) => Number(v) || 0;

                // Production fuel split for Scope 1 / 2
                // Scope 1: heat + steam (assumed on-site combustion)
                // Scope 2: electricity + cooling (assumed grid-derived)
                const elec = num(prod.elec_kwh) * num(prod.ef_elec);
                const heat = num(prod.heat_kwh) * num(prod.ef_heat);
                const cool = num(prod.cool_kwh) * num(prod.ef_cool);
                const steam = num(prod.steam_kwh) * num(prod.ef_steam);

                const productionScope1 = heat + steam;
                const productionScope2 = elec + cool;
                const scope3 = num(calc.material_value) + num(calc.packaging_value)
                    + num(calc.logistic_value) + num(calc.waste_value);

                return {
                    componentName: b.component_name || "Unnamed",
                    materialNumber: b.material_number || "—",
                    supplierName: b.supplier_name || "—",
                    weightKg: num(b.weight_gms) / 1000,
                    quantity: Number(b.quantity) || 0,
                    scopeOne: productionScope1,
                    scopeTwo: productionScope2,
                    scopeThree: scope3,
                    totalCo2e: num(calc.total_pcf_value),
                    material: num(calc.material_value),
                    production: num(calc.production_value),
                    packaging: num(calc.packaging_value),
                    logistic: num(calc.logistic_value),
                    waste: num(calc.waste_value),
                };
            });

            // 6. Aggregate phase + scope totals
            const totalsByPhase = components.reduce(
                (acc, c) => ({
                    material: acc.material + c.material,
                    production: acc.production + c.production,
                    packaging: acc.packaging + c.packaging,
                    logistic: acc.logistic + c.logistic,
                    waste: acc.waste + c.waste,
                }),
                { material: 0, production: 0, packaging: 0, logistic: 0, waste: 0 }
            );
            const totalsByScope = components.reduce(
                (acc, c) => ({
                    scopeOne: acc.scopeOne + c.scopeOne,
                    scopeTwo: acc.scopeTwo + c.scopeTwo,
                    scopeThree: acc.scopeThree + c.scopeThree,
                }),
                { scopeOne: 0, scopeTwo: 0, scopeThree: 0 }
            );

            const totalCo2e = Number(pcf.overall_pcf)
                || components.reduce((s, c) => s + c.totalCo2e, 0);

            // 7. Supplier appendix — group BOM rows by supplier and fetch their questionnaire data
            const supplierAppendix = await buildSupplierAppendix(client, pcfRequestId, bomRes.rows);

            // 8. Render PDF
            const reportingPeriod = (() => {
                const d = new Date(pcf.created_date || Date.now());
                return `FY ${d.getFullYear()}`;
            })();
            const productName = pcf.request_title
                || pcf.product_category_name
                || pcf.component_category_name
                || "Product";

            const pdfBuffer = await generatePcfReportPdfBuffer({
                pcfRequestNumber: pcf.code || pcfRequestId,
                productName,
                clientName: pcf.request_organization || pcf.submitted_by || "—",
                reportingPeriod,
                generationDate: new Date().toISOString(),
                totalCo2e,
                functionalUnit: "1 unit of finished product",
                systemBoundary: "Cradle-to-gate",
                gwpSet: "IPCC AR6, 100-year GWP",
                totalsByPhase,
                totalsByScope,
                components,
                methodology: {
                    standard: "Catena-X / ISO 14067:2018 / GHG Protocol Product Standard",
                    allocationMethod: "Mass-based allocation across co-products and shared infrastructure",
                    cutoffCriteria: "Inputs contributing less than 1% of total mass excluded; cumulative excluded inputs do not exceed 3% of total mass.",
                },
                dataSources: {
                    primary: "Supplier-provided questionnaire responses (component composition, packaging, transport, energy, waste)",
                    secondary: "BAFU: 2025 Version 2 Emission Factor Database",
                    backgroundEf: "Region- and year-matched emission factors from BAFU Database and IPCC AR6 characterization",
                },
                supplierAppendix,
            });

            const sanitizedProduct = String(productName)
                .replace(/[^a-zA-Z0-9]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_$/g, "")
                .slice(0, 60);
            const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
            const filename = `EnviGuide_PCF_${pcf.code || "Report"}_${sanitizedProduct}_${dateStr}.pdf`;

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Length", pdfBuffer.length.toString());
            return res.end(pdfBuffer);
        } catch (error: any) {
            console.error("generatePcfReportPdf error:", error);
            return res.status(500).send(generateResponse(false,
                error.message || "Failed to generate PCF report", 500, null));
        }
    });
}

// ============================================================
// Supplier appendix builder
// One section per supplier, listing the components they supplied
// and a curated set of their questionnaire answers.
// ============================================================
async function buildSupplierAppendix(
    client: any,
    pcfRequestId: string,
    bomRows: any[]
): Promise<PcfReportSupplierAppendix[]> {
    // Group BOM components by supplier
    const bySupplier = new Map<string, { name: string; email: string; components: string[] }>();
    for (const b of bomRows) {
        if (!b.supplier_id) continue;
        if (!bySupplier.has(b.supplier_id)) {
            bySupplier.set(b.supplier_id, {
                name: b.supplier_name || "Supplier",
                email: b.supplier_email || "",
                components: [],
            });
        }
        bySupplier.get(b.supplier_id)!.components.push(b.component_name || b.material_number || "—");
    }
    if (bySupplier.size === 0) return [];

    const supplierIds = Array.from(bySupplier.keys());

    // Fetch supplier general info questionnaire snapshot.
    // Only the fields actually filled in the questionnaire are surfaced in the
    // appendix — Designation / Core business activity / No. of employees are
    // currently disabled in the form, so they're not pulled.
    let sgiqRows: any[] = [];
    try {
        const r = await client.query(
            `SELECT sgiq.sgiq_id, sgiq.sup_id, sgiq.bom_pcf_id,
                    sgiq.organization_name, sgiq.email_address,
                    sgiq.annual_reporting_period
             FROM supplier_general_info_questions sgiq
             WHERE sgiq.bom_pcf_id = $1 AND sgiq.sup_id = ANY($2::text[])`,
            [pcfRequestId, supplierIds]
        );
        sgiqRows = r.rows;
    } catch {
        // Table or columns may differ — keep appendix lightweight on error
        sgiqRows = [];
    }
    const sgiqBySupplier = new Map<string, any>();
    for (const r of sgiqRows) sgiqBySupplier.set(r.sup_id, r);

    const out: PcfReportSupplierAppendix[] = [];
    for (const [sup_id, info] of bySupplier.entries()) {
        const sgiq = sgiqBySupplier.get(sup_id) || {};
        const orgName = sgiq.organization_name || info.name;

        const orgItems = [
            { label: "Organization name", value: orgName || "—" },
            { label: "Contact email", value: sgiq.email_address || info.email || "—" },
            { label: "Reporting period", value: sgiq.annual_reporting_period || "—" },
        ];

        out.push({
            supplierName: orgName,
            supplierEmail: sgiq.email || info.email,
            componentsSupplied: info.components,
            responses: [
                { section: "Organization", items: orgItems },
            ],
        });
    }

    return out;
}

export async function getProductFootPrintDiagnostic(_req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const pcfStatusCounts = await client.query(`
                SELECT status, COUNT(*)::int AS count
                FROM bom_pcf_request
                GROUP BY status
                ORDER BY status;
            `);

            const bomCalcCounts = await client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE is_bom_calculated = TRUE)::int  AS calculated,
                    COUNT(*) FILTER (WHERE is_bom_calculated = FALSE)::int AS not_calculated,
                    COUNT(*)::int AS total
                FROM bom;
            `);

            const reportRowCount = await client.query(`
                SELECT COUNT(*)::int AS count
                FROM bom b
                WHERE b.is_bom_calculated = TRUE;
            `);

            // Completed PCFs whose BOMs are not all flagged calculated.
            const mismatchedPcfs = await client.query(`
                SELECT
                    pcf.id,
                    pcf.code,
                    pcf.request_title,
                    pcf.status,
                    COUNT(b.id)::int                                                AS bom_total,
                    COUNT(b.id) FILTER (WHERE b.is_bom_calculated = TRUE)::int      AS bom_calculated,
                    COUNT(b.id) FILTER (WHERE b.is_bom_calculated = FALSE)::int     AS bom_not_calculated
                FROM bom_pcf_request pcf
                LEFT JOIN bom b ON b.bom_pcf_id = pcf.id
                WHERE pcf.status = 'Completed'
                GROUP BY pcf.id, pcf.code, pcf.request_title, pcf.status
                HAVING COUNT(b.id) FILTER (WHERE b.is_bom_calculated = FALSE) > 0
                    OR COUNT(b.id) = 0
                ORDER BY pcf.created_date DESC;
            `);

            // Completed PCFs whose BOMs ARE all flagged calculated -> visible in report.
            const visiblePcfCount = await client.query(`
                SELECT COUNT(*)::int AS count
                FROM bom_pcf_request pcf
                WHERE pcf.status = 'Completed'
                  AND EXISTS (SELECT 1 FROM bom b WHERE b.bom_pcf_id = pcf.id AND b.is_bom_calculated = TRUE);
            `);

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    pcf_request_status_breakdown: pcfStatusCounts.rows,
                    bom_calculation_breakdown: bomCalcCounts.rows[0],
                    product_footprint_visible_rows: reportRowCount.rows[0].count,
                    completed_pcfs_visible_in_report: visiblePcfCount.rows[0].count,
                    completed_pcfs_with_missing_bom_calculations: mismatchedPcfs.rows
                })
            );
        } catch (error: any) {
            console.error("Error running product footprint diagnostic:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to run diagnostic"
            });
        }
    });
}
