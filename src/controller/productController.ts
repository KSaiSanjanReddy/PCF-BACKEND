import { withClient } from '../util/database.js';
import { ulid } from 'ulid';
import { generateResponse } from '../util/genRes.js';
import { add, roundDp, truncDp } from '../util/decimalMath.js';
import { assertScopeThreeBomRowsValid } from '../services/scopeThreeBomValidation.js';

export async function createProduct(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            await client.query("BEGIN");

            const {
                product_name,
                product_category_id,
                product_sub_category_id,
                description,
                ts_weight_kg,
                ts_dimensions,
                ts_material,
                ts_manufacturing_process_id,
                ts_supplier,
                ts_part_number,
                ed_estimated_pcf,
                ed_recyclability,
                ed_life_cycle_stage_id,
                ed_renewable_energy,
                product_status,
                client_or_manufacturer_ids
            } = req.body;

            const created_by = req.user_id;
            const id = ulid();

            // if (!product_code || product_code.trim() === "") {
            //     return res.send(generateResponse(false, "product_code is required", 400, null));
            // }

            // === Generate new code ===
            const lastCodeRes = await client.query(
                `SELECT product_code FROM product 
         WHERE product_code LIKE 'PRO%' 
         ORDER BY created_date DESC 
         LIMIT 1;`
            );

            let product_code = "PRO00001";
            if (lastCodeRes.rows.length > 0) {
                const lastCode = lastCodeRes.rows[0].product_code; // e.g. "PRO00012"
                const numPart = parseInt(lastCode.replace("PRO", ""), 10);
                const nextNum = numPart + 1;
                product_code = "PRO" + String(nextNum).padStart(5, "0");
            }

            if (!product_name || product_name.trim() === "") {
                return res.send(generateResponse(false, "product_name is required", 400, null));
            }
            if (!product_category_id || product_category_id.trim() === "") {
                return res.send(generateResponse(false, "product_category_id is required", 400, null));
            }

            // 🔍 CHECK IF PRODUCT CODE ALREADY EXISTS
            // const codeCheck = await client.query(
            //     `SELECT id FROM product WHERE product_code = $1`,
            //     [product_code]
            // );

            // if (codeCheck.rows.length > 0) {
            //     await client.query("ROLLBACK");
            //     return res.send(
            //         generateResponse(false, "Product code already exists", 400, null)
            //     );
            // }

            const insertQuery = `
                INSERT INTO product (
                    id, product_code, product_name, product_category_id, 
                    product_sub_category_id, description, ts_weight_kg, 
                    ts_dimensions, ts_material, ts_manufacturing_process_id, 
                    ts_supplier, ts_part_number, ed_estimated_pcf, 
                    ed_recyclability, ed_life_cycle_stage_id, 
                    ed_renewable_energy, created_by,product_status,client_or_manufacturer_ids
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
                ) RETURNING *;
            `;

            const result = await client.query(insertQuery, [
                id, product_code, product_name, product_category_id,
                product_sub_category_id, description, ts_weight_kg,
                ts_dimensions, ts_material, ts_manufacturing_process_id,
                ts_supplier, ts_part_number, ed_estimated_pcf,
                ed_recyclability, ed_life_cycle_stage_id,
                ed_renewable_energy, created_by, product_status,
                client_or_manufacturer_ids
            ]);

            await client.query("COMMIT");

            return res.send(generateResponse(true, "Product created", 200, result.rows[0]));

        } catch (error: any) {
            await client.query("ROLLBACK");
            return res.send(generateResponse(false, error.message, 400, null));
        }
    });
}

export async function updateProduct(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            await client.query("BEGIN");

            const {
                id,
                product_name,
                product_category_id,
                product_sub_category_id,
                description,
                ts_weight_kg,
                ts_dimensions,
                ts_material,
                ts_manufacturing_process_id,
                ts_supplier,
                ts_part_number,
                ed_estimated_pcf,
                ed_recyclability,
                ed_life_cycle_stage_id,
                ed_renewable_energy,
                product_status,
                own_emission_status,
                client_or_manufacturer_ids
            } = req.body;

            const updated_by = req.user_id;

            if (!product_name || product_name.trim() === "") {
                return res.send(generateResponse(false, "product_name is required", 400, null));
            }
            if (!product_category_id || product_category_id.trim() === "") {
                return res.send(generateResponse(false, "product_category_id is required", 400, null));
            }


            const updateQuery = `
                UPDATE product
                SET 
                    product_name = $1,
                    product_category_id = $2,
                    product_sub_category_id = $3,
                    description = $4,
                    ts_weight_kg = $5,
                    ts_dimensions = $6,
                    ts_material = $7,
                    ts_manufacturing_process_id = $8,
                    ts_supplier = $9,
                    ts_part_number = $10,
                    ed_estimated_pcf = $11,
                    ed_recyclability = $12,
                    ed_life_cycle_stage_id = $13,
                    ed_renewable_energy = $14,
                    updated_by = $15,
                    update_date = NOW(),
                    product_status=$17,
                    client_or_manufacturer_ids=$18
                WHERE id = $16
                RETURNING *;
            `;

            const result = await client.query(updateQuery, [
                product_name,
                product_category_id,
                product_sub_category_id,
                description,
                ts_weight_kg,
                ts_dimensions,
                ts_material,
                ts_manufacturing_process_id,
                ts_supplier,
                ts_part_number,
                ed_estimated_pcf,
                ed_recyclability,
                ed_life_cycle_stage_id,
                ed_renewable_energy,
                updated_by,
                id,
                product_status,
                client_or_manufacturer_ids
            ]);

            const own_emission_id = result.rows[0].own_emission_id

            if (own_emission_id) {
                const updateStatusOwnEmission = `
                UPDATE own_emission
                SET own_emission_status = $1,
                WHERE id = $2
                RETURNING *;
            `;

                await client.query(updateStatusOwnEmission, [
                    own_emission_status,
                    own_emission_id
                ]);
            }
            await client.query("COMMIT");

            return res.send(generateResponse(true, "Product updated", 200, result.rows[0]));

        } catch (err: any) {
            await client.query("ROLLBACK");
            return res.send(generateResponse(false, err.message, 400, null));
        }
    });
}

export async function getProductById(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { id, bom_pcf_id } = req.query;

            const productQuery = `
                SELECT p.*,
                       pc.code AS category_code,
                       pc.name AS category_name,
                       sc.code AS sub_category_code,
                       sc.name AS sub_category_name,
                       mp.code AS manufacturing_process_code,
                       mp.name AS manufacturing_process_name,
                       lc.code AS life_cycle_stage_code,
                       lc.name AS life_cycle_stage_name,
                       u1.user_name AS created_by_name,
                       u2.user_name AS updated_by_name
                FROM product p
                LEFT JOIN product_category pc ON p.product_category_id = pc.id
                LEFT JOIN product_sub_category sc ON p.product_sub_category_id = sc.id
                LEFT JOIN manufacturing_process mp ON p.ts_manufacturing_process_id = mp.id
                LEFT JOIN life_cycle_stage lc ON p.ed_life_cycle_stage_id = lc.id
                LEFT JOIN users_table u1 ON p.created_by = u1.user_id
                LEFT JOIN users_table u2 ON p.updated_by = u2.user_id
                WHERE p.id = $1;
            `;

            const productResult = await client.query(productQuery, [id]);

            if (productResult.rows.length === 0) {
                return res.send(generateResponse(false, "Product not found", 404, null));
            }

            let product = productResult.rows[0];

            /* ---------- OWN EMISSION ---------- */
            const ownEmissionQuery = `
                SELECT oe.*,
                       cm.name AS calculation_method_name,
                       u1.user_name AS created_by_name,
                       u2.user_name AS updated_by_name
                FROM own_emission oe
                LEFT JOIN calculation_method cm ON oe.id = cm.id
                LEFT JOIN users_table u1 ON oe.created_by = u1.user_id
                LEFT JOIN users_table u2 ON oe.updated_by = u2.user_id
                WHERE oe.product_id = $1
                ${bom_pcf_id ? `AND oe.bom_pcf_id = $2` : ``}
            `;

            const ownEmissionParams = bom_pcf_id ? [id, bom_pcf_id] : [id];
            const ownEmissionResult = await client.query(
                ownEmissionQuery,
                ownEmissionParams
            );

            product.own_emission = ownEmissionResult.rows || [];


            /* ---------- ATTACH PCF DETAILS ---------- */
            for (const oe of product.own_emission) {
                oe.pcf_details = oe.bom_pcf_id
                    ? await getOwnEmissionWithBOMDetailsById(
                        client,
                        oe.bom_pcf_id,
                        oe.client_id,
                        oe.id
                    )
                    : null;

                oe.pcf_dqr_data_collection_stage =
                    await getPcfDqrDataCollectionStage(
                        client,
                        oe.bom_pcf_id,
                        oe.client_id
                    );
            }

            // ---------- Fetch Own Emission (Separate) ----------
            // const ownEmissionQuery = `
            //     SELECT oe.*,
            //            cm.name AS calculation_method_name,
            //            u1.user_name AS created_by_name,
            //            u2.user_name AS updated_by_name
            //     FROM own_emission oe
            //     LEFT JOIN calculation_method cm ON oe.id = cm.id
            //     LEFT JOIN users_table u1 ON oe.created_by = u1.user_id
            //     LEFT JOIN users_table u2 ON oe.updated_by = u2.user_id
            //     WHERE oe.product_id = $1;
            // `;

            // const ownEmissionResult = await client.query(ownEmissionQuery, [id]);
            // product.own_emission = ownEmissionResult.rows || [];

            // /* ---------- ATTACH PCF DETAILS PER OWN EMISSION ---------- */
            // for (const oe of product.own_emission) {
            //     if (oe.bom_pcf_id) {
            //         oe.pcf_details = await getOwnEmissionWithBOMDetailsById(
            //             client,
            //             oe.bom_pcf_id,
            //             oe.client_id
            //         );
            //     } else {
            //         oe.pcf_details = null;
            //     }
            // }

            return res.send(generateResponse(true, "Fetched successfully", 200, product));


        } catch (err: any) {
            return res.send(generateResponse(false, err.message, 400, null));
        }
    });
}

// export async function getOwnEmissionWithBOMDetailsById(
//     client: any,
//     bom_pcf_id: string,
//     client_id: string
// ) {

//     const result = await client.query(
//         `
// WITH base_pcf AS (
//     SELECT
//         pcf.id,
//         pcf.code,
//         pcf.request_title,
//         pcf.priority,
//         pcf.request_organization,
//         pcf.due_date,
//         pcf.request_description,
//         pcf.status,
//         pcf.model_version,
//         pcf.overall_pcf,
//         pcf.is_approved,
//         pcf.is_rejected,
//         pcf.reject_reason,
//         pcf.rejected_by,
//         pcf.is_draft,
//         pcf.created_date,
//         pcf.product_code,
//         pcf.client_id,

//         pcf.product_category_id,
//         pcf.component_category_id,
//         pcf.component_type_id,
//         pcf.manufacturer_id

//     FROM bom_pcf_request pcf
//     WHERE pcf.id = $1 AND pcf.client_id =$2
// )

// SELECT
//     base_pcf.*,

//     /* ---------------- Category Details ---------------- */
//     jsonb_build_object(
//         'id', pc.id,
//         'code', pc.code,
//         'name', pc.name
//     ) AS product_category,

//     jsonb_build_object(
//         'id', cc.id,
//         'code', cc.code,
//         'name', cc.name
//     ) AS component_category,

//     jsonb_build_object(
//         'id', ct.id,
//         'code', ct.code,
//         'name', ct.name
//     ) AS component_type,

//     jsonb_build_object(
//         'id', m.id,
//         'code', m.code,
//         'name', m.name,
//         'address', m.address,
//         'lat', m.lat,
//         'long', m.long
//     ) AS manufacturer,

//     jsonb_build_object(
//         'user_id', urb.user_id,
//         'user_role', urb.user_role,
//         'user_name', urb.user_name
//     ) AS rejectedBy,

//     /* ---------------- Product Specifications ---------------- */
//     COALESCE(
//         jsonb_agg(
//             DISTINCT jsonb_build_object(
//                 'id', ps.id,
//                 'specification_name', ps.specification_name,
//                 'specification_value', ps.specification_value,
//                 'specification_unit', ps.specification_unit
//             )
//         ) FILTER (WHERE ps.id IS NOT NULL),
//         '[]'
//     ) AS product_specifications,

// /* ---------------- BOM List (FULL DETAILS) ---------------- */
// COALESCE(
//     jsonb_agg(
//         DISTINCT jsonb_build_object(
//             'id', b.id,
//             'code', b.code,
//             'product_id', b.product_id,
//             'bom_pcf_id', b.bom_pcf_id,
//             'client_id', b.client_id


//             /* ---------- MATERIAL EMISSION ---------- */
//             'material_emission', (
//                 SELECT jsonb_agg(to_jsonb(mem))
//                 FROM bom_emission_material_calculation_engine mem
//                 WHERE mem.product_bom_pcf_id = b.bom_pcf_id AND mem.product_id = b.product_id AND bom_id IS NULL
//             ),

//             /* ---------- PRODUCTION EMISSION ---------- */
//             'production_emission_calculation', (
//                 SELECT to_jsonb(mep)
//                 FROM bom_emission_production_calculation_engine mep
//                 WHERE mep.product_bom_pcf_id = b.bom_pcf_id AND mep.product_id = b.product_id AND bom_id IS NULL
//                 LIMIT 1
//             ),

//             /* ---------- PACKAGING EMISSION ---------- */
//             'packaging_emission_calculation', (
//                 SELECT to_jsonb(mpk)
//                 FROM bom_emission_packaging_calculation_engine mpk
//                 WHERE mpk.product_bom_pcf_id = b.bom_pcf_id AND mpk.product_id = b.product_id AND bom_id IS NULL
//                 LIMIT 1
//             ),

//             /* ---------- WASTE EMISSION ---------- */
//             'waste_emission_calculation', (
//                 SELECT to_jsonb(mw)
//                 FROM bom_emission_waste_calculation_engine mw
//                 WHERE mw.product_bom_pcf_id = b.bom_pcf_id AND mw.product_id = b.product_id AND bom_id IS NULL
//                 LIMIT 1
//             ),

//             /* ---------- LOGISTIC EMISSION ---------- */
//             'logistic_emission_calculation', (
//                 SELECT to_jsonb(ml)
//                 FROM bom_emission_logistic_calculation_engine ml
//                 WHERE ml.product_bom_pcf_id = b.bom_pcf_id AND ml.product_id = b.product_id AND bom_id IS NULL
//                 LIMIT 1
//             ),

//             /* ---------- TOTAL PCF ---------- */
//             'pcf_total_emission_calculation', (
//                 SELECT to_jsonb(pcfe)
//                 FROM bom_emission_calculation_engine pcfe
//                 WHERE pcfe.product_bom_pcf_id = b.bom_pcf_id AND pcfe.product_id = b.product_id AND bom_id IS NULL
//                 LIMIT 1
//             ),

//             /* ---------- ALLOCATION METHODOLOGY ---------- */
//             'allocation_methodology', (
//                 SELECT to_jsonb(am)
//                 FROM allocation_methodology am
//                 WHERE am.product_bom_pcf_id = b.bom_pcf_id AND am.product_id = b.product_id AND bom_id IS NULL
//                 LIMIT 1
//             )
//         )
//     ) FILTER (WHERE b.id IS NOT NULL),
//     '[]'
// ) AS bom_list,

//     /* ---------------- PCF STAGES (1–1 OBJECT) ---------------- */
//     jsonb_build_object(
//         'id', st.id,
//         'bom_pcf_id', st.bom_pcf_id,
//         'is_pcf_request_created', st.is_pcf_request_created,
//         'is_pcf_request_submitted', st.is_pcf_request_submitted,
//         'is_bom_verified', st.is_bom_verified,
//         'is_data_collected', st.is_data_collected,
//         'is_dqr_completed', st.is_dqr_completed,
//         'is_pcf_calculated', st.is_pcf_calculated,
//         'is_result_validation_verified', st.is_result_validation_verified,
//         'is_result_submitted', st.is_result_submitted,
//         'pcf_request_created_by', st.pcf_request_created_by,
//         'pcf_request_submitted_by', st.pcf_request_submitted_by,
//         'bom_verified_by', st.bom_verified_by,
//         'dqr_completed_by', st.dqr_completed_by,
//         'pcf_calculated_by', st.pcf_calculated_by,
//         'result_validation_verified_by', st.result_validation_verified_by,
//         'result_submitted_by', st.result_submitted_by,
//         'pcf_request_created_date', st.pcf_request_created_date,
//         'pcf_request_submitted_date', st.pcf_request_submitted_date,
//         'bom_verified_date', st.bom_verified_date,
//         'dqr_completed_date', st.dqr_completed_date,
//         'pcf_calculated_date', st.pcf_calculated_date,
//         'result_validation_verified_date', st.result_validation_verified_date,
//         'result_submitted_date', st.result_submitted_date,
//         'update_date', st.update_date,
//         'created_date', st.created_date,
//         'pcf_request_created_by', jsonb_build_object(
//             'user_id', ucb.user_id,
//             'user_role', ucb.user_role,
//             'user_name', ucb.user_name
//         ),
//         'pcf_request_submitted_by', jsonb_build_object(
//             'user_id', usb.user_id,
//             'user_role', usb.user_role,
//             'user_name', usb.user_name
//         ),
//          'bom_verified_by', jsonb_build_object(
//             'user_id', uvb.user_id,
//             'user_role', uvb.user_role,
//             'user_name', uvb.user_name
//         )
//     ) AS pcf_request_stages,

// /* ---------------- PCF DQR DATA COLLECTION STAGE ---------------- */
// COALESCE(
//     (
//         SELECT jsonb_agg(
//             jsonb_build_object(
//                 'id', dcsr.id,
//                /*  'bom_id', dcsr.bom_id,*/
//                 'submitted_by', dcsr.submitted_by,

//                 /* ---------- Client (from users_table) ---------- */
//                 'client', jsonb_build_object(
//                     'user_id', uc.user_id,
//                     'user_name', uc.user_name,
//                     'user_role', uc.user_role
//                 ),

//                 'submittedBy', jsonb_build_object(
//                     'user_id', usmb.user_id,
//                     'user_role', usmb.user_role,
//                     'user_name', usmb.user_name
//                 ),

//                 'is_submitted', dcsr.is_submitted,
//                 'completed_date', dcsr.completed_date,
//                 'created_date', dcsr.created_date,
//                 'update_date', dcsr.update_date
//             )
//         )
//         FROM pcf_request_data_rating_stage dcsr
//         LEFT JOIN users_table uc ON uc.user_id = dcsr.client_id
//         LEFT JOIN users_table usmb ON usmb.user_id = dcsr.submitted_by
//         WHERE dcsr.bom_pcf_id = base_pcf.id AND dcsr.sup_id IS NULL
//     ),
//     '[]'
// ) AS pcf_data_dqr_rating_stage


// FROM base_pcf
// LEFT JOIN product_category pc ON pc.id = base_pcf.product_category_id
// LEFT JOIN component_category cc ON cc.id = base_pcf.component_category_id
// LEFT JOIN component_type ct ON ct.id = base_pcf.component_type_id
// LEFT JOIN manufacturer m ON m.id = base_pcf.manufacturer_id
// LEFT JOIN users_table urb ON urb.user_id = base_pcf.rejected_by
// LEFT JOIN bom_pcf_request_product_specification ps ON ps.bom_pcf_id = base_pcf.id
// LEFT JOIN own_emission b ON b.bom_pcf_id = base_pcf.id AND b.client_id = base_pcf.client_id AND from base pcf take product_code compare with product table fetch id then compare with own emission product_id
// LEFT JOIN supplier_details s ON s.sup_id = b.supplier_id
// LEFT JOIN pcf_request_stages st ON st.bom_pcf_id = base_pcf.id
// LEFT JOIN users_table ucb ON ucb.user_id = st.pcf_request_created_by
// LEFT JOIN users_table usb ON usb.user_id = st.pcf_request_submitted_by
// LEFT JOIN users_table uvb ON uvb.user_id = st.bom_verified_by
// 'code', b.code,
//             'product_id', b.product_id,
//             'bom_pcf_id', b.bom_pcf_id,
//             'client_id', b.client_id
// GROUP BY
//     base_pcf.id,
//     base_pcf.code,
//     base_pcf.product_id,
//     base_pcf.bom_pcf_id,
//     base_pcf.client_id,
//     base_pcf.due_date,
//     base_pcf.request_description,
//     base_pcf.status,
//     base_pcf.model_version,
//     base_pcf.overall_pcf,
//     base_pcf.is_approved,
//     base_pcf.is_rejected,
//     base_pcf.is_draft,
//     base_pcf.created_date,
//     base_pcf.product_category_id,
//     base_pcf.component_category_id,
//     base_pcf.component_type_id,
//     base_pcf.manufacturer_id,
//     usb.user_id,
//     ucb.user_id,
//     uvb.user_id,
//     base_pcf.reject_reason,
//     base_pcf.rejected_by,
//     urb.user_id,
//     pc.id,
//     cc.id,
//     ct.id,
//     m.id,
//     st.id;

// `,
//         [bom_pcf_id, client_id]
//     );

//     return result.rows.length ? result.rows[0] : null;
// }

export async function getOwnEmissionWithBOMDetailsById(
    client: any,
    bom_pcf_id: string,
    client_id: string,
    _own_emission_id: string
) {
    const result = await client.query(
        `
WITH base_pcf AS (
    SELECT *
    FROM bom_pcf_request
    WHERE id = $1
      AND client_id = $2
)

SELECT
    base_pcf.id,
    base_pcf.code,
    base_pcf.request_title,
    base_pcf.priority,
    base_pcf.request_organization,
    base_pcf.due_date,
    base_pcf.request_description,
    base_pcf.status,
    base_pcf.model_version,
    base_pcf.overall_pcf,
    base_pcf.is_approved,
    base_pcf.is_rejected,
    base_pcf.reject_reason,
    base_pcf.is_draft,
    base_pcf.created_date,
    base_pcf.product_code,
    base_pcf.client_id,

    /* ---------- CATEGORY DETAILS ---------- */
    jsonb_build_object('id', pc.id, 'code', pc.code, 'name', pc.name) AS product_category,
    jsonb_build_object('id', cc.id, 'code', cc.code, 'name', cc.name) AS component_category,
    jsonb_build_object('id', ct.id, 'code', ct.code, 'name', ct.name) AS component_type,
    jsonb_build_object('id', m.id, 'code', m.code, 'name', m.name) AS manufacturer,

    /* ---------- REJECTED BY ---------- */
    jsonb_build_object(
        'user_id', urb.user_id,
        'user_name', urb.user_name,
        'user_role', urb.user_role
    ) AS rejected_by,

    /* ---------- PRODUCT SPECIFICATIONS ---------- */
    COALESCE(
        jsonb_agg(
            DISTINCT jsonb_build_object(
                'id', ps.id,
                'specification_name', ps.specification_name,
                'specification_value', ps.specification_value,
                'specification_unit', ps.specification_unit
            )
        ) FILTER (WHERE ps.id IS NOT NULL),
        '[]'
    ) AS product_specifications,

    /* ---------- OWN EMISSION (ARRAY) ---------- */
    COALESCE(
        jsonb_agg(
            DISTINCT jsonb_build_object(
                'id', oe.id,
                'product_id', oe.product_id,
                'bom_pcf_id', oe.bom_pcf_id,
                'client_id', oe.client_id,

                'material_emission', (
                    SELECT jsonb_agg(to_jsonb(mem))
                    FROM bom_emission_material_calculation_engine mem
                    WHERE mem.product_bom_pcf_id = oe.bom_pcf_id
                      AND mem.product_id = oe.product_id
                      AND mem.bom_id IS NULL
                ),

                'production_emission', (
                    SELECT to_jsonb(mep)
                    FROM bom_emission_production_calculation_engine mep
                    WHERE mep.product_bom_pcf_id = oe.bom_pcf_id
                      AND mep.product_id = oe.product_id
                      AND mep.bom_id IS NULL
                    LIMIT 1
                ),

                'packaging_emission', (
                    SELECT to_jsonb(mpk)
                    FROM bom_emission_packaging_calculation_engine mpk
                    WHERE mpk.product_bom_pcf_id = oe.bom_pcf_id
                      AND mpk.product_id = oe.product_id
                      AND mpk.bom_id IS NULL
                    LIMIT 1
                ),

                'waste_emission', (
                    SELECT to_jsonb(mw)
                    FROM bom_emission_waste_calculation_engine mw
                    WHERE mw.product_bom_pcf_id = oe.bom_pcf_id
                      AND mw.product_id = oe.product_id
                      AND mw.bom_id IS NULL
                    LIMIT 1
                ),

                'logistic_emission', (
                    SELECT to_jsonb(ml)
                    FROM bom_emission_logistic_calculation_engine ml
                    WHERE ml.product_bom_pcf_id = oe.bom_pcf_id
                      AND ml.product_id = oe.product_id
                      AND ml.bom_id IS NULL
                    LIMIT 1
                ),

                'total_emission', (
                    SELECT to_jsonb(pcfe)
                    FROM bom_emission_calculation_engine pcfe
                    WHERE pcfe.product_bom_pcf_id = oe.bom_pcf_id
                      AND pcfe.product_id = oe.product_id
                      AND pcfe.bom_id IS NULL
                    LIMIT 1
                ),

                'allocation_methodology', (
                    SELECT to_jsonb(am)
                    FROM allocation_methodology am
                    WHERE am.product_bom_pcf_id = oe.bom_pcf_id
                      AND am.product_id = oe.product_id
                      AND am.bom_id IS NULL
                    LIMIT 1
                )
            )
        ) FILTER (WHERE oe.id IS NOT NULL),
        '[]'
    ) AS own_emission_details

    /* ---------- PCF DQR DATA COLLECTION STAGE 
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', dqr.id,
                    'is_submitted', dqr.is_submitted,
                    'completed_date', dqr.completed_date,

                    'client', jsonb_build_object(
                        'user_id', uc.user_id,
                        'user_name', uc.user_name,
                        'user_role', uc.user_role
                    ),

                    'submitted_by', jsonb_build_object(
                        'user_id', us.user_id,
                        'user_name', us.user_name,
                        'user_role', us.user_role
                    ),

                    'created_date', dqr.created_date,
                    'update_date', dqr.update_date
                )
            )
            FROM pcf_request_data_rating_stage dqr
            LEFT JOIN users_table uc ON uc.user_id = dqr.client_id
            LEFT JOIN users_table us ON us.user_id = dqr.submitted_by
            WHERE dqr.bom_pcf_id = base_pcf.id
              AND dqr.sup_id IS NULL
              AND dqr.client_id = base_pcf.client_id
              AND dqr.own_emission_id IS NOT NULL
        ),
        '[]'
    ) AS pcf_dqr_data_collection_stage ---------- */

FROM base_pcf
LEFT JOIN product p ON p.product_code = base_pcf.product_code
LEFT JOIN own_emission oe
       ON oe.bom_pcf_id = base_pcf.id
      AND oe.client_id = base_pcf.client_id
      AND oe.product_id = p.id

LEFT JOIN product_category pc ON pc.id = base_pcf.product_category_id
LEFT JOIN component_category cc ON cc.id = base_pcf.component_category_id
LEFT JOIN component_type ct ON ct.id = base_pcf.component_type_id
LEFT JOIN manufacturer m ON m.id = base_pcf.manufacturer_id
LEFT JOIN users_table urb ON urb.user_id = base_pcf.rejected_by
LEFT JOIN bom_pcf_request_product_specification ps ON ps.bom_pcf_id = base_pcf.id

GROUP BY
     base_pcf.id,
    base_pcf.code,
    base_pcf.request_title,
    base_pcf.priority,
    base_pcf.request_organization,
    base_pcf.due_date,
    base_pcf.request_description,
    base_pcf.status,
    base_pcf.model_version,
    base_pcf.overall_pcf,
    base_pcf.is_approved,
    base_pcf.is_rejected,
    base_pcf.reject_reason,
    base_pcf.is_draft,
    base_pcf.created_date,
    base_pcf.product_code,
    base_pcf.client_id,
    pc.id, cc.id, ct.id, m.id,
    urb.user_id,
    p.id;
        `,
        [bom_pcf_id, client_id]
    );

    return result.rows.length ? result.rows[0] : null;
}

export async function getPcfDqrDataCollectionStage(
    client: any,
    bom_pcf_id: string,
    client_id: string
) {
    const result = await client.query(
        `
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', dqr.id,
                'is_submitted', dqr.is_submitted,
                'completed_date', dqr.completed_date,

                'client', jsonb_build_object(
                    'user_id', uc.user_id,
                    'user_name', uc.user_name,
                    'user_role', uc.user_role
                ),

                'submitted_by', jsonb_build_object(
                    'user_id', us.user_id,
                    'user_name', us.user_name,
                    'user_role', us.user_role
                ),

                'created_date', dqr.created_date,
                'update_date', dqr.update_date
            )
        ) AS pcf_dqr_data_collection_stage
        FROM pcf_request_data_rating_stage dqr
        LEFT JOIN users_table uc ON uc.user_id = dqr.client_id
        LEFT JOIN users_table us ON us.user_id = dqr.submitted_by
        WHERE dqr.bom_pcf_id = $1
          AND dqr.client_id = $2
          AND dqr.sup_id IS NULL
          AND dqr.own_emission_id IS NOT NULL;
        `,
        [bom_pcf_id, client_id]
    );

    return result.rows[0]?.pcf_dqr_data_collection_stage || [];
}

export async function listProducts(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const {
                pageNumber = 1,
                pageSize = 10,
                start_date,
                end_date,
                category_name,
                sub_ategory_name,
                pcf_status,
                product_name,
                search = ""
            } = req.query;

            const page = pageNumber;
            const limit = pageSize;
            const offset = (Number(page) - 1) * Number(limit);

            let whereClauses: string[] = [];
            let params: any[] = [];
            let index = 1;

            if (req.user_id) {

                const userRoleQuery = `
                    SELECT user_role 
                    FROM users_table 
                    WHERE user_id = $1
                `;

                const userRoleResult = await client.query(userRoleQuery, [req.user_id]);

                if (userRoleResult.rows.length > 0) {
                    const userRole = userRoleResult.rows[0].user_role;

                    const isManufacturer =
                        userRole && userRole.toLowerCase() === "manufacturer";

                    if (isManufacturer) {
                        whereClauses.push(`$${index} = ANY(p.client_or_manufacturer_ids)`);
                        params.push(req.user_id);
                        index++;
                    }
                }
            }

            // Filter: Date Range
            if (start_date && end_date) {
                whereClauses.push(`p.update_date BETWEEN $${index} AND $${index + 1}`);
                params.push(start_date, end_date);
                index += 2;
            }

            // Filter: Category Name
            if (category_name) {
                whereClauses.push(`pc.name ILIKE $${index}`);
                params.push(`%${category_name}%`);
                index++;
            }

            if (product_name) {
                whereClauses.push(`p.product_name ILIKE $${index}`);
                params.push(`%${product_name}%`);
                index++;
            }

            if (sub_ategory_name) {
                whereClauses.push(`sc.name ILIKE $${index}`);
                params.push(`%${sub_ategory_name}%`);
                index++;
            }


            // Filter: PCF Status
            if (pcf_status) {
                whereClauses.push(`p.pcf_status = $${index}`);
                params.push(pcf_status);
                index++;
            }

            // Optional Search (product_code, product_name)
            if (search) {
                whereClauses.push(`(
                    p.product_code ILIKE $${index} OR 
                    p.product_name ILIKE $${index} OR
                    sc.name ILIKE $${index} OR
                    pc.name ILIKE $${index}
                    
                )`);
                params.push(`%${search}%`);
                index++;
            }

            const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

            const query = `
                SELECT p.*,
                       pc.code AS category_code,
                       pc.name AS category_name,
                       sc.code AS sub_category_code,
                       sc.name AS sub_category_name,
                       mp.name AS manufacturing_process_name,
                       lc.name AS life_cycle_stage_name,
                       u1.user_name AS created_by_name,
                       u2.user_name AS updated_by_name
                FROM product p
                LEFT JOIN product_category pc ON p.product_category_id = pc.id
                LEFT JOIN product_sub_category sc ON p.product_sub_category_id = sc.id
                LEFT JOIN manufacturing_process mp ON p.ts_manufacturing_process_id = mp.id
                LEFT JOIN life_cycle_stage lc ON p.ed_life_cycle_stage_id = lc.id
                LEFT JOIN users_table u1 ON p.created_by = u1.user_id
                LEFT JOIN users_table u2 ON p.updated_by = u2.user_id
                ${whereSQL}
                ORDER BY p.update_date DESC
                LIMIT ${limit} OFFSET ${offset};
            `;


            const countQuery = `
                SELECT COUNT(*) AS total
                FROM product p
                LEFT JOIN product_category pc ON p.product_category_id = pc.id
                LEFT JOIN product_sub_category sc ON p.product_sub_category_id = sc.id
                LEFT JOIN manufacturing_process mp ON p.ts_manufacturing_process_id = mp.id
                LEFT JOIN life_cycle_stage lc ON p.ed_life_cycle_stage_id = lc.id
                LEFT JOIN users_table u1 ON p.created_by = u1.user_id
                LEFT JOIN users_table u2 ON p.updated_by = u2.user_id
                ${whereSQL}
            `;

            const countResult = await client.query(
                countQuery,
                params
            );

            const total = Number(countResult.rows[0].total);

            // const totalcountQuery = `
            //     SELECT COUNT(*) AS total_records
            //     FROM product p
            //      ${whereSQL}
            // `;

            // const TotalcountResult = await client.query(
            //     totalcountQuery, params
            // );

            const totalcountQuery = `
                SELECT COUNT(*) AS total_records
                FROM product p
            `;

            const TotalcountResult = await client.query(
                totalcountQuery
            );

            const total_records = Number(TotalcountResult.rows[0].total_records);

            const result = await client.query(query, params);

            return res.send(generateResponse(true, "Fetched successfully", 200, {
                data: result.rows,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / Number(limit))
                },
                total_records: total_records
            }));

        } catch (err: any) {
            console.error("❌ Error listing products:", err);
            return res.send(generateResponse(false, err.message, 400, null));
        }
    });
}

// export async function productsDropDown(req: any, res: any) {
//     return withClient(async (client: any) => {
//         try {
//             const query = `
//                 SELECT 
//                 p.id,
//                 p.product_code,
//                 p.product_name
//                 FROM product p
//                 ORDER BY p.update_date DESC
//             `;

//             const result = await client.query(query);

//             return res.send(generateResponse(true, "Fetched successfully", 200, result.rows));

//         } catch (err: any) {
//             console.error("❌ Error listing products:", err);
//             return res.send(generateResponse(false, err.message, 400, null));
//         }
//     });
// }

// Below product dropdown based on manufacturer

export async function productsDropDown(req: any, res: any) {
    return withClient(async (client: any) => {
        try {

            let whereClause = "";
            let values: any[] = [];

            if (req.user_id) {

                const userRoleQuery = `
                    SELECT user_role 
                    FROM users_table 
                    WHERE user_id = $1
                `;

                const userRoleResult = await client.query(userRoleQuery, [req.user_id]);

                if (userRoleResult.rows.length > 0) {
                    const userRole = userRoleResult.rows[0].user_role;

                    const isManufacturer =
                        userRole && userRole.toLowerCase() === "manufacturer";

                    if (isManufacturer) {
                        // ✅ Check inside VARCHAR[] column
                        whereClause = `WHERE $1 = ANY(p.client_or_manufacturer_ids)`;
                        values.push(req.user_id);
                    }
                }
            }

            const query = `
                SELECT 
                    p.id,
                    p.product_code,
                    p.product_name
                FROM product p
                ${whereClause}
                ORDER BY p.update_date DESC
            `;

            const result = await client.query(query, values);

            return res.send(
                generateResponse(true, "Fetched successfully", 200, result.rows)
            );

        } catch (err: any) {
            console.error("❌ Error listing products:", err);
            return res.send(generateResponse(false, err.message, 400, null));
        }
    });
}


export async function getProductByCode(client: any, product_code: string) {
    const query = `
        SELECT * FROM product WHERE product_code = $1
    `;
    const result = await client.query(query, [product_code]);
    return result.rows[0];
}

// // =========> OWN EMISSION <=========
export async function pcfDropDown(req: any, res: any) {

    return withClient(async (client: any) => {
        try {
            const { product_code } = req.query;

            if (!product_code) {
                return res.send(
                    generateResponse(false, "product_code is required", 400, null)
                );
            }

            const client_id = req.user_id;
            const query = `
                 SELECT
                    bpr.id,
                    bpr.code,
                    bpr.request_title,
                    bpr.is_own_emission_calculated
                FROM bom_pcf_request bpr
                LEFT JOIN own_emission oe
                    ON oe.bom_pcf_id = bpr.id
                WHERE bpr.product_code = $1 AND bpr.created_by =$2
                ORDER BY bpr.created_date DESC
            `;

            const result = await client.query(query, [product_code, client_id]);

            return res.send(
                generateResponse(true, "Dropdown fetched successfully", 200, result.rows)
            );

        } catch (error: any) {
            return res.send(
                generateResponse(false, error.message, 400, null)
            );
        }
    });
}

export async function getByIdPcfRequestWithBOMDetails(req: any, res: any) {
    const { bom_pcf_id } = req.query;

    return withClient(async (client: any) => {
        try {
            const result = await client.query(
                `
WITH base_pcf AS (
    SELECT
        pcf.id,
        pcf.code,
        pcf.request_title,
        pcf.priority,
        pcf.request_organization,
        pcf.due_date,
        pcf.request_description,
        pcf.status,
        pcf.model_version,
        pcf.overall_pcf,
        pcf.is_approved,
        pcf.is_rejected,
        pcf.reject_reason,
        pcf.rejected_by,
        pcf.is_draft,
        pcf.created_date,

        pcf.product_category_id,
        pcf.component_category_id,
        pcf.component_type_id,
        pcf.manufacturer_id

    FROM bom_pcf_request pcf
    WHERE pcf.id = $1
)

SELECT
    base_pcf.*,

    /* ---------------- Category Details ---------------- */
    jsonb_build_object(
        'id', pc.id,
        'code', pc.code,
        'name', pc.name
    ) AS product_category,

    jsonb_build_object(
        'id', cc.id,
        'code', cc.code,
        'name', cc.name
    ) AS component_category,

    jsonb_build_object(
        'id', ct.id,
        'code', ct.code,
        'name', ct.name
    ) AS component_type,

    jsonb_build_object(
        'id', m.id,
        'code', m.code,
        'name', m.name,
        'address', m.address,
        'lat', m.lat,
        'long', m.long
    ) AS manufacturer,

    jsonb_build_object(
        'user_id', urb.user_id,
        'user_role', urb.user_role,
        'user_name', urb.user_name
    ) AS rejectedBy,

    /* ---------------- Product Specifications ---------------- */
    COALESCE(
        jsonb_agg(
            DISTINCT jsonb_build_object(
                'id', ps.id,
                'specification_name', ps.specification_name,
                'specification_value', ps.specification_value,
                'specification_unit', ps.specification_unit
            )
        ) FILTER (WHERE ps.id IS NOT NULL),
        '[]'
    ) AS product_specifications,

/* ---------------- BOM List (FULL DETAILS) ---------------- */
COALESCE(
    jsonb_agg(
        DISTINCT jsonb_build_object(
            'id', b.id,
            'code', b.code,
            'material_number', b.material_number,
            'component_name', b.component_name,
            'quantity', b.qunatity,
            'price', b.price,
            'total_price', b.total_price,
            'weight_gms', b.weight_gms,
            'economic_ratio', b.economic_ratio,
            'total_weight_gms', b.total_weight_gms,
            'production_location', b.production_location,
            'manufacturer', b.manufacturer,
            'detail_description', b.detail_description,
            'component_category', b.component_category,

            /* ---------- Supplier ---------- */
            'supplier', jsonb_build_object(
                'sup_id', s.sup_id,
                'code', s.code,
                'supplier_name', s.supplier_name,
                'supplier_email', s.supplier_email,
                'supplier_phone_number', s.supplier_phone_number
            ),

            /* ---------- MATERIAL EMISSION ---------- */
            'material_emission', (
                SELECT jsonb_agg(to_jsonb(mem))
                FROM bom_emission_material_calculation_engine mem
                WHERE mem.bom_id = b.id AND mem.product_id IS NULL
            ),

            /* ---------- PRODUCTION EMISSION ---------- */
            'production_emission_calculation', (
                SELECT to_jsonb(mep)
                FROM bom_emission_production_calculation_engine mep
                WHERE mep.bom_id = b.id AND mep.product_id IS NULL
                ORDER BY mep.created_date DESC
                LIMIT 1
            ),

            /* ---------- PACKAGING EMISSION ---------- */
            'packaging_emission_calculation', (
                SELECT to_jsonb(mpk)
                FROM bom_emission_packaging_calculation_engine mpk
                WHERE mpk.bom_id = b.id AND mpk.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- WASTE EMISSION ---------- */
            'waste_emission_calculation', (
                SELECT to_jsonb(mw)
                FROM bom_emission_waste_calculation_engine mw
                WHERE mw.bom_id = b.id AND mw.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- LOGISTIC EMISSION ---------- */
            'logistic_emission_calculation', (
                SELECT to_jsonb(ml)
                FROM bom_emission_logistic_calculation_engine ml
                WHERE ml.bom_id = b.id AND ml.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- TOTAL PCF ---------- */
            'pcf_total_emission_calculation', (
                SELECT to_jsonb(pcfe)
                FROM bom_emission_calculation_engine pcfe
                WHERE pcfe.bom_id = b.id AND pcfe.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- TRANSPORTATION DETAILS ---------- */
            'transportation_details', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'motuft_id', mt.motuft_id,
                        'mode_of_transport', mt.mode_of_transport,
                        'weight_transported', mt.weight_transported,
                        'source_point', mt.source_point,
                        'drop_point', mt.drop_point,
                        'distance', mt.distance,
                        'created_date', mt.created_date
                    )
                )
                FROM mode_of_transport_used_for_transportation_questions mt
                WHERE mt.bom_id = b.id
            ), '[]'::jsonb),

            /* ---------- ALLOCATION METHODOLOGY ---------- */
            'allocation_methodology', (
                SELECT to_jsonb(am)
                FROM allocation_methodology am
                WHERE am.bom_id = b.id
                LIMIT 1
            )
        )
    ) FILTER (WHERE b.id IS NOT NULL),
    '[]'
) AS bom_list,

    /* ---------------- PCF STAGES (1–1 OBJECT) ---------------- */
    jsonb_build_object(
        'id', st.id,
        'bom_pcf_id', st.bom_pcf_id,
        'is_pcf_request_created', st.is_pcf_request_created,
        'is_pcf_request_submitted', st.is_pcf_request_submitted,
        'is_bom_verified', st.is_bom_verified,
        'is_data_collected', st.is_data_collected,
        'is_dqr_completed', st.is_dqr_completed,
        'is_pcf_calculated', st.is_pcf_calculated,
        'is_result_validation_verified', st.is_result_validation_verified,
        'is_result_submitted', st.is_result_submitted,
        'pcf_request_created_by', st.pcf_request_created_by,
        'pcf_request_submitted_by', st.pcf_request_submitted_by,
        'bom_verified_by', st.bom_verified_by,
        'dqr_completed_by', st.dqr_completed_by,
        'pcf_calculated_by', st.pcf_calculated_by,
        'result_validation_verified_by', st.result_validation_verified_by,
        'result_submitted_by', st.result_submitted_by,
        'pcf_request_created_date', st.pcf_request_created_date,
        'pcf_request_submitted_date', st.pcf_request_submitted_date,
        'bom_verified_date', st.bom_verified_date,
        'dqr_completed_date', st.dqr_completed_date,
        'pcf_calculated_date', st.pcf_calculated_date,
        'result_validation_verified_date', st.result_validation_verified_date,
        'result_submitted_date', st.result_submitted_date,
        'update_date', st.update_date,
        'created_date', st.created_date,
        'pcf_request_created_by', jsonb_build_object(
            'user_id', ucb.user_id,
            'user_role', ucb.user_role,
            'user_name', ucb.user_name
        ),
        'pcf_request_submitted_by', jsonb_build_object(
            'user_id', usb.user_id,
            'user_role', usb.user_role,
            'user_name', usb.user_name
        ),
         'bom_verified_by', jsonb_build_object(
            'user_id', uvb.user_id,
            'user_role', uvb.user_role,
            'user_name', uvb.user_name
        )
    ) AS pcf_request_stages,

/* ---------------- PCF DATA COLLECTION STAGE ---------------- */
COALESCE(
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', dcs.id,
               /*  'bom_id', dcs.bom_id,*/

                /* ---------- Supplier ---------- */
                'supplier', jsonb_build_object(
                    'sup_id', sd.sup_id,
                    'code', sd.code,
                    'supplier_name', sd.supplier_name,
                    'supplier_email', sd.supplier_email,
                    'supplier_phone_number', sd.supplier_phone_number
                ),

                /* ---------- Client (from users_table) ---------- */
                'client', jsonb_build_object(
                    'user_id', uc.user_id,
                    'user_name', uc.user_name,
                    'user_role', uc.user_role
                ),

                /* ---------- BOM ARRAY (via bom_pcf_id + supplier) ---------- 
                'bom',
                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', b2.id,
                                'code', b2.code,
                                'material_number', b2.material_number,
                                'component_name', b2.component_name
                            )
                            ORDER BY b2.created_date DESC
                        )
                        FROM bom b2
                        WHERE b2.bom_pcf_id = dcs.bom_pcf_id
                          AND b2.supplier_id = dcs.sup_id
                    ),
                    '[]'::jsonb
                ),*/

                'is_submitted', dcs.is_submitted,
                'completed_date', dcs.completed_date,
                'created_date', dcs.created_date,
                'update_date', dcs.update_date
            )
        )
        FROM pcf_request_data_collection_stage dcs
        LEFT JOIN supplier_details sd ON sd.sup_id = dcs.sup_id
        LEFT JOIN users_table uc ON uc.user_id = dcs.client_id
        WHERE dcs.bom_pcf_id = base_pcf.id
    ),
    '[]'::jsonb
) AS pcf_data_collection_stage,


/* ---------------- PCF DQR DATA COLLECTION STAGE ---------------- */
COALESCE(
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', dcsr.id,
               /*  'bom_id', dcsr.bom_id,*/
                'submitted_by', dcsr.submitted_by,

                'supplier', jsonb_build_object(
                    'sup_id', sd.sup_id,
                    'code', sd.code,
                    'supplier_name', sd.supplier_name,
                    'supplier_email', sd.supplier_email,
                    'supplier_phone_number', sd.supplier_phone_number
                ),

              /*  'bom', jsonb_build_object(
                    'id', b2.id,
                    'code', b2.code,
                    'material_number', b2.material_number,
                    'component_name', b2.component_name
                ),*/

                'submittedBy', jsonb_build_object(
                    'user_id', usmb.user_id,
                    'user_role', usmb.user_role,
                    'user_name', usmb.user_name
                ),

                'is_submitted', dcsr.is_submitted,
                'completed_date', dcsr.completed_date,
                'created_date', dcsr.created_date,
                'update_date', dcsr.update_date
            )
        )
        FROM pcf_request_data_rating_stage dcsr
        LEFT JOIN supplier_details sd ON sd.sup_id = dcsr.sup_id
        LEFT JOIN bom b2 ON b2.id = dcsr.bom_id
        LEFT JOIN users_table usmb ON usmb.user_id = dcsr.submitted_by
        WHERE dcsr.bom_pcf_id = base_pcf.id
    ),
    '[]'
) AS pcf_data_dqr_rating_stage


FROM base_pcf
LEFT JOIN product_category pc ON pc.id = base_pcf.product_category_id
LEFT JOIN component_category cc ON cc.id = base_pcf.component_category_id
LEFT JOIN component_type ct ON ct.id = base_pcf.component_type_id
LEFT JOIN manufacturer m ON m.id = base_pcf.manufacturer_id
LEFT JOIN users_table urb ON urb.user_id = base_pcf.rejected_by
LEFT JOIN bom_pcf_request_product_specification ps ON ps.bom_pcf_id = base_pcf.id
LEFT JOIN bom b ON b.bom_pcf_id = base_pcf.id
LEFT JOIN supplier_details s ON s.sup_id = b.supplier_id
LEFT JOIN pcf_request_stages st ON st.bom_pcf_id = base_pcf.id
LEFT JOIN users_table ucb ON ucb.user_id = st.pcf_request_created_by
LEFT JOIN users_table usb ON usb.user_id = st.pcf_request_submitted_by
LEFT JOIN users_table uvb ON uvb.user_id = st.bom_verified_by
GROUP BY
    base_pcf.id,
    base_pcf.code,
    base_pcf.request_title,
    base_pcf.priority,
    base_pcf.request_organization,
    base_pcf.due_date,
    base_pcf.request_description,
    base_pcf.status,
    base_pcf.model_version,
    base_pcf.overall_pcf,
    base_pcf.is_approved,
    base_pcf.is_rejected,
    base_pcf.is_draft,
    base_pcf.created_date,
    base_pcf.product_category_id,
    base_pcf.component_category_id,
    base_pcf.component_type_id,
    base_pcf.manufacturer_id,
    usb.user_id,
    ucb.user_id,
    uvb.user_id,
    base_pcf.reject_reason,
    base_pcf.rejected_by,
    urb.user_id,
    pc.id,
    cc.id,
    ct.id,
    m.id,
    st.id;

`,
                [bom_pcf_id]
            );

            return res.status(200).send(
                generateResponse(true, "PCF request AND BOM fetched Successfully!", 200, result.rows)
            );

        } catch (error: any) {
            console.error("Error fetching PCF BOM list:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch PCF BOM list"
            });
        }
    });
}

export async function getPCFHistoryBOMDetails(req: any, res: any) {
    const { product_code } = req.query;

    return withClient(async (client: any) => {
        try {
            const result = await client.query(
                `
WITH base_pcf AS (
    SELECT
        pcf.id,
        pcf.code,
        pcf.request_title,
        pcf.priority,
        pcf.request_organization,
        pcf.due_date,
        pcf.request_description,
        pcf.status,
        pcf.model_version,
        pcf.overall_pcf,
        pcf.is_approved,
        pcf.is_rejected,
        pcf.reject_reason,
        pcf.rejected_by,
        pcf.is_draft,
        pcf.created_date,
        pcf.product_code,

        pcf.product_category_id,
        pcf.component_category_id,
        pcf.component_type_id,
        pcf.manufacturer_id

    FROM bom_pcf_request pcf
    WHERE pcf.product_code = $1
)

SELECT
    base_pcf.*,

    /* ---------------- Category Details ---------------- */
    jsonb_build_object(
        'id', pc.id,
        'code', pc.code,
        'name', pc.name
    ) AS product_category,

    jsonb_build_object(
        'id', cc.id,
        'code', cc.code,
        'name', cc.name
    ) AS component_category,

    jsonb_build_object(
        'id', ct.id,
        'code', ct.code,
        'name', ct.name
    ) AS component_type,

    jsonb_build_object(
        'id', m.id,
        'code', m.code,
        'name', m.name,
        'address', m.address,
        'lat', m.lat,
        'long', m.long
    ) AS manufacturer,

    jsonb_build_object(
        'user_id', urb.user_id,
        'user_role', urb.user_role,
        'user_name', urb.user_name
    ) AS rejectedBy,

    /* ---------------- Product Specifications ---------------- */
    COALESCE(
        jsonb_agg(
            DISTINCT jsonb_build_object(
                'id', ps.id,
                'specification_name', ps.specification_name,
                'specification_value', ps.specification_value,
                'specification_unit', ps.specification_unit
            )
        ) FILTER (WHERE ps.id IS NOT NULL),
        '[]'
    ) AS product_specifications,

/* ---------------- BOM List (FULL DETAILS) ---------------- */
COALESCE(
    jsonb_agg(
        DISTINCT jsonb_build_object(
            'id', b.id,
            'code', b.code,
            'material_number', b.material_number,
            'component_name', b.component_name,
            'quantity', b.qunatity,
            'price', b.price,
            'total_price', b.total_price,
            'weight_gms', b.weight_gms,
            'economic_ratio', b.economic_ratio,
            'total_weight_gms', b.total_weight_gms,
            'production_location', b.production_location,
            'manufacturer', b.manufacturer,
            'detail_description', b.detail_description,
            'component_category', b.component_category,

            /* ---------- Supplier ---------- */
            'supplier', jsonb_build_object(
                'sup_id', s.sup_id,
                'code', s.code,
                'supplier_name', s.supplier_name,
                'supplier_email', s.supplier_email,
                'supplier_phone_number', s.supplier_phone_number
            ),

            /* ---------- MATERIAL EMISSION ---------- */
            'material_emission', (
                SELECT jsonb_agg(to_jsonb(mem))
                FROM bom_emission_material_calculation_engine mem
                WHERE mem.bom_id = b.id AND mem.product_id IS NULL
            ),

            /* ---------- PRODUCTION EMISSION ---------- */
            'production_emission_calculation', (
                SELECT to_jsonb(mep)
                FROM bom_emission_production_calculation_engine mep
                WHERE mep.bom_id = b.id AND mep.product_id IS NULL
                ORDER BY mep.created_date DESC
                LIMIT 1
            ),

            /* ---------- PACKAGING EMISSION ---------- */
            'packaging_emission_calculation', (
                SELECT to_jsonb(mpk)
                FROM bom_emission_packaging_calculation_engine mpk
                WHERE mpk.bom_id = b.id AND mpk.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- WASTE EMISSION ---------- */
            'waste_emission_calculation', (
                SELECT to_jsonb(mw)
                FROM bom_emission_waste_calculation_engine mw
                WHERE mw.bom_id = b.id AND mw.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- LOGISTIC EMISSION ---------- */
            'logistic_emission_calculation', (
                SELECT to_jsonb(ml)
                FROM bom_emission_logistic_calculation_engine ml
                WHERE ml.bom_id = b.id AND ml.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- TOTAL PCF ---------- */
            'pcf_total_emission_calculation', (
                SELECT to_jsonb(pcfe)
                FROM bom_emission_calculation_engine pcfe
                WHERE pcfe.bom_id = b.id AND pcfe.product_id IS NULL
                LIMIT 1
            ),

            /* ---------- TRANSPORTATION DETAILS ---------- */
            'transportation_details', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'motuft_id', mt.motuft_id,
                        'mode_of_transport', mt.mode_of_transport,
                        'weight_transported', mt.weight_transported,
                        'source_point', mt.source_point,
                        'drop_point', mt.drop_point,
                        'distance', mt.distance,
                        'created_date', mt.created_date
                    )
                )
                FROM mode_of_transport_used_for_transportation_questions mt
                WHERE mt.bom_id = b.id
            ), '[]'::jsonb),

            /* ---------- ALLOCATION METHODOLOGY ---------- */
            'allocation_methodology', (
                SELECT to_jsonb(am)
                FROM allocation_methodology am
                WHERE am.bom_id = b.id
                LIMIT 1
            )
        )
    ) FILTER (WHERE b.id IS NOT NULL),
    '[]'
) AS bom_list


FROM base_pcf
LEFT JOIN product_category pc ON pc.id = base_pcf.product_category_id
LEFT JOIN component_category cc ON cc.id = base_pcf.component_category_id
LEFT JOIN component_type ct ON ct.id = base_pcf.component_type_id
LEFT JOIN manufacturer m ON m.id = base_pcf.manufacturer_id
LEFT JOIN users_table urb ON urb.user_id = base_pcf.rejected_by
LEFT JOIN bom_pcf_request_product_specification ps ON ps.bom_pcf_id = base_pcf.id
LEFT JOIN bom b ON b.bom_pcf_id = base_pcf.id
LEFT JOIN supplier_details s ON s.sup_id = b.supplier_id
LEFT JOIN pcf_request_stages st ON st.bom_pcf_id = base_pcf.id
LEFT JOIN users_table ucb ON ucb.user_id = st.pcf_request_created_by
LEFT JOIN users_table usb ON usb.user_id = st.pcf_request_submitted_by
LEFT JOIN users_table uvb ON uvb.user_id = st.bom_verified_by
GROUP BY
    base_pcf.id,
    base_pcf.code,
    base_pcf.request_title,
    base_pcf.priority,
    base_pcf.request_organization,
    base_pcf.due_date,
    base_pcf.request_description,
    base_pcf.status,
    base_pcf.model_version,
    base_pcf.overall_pcf,
    base_pcf.is_approved,
    base_pcf.is_rejected,
    base_pcf.is_draft,
    base_pcf.created_date,
    base_pcf.product_category_id,
    base_pcf.component_category_id,
    base_pcf.component_type_id,
    base_pcf.manufacturer_id,
    base_pcf.product_code,
    usb.user_id,
    ucb.user_id,
    uvb.user_id,
    base_pcf.reject_reason,
    base_pcf.rejected_by,
    urb.user_id,
    pc.id,
    cc.id,
    ct.id,
    m.id,
    st.id;

`,
                [product_code]
            );

            return res.status(200).send(
                generateResponse(true, "PCF request AND BOM fetched Successfully!", 200, result.rows)
            );

        } catch (error: any) {
            console.error("Error fetching PCF BOM list:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch PCF BOM list"
            });
        }
    });
}

export async function getPCFOwnEmissionHistoryDetails(req: any, res: any) {
    const { product_code } = req.query;

    return withClient(async (client: any) => {
        try {

            const productCheckQuery = `
    SELECT id
    FROM product
    WHERE product_code = $1
    LIMIT 1;
`;

            const productCheck = await client.query(productCheckQuery, [product_code]);

            if (productCheck.rowCount === 0) {
                return res.status(404).json(
                    generateResponse(false, "Product code not found", 404, null)
                );
            }

            console.log(productCheck.rows[0]);

            const result = await client.query(
                `
WITH base_pcf AS (
    SELECT
        pcf.id,
        pcf.code,
        pr.id AS product_id, --from product table
        pcf.request_title,
        pcf.priority,
        pcf.request_organization,
        pcf.due_date,
        pcf.request_description,
        pcf.status,
        pcf.model_version,
        pcf.overall_pcf,
        pcf.created_date,
        oe.bom_pcf_id AS own_bom_pcf_id
    FROM bom_pcf_request pcf
    INNER JOIN own_emission oe
        ON oe.bom_pcf_id = pcf.id
       AND oe.is_own_emission_calculated = TRUE
    INNER JOIN product pr
        ON pr.product_code = pcf.product_code
    WHERE pcf.product_code = $1
)


SELECT
    base_pcf.*,

 /* ---------- MATERIAL EMISSION ---------- */
    (
        SELECT jsonb_agg(to_jsonb(mem))
        FROM bom_emission_material_calculation_engine mem
        WHERE mem.product_id = base_pcf.product_id
          AND mem.product_bom_pcf_id = base_pcf.own_bom_pcf_id
    ) AS material_emission,

    /* ---------- PRODUCTION EMISSION ---------- */
    (
        SELECT to_jsonb(mep)
        FROM bom_emission_production_calculation_engine mep
        WHERE mep.product_id = base_pcf.product_id
          AND mep.product_bom_pcf_id = base_pcf.own_bom_pcf_id
        LIMIT 1
    ) AS production_emission_calculation,

    /* ---------- PACKAGING EMISSION ---------- */
    (
        SELECT to_jsonb(mpk)
        FROM bom_emission_packaging_calculation_engine mpk
        WHERE mpk.product_id = base_pcf.product_id
          AND mpk.product_bom_pcf_id = base_pcf.own_bom_pcf_id
        LIMIT 1
    ) AS packaging_emission_calculation,

    /* ---------- WASTE EMISSION ---------- */
    (
        SELECT to_jsonb(mw)
        FROM bom_emission_waste_calculation_engine mw
        WHERE mw.product_id = base_pcf.product_id
          AND mw.product_bom_pcf_id = base_pcf.own_bom_pcf_id
        LIMIT 1
    ) AS waste_emission_calculation,

    /* ---------- LOGISTIC EMISSION ---------- */
    (
        SELECT to_jsonb(ml)
        FROM bom_emission_logistic_calculation_engine ml
        WHERE ml.product_id = base_pcf.product_id
          AND ml.product_bom_pcf_id = base_pcf.own_bom_pcf_id
        LIMIT 1
    ) AS logistic_emission_calculation,

    /* ---------- TOTAL PCF ---------- */
    (
        SELECT to_jsonb(pcfe)
        FROM bom_emission_calculation_engine pcfe
        WHERE pcfe.product_id = base_pcf.product_id
          AND pcfe.product_bom_pcf_id = base_pcf.own_bom_pcf_id
        LIMIT 1
    ) AS pcf_total_emission_calculation


FROM base_pcf

GROUP BY
    base_pcf.id,
    base_pcf.code,
    base_pcf.product_id,
    base_pcf.request_title,
    base_pcf.priority,
    base_pcf.request_organization,
    base_pcf.due_date,
    base_pcf.request_description,
    base_pcf.status,
    base_pcf.model_version,
    base_pcf.overall_pcf,
    base_pcf.created_date,
    base_pcf.own_bom_pcf_id

`,
                [product_code]
            );

            return res.status(200).send(
                generateResponse(true, "PCF request AND BOM fetched Successfully!", 200, result.rows)
            );

        } catch (error: any) {
            console.error("Error fetching PCF BOM list:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch PCF BOM list"
            });
        }
    });
}

export async function productPCFBomSupplierDetails(req: any, res: any) {
    const { product_code } = req.query;

    return withClient(async (client: any) => {
        try {
            if (!product_code) {
                return res.status(400).send(
                    generateResponse(false, "product_code is required", 400, null)
                );
            }

            const result = await client.query(
                `
SELECT
    sd.sup_id,
    sd.code,
    sd.supplier_name,
    sd.supplier_email,
    sd.supplier_city,
    sd.supplier_state,
    sd.supplier_country,

    /* ---------- STATIC PCF STATE ---------- */
    'Secondary Data' AS pcf_state,

/* ---------- SHARED PCF COUNT (PRODUCT LEVEL) ---------- */
(
    SELECT COUNT(DISTINCT b1.bom_pcf_id)
    FROM bom b1
    JOIN bom_pcf_request p1
        ON p1.id = b1.bom_pcf_id
    WHERE b1.supplier_id = sd.sup_id
      AND p1.product_code = $1
) AS shared_pcf_count,

    /* ---------- COMPONENTS SUPPLIED COUNT (PRODUCT LEVEL) ---------- */
    COUNT(b.id) AS components_supplied_count,

    /* ---------- SUPPLIER PCF VALUE (PRODUCT LEVEL) ---------- */
(
    SELECT COALESCE(SUM(pcfe.total_pcf_value), 0)
    FROM bom b2
    JOIN bom_pcf_request p2
        ON p2.id = b2.bom_pcf_id
    JOIN bom_emission_calculation_engine pcfe
        ON pcfe.bom_id = b2.id AND pcfe.product_id IS NULL
    WHERE b2.supplier_id = sd.sup_id
      AND p2.product_code = $1
) AS supplier_pcf_value

FROM bom_pcf_request pcf
JOIN bom b
    ON b.bom_pcf_id = pcf.id
JOIN supplier_details sd
    ON sd.sup_id = b.supplier_id

WHERE pcf.product_code = $1

GROUP BY
    sd.sup_id,
    sd.code,
    sd.supplier_name,
    sd.supplier_email,
    sd.supplier_city,
    sd.supplier_state,
    sd.supplier_country

ORDER BY sd.supplier_name;
`,
                [product_code]
            );

            return res.status(200).send(
                generateResponse(
                    true,
                    "Product PCF BOM Supplier details fetched successfully",
                    200,
                    result.rows
                )
            );

        } catch (error: any) {
            console.error("Error fetching supplier details:", error);
            return res.status(500).send(
                generateResponse(false, error.message, 500, null)
            );
        }
    });
}

// export async function secondaryDataEntriesById(req: any, res: any) {
//     const { bom_pcf_id } = req.query;

//     return withClient(async (client: any) => {
//         try {
//             const result = await client.query(
//                 `
// WITH
// /* ================= BASE PCF ================= */
// base_pcf AS (
//     SELECT
//         pcf.id,
//         pcf.code,
//         pcf.request_title,
//         pcf.status,
//         pcf.model_version,
//         pcf.overall_pcf,
//         pcf.is_approved,
//         pcf.is_rejected,
//         pcf.is_draft,
//         pcf.created_date
//     FROM bom_pcf_request pcf
//     WHERE pcf.id = $1
// ),

// /* ================= BOM + SUPPLIER ================= */
// bom_supplier AS (
//     SELECT
//         b.id AS bom_id,
//         b.code,
//         b.material_number,
//         b.component_name,
//         b.qunatity,
//         b.price,
//         b.total_price,
//         b.weight_gms,
//         b.economic_ratio,
//         b.total_weight_gms,
//         b.production_location,
//         b.manufacturer,
//         b.detail_description,
//         b.component_category,
//         b.supplier_id AS sup_id,
//         b.bom_pcf_id,

//         sd.code AS supplier_code,
//         sd.supplier_name,
//         sd.supplier_email,
//         sd.supplier_phone_number
//     FROM bom b
//     JOIN supplier_details sd ON sd.sup_id = b.supplier_id
//     WHERE b.bom_pcf_id = $1
// ),

// /* ================= SUPPLIER SGIQ (with BOM context) ================= */
// supplier_sgiq AS (
//     SELECT
//         sgiq.sgiq_id,
//         sgiq.sup_id,
//         sgiq.bom_pcf_id,
//         sup.supplier_name,
//         sup.code AS supplier_code,
//         sup.supplier_email
//     FROM supplier_general_info_questions sgiq
//     JOIN pcf_request_data_rating_stage prdrs
//         ON prdrs.bom_pcf_id = sgiq.bom_pcf_id
//        AND prdrs.sup_id = sgiq.sup_id
//        AND prdrs.bom_id = b.id
//     JOIN supplier_details sup
//         ON sup.sup_id = sgiq.sup_id
//     WHERE prdrs.is_submitted = TRUE
//       AND sgiq.bom_pcf_id = $1
// ),

// /* ================= DQR UNION (ALL QUESTIONS) ================= */
// dqr_union AS (
//     /* ================= Q9 ================= */
//     SELECT
//         ss.sup_id,
//         ss.bom_pcf_id,
//         CASE WHEN q9.ter_tag_value IN ('1','2','3','4','5') THEN q9.ter_tag_value::int ELSE 0 END AS ter,
//         CASE WHEN q9.tir_tag_value IN ('1','2','3','4','5') THEN q9.tir_tag_value::int ELSE 0 END AS tir,
//         CASE WHEN q9.gr_tag_value  IN ('1','2','3','4','5') THEN q9.gr_tag_value::int  ELSE 0 END AS gr,
//         CASE WHEN q9.c_tag_value   IN ('1','2','3','4','5') THEN q9.c_tag_value::int   ELSE 0 END AS c,
//         CASE WHEN q9.pds_tag_value IN ('1','2','3','4','5') THEN q9.pds_tag_value::int ELSE 0 END AS pds
//     FROM dqr_emission_data_rating_qnine q9
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q9.sgiq_id

//     UNION ALL

//     /* ================= Q11 ================= */
//     SELECT
//         ss.sup_id,
//         ss.bom_pcf_id,
//         CASE WHEN q11.ter_tag_value IN ('1','2','3','4','5') THEN q11.ter_tag_value::int ELSE 0 END,
//         CASE WHEN q11.tir_tag_value IN ('1','2','3','4','5') THEN q11.tir_tag_value::int ELSE 0 END,
//         CASE WHEN q11.gr_tag_value  IN ('1','2','3','4','5') THEN q11.gr_tag_value::int  ELSE 0 END,
//         CASE WHEN q11.c_tag_value   IN ('1','2','3','4','5') THEN q11.c_tag_value::int   ELSE 0 END,
//         CASE WHEN q11.pds_tag_value IN ('1','2','3','4','5') THEN q11.pds_tag_value::int ELSE 0 END
//     FROM dqr_supplier_product_questions_rating_qeleven q11
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q11.sgiq_id

//     UNION ALL

//     /* ================= Q12 ================= */
//     SELECT
//         ss.sup_id,
//         ss.bom_pcf_id,
//         CASE WHEN q12.ter_tag_value IN ('1','2','3','4','5') THEN q12.ter_tag_value::int ELSE 0 END,
//         CASE WHEN q12.tir_tag_value IN ('1','2','3','4','5') THEN q12.tir_tag_value::int ELSE 0 END,
//         CASE WHEN q12.gr_tag_value  IN ('1','2','3','4','5') THEN q12.gr_tag_value::int  ELSE 0 END,
//         CASE WHEN q12.c_tag_value   IN ('1','2','3','4','5') THEN q12.c_tag_value::int   ELSE 0 END,
//         CASE WHEN q12.pds_tag_value IN ('1','2','3','4','5') THEN q12.pds_tag_value::int ELSE 0 END
//     FROM dqr_supplier_product_questions_rating_qtwelve q12
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q12.sgiq_id

//     UNION ALL

//     /* ================= Q13 ================= */
//     SELECT
//         ss.sup_id,
//         ss.bom_pcf_id,
//         CASE WHEN q13.ter_tag_value IN ('1','2','3','4','5') THEN q13.ter_tag_value::int ELSE 0 END,
//         CASE WHEN q13.tir_tag_value IN ('1','2','3','4','5') THEN q13.tir_tag_value::int ELSE 0 END,
//         CASE WHEN q13.gr_tag_value  IN ('1','2','3','4','5') THEN q13.gr_tag_value::int  ELSE 0 END,
//         CASE WHEN q13.c_tag_value   IN ('1','2','3','4','5') THEN q13.c_tag_value::int   ELSE 0 END,
//         CASE WHEN q13.pds_tag_value IN ('1','2','3','4','5') THEN q13.pds_tag_value::int ELSE 0 END
//     FROM dqr_production_site_detail_rating_qthirteen q13
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q13.sgiq_id

//     UNION ALL

//     /* ================= Q15 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q15.ter_tag_value IN ('1','2','3','4','5') THEN q15.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q15.tir_tag_value IN ('1','2','3','4','5') THEN q15.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q15.gr_tag_value  IN ('1','2','3','4','5') THEN q15.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q15.c_tag_value   IN ('1','2','3','4','5') THEN q15.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q15.pds_tag_value IN ('1','2','3','4','5') THEN q15.pds_tag_value::int ELSE 0 END
//     FROM dqr_product_component_manufactured_rating_qfiften q15
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q15.sgiq_id

//     UNION ALL

//     /* ================= Q15.1 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q151.ter_tag_value IN ('1','2','3','4','5') THEN q151.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q151.tir_tag_value IN ('1','2','3','4','5') THEN q151.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q151.gr_tag_value  IN ('1','2','3','4','5') THEN q151.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q151.c_tag_value   IN ('1','2','3','4','5') THEN q151.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q151.pds_tag_value IN ('1','2','3','4','5') THEN q151.pds_tag_value::int ELSE 0 END
//     FROM dqr_co_product_component_manufactured_rating_qfiftenone q151
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q151.sgiq_id

//     UNION ALL

//     /* ================= Q16 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q16.ter_tag_value IN ('1','2','3','4','5') THEN q16.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q16.tir_tag_value IN ('1','2','3','4','5') THEN q16.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q16.gr_tag_value  IN ('1','2','3','4','5') THEN q16.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q16.c_tag_value   IN ('1','2','3','4','5') THEN q16.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q16.pds_tag_value IN ('1','2','3','4','5') THEN q16.pds_tag_value::int ELSE 0 END
//     FROM dqr_stationary_combustion_on_site_energy_rating_qsixten q16
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q16.sgiq_id

//     UNION ALL

//     /* ================= Q17 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q17.ter_tag_value IN ('1','2','3','4','5') THEN q17.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q17.tir_tag_value IN ('1','2','3','4','5') THEN q17.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q17.gr_tag_value  IN ('1','2','3','4','5') THEN q17.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q17.c_tag_value   IN ('1','2','3','4','5') THEN q17.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q17.pds_tag_value IN ('1','2','3','4','5') THEN q17.pds_tag_value::int ELSE 0 END
//     FROM dqr_mobile_combustion_company_owned_vehicles_rating_qseventen q17
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q17.sgiq_id

//     UNION ALL

//     /* ================= Q19 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q19.ter_tag_value IN ('1','2','3','4','5') THEN q19.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q19.tir_tag_value IN ('1','2','3','4','5') THEN q19.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q19.gr_tag_value  IN ('1','2','3','4','5') THEN q19.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q19.c_tag_value   IN ('1','2','3','4','5') THEN q19.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q19.pds_tag_value IN ('1','2','3','4','5') THEN q19.pds_tag_value::int ELSE 0 END
//     FROM dqr_refrigerants_rating_qnineten q19
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q19.sgiq_id

//     UNION ALL

//     /* ================= Q21 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q21.ter_tag_value IN ('1','2','3','4','5') THEN q21.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q21.tir_tag_value IN ('1','2','3','4','5') THEN q21.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q21.gr_tag_value  IN ('1','2','3','4','5') THEN q21.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q21.c_tag_value   IN ('1','2','3','4','5') THEN q21.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q21.pds_tag_value IN ('1','2','3','4','5') THEN q21.pds_tag_value::int ELSE 0 END
//     FROM dqr_process_emissions_sources_qtwentyone q21
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q21.sgiq_id

//     UNION ALL

//     /* ================= Q22 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q22.ter_tag_value IN ('1','2','3','4','5') THEN q22.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q22.tir_tag_value IN ('1','2','3','4','5') THEN q22.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q22.gr_tag_value  IN ('1','2','3','4','5') THEN q22.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q22.c_tag_value   IN ('1','2','3','4','5') THEN q22.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q22.pds_tag_value IN ('1','2','3','4','5') THEN q22.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_two_indirect_emis_from_pur_energy_qtwentytwo q22
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q22.sgiq_id

//     UNION ALL

//     /* ================= Q24 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q24.ter_tag_value IN ('1','2','3','4','5') THEN q24.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q24.tir_tag_value IN ('1','2','3','4','5') THEN q24.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q24.gr_tag_value  IN ('1','2','3','4','5') THEN q24.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q24.c_tag_value   IN ('1','2','3','4','5') THEN q24.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q24.pds_tag_value IN ('1','2','3','4','5') THEN q24.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_two_indirect_emissions_certificates_qtwentyfour q24
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q24.sgiq_id

//     UNION ALL

//     /* ================= Q26 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q26.ter_tag_value IN ('1','2','3','4','5') THEN q26.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q26.tir_tag_value IN ('1','2','3','4','5') THEN q26.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q26.gr_tag_value  IN ('1','2','3','4','5') THEN q26.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q26.c_tag_value   IN ('1','2','3','4','5') THEN q26.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q26.pds_tag_value IN ('1','2','3','4','5') THEN q26.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_two_indirect_emissions_qtwentysix q26
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q26.sgiq_id

//     UNION ALL

//     /* ================= Q27 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q27.ter_tag_value IN ('1','2','3','4','5') THEN q27.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q27.tir_tag_value IN ('1','2','3','4','5') THEN q27.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q27.gr_tag_value  IN ('1','2','3','4','5') THEN q27.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q27.c_tag_value   IN ('1','2','3','4','5') THEN q27.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q27.pds_tag_value IN ('1','2','3','4','5') THEN q27.pds_tag_value::int ELSE 0 END
//     FROM dqr_energy_intensity_of_pro_est_kwhor_mj_qtwentyseven q27
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q27.sgiq_id

//     UNION ALL

//     /* ================= Q28 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q28.ter_tag_value IN ('1','2','3','4','5') THEN q28.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q28.tir_tag_value IN ('1','2','3','4','5') THEN q28.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q28.gr_tag_value  IN ('1','2','3','4','5') THEN q28.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q28.c_tag_value   IN ('1','2','3','4','5') THEN q28.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q28.pds_tag_value IN ('1','2','3','4','5') THEN q28.pds_tag_value::int ELSE 0 END
//     FROM dqr_process_specific_energy_usage_qtwentyeight q28
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q28.sgiq_id

//     UNION ALL

//     /* ================= Q30 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q30.ter_tag_value IN ('1','2','3','4','5') THEN q30.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q30.tir_tag_value IN ('1','2','3','4','5') THEN q30.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q30.gr_tag_value  IN ('1','2','3','4','5') THEN q30.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q30.c_tag_value   IN ('1','2','3','4','5') THEN q30.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q30.pds_tag_value IN ('1','2','3','4','5') THEN q30.pds_tag_value::int ELSE 0 END
//     FROM dqr_abatement_systems_used_qthirty q30
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q30.sgiq_id

//     UNION ALL

//     /* ================= Q31 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q31.ter_tag_value IN ('1','2','3','4','5') THEN q31.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q31.tir_tag_value IN ('1','2','3','4','5') THEN q31.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q31.gr_tag_value  IN ('1','2','3','4','5') THEN q31.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q31.c_tag_value   IN ('1','2','3','4','5') THEN q31.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q31.pds_tag_value IN ('1','2','3','4','5') THEN q31.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_two_indirect_emissions_qthirtyone q31
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q31.sgiq_id

//     UNION ALL

//     /* ================= Q32 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q32.ter_tag_value IN ('1','2','3','4','5') THEN q32.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q32.tir_tag_value IN ('1','2','3','4','5') THEN q32.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q32.gr_tag_value  IN ('1','2','3','4','5') THEN q32.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q32.c_tag_value   IN ('1','2','3','4','5') THEN q32.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q32.pds_tag_value IN ('1','2','3','4','5') THEN q32.pds_tag_value::int ELSE 0 END
//     FROM dqr_type_of_quality_control_equipment_usage_qthirtytwo q32
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q32.sgiq_id

//     UNION ALL

//     /* ================= Q33 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q33.ter_tag_value IN ('1','2','3','4','5') THEN q33.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q33.tir_tag_value IN ('1','2','3','4','5') THEN q33.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q33.gr_tag_value  IN ('1','2','3','4','5') THEN q33.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q33.c_tag_value   IN ('1','2','3','4','5') THEN q33.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q33.pds_tag_value IN ('1','2','3','4','5') THEN q33.pds_tag_value::int ELSE 0 END
//     FROM dqr_electricity_consumed_for_quality_control_qthirtythree q33
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q33.sgiq_id

//     UNION ALL

//     /* ================= Q34 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q34.ter_tag_value IN ('1','2','3','4','5') THEN q34.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q34.tir_tag_value IN ('1','2','3','4','5') THEN q34.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q34.gr_tag_value  IN ('1','2','3','4','5') THEN q34.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q34.c_tag_value   IN ('1','2','3','4','5') THEN q34.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q34.pds_tag_value IN ('1','2','3','4','5') THEN q34.pds_tag_value::int ELSE 0 END
//     FROM dqr_quality_control_process_usage_qthirtyfour q34
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q34.sgiq_id

//     UNION ALL

//     /* ================= Q341 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q341.ter_tag_value IN ('1','2','3','4','5') THEN q341.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q341.tir_tag_value IN ('1','2','3','4','5') THEN q341.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q341.gr_tag_value  IN ('1','2','3','4','5') THEN q341.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q341.c_tag_value   IN ('1','2','3','4','5') THEN q341.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q341.pds_tag_value IN ('1','2','3','4','5') THEN q341.pds_tag_value::int ELSE 0 END
//     FROM dqr_quality_control_process_usage_pressure_or_flow_qthirtyfour q341
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q341.sgiq_id

//     UNION ALL

//     /* ================= Q35 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q35.ter_tag_value IN ('1','2','3','4','5') THEN q35.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q35.tir_tag_value IN ('1','2','3','4','5') THEN q35.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q35.gr_tag_value  IN ('1','2','3','4','5') THEN q35.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q35.c_tag_value   IN ('1','2','3','4','5') THEN q35.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q35.pds_tag_value IN ('1','2','3','4','5') THEN q35.pds_tag_value::int ELSE 0 END
//     FROM dqr_quality_control_use_any_consumables_qthirtyfive q35
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q35.sgiq_id

//     UNION ALL

//     /* ================= Q37 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q37.ter_tag_value IN ('1','2','3','4','5') THEN q37.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q37.tir_tag_value IN ('1','2','3','4','5') THEN q37.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q37.gr_tag_value  IN ('1','2','3','4','5') THEN q37.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q37.c_tag_value   IN ('1','2','3','4','5') THEN q37.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q37.pds_tag_value IN ('1','2','3','4','5') THEN q37.pds_tag_value::int ELSE 0 END
//     FROM dqr_weight_of_samples_destroyed_qthirtyseven q37
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q37.sgiq_id

//     UNION ALL

//     /* ================= Q38 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q38.ter_tag_value IN ('1','2','3','4','5') THEN q38.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q38.tir_tag_value IN ('1','2','3','4','5') THEN q38.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q38.gr_tag_value  IN ('1','2','3','4','5') THEN q38.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q38.c_tag_value   IN ('1','2','3','4','5') THEN q38.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q38.pds_tag_value IN ('1','2','3','4','5') THEN q38.pds_tag_value::int ELSE 0 END
//     FROM dqr_defect_or_rej_rate_identified_by_quality_control_qthirtyeight q38
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q38.sgiq_id

//     UNION ALL

//     /* ================= Q39 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q39.ter_tag_value IN ('1','2','3','4','5') THEN q39.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q39.tir_tag_value IN ('1','2','3','4','5') THEN q39.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q39.gr_tag_value  IN ('1','2','3','4','5') THEN q39.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q39.c_tag_value   IN ('1','2','3','4','5') THEN q39.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q39.pds_tag_value IN ('1','2','3','4','5') THEN q39.pds_tag_value::int ELSE 0 END
//     FROM dqr_rework_rate_due_to_quality_control_qthirtynine q39
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q39.sgiq_id

//     UNION ALL

//     /* ================= Q40 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q40.ter_tag_value IN ('1','2','3','4','5') THEN q40.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q40.tir_tag_value IN ('1','2','3','4','5') THEN q40.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q40.gr_tag_value  IN ('1','2','3','4','5') THEN q40.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q40.c_tag_value   IN ('1','2','3','4','5') THEN q40.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q40.pds_tag_value IN ('1','2','3','4','5') THEN q40.pds_tag_value::int ELSE 0 END
//     FROM dqr_weight_of_quality_control_waste_generated_qforty q40
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q40.sgiq_id

//     UNION ALL

//     /* ================= Q41 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q41.ter_tag_value IN ('1','2','3','4','5') THEN q41.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q41.tir_tag_value IN ('1','2','3','4','5') THEN q41.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q41.gr_tag_value  IN ('1','2','3','4','5') THEN q41.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q41.c_tag_value   IN ('1','2','3','4','5') THEN q41.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q41.pds_tag_value IN ('1','2','3','4','5') THEN q41.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_two_indirect_emissions_qfortyone q41
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q41.sgiq_id

//     UNION ALL

//     /* ================= Q44 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q44.ter_tag_value IN ('1','2','3','4','5') THEN q44.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q44.tir_tag_value IN ('1','2','3','4','5') THEN q44.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q44.gr_tag_value  IN ('1','2','3','4','5') THEN q44.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q44.c_tag_value   IN ('1','2','3','4','5') THEN q44.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q44.pds_tag_value IN ('1','2','3','4','5') THEN q44.pds_tag_value::int ELSE 0 END
//     FROM dqr_energy_consumption_for_qfortyfour_qfortyfour q44
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q44.sgiq_id

//     UNION ALL

//     /* ================= Q46 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q46.ter_tag_value IN ('1','2','3','4','5') THEN q46.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q46.tir_tag_value IN ('1','2','3','4','5') THEN q46.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q46.gr_tag_value  IN ('1','2','3','4','5') THEN q46.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q46.c_tag_value   IN ('1','2','3','4','5') THEN q46.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q46.pds_tag_value IN ('1','2','3','4','5') THEN q46.pds_tag_value::int ELSE 0 END
//     FROM dqr_cloud_provider_details_qfortysix q46
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q46.sgiq_id

//     UNION ALL

//     /* ================= Q47 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q47.ter_tag_value IN ('1','2','3','4','5') THEN q47.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q47.tir_tag_value IN ('1','2','3','4','5') THEN q47.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q47.gr_tag_value  IN ('1','2','3','4','5') THEN q47.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q47.c_tag_value   IN ('1','2','3','4','5') THEN q47.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q47.pds_tag_value IN ('1','2','3','4','5') THEN q47.pds_tag_value::int ELSE 0 END
//     FROM dqr_dedicated_monitoring_sensor_usage_qfortyseven q47
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q47.sgiq_id

//     UNION ALL

//     /* ================= Q48 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q48.ter_tag_value IN ('1','2','3','4','5') THEN q48.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q48.tir_tag_value IN ('1','2','3','4','5') THEN q48.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q48.gr_tag_value  IN ('1','2','3','4','5') THEN q48.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q48.c_tag_value   IN ('1','2','3','4','5') THEN q48.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q48.pds_tag_value IN ('1','2','3','4','5') THEN q48.pds_tag_value::int ELSE 0 END
//     FROM dqr_annual_replacement_rate_of_sensor_qfortyeight q48
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q48.sgiq_id

//     UNION ALL

//     /* ================= Q51 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q51.ter_tag_value IN ('1','2','3','4','5') THEN q51.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q51.tir_tag_value IN ('1','2','3','4','5') THEN q51.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q51.gr_tag_value  IN ('1','2','3','4','5') THEN q51.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q51.c_tag_value   IN ('1','2','3','4','5') THEN q51.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q51.pds_tag_value IN ('1','2','3','4','5') THEN q51.pds_tag_value::int ELSE 0 END
//     FROM dqr_energy_consumption_for_qfiftyone_qfiftyone q51
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q51.sgiq_id

//     UNION ALL

//     /* ================= Q52 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q52.ter_tag_value IN ('1','2','3','4','5') THEN q52.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q52.tir_tag_value IN ('1','2','3','4','5') THEN q52.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q52.gr_tag_value  IN ('1','2','3','4','5') THEN q52.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q52.c_tag_value   IN ('1','2','3','4','5') THEN q52.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q52.pds_tag_value IN ('1','2','3','4','5') THEN q52.pds_tag_value::int ELSE 0 END
//     FROM dqr_raw_materials_used_in_component_manufacturing_qfiftytwo q52
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q52.sgiq_id

//     UNION ALL

//     /* ================= Q53 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q53.ter_tag_value IN ('1','2','3','4','5') THEN q53.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q53.tir_tag_value IN ('1','2','3','4','5') THEN q53.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q53.gr_tag_value  IN ('1','2','3','4','5') THEN q53.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q53.c_tag_value   IN ('1','2','3','4','5') THEN q53.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q53.pds_tag_value IN ('1','2','3','4','5') THEN q53.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_three_other_indirect_emissions_qfiftythree q53
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q53.sgiq_id

//     UNION ALL

//     /* ================= Q54 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q54.ter_tag_value IN ('1','2','3','4','5') THEN q54.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q54.tir_tag_value IN ('1','2','3','4','5') THEN q54.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q54.gr_tag_value  IN ('1','2','3','4','5') THEN q54.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q54.c_tag_value   IN ('1','2','3','4','5') THEN q54.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q54.pds_tag_value IN ('1','2','3','4','5') THEN q54.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_three_other_indirect_emissions_qfiftyfour q54
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q54.sgiq_id

//     UNION ALL

//     /* ================= Q56 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q56.ter_tag_value IN ('1','2','3','4','5') THEN q56.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q56.tir_tag_value IN ('1','2','3','4','5') THEN q56.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q56.gr_tag_value  IN ('1','2','3','4','5') THEN q56.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q56.c_tag_value   IN ('1','2','3','4','5') THEN q56.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q56.pds_tag_value IN ('1','2','3','4','5') THEN q56.pds_tag_value::int ELSE 0 END
//     FROM dqr_recycled_materials_with_percentage_qfiftysix q56
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q56.sgiq_id

//     UNION ALL

//     /* ================= Q58 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q58.ter_tag_value IN ('1','2','3','4','5') THEN q58.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q58.tir_tag_value IN ('1','2','3','4','5') THEN q58.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q58.gr_tag_value  IN ('1','2','3','4','5') THEN q58.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q58.c_tag_value   IN ('1','2','3','4','5') THEN q58.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q58.pds_tag_value IN ('1','2','3','4','5') THEN q58.pds_tag_value::int ELSE 0 END
//     FROM dqr_pre_post_consumer_reutilization_percentage_qfiftyeight q58
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q58.sgiq_id

//     UNION ALL

//     /* ================= Q59 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q59.ter_tag_value IN ('1','2','3','4','5') THEN q59.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q59.tir_tag_value IN ('1','2','3','4','5') THEN q59.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q59.gr_tag_value  IN ('1','2','3','4','5') THEN q59.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q59.c_tag_value   IN ('1','2','3','4','5') THEN q59.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q59.pds_tag_value IN ('1','2','3','4','5') THEN q59.pds_tag_value::int ELSE 0 END
//     FROM dqr_pir_pcr_material_percentage_qfiftynine q59
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q59.sgiq_id

//     UNION ALL

//     /* ================= Q60 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q60.ter_tag_value IN ('1','2','3','4','5') THEN q60.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q60.tir_tag_value IN ('1','2','3','4','5') THEN q60.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q60.gr_tag_value  IN ('1','2','3','4','5') THEN q60.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q60.c_tag_value   IN ('1','2','3','4','5') THEN q60.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q60.pds_tag_value IN ('1','2','3','4','5') THEN q60.pds_tag_value::int ELSE 0 END
//     FROM dqr_type_of_pack_mat_used_for_delivering_qsixty q60
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q60.sgiq_id

//     UNION ALL

//     /* ================= Q61 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q61.ter_tag_value IN ('1','2','3','4','5') THEN q61.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q61.tir_tag_value IN ('1','2','3','4','5') THEN q61.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q61.gr_tag_value  IN ('1','2','3','4','5') THEN q61.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q61.c_tag_value   IN ('1','2','3','4','5') THEN q61.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q61.pds_tag_value IN ('1','2','3','4','5') THEN q61.pds_tag_value::int ELSE 0 END
//     FROM dqr_weight_of_packaging_per_unit_product_qsixtyone q61
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q61.sgiq_id

//     UNION ALL

//     /* ================= Q64 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q64.ter_tag_value IN ('1','2','3','4','5') THEN q64.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q64.tir_tag_value IN ('1','2','3','4','5') THEN q64.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q64.gr_tag_value  IN ('1','2','3','4','5') THEN q64.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q64.c_tag_value   IN ('1','2','3','4','5') THEN q64.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q64.pds_tag_value IN ('1','2','3','4','5') THEN q64.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_three_other_indirect_emissions_qsixtyfour q64
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q64.sgiq_id

//     UNION ALL

//     /* ================= Q67 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q67.ter_tag_value IN ('1','2','3','4','5') THEN q67.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q67.tir_tag_value IN ('1','2','3','4','5') THEN q67.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q67.gr_tag_value  IN ('1','2','3','4','5') THEN q67.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q67.c_tag_value   IN ('1','2','3','4','5') THEN q67.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q67.pds_tag_value IN ('1','2','3','4','5') THEN q67.pds_tag_value::int ELSE 0 END
//     FROM dqr_energy_consumption_for_qsixtyseven_qsixtyseven q67
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q67.sgiq_id

//     UNION ALL

//     /* ================= Q68 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q68.ter_tag_value IN ('1','2','3','4','5') THEN q68.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q68.tir_tag_value IN ('1','2','3','4','5') THEN q68.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q68.gr_tag_value  IN ('1','2','3','4','5') THEN q68.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q68.c_tag_value   IN ('1','2','3','4','5') THEN q68.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q68.pds_tag_value IN ('1','2','3','4','5') THEN q68.pds_tag_value::int ELSE 0 END
//     FROM dqr_weight_of_pro_packaging_waste_qsixtyeight q68
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q68.sgiq_id

//     UNION ALL

//     /* ================= Q69 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q69.ter_tag_value IN ('1','2','3','4','5') THEN q69.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q69.tir_tag_value IN ('1','2','3','4','5') THEN q69.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q69.gr_tag_value  IN ('1','2','3','4','5') THEN q69.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q69.c_tag_value   IN ('1','2','3','4','5') THEN q69.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q69.pds_tag_value IN ('1','2','3','4','5') THEN q69.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_three_other_indirect_emissions_qsixtynine q69
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q69.sgiq_id

//     UNION ALL

//     /* ================= Q71 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q71.ter_tag_value IN ('1','2','3','4','5') THEN q71.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q71.tir_tag_value IN ('1','2','3','4','5') THEN q71.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q71.gr_tag_value  IN ('1','2','3','4','5') THEN q71.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q71.c_tag_value   IN ('1','2','3','4','5') THEN q71.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q71.pds_tag_value IN ('1','2','3','4','5') THEN q71.pds_tag_value::int ELSE 0 END
//     FROM dqr_type_of_by_product_qseventyone q71
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q71.sgiq_id

//     UNION ALL

//     /* ================= Q73 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q73.ter_tag_value IN ('1','2','3','4','5') THEN q73.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q73.tir_tag_value IN ('1','2','3','4','5') THEN q73.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q73.gr_tag_value  IN ('1','2','3','4','5') THEN q73.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q73.c_tag_value   IN ('1','2','3','4','5') THEN q73.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q73.pds_tag_value IN ('1','2','3','4','5') THEN q73.pds_tag_value::int ELSE 0 END
//     FROM dqr_co_two_emission_of_raw_material_qseventythree q73
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q73.sgiq_id

//     UNION ALL

//     /* ================= Q74 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q74.ter_tag_value IN ('1','2','3','4','5') THEN q74.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q74.tir_tag_value IN ('1','2','3','4','5') THEN q74.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q74.gr_tag_value  IN ('1','2','3','4','5') THEN q74.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q74.c_tag_value   IN ('1','2','3','4','5') THEN q74.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q74.pds_tag_value IN ('1','2','3','4','5') THEN q74.pds_tag_value::int ELSE 0 END
//     FROM dqr_mode_of_transport_used_for_transportation_qseventyfour q74
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q74.sgiq_id

//     UNION ALL

//     /* ================= Q75 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q75.ter_tag_value IN ('1','2','3','4','5') THEN q75.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q75.tir_tag_value IN ('1','2','3','4','5') THEN q75.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q75.gr_tag_value  IN ('1','2','3','4','5') THEN q75.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q75.c_tag_value   IN ('1','2','3','4','5') THEN q75.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q75.pds_tag_value IN ('1','2','3','4','5') THEN q75.pds_tag_value::int ELSE 0 END
//     FROM dqr_destination_plant_component_transportation_qseventyfive q75
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q75.sgiq_id

//     UNION ALL

//     /* ================= Q79 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q79.ter_tag_value IN ('1','2','3','4','5') THEN q79.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q79.tir_tag_value IN ('1','2','3','4','5') THEN q79.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q79.gr_tag_value  IN ('1','2','3','4','5') THEN q79.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q79.c_tag_value   IN ('1','2','3','4','5') THEN q79.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q79.pds_tag_value IN ('1','2','3','4','5') THEN q79.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_three_other_indirect_emissions_qseventynine q79
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q79.sgiq_id

//     UNION ALL

//     /* ================= Q80 ================= */
//     SELECT ss.sup_id,
//            ss.bom_pcf_id,
//            CASE WHEN q80.ter_tag_value IN ('1','2','3','4','5') THEN q80.ter_tag_value::int ELSE 0 END,
//            CASE WHEN q80.tir_tag_value IN ('1','2','3','4','5') THEN q80.tir_tag_value::int ELSE 0 END,
//            CASE WHEN q80.gr_tag_value  IN ('1','2','3','4','5') THEN q80.gr_tag_value::int  ELSE 0 END,
//            CASE WHEN q80.c_tag_value   IN ('1','2','3','4','5') THEN q80.c_tag_value::int   ELSE 0 END,
//            CASE WHEN q80.pds_tag_value IN ('1','2','3','4','5') THEN q80.pds_tag_value::int ELSE 0 END
//     FROM dqr_scope_three_other_indirect_emissions_qeighty q80
//     JOIN supplier_sgiq ss ON ss.sgiq_id = q80.sgiq_id
// ),

// /* ================= DQR SUMMARY (SUPPLIER + BOM_PCF_ID LEVEL) ================= */
// dqr_summary AS (
//     SELECT
//         du.sup_id,
//         du.bom_pcf_id,
//         ROUND(AVG(du.ter)::numeric, 2) AS ter,
//         ROUND(AVG(du.tir)::numeric, 2) AS tir,
//         ROUND(AVG(du.gr)::numeric, 2)  AS gr,
//         ROUND(AVG(du.c)::numeric, 2)   AS c,
//         ROUND(AVG(du.pds)::numeric, 2) AS pds,
//         ROUND(
//             (AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5,
//             2
//         ) AS overall_dqr_score,
//         CASE
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 1.5 THEN '1 (Very Good)'
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 2.5 THEN '2 (Good)'
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 3.5 THEN '3 (Fair)'
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 4.5 THEN '4 (Poor)'
//             ELSE '5 (Very Poor)'
//         END AS criterion,
//         CASE
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 1.5 THEN 'Fully representative, verified, recent, primary data'
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 2.5 THEN 'High representativeness, partly verified'
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 3.5 THEN 'Moderate accuracy, based on industry averages'
//             WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 4.5 THEN 'Outdated, estimated, or incomplete data'
//             ELSE 'Non-representative / missing key data'
//         END AS meaning_description
//     FROM dqr_union du
//     GROUP BY du.sup_id, du.bom_pcf_id
// )

// /* ================= FINAL RESPONSE ================= */
// SELECT
//     bp.*,
//     'Secondary Data' AS pcf_state,

//     COALESCE(
//         jsonb_agg(
//             jsonb_build_object(
//                 'bom_id', bs.bom_id,
//                 'code', bs.code,
//                 'material_number', bs.material_number,
//                 'component_name', bs.component_name,
//                 'quantity', bs.qunatity,
//                 'price', bs.price,
//                 'total_price', bs.total_price,
//                 'weight_gms', bs.weight_gms,
//                 'economic_ratio', bs.economic_ratio,
//                 'total_weight_gms', bs.total_weight_gms,
//                 'production_location', bs.production_location,
//                 'manufacturer', bs.manufacturer,
//                 'detail_description', bs.detail_description,
//                 'component_category', bs.component_category,

//                 /* ---------- SUPPLIER ---------- */
//                 'supplier', jsonb_build_object(
//                     'sup_id', bs.sup_id,
//                     'code', bs.supplier_code,
//                     'supplier_name', bs.supplier_name,
//                     'supplier_email', bs.supplier_email,
//                     'supplier_phone_number', bs.supplier_phone_number
//                 ),

//                 /* ---------- DQR (BOM-LEVEL) ---------- */
//                 'dqr_rating', (
//                     SELECT to_jsonb(ds)
//                     FROM dqr_summary ds
//                     WHERE ds.sup_id = bs.sup_id
//                       AND ds.bom_pcf_id = bs.bom_pcf_id
//                 ),

//                 /* ---------- MATERIAL EMISSION ---------- */
//                 'material_emission', (
//                     SELECT COALESCE(jsonb_agg(to_jsonb(mem)), '[]'::jsonb)
//                     FROM bom_emission_material_calculation_engine mem
//                     WHERE mem.bom_id = bs.bom_id
//                 ),

//                 /* ---------- PRODUCTION ---------- */
//                 'production_emission_calculation', (
//                     SELECT to_jsonb(mep)
//                     FROM bom_emission_production_calculation_engine mep
//                     WHERE mep.bom_id = bs.bom_id
//                     LIMIT 1
//                 ),

//                 /* ---------- PACKAGING ---------- */
//                 'packaging_emission_calculation', (
//                     SELECT to_jsonb(mpk)
//                     FROM bom_emission_packaging_calculation_engine mpk
//                     WHERE mpk.bom_id = bs.bom_id
//                     LIMIT 1
//                 ),

//                 /* ---------- WASTE ---------- */
//                 'waste_emission_calculation', (
//                     SELECT to_jsonb(mw)
//                     FROM bom_emission_waste_calculation_engine mw
//                     WHERE mw.bom_id = bs.bom_id
//                     LIMIT 1
//                 ),

//                 /* ---------- LOGISTIC ---------- */
//                 'logistic_emission_calculation', (
//                     SELECT to_jsonb(ml)
//                     FROM bom_emission_logistic_calculation_engine ml
//                     WHERE ml.bom_id = bs.bom_id
//                     LIMIT 1
//                 ),

//                 /* ---------- TOTAL PCF ---------- */
//                 'pcf_total_emission_calculation', (
//                     SELECT to_jsonb(pcfe)
//                     FROM bom_emission_calculation_engine pcfe
//                     WHERE pcfe.bom_id = bs.bom_id
//                     LIMIT 1
//                 )
//             )
//         ),
//         '[]'::jsonb
//     ) AS bom_list

// FROM base_pcf bp
// LEFT JOIN bom_supplier bs ON TRUE
// GROUP BY bp.id, bp.code, bp.request_title, bp.status, bp.model_version, 
//          bp.overall_pcf, bp.is_approved, bp.is_rejected, bp.is_draft, bp.created_date;

//                 `,
//                 [bom_pcf_id]
//             );

//             return res.status(200).send(
//                 generateResponse(true, "Secondary PCF + BOM + DQR fetched successfully", 200, result.rows[0])
//             );

//         } catch (error: any) {
//             console.error("Error:", error);
//             return res.status(500).send(
//                 generateResponse(false, error.message || "Failed to fetch data", 500, null)
//             );
//         }
//     });
// }

export async function secondaryDataEntriesById(req: any, res: any) {
    const { bom_pcf_id, product_code } = req.query;

    return withClient(async (client: any) => {
        try {
            const result = await client.query(
                `
WITH
/* ================= BASE PCF ================= */
base_pcf AS (
    SELECT
        pcf.id,
        pcf.code,
        pcf.request_title,
        pcf.status,
        pcf.model_version,
        pcf.overall_pcf,
        pcf.is_approved,
        pcf.is_rejected,
        pcf.is_draft,
        pcf.created_date
    FROM bom_pcf_request pcf
    WHERE pcf.id = $1
),

/* ================= PRODUCT LIFE CYCLE STAGE ================= */
product_life_cycle AS (
    SELECT
        p.product_code,
        p.ed_life_cycle_stage_id,
        lcsp.name AS life_cycle_stage_name
    FROM product p
    LEFT JOIN life_cycle_stages_of_product lcsp 
        ON lcsp.lcsp_id = p.ed_life_cycle_stage_id
    WHERE p.product_code = $2
),

/* ================= BOM + SUPPLIER ================= */
bom_supplier AS (
    SELECT
        b.id AS bom_id,
        b.code,
        b.material_number,
        b.component_name,
        b.qunatity,
        b.price,
        b.total_price,
        b.weight_gms,
        b.economic_ratio,
        b.total_weight_gms,
        b.production_location,
        b.manufacturer,
        b.detail_description,
        b.component_category,
        b.supplier_id AS sup_id,
        b.bom_pcf_id,

        sd.code AS supplier_code,
        sd.supplier_name,
        sd.supplier_email,
        sd.supplier_phone_number
    FROM bom b
    JOIN supplier_details sd ON sd.sup_id = b.supplier_id
    WHERE b.bom_pcf_id = $1
),

/* ================= SUPPLIER SGIQ (with BOM context) ================= */
supplier_sgiq AS (
    SELECT
        sgiq.sgiq_id,
        sgiq.sup_id,
        sgiq.bom_pcf_id,
        prdrs.bom_id,
        sup.supplier_name,
        sup.code AS supplier_code,
        sup.supplier_email
    FROM supplier_general_info_questions sgiq
    JOIN pcf_request_data_rating_stage prdrs
        ON prdrs.bom_pcf_id = sgiq.bom_pcf_id
       AND prdrs.sup_id = sgiq.sup_id
    JOIN supplier_details sup
        ON sup.sup_id = sgiq.sup_id
    WHERE prdrs.is_submitted = TRUE
      AND sgiq.bom_pcf_id = $1 AND sgiq.own_emission_id IS NULL
),

/* ================= DQR UNION (ALL QUESTIONS) ================= */
dqr_union AS (
    /* ================= Q9 ================= */
    SELECT
        ss.sup_id,
        ss.bom_pcf_id,
        ss.bom_id,
        CASE WHEN q9.ter_tag_value IN ('1','2','3','4','5') THEN q9.ter_tag_value::int ELSE 0 END AS ter,
        CASE WHEN q9.tir_tag_value IN ('1','2','3','4','5') THEN q9.tir_tag_value::int ELSE 0 END AS tir,
        CASE WHEN q9.gr_tag_value  IN ('1','2','3','4','5') THEN q9.gr_tag_value::int  ELSE 0 END AS gr,
        CASE WHEN q9.c_tag_value   IN ('1','2','3','4','5') THEN q9.c_tag_value::int   ELSE 0 END AS c,
        CASE WHEN q9.pds_tag_value IN ('1','2','3','4','5') THEN q9.pds_tag_value::int ELSE 0 END AS pds
    FROM dqr_emission_data_rating_qnine q9
    JOIN supplier_sgiq ss ON ss.sgiq_id = q9.sgiq_id

    UNION ALL

    /* ================= Q11 ================= */
    SELECT
        ss.sup_id,
        ss.bom_pcf_id,
        ss.bom_id,
        CASE WHEN q11.ter_tag_value IN ('1','2','3','4','5') THEN q11.ter_tag_value::int ELSE 0 END,
        CASE WHEN q11.tir_tag_value IN ('1','2','3','4','5') THEN q11.tir_tag_value::int ELSE 0 END,
        CASE WHEN q11.gr_tag_value  IN ('1','2','3','4','5') THEN q11.gr_tag_value::int  ELSE 0 END,
        CASE WHEN q11.c_tag_value   IN ('1','2','3','4','5') THEN q11.c_tag_value::int   ELSE 0 END,
        CASE WHEN q11.pds_tag_value IN ('1','2','3','4','5') THEN q11.pds_tag_value::int ELSE 0 END
    FROM dqr_supplier_product_questions_rating_qeleven q11
    JOIN supplier_sgiq ss ON ss.sgiq_id = q11.sgiq_id

    UNION ALL

    /* ================= Q12 ================= */
    SELECT
        ss.sup_id,
        ss.bom_pcf_id,
        ss.bom_id,
        CASE WHEN q12.ter_tag_value IN ('1','2','3','4','5') THEN q12.ter_tag_value::int ELSE 0 END,
        CASE WHEN q12.tir_tag_value IN ('1','2','3','4','5') THEN q12.tir_tag_value::int ELSE 0 END,
        CASE WHEN q12.gr_tag_value  IN ('1','2','3','4','5') THEN q12.gr_tag_value::int  ELSE 0 END,
        CASE WHEN q12.c_tag_value   IN ('1','2','3','4','5') THEN q12.c_tag_value::int   ELSE 0 END,
        CASE WHEN q12.pds_tag_value IN ('1','2','3','4','5') THEN q12.pds_tag_value::int ELSE 0 END
    FROM dqr_supplier_product_questions_rating_qtwelve q12
    JOIN supplier_sgiq ss ON ss.sgiq_id = q12.sgiq_id

    UNION ALL

    /* ================= Q13 ================= */
    SELECT
        ss.sup_id,
        ss.bom_pcf_id,
        ss.bom_id,
        CASE WHEN q13.ter_tag_value IN ('1','2','3','4','5') THEN q13.ter_tag_value::int ELSE 0 END,
        CASE WHEN q13.tir_tag_value IN ('1','2','3','4','5') THEN q13.tir_tag_value::int ELSE 0 END,
        CASE WHEN q13.gr_tag_value  IN ('1','2','3','4','5') THEN q13.gr_tag_value::int  ELSE 0 END,
        CASE WHEN q13.c_tag_value   IN ('1','2','3','4','5') THEN q13.c_tag_value::int   ELSE 0 END,
        CASE WHEN q13.pds_tag_value IN ('1','2','3','4','5') THEN q13.pds_tag_value::int ELSE 0 END
    FROM dqr_production_site_detail_rating_qthirteen q13
    JOIN supplier_sgiq ss ON ss.sgiq_id = q13.sgiq_id

    UNION ALL

    /* ================= Q15 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q15.ter_tag_value IN ('1','2','3','4','5') THEN q15.ter_tag_value::int ELSE 0 END,
           CASE WHEN q15.tir_tag_value IN ('1','2','3','4','5') THEN q15.tir_tag_value::int ELSE 0 END,
           CASE WHEN q15.gr_tag_value  IN ('1','2','3','4','5') THEN q15.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q15.c_tag_value   IN ('1','2','3','4','5') THEN q15.c_tag_value::int   ELSE 0 END,
           CASE WHEN q15.pds_tag_value IN ('1','2','3','4','5') THEN q15.pds_tag_value::int ELSE 0 END
    FROM dqr_product_component_manufactured_rating_qfiften q15
    JOIN supplier_sgiq ss ON ss.sgiq_id = q15.sgiq_id

    UNION ALL

    /* ================= Q15.1 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q151.ter_tag_value IN ('1','2','3','4','5') THEN q151.ter_tag_value::int ELSE 0 END,
           CASE WHEN q151.tir_tag_value IN ('1','2','3','4','5') THEN q151.tir_tag_value::int ELSE 0 END,
           CASE WHEN q151.gr_tag_value  IN ('1','2','3','4','5') THEN q151.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q151.c_tag_value   IN ('1','2','3','4','5') THEN q151.c_tag_value::int   ELSE 0 END,
           CASE WHEN q151.pds_tag_value IN ('1','2','3','4','5') THEN q151.pds_tag_value::int ELSE 0 END
    FROM dqr_co_product_component_manufactured_rating_qfiftenone q151
    JOIN supplier_sgiq ss ON ss.sgiq_id = q151.sgiq_id

    UNION ALL

    /* ================= Q16 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q16.ter_tag_value IN ('1','2','3','4','5') THEN q16.ter_tag_value::int ELSE 0 END,
           CASE WHEN q16.tir_tag_value IN ('1','2','3','4','5') THEN q16.tir_tag_value::int ELSE 0 END,
           CASE WHEN q16.gr_tag_value  IN ('1','2','3','4','5') THEN q16.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q16.c_tag_value   IN ('1','2','3','4','5') THEN q16.c_tag_value::int   ELSE 0 END,
           CASE WHEN q16.pds_tag_value IN ('1','2','3','4','5') THEN q16.pds_tag_value::int ELSE 0 END
    FROM dqr_stationary_combustion_on_site_energy_rating_qsixten q16
    JOIN supplier_sgiq ss ON ss.sgiq_id = q16.sgiq_id

    UNION ALL

    /* ================= Q17 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q17.ter_tag_value IN ('1','2','3','4','5') THEN q17.ter_tag_value::int ELSE 0 END,
           CASE WHEN q17.tir_tag_value IN ('1','2','3','4','5') THEN q17.tir_tag_value::int ELSE 0 END,
           CASE WHEN q17.gr_tag_value  IN ('1','2','3','4','5') THEN q17.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q17.c_tag_value   IN ('1','2','3','4','5') THEN q17.c_tag_value::int   ELSE 0 END,
           CASE WHEN q17.pds_tag_value IN ('1','2','3','4','5') THEN q17.pds_tag_value::int ELSE 0 END
    FROM dqr_mobile_combustion_company_owned_vehicles_rating_qseventen q17
    JOIN supplier_sgiq ss ON ss.sgiq_id = q17.sgiq_id

    UNION ALL

    /* ================= Q19 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q19.ter_tag_value IN ('1','2','3','4','5') THEN q19.ter_tag_value::int ELSE 0 END,
           CASE WHEN q19.tir_tag_value IN ('1','2','3','4','5') THEN q19.tir_tag_value::int ELSE 0 END,
           CASE WHEN q19.gr_tag_value  IN ('1','2','3','4','5') THEN q19.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q19.c_tag_value   IN ('1','2','3','4','5') THEN q19.c_tag_value::int   ELSE 0 END,
           CASE WHEN q19.pds_tag_value IN ('1','2','3','4','5') THEN q19.pds_tag_value::int ELSE 0 END
    FROM dqr_refrigerants_rating_qnineten q19
    JOIN supplier_sgiq ss ON ss.sgiq_id = q19.sgiq_id

    UNION ALL

    /* ================= Q21 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q21.ter_tag_value IN ('1','2','3','4','5') THEN q21.ter_tag_value::int ELSE 0 END,
           CASE WHEN q21.tir_tag_value IN ('1','2','3','4','5') THEN q21.tir_tag_value::int ELSE 0 END,
           CASE WHEN q21.gr_tag_value  IN ('1','2','3','4','5') THEN q21.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q21.c_tag_value   IN ('1','2','3','4','5') THEN q21.c_tag_value::int   ELSE 0 END,
           CASE WHEN q21.pds_tag_value IN ('1','2','3','4','5') THEN q21.pds_tag_value::int ELSE 0 END
    FROM dqr_process_emissions_sources_qtwentyone q21
    JOIN supplier_sgiq ss ON ss.sgiq_id = q21.sgiq_id

    UNION ALL

    /* ================= Q22 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q22.ter_tag_value IN ('1','2','3','4','5') THEN q22.ter_tag_value::int ELSE 0 END,
           CASE WHEN q22.tir_tag_value IN ('1','2','3','4','5') THEN q22.tir_tag_value::int ELSE 0 END,
           CASE WHEN q22.gr_tag_value  IN ('1','2','3','4','5') THEN q22.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q22.c_tag_value   IN ('1','2','3','4','5') THEN q22.c_tag_value::int   ELSE 0 END,
           CASE WHEN q22.pds_tag_value IN ('1','2','3','4','5') THEN q22.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_two_indirect_emis_from_pur_energy_qtwentytwo q22
    JOIN supplier_sgiq ss ON ss.sgiq_id = q22.sgiq_id

    UNION ALL

    /* ================= Q24 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q24.ter_tag_value IN ('1','2','3','4','5') THEN q24.ter_tag_value::int ELSE 0 END,
           CASE WHEN q24.tir_tag_value IN ('1','2','3','4','5') THEN q24.tir_tag_value::int ELSE 0 END,
           CASE WHEN q24.gr_tag_value  IN ('1','2','3','4','5') THEN q24.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q24.c_tag_value   IN ('1','2','3','4','5') THEN q24.c_tag_value::int   ELSE 0 END,
           CASE WHEN q24.pds_tag_value IN ('1','2','3','4','5') THEN q24.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_two_indirect_emissions_certificates_qtwentyfour q24
    JOIN supplier_sgiq ss ON ss.sgiq_id = q24.sgiq_id

    UNION ALL

    /* ================= Q26 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q26.ter_tag_value IN ('1','2','3','4','5') THEN q26.ter_tag_value::int ELSE 0 END,
           CASE WHEN q26.tir_tag_value IN ('1','2','3','4','5') THEN q26.tir_tag_value::int ELSE 0 END,
           CASE WHEN q26.gr_tag_value  IN ('1','2','3','4','5') THEN q26.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q26.c_tag_value   IN ('1','2','3','4','5') THEN q26.c_tag_value::int   ELSE 0 END,
           CASE WHEN q26.pds_tag_value IN ('1','2','3','4','5') THEN q26.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_two_indirect_emissions_qtwentysix q26
    JOIN supplier_sgiq ss ON ss.sgiq_id = q26.sgiq_id

    UNION ALL

    /* ================= Q27 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q27.ter_tag_value IN ('1','2','3','4','5') THEN q27.ter_tag_value::int ELSE 0 END,
           CASE WHEN q27.tir_tag_value IN ('1','2','3','4','5') THEN q27.tir_tag_value::int ELSE 0 END,
           CASE WHEN q27.gr_tag_value  IN ('1','2','3','4','5') THEN q27.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q27.c_tag_value   IN ('1','2','3','4','5') THEN q27.c_tag_value::int   ELSE 0 END,
           CASE WHEN q27.pds_tag_value IN ('1','2','3','4','5') THEN q27.pds_tag_value::int ELSE 0 END
    FROM dqr_energy_intensity_of_pro_est_kwhor_mj_qtwentyseven q27
    JOIN supplier_sgiq ss ON ss.sgiq_id = q27.sgiq_id

    UNION ALL

    /* ================= Q28 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q28.ter_tag_value IN ('1','2','3','4','5') THEN q28.ter_tag_value::int ELSE 0 END,
           CASE WHEN q28.tir_tag_value IN ('1','2','3','4','5') THEN q28.tir_tag_value::int ELSE 0 END,
           CASE WHEN q28.gr_tag_value  IN ('1','2','3','4','5') THEN q28.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q28.c_tag_value   IN ('1','2','3','4','5') THEN q28.c_tag_value::int   ELSE 0 END,
           CASE WHEN q28.pds_tag_value IN ('1','2','3','4','5') THEN q28.pds_tag_value::int ELSE 0 END
    FROM dqr_process_specific_energy_usage_qtwentyeight q28
    JOIN supplier_sgiq ss ON ss.sgiq_id = q28.sgiq_id

    UNION ALL

    /* ================= Q30 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q30.ter_tag_value IN ('1','2','3','4','5') THEN q30.ter_tag_value::int ELSE 0 END,
           CASE WHEN q30.tir_tag_value IN ('1','2','3','4','5') THEN q30.tir_tag_value::int ELSE 0 END,
           CASE WHEN q30.gr_tag_value  IN ('1','2','3','4','5') THEN q30.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q30.c_tag_value   IN ('1','2','3','4','5') THEN q30.c_tag_value::int   ELSE 0 END,
           CASE WHEN q30.pds_tag_value IN ('1','2','3','4','5') THEN q30.pds_tag_value::int ELSE 0 END
    FROM dqr_abatement_systems_used_qthirty q30
    JOIN supplier_sgiq ss ON ss.sgiq_id = q30.sgiq_id

    UNION ALL

    /* ================= Q31 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q31.ter_tag_value IN ('1','2','3','4','5') THEN q31.ter_tag_value::int ELSE 0 END,
           CASE WHEN q31.tir_tag_value IN ('1','2','3','4','5') THEN q31.tir_tag_value::int ELSE 0 END,
           CASE WHEN q31.gr_tag_value  IN ('1','2','3','4','5') THEN q31.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q31.c_tag_value   IN ('1','2','3','4','5') THEN q31.c_tag_value::int   ELSE 0 END,
           CASE WHEN q31.pds_tag_value IN ('1','2','3','4','5') THEN q31.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_two_indirect_emissions_qthirtyone q31
    JOIN supplier_sgiq ss ON ss.sgiq_id = q31.sgiq_id

    UNION ALL

    /* ================= Q32 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q32.ter_tag_value IN ('1','2','3','4','5') THEN q32.ter_tag_value::int ELSE 0 END,
           CASE WHEN q32.tir_tag_value IN ('1','2','3','4','5') THEN q32.tir_tag_value::int ELSE 0 END,
           CASE WHEN q32.gr_tag_value  IN ('1','2','3','4','5') THEN q32.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q32.c_tag_value   IN ('1','2','3','4','5') THEN q32.c_tag_value::int   ELSE 0 END,
           CASE WHEN q32.pds_tag_value IN ('1','2','3','4','5') THEN q32.pds_tag_value::int ELSE 0 END
    FROM dqr_type_of_quality_control_equipment_usage_qthirtytwo q32
    JOIN supplier_sgiq ss ON ss.sgiq_id = q32.sgiq_id

    UNION ALL

    /* ================= Q33 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q33.ter_tag_value IN ('1','2','3','4','5') THEN q33.ter_tag_value::int ELSE 0 END,
           CASE WHEN q33.tir_tag_value IN ('1','2','3','4','5') THEN q33.tir_tag_value::int ELSE 0 END,
           CASE WHEN q33.gr_tag_value  IN ('1','2','3','4','5') THEN q33.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q33.c_tag_value   IN ('1','2','3','4','5') THEN q33.c_tag_value::int   ELSE 0 END,
           CASE WHEN q33.pds_tag_value IN ('1','2','3','4','5') THEN q33.pds_tag_value::int ELSE 0 END
    FROM dqr_electricity_consumed_for_quality_control_qthirtythree q33
    JOIN supplier_sgiq ss ON ss.sgiq_id = q33.sgiq_id

    UNION ALL

    /* ================= Q34 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q34.ter_tag_value IN ('1','2','3','4','5') THEN q34.ter_tag_value::int ELSE 0 END,
           CASE WHEN q34.tir_tag_value IN ('1','2','3','4','5') THEN q34.tir_tag_value::int ELSE 0 END,
           CASE WHEN q34.gr_tag_value  IN ('1','2','3','4','5') THEN q34.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q34.c_tag_value   IN ('1','2','3','4','5') THEN q34.c_tag_value::int   ELSE 0 END,
           CASE WHEN q34.pds_tag_value IN ('1','2','3','4','5') THEN q34.pds_tag_value::int ELSE 0 END
    FROM dqr_quality_control_process_usage_qthirtyfour q34
    JOIN supplier_sgiq ss ON ss.sgiq_id = q34.sgiq_id

    UNION ALL

    /* ================= Q341 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q341.ter_tag_value IN ('1','2','3','4','5') THEN q341.ter_tag_value::int ELSE 0 END,
           CASE WHEN q341.tir_tag_value IN ('1','2','3','4','5') THEN q341.tir_tag_value::int ELSE 0 END,
           CASE WHEN q341.gr_tag_value  IN ('1','2','3','4','5') THEN q341.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q341.c_tag_value   IN ('1','2','3','4','5') THEN q341.c_tag_value::int   ELSE 0 END,
           CASE WHEN q341.pds_tag_value IN ('1','2','3','4','5') THEN q341.pds_tag_value::int ELSE 0 END
    FROM dqr_quality_control_process_usage_pressure_or_flow_qthirtyfour q341
    JOIN supplier_sgiq ss ON ss.sgiq_id = q341.sgiq_id

    UNION ALL

    /* ================= Q35 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q35.ter_tag_value IN ('1','2','3','4','5') THEN q35.ter_tag_value::int ELSE 0 END,
           CASE WHEN q35.tir_tag_value IN ('1','2','3','4','5') THEN q35.tir_tag_value::int ELSE 0 END,
           CASE WHEN q35.gr_tag_value  IN ('1','2','3','4','5') THEN q35.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q35.c_tag_value   IN ('1','2','3','4','5') THEN q35.c_tag_value::int   ELSE 0 END,
           CASE WHEN q35.pds_tag_value IN ('1','2','3','4','5') THEN q35.pds_tag_value::int ELSE 0 END
    FROM dqr_quality_control_use_any_consumables_qthirtyfive q35
    JOIN supplier_sgiq ss ON ss.sgiq_id = q35.sgiq_id

    UNION ALL

    /* ================= Q37 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q37.ter_tag_value IN ('1','2','3','4','5') THEN q37.ter_tag_value::int ELSE 0 END,
           CASE WHEN q37.tir_tag_value IN ('1','2','3','4','5') THEN q37.tir_tag_value::int ELSE 0 END,
           CASE WHEN q37.gr_tag_value  IN ('1','2','3','4','5') THEN q37.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q37.c_tag_value   IN ('1','2','3','4','5') THEN q37.c_tag_value::int   ELSE 0 END,
           CASE WHEN q37.pds_tag_value IN ('1','2','3','4','5') THEN q37.pds_tag_value::int ELSE 0 END
    FROM dqr_weight_of_samples_destroyed_qthirtyseven q37
    JOIN supplier_sgiq ss ON ss.sgiq_id = q37.sgiq_id

    UNION ALL

    /* ================= Q38 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q38.ter_tag_value IN ('1','2','3','4','5') THEN q38.ter_tag_value::int ELSE 0 END,
           CASE WHEN q38.tir_tag_value IN ('1','2','3','4','5') THEN q38.tir_tag_value::int ELSE 0 END,
           CASE WHEN q38.gr_tag_value  IN ('1','2','3','4','5') THEN q38.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q38.c_tag_value   IN ('1','2','3','4','5') THEN q38.c_tag_value::int   ELSE 0 END,
           CASE WHEN q38.pds_tag_value IN ('1','2','3','4','5') THEN q38.pds_tag_value::int ELSE 0 END
    FROM dqr_defect_or_rej_rate_identified_by_quality_control_qthirtyeight q38
    JOIN supplier_sgiq ss ON ss.sgiq_id = q38.sgiq_id

    UNION ALL

    /* ================= Q39 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q39.ter_tag_value IN ('1','2','3','4','5') THEN q39.ter_tag_value::int ELSE 0 END,
           CASE WHEN q39.tir_tag_value IN ('1','2','3','4','5') THEN q39.tir_tag_value::int ELSE 0 END,
           CASE WHEN q39.gr_tag_value  IN ('1','2','3','4','5') THEN q39.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q39.c_tag_value   IN ('1','2','3','4','5') THEN q39.c_tag_value::int   ELSE 0 END,
           CASE WHEN q39.pds_tag_value IN ('1','2','3','4','5') THEN q39.pds_tag_value::int ELSE 0 END
    FROM dqr_rework_rate_due_to_quality_control_qthirtynine q39
    JOIN supplier_sgiq ss ON ss.sgiq_id = q39.sgiq_id

    UNION ALL

    /* ================= Q40 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q40.ter_tag_value IN ('1','2','3','4','5') THEN q40.ter_tag_value::int ELSE 0 END,
           CASE WHEN q40.tir_tag_value IN ('1','2','3','4','5') THEN q40.tir_tag_value::int ELSE 0 END,
           CASE WHEN q40.gr_tag_value  IN ('1','2','3','4','5') THEN q40.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q40.c_tag_value   IN ('1','2','3','4','5') THEN q40.c_tag_value::int   ELSE 0 END,
           CASE WHEN q40.pds_tag_value IN ('1','2','3','4','5') THEN q40.pds_tag_value::int ELSE 0 END
    FROM dqr_weight_of_quality_control_waste_generated_qforty q40
    JOIN supplier_sgiq ss ON ss.sgiq_id = q40.sgiq_id

    UNION ALL

    /* ================= Q41 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q41.ter_tag_value IN ('1','2','3','4','5') THEN q41.ter_tag_value::int ELSE 0 END,
           CASE WHEN q41.tir_tag_value IN ('1','2','3','4','5') THEN q41.tir_tag_value::int ELSE 0 END,
           CASE WHEN q41.gr_tag_value  IN ('1','2','3','4','5') THEN q41.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q41.c_tag_value   IN ('1','2','3','4','5') THEN q41.c_tag_value::int   ELSE 0 END,
           CASE WHEN q41.pds_tag_value IN ('1','2','3','4','5') THEN q41.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_two_indirect_emissions_qfortyone q41
    JOIN supplier_sgiq ss ON ss.sgiq_id = q41.sgiq_id

    UNION ALL

    /* ================= Q44 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q44.ter_tag_value IN ('1','2','3','4','5') THEN q44.ter_tag_value::int ELSE 0 END,
           CASE WHEN q44.tir_tag_value IN ('1','2','3','4','5') THEN q44.tir_tag_value::int ELSE 0 END,
           CASE WHEN q44.gr_tag_value  IN ('1','2','3','4','5') THEN q44.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q44.c_tag_value   IN ('1','2','3','4','5') THEN q44.c_tag_value::int   ELSE 0 END,
           CASE WHEN q44.pds_tag_value IN ('1','2','3','4','5') THEN q44.pds_tag_value::int ELSE 0 END
    FROM dqr_energy_consumption_for_qfortyfour_qfortyfour q44
    JOIN supplier_sgiq ss ON ss.sgiq_id = q44.sgiq_id

    UNION ALL

    /* ================= Q46 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q46.ter_tag_value IN ('1','2','3','4','5') THEN q46.ter_tag_value::int ELSE 0 END,
           CASE WHEN q46.tir_tag_value IN ('1','2','3','4','5') THEN q46.tir_tag_value::int ELSE 0 END,
           CASE WHEN q46.gr_tag_value  IN ('1','2','3','4','5') THEN q46.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q46.c_tag_value   IN ('1','2','3','4','5') THEN q46.c_tag_value::int   ELSE 0 END,
           CASE WHEN q46.pds_tag_value IN ('1','2','3','4','5') THEN q46.pds_tag_value::int ELSE 0 END
    FROM dqr_cloud_provider_details_qfortysix q46
    JOIN supplier_sgiq ss ON ss.sgiq_id = q46.sgiq_id

    UNION ALL

    /* ================= Q47 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q47.ter_tag_value IN ('1','2','3','4','5') THEN q47.ter_tag_value::int ELSE 0 END,
           CASE WHEN q47.tir_tag_value IN ('1','2','3','4','5') THEN q47.tir_tag_value::int ELSE 0 END,
           CASE WHEN q47.gr_tag_value  IN ('1','2','3','4','5') THEN q47.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q47.c_tag_value   IN ('1','2','3','4','5') THEN q47.c_tag_value::int   ELSE 0 END,
           CASE WHEN q47.pds_tag_value IN ('1','2','3','4','5') THEN q47.pds_tag_value::int ELSE 0 END
    FROM dqr_dedicated_monitoring_sensor_usage_qfortyseven q47
    JOIN supplier_sgiq ss ON ss.sgiq_id = q47.sgiq_id

    UNION ALL

    /* ================= Q48 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q48.ter_tag_value IN ('1','2','3','4','5') THEN q48.ter_tag_value::int ELSE 0 END,
           CASE WHEN q48.tir_tag_value IN ('1','2','3','4','5') THEN q48.tir_tag_value::int ELSE 0 END,
           CASE WHEN q48.gr_tag_value  IN ('1','2','3','4','5') THEN q48.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q48.c_tag_value   IN ('1','2','3','4','5') THEN q48.c_tag_value::int   ELSE 0 END,
           CASE WHEN q48.pds_tag_value IN ('1','2','3','4','5') THEN q48.pds_tag_value::int ELSE 0 END
    FROM dqr_annual_replacement_rate_of_sensor_qfortyeight q48
    JOIN supplier_sgiq ss ON ss.sgiq_id = q48.sgiq_id

    UNION ALL

    /* ================= Q51 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q51.ter_tag_value IN ('1','2','3','4','5') THEN q51.ter_tag_value::int ELSE 0 END,
           CASE WHEN q51.tir_tag_value IN ('1','2','3','4','5') THEN q51.tir_tag_value::int ELSE 0 END,
           CASE WHEN q51.gr_tag_value  IN ('1','2','3','4','5') THEN q51.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q51.c_tag_value   IN ('1','2','3','4','5') THEN q51.c_tag_value::int   ELSE 0 END,
           CASE WHEN q51.pds_tag_value IN ('1','2','3','4','5') THEN q51.pds_tag_value::int ELSE 0 END
    FROM dqr_energy_consumption_for_qfiftyone_qfiftyone q51
    JOIN supplier_sgiq ss ON ss.sgiq_id = q51.sgiq_id

    UNION ALL

    /* ================= Q52 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q52.ter_tag_value IN ('1','2','3','4','5') THEN q52.ter_tag_value::int ELSE 0 END,
           CASE WHEN q52.tir_tag_value IN ('1','2','3','4','5') THEN q52.tir_tag_value::int ELSE 0 END,
           CASE WHEN q52.gr_tag_value  IN ('1','2','3','4','5') THEN q52.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q52.c_tag_value   IN ('1','2','3','4','5') THEN q52.c_tag_value::int   ELSE 0 END,
           CASE WHEN q52.pds_tag_value IN ('1','2','3','4','5') THEN q52.pds_tag_value::int ELSE 0 END
    FROM dqr_raw_materials_used_in_component_manufacturing_qfiftytwo q52
    JOIN supplier_sgiq ss ON ss.sgiq_id = q52.sgiq_id

    UNION ALL

    /* ================= Q53 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q53.ter_tag_value IN ('1','2','3','4','5') THEN q53.ter_tag_value::int ELSE 0 END,
           CASE WHEN q53.tir_tag_value IN ('1','2','3','4','5') THEN q53.tir_tag_value::int ELSE 0 END,
           CASE WHEN q53.gr_tag_value  IN ('1','2','3','4','5') THEN q53.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q53.c_tag_value   IN ('1','2','3','4','5') THEN q53.c_tag_value::int   ELSE 0 END,
           CASE WHEN q53.pds_tag_value IN ('1','2','3','4','5') THEN q53.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_three_other_indirect_emissions_qfiftythree q53
    JOIN supplier_sgiq ss ON ss.sgiq_id = q53.sgiq_id

    UNION ALL

    /* ================= Q54 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q54.ter_tag_value IN ('1','2','3','4','5') THEN q54.ter_tag_value::int ELSE 0 END,
           CASE WHEN q54.tir_tag_value IN ('1','2','3','4','5') THEN q54.tir_tag_value::int ELSE 0 END,
           CASE WHEN q54.gr_tag_value  IN ('1','2','3','4','5') THEN q54.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q54.c_tag_value   IN ('1','2','3','4','5') THEN q54.c_tag_value::int   ELSE 0 END,
           CASE WHEN q54.pds_tag_value IN ('1','2','3','4','5') THEN q54.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_three_other_indirect_emissions_qfiftyfour q54
    JOIN supplier_sgiq ss ON ss.sgiq_id = q54.sgiq_id

    UNION ALL

    /* ================= Q56 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q56.ter_tag_value IN ('1','2','3','4','5') THEN q56.ter_tag_value::int ELSE 0 END,
           CASE WHEN q56.tir_tag_value IN ('1','2','3','4','5') THEN q56.tir_tag_value::int ELSE 0 END,
           CASE WHEN q56.gr_tag_value  IN ('1','2','3','4','5') THEN q56.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q56.c_tag_value   IN ('1','2','3','4','5') THEN q56.c_tag_value::int   ELSE 0 END,
           CASE WHEN q56.pds_tag_value IN ('1','2','3','4','5') THEN q56.pds_tag_value::int ELSE 0 END
    FROM dqr_recycled_materials_with_percentage_qfiftysix q56
    JOIN supplier_sgiq ss ON ss.sgiq_id = q56.sgiq_id

    UNION ALL

    /* ================= Q58 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q58.ter_tag_value IN ('1','2','3','4','5') THEN q58.ter_tag_value::int ELSE 0 END,
           CASE WHEN q58.tir_tag_value IN ('1','2','3','4','5') THEN q58.tir_tag_value::int ELSE 0 END,
           CASE WHEN q58.gr_tag_value  IN ('1','2','3','4','5') THEN q58.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q58.c_tag_value   IN ('1','2','3','4','5') THEN q58.c_tag_value::int   ELSE 0 END,
           CASE WHEN q58.pds_tag_value IN ('1','2','3','4','5') THEN q58.pds_tag_value::int ELSE 0 END
    FROM dqr_pre_post_consumer_reutilization_percentage_qfiftyeight q58
    JOIN supplier_sgiq ss ON ss.sgiq_id = q58.sgiq_id

    UNION ALL

    /* ================= Q59 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q59.ter_tag_value IN ('1','2','3','4','5') THEN q59.ter_tag_value::int ELSE 0 END,
           CASE WHEN q59.tir_tag_value IN ('1','2','3','4','5') THEN q59.tir_tag_value::int ELSE 0 END,
           CASE WHEN q59.gr_tag_value  IN ('1','2','3','4','5') THEN q59.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q59.c_tag_value   IN ('1','2','3','4','5') THEN q59.c_tag_value::int   ELSE 0 END,
           CASE WHEN q59.pds_tag_value IN ('1','2','3','4','5') THEN q59.pds_tag_value::int ELSE 0 END
    FROM dqr_pir_pcr_material_percentage_qfiftynine q59
    JOIN supplier_sgiq ss ON ss.sgiq_id = q59.sgiq_id

    UNION ALL

    /* ================= Q60 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q60.ter_tag_value IN ('1','2','3','4','5') THEN q60.ter_tag_value::int ELSE 0 END,
           CASE WHEN q60.tir_tag_value IN ('1','2','3','4','5') THEN q60.tir_tag_value::int ELSE 0 END,
           CASE WHEN q60.gr_tag_value  IN ('1','2','3','4','5') THEN q60.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q60.c_tag_value   IN ('1','2','3','4','5') THEN q60.c_tag_value::int   ELSE 0 END,
           CASE WHEN q60.pds_tag_value IN ('1','2','3','4','5') THEN q60.pds_tag_value::int ELSE 0 END
    FROM dqr_type_of_pack_mat_used_for_delivering_qsixty q60
    JOIN supplier_sgiq ss ON ss.sgiq_id = q60.sgiq_id

    UNION ALL

    /* ================= Q61 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q61.ter_tag_value IN ('1','2','3','4','5') THEN q61.ter_tag_value::int ELSE 0 END,
           CASE WHEN q61.tir_tag_value IN ('1','2','3','4','5') THEN q61.tir_tag_value::int ELSE 0 END,
           CASE WHEN q61.gr_tag_value  IN ('1','2','3','4','5') THEN q61.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q61.c_tag_value   IN ('1','2','3','4','5') THEN q61.c_tag_value::int   ELSE 0 END,
           CASE WHEN q61.pds_tag_value IN ('1','2','3','4','5') THEN q61.pds_tag_value::int ELSE 0 END
    FROM dqr_weight_of_packaging_per_unit_product_qsixtyone q61
    JOIN supplier_sgiq ss ON ss.sgiq_id = q61.sgiq_id

    UNION ALL

    /* ================= Q64 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q64.ter_tag_value IN ('1','2','3','4','5') THEN q64.ter_tag_value::int ELSE 0 END,
           CASE WHEN q64.tir_tag_value IN ('1','2','3','4','5') THEN q64.tir_tag_value::int ELSE 0 END,
           CASE WHEN q64.gr_tag_value  IN ('1','2','3','4','5') THEN q64.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q64.c_tag_value   IN ('1','2','3','4','5') THEN q64.c_tag_value::int   ELSE 0 END,
           CASE WHEN q64.pds_tag_value IN ('1','2','3','4','5') THEN q64.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_three_other_indirect_emissions_qsixtyfour q64
    JOIN supplier_sgiq ss ON ss.sgiq_id = q64.sgiq_id

    UNION ALL

    /* ================= Q67 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q67.ter_tag_value IN ('1','2','3','4','5') THEN q67.ter_tag_value::int ELSE 0 END,
           CASE WHEN q67.tir_tag_value IN ('1','2','3','4','5') THEN q67.tir_tag_value::int ELSE 0 END,
           CASE WHEN q67.gr_tag_value  IN ('1','2','3','4','5') THEN q67.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q67.c_tag_value   IN ('1','2','3','4','5') THEN q67.c_tag_value::int   ELSE 0 END,
           CASE WHEN q67.pds_tag_value IN ('1','2','3','4','5') THEN q67.pds_tag_value::int ELSE 0 END
    FROM dqr_energy_consumption_for_qsixtyseven_qsixtyseven q67
    JOIN supplier_sgiq ss ON ss.sgiq_id = q67.sgiq_id

    UNION ALL

    /* ================= Q68 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q68.ter_tag_value IN ('1','2','3','4','5') THEN q68.ter_tag_value::int ELSE 0 END,
           CASE WHEN q68.tir_tag_value IN ('1','2','3','4','5') THEN q68.tir_tag_value::int ELSE 0 END,
           CASE WHEN q68.gr_tag_value  IN ('1','2','3','4','5') THEN q68.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q68.c_tag_value   IN ('1','2','3','4','5') THEN q68.c_tag_value::int   ELSE 0 END,
           CASE WHEN q68.pds_tag_value IN ('1','2','3','4','5') THEN q68.pds_tag_value::int ELSE 0 END
    FROM dqr_weight_of_pro_packaging_waste_qsixtyeight q68
    JOIN supplier_sgiq ss ON ss.sgiq_id = q68.sgiq_id

    UNION ALL

    /* ================= Q69 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q69.ter_tag_value IN ('1','2','3','4','5') THEN q69.ter_tag_value::int ELSE 0 END,
           CASE WHEN q69.tir_tag_value IN ('1','2','3','4','5') THEN q69.tir_tag_value::int ELSE 0 END,
           CASE WHEN q69.gr_tag_value  IN ('1','2','3','4','5') THEN q69.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q69.c_tag_value   IN ('1','2','3','4','5') THEN q69.c_tag_value::int   ELSE 0 END,
           CASE WHEN q69.pds_tag_value IN ('1','2','3','4','5') THEN q69.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_three_other_indirect_emissions_qsixtynine q69
    JOIN supplier_sgiq ss ON ss.sgiq_id = q69.sgiq_id

    UNION ALL

    /* ================= Q71 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q71.ter_tag_value IN ('1','2','3','4','5') THEN q71.ter_tag_value::int ELSE 0 END,
           CASE WHEN q71.tir_tag_value IN ('1','2','3','4','5') THEN q71.tir_tag_value::int ELSE 0 END,
           CASE WHEN q71.gr_tag_value  IN ('1','2','3','4','5') THEN q71.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q71.c_tag_value   IN ('1','2','3','4','5') THEN q71.c_tag_value::int   ELSE 0 END,
           CASE WHEN q71.pds_tag_value IN ('1','2','3','4','5') THEN q71.pds_tag_value::int ELSE 0 END
    FROM dqr_type_of_by_product_qseventyone q71
    JOIN supplier_sgiq ss ON ss.sgiq_id = q71.sgiq_id

    UNION ALL

    /* ================= Q73 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q73.ter_tag_value IN ('1','2','3','4','5') THEN q73.ter_tag_value::int ELSE 0 END,
           CASE WHEN q73.tir_tag_value IN ('1','2','3','4','5') THEN q73.tir_tag_value::int ELSE 0 END,
           CASE WHEN q73.gr_tag_value  IN ('1','2','3','4','5') THEN q73.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q73.c_tag_value   IN ('1','2','3','4','5') THEN q73.c_tag_value::int   ELSE 0 END,
           CASE WHEN q73.pds_tag_value IN ('1','2','3','4','5') THEN q73.pds_tag_value::int ELSE 0 END
    FROM dqr_co_two_emission_of_raw_material_qseventythree q73
    JOIN supplier_sgiq ss ON ss.sgiq_id = q73.sgiq_id

    UNION ALL

    /* ================= Q74 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q74.ter_tag_value IN ('1','2','3','4','5') THEN q74.ter_tag_value::int ELSE 0 END,
           CASE WHEN q74.tir_tag_value IN ('1','2','3','4','5') THEN q74.tir_tag_value::int ELSE 0 END,
           CASE WHEN q74.gr_tag_value  IN ('1','2','3','4','5') THEN q74.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q74.c_tag_value   IN ('1','2','3','4','5') THEN q74.c_tag_value::int   ELSE 0 END,
           CASE WHEN q74.pds_tag_value IN ('1','2','3','4','5') THEN q74.pds_tag_value::int ELSE 0 END
    FROM dqr_mode_of_transport_used_for_transportation_qseventyfour q74
    JOIN supplier_sgiq ss ON ss.sgiq_id = q74.sgiq_id

    UNION ALL

    /* ================= Q75 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q75.ter_tag_value IN ('1','2','3','4','5') THEN q75.ter_tag_value::int ELSE 0 END,
           CASE WHEN q75.tir_tag_value IN ('1','2','3','4','5') THEN q75.tir_tag_value::int ELSE 0 END,
           CASE WHEN q75.gr_tag_value  IN ('1','2','3','4','5') THEN q75.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q75.c_tag_value   IN ('1','2','3','4','5') THEN q75.c_tag_value::int   ELSE 0 END,
           CASE WHEN q75.pds_tag_value IN ('1','2','3','4','5') THEN q75.pds_tag_value::int ELSE 0 END
    FROM dqr_destination_plant_component_transportation_qseventyfive q75
    JOIN supplier_sgiq ss ON ss.sgiq_id = q75.sgiq_id

    UNION ALL

    /* ================= Q79 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q79.ter_tag_value IN ('1','2','3','4','5') THEN q79.ter_tag_value::int ELSE 0 END,
           CASE WHEN q79.tir_tag_value IN ('1','2','3','4','5') THEN q79.tir_tag_value::int ELSE 0 END,
           CASE WHEN q79.gr_tag_value  IN ('1','2','3','4','5') THEN q79.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q79.c_tag_value   IN ('1','2','3','4','5') THEN q79.c_tag_value::int   ELSE 0 END,
           CASE WHEN q79.pds_tag_value IN ('1','2','3','4','5') THEN q79.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_three_other_indirect_emissions_qseventynine q79
    JOIN supplier_sgiq ss ON ss.sgiq_id = q79.sgiq_id

    UNION ALL

    /* ================= Q80 ================= */
    SELECT ss.sup_id,
           ss.bom_pcf_id,
           ss.bom_id,
           CASE WHEN q80.ter_tag_value IN ('1','2','3','4','5') THEN q80.ter_tag_value::int ELSE 0 END,
           CASE WHEN q80.tir_tag_value IN ('1','2','3','4','5') THEN q80.tir_tag_value::int ELSE 0 END,
           CASE WHEN q80.gr_tag_value  IN ('1','2','3','4','5') THEN q80.gr_tag_value::int  ELSE 0 END,
           CASE WHEN q80.c_tag_value   IN ('1','2','3','4','5') THEN q80.c_tag_value::int   ELSE 0 END,
           CASE WHEN q80.pds_tag_value IN ('1','2','3','4','5') THEN q80.pds_tag_value::int ELSE 0 END
    FROM dqr_scope_three_other_indirect_emissions_qeighty q80
    JOIN supplier_sgiq ss ON ss.sgiq_id = q80.sgiq_id
),

/* ================= DQR SUMMARY (SUPPLIER + BOM_PCF_ID + BOM_ID LEVEL) ================= */
dqr_summary AS (
    SELECT
        du.sup_id,
        du.bom_pcf_id,
        du.bom_id,
        ROUND(AVG(du.ter)::numeric, 2) AS ter,
        ROUND(AVG(du.tir)::numeric, 2) AS tir,
        ROUND(AVG(du.gr)::numeric, 2)  AS gr,
        ROUND(AVG(du.c)::numeric, 2)   AS c,
        ROUND(AVG(du.pds)::numeric, 2) AS pds,
        ROUND(
            (AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5,
            2
        ) AS overall_dqr_score,
        CASE
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 1.5 THEN '1 (Very Good)'
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 2.5 THEN '2 (Good)'
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 3.5 THEN '3 (Fair)'
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 4.5 THEN '4 (Poor)'
            ELSE '5 (Very Poor)'
        END AS criterion,
        CASE
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 1.5 THEN 'Fully representative, verified, recent, primary data'
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 2.5 THEN 'High representativeness, partly verified'
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 3.5 THEN 'Moderate accuracy, based on industry averages'
            WHEN ROUND((AVG(du.ter) + AVG(du.tir) + AVG(du.gr) + AVG(du.c) + AVG(du.pds)) / 5, 2) <= 4.5 THEN 'Outdated, estimated, or incomplete data'
            ELSE 'Non-representative / missing key data'
        END AS meaning_description
    FROM dqr_union du
    GROUP BY du.sup_id, du.bom_pcf_id, du.bom_id
)

/* ================= FINAL RESPONSE ================= */
SELECT
    bp.*,
    plc.product_code,         
    plc.ed_life_cycle_stage_id,
    plc.life_cycle_stage_name, 

    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'bom_id', bs.bom_id,
                'code', bs.code,
                'material_number', bs.material_number,
                'component_name', bs.component_name,
                'quantity', bs.qunatity,
                'price', bs.price,
                'total_price', bs.total_price,
                'weight_gms', bs.weight_gms,
                'economic_ratio', bs.economic_ratio,
                'total_weight_gms', bs.total_weight_gms,
                'production_location', bs.production_location,
                'manufacturer', bs.manufacturer,
                'detail_description', bs.detail_description,
                'component_category', bs.component_category,
                'data_source', 'Internal DB', 

                /* ---------- SUPPLIER ---------- */
                'supplier', jsonb_build_object(
                    'sup_id', bs.sup_id,
                    'code', bs.supplier_code,
                    'supplier_name', bs.supplier_name,
                    'supplier_email', bs.supplier_email,
                    'supplier_phone_number', bs.supplier_phone_number
                ),

                /* ---------- DQR (BOM-LEVEL) ---------- */
                'dqr_rating', (
                    SELECT to_jsonb(ds)
                    FROM dqr_summary ds
                    WHERE ds.sup_id = bs.sup_id
                      AND ds.bom_pcf_id = bs.bom_pcf_id
                      AND ds.bom_id = bs.bom_id
                ),

                /* ---------- MATERIAL EMISSION ---------- */
                'material_emission', (
                    SELECT COALESCE(jsonb_agg(to_jsonb(mem)), '[]'::jsonb)
                    FROM bom_emission_material_calculation_engine mem
                    WHERE mem.bom_id = bs.bom_id AND mem.product_id IS NULL
                ),

                /* ---------- PRODUCTION ---------- */
                'production_emission_calculation', (
                    SELECT to_jsonb(mep)
                    FROM bom_emission_production_calculation_engine mep
                    WHERE mep.bom_id = bs.bom_id AND mep.product_id IS NULL
                    LIMIT 1
                ),

                /* ---------- PACKAGING ---------- */
                'packaging_emission_calculation', (
                    SELECT to_jsonb(mpk)
                    FROM bom_emission_packaging_calculation_engine mpk
                    WHERE mpk.bom_id = bs.bom_id AND mpk.product_id IS NULL
                    LIMIT 1
                ),

                /* ---------- WASTE ---------- */
                'waste_emission_calculation', (
                    SELECT to_jsonb(mw)
                    FROM bom_emission_waste_calculation_engine mw
                    WHERE mw.bom_id = bs.bom_id AND mw.product_id IS NULL
                    LIMIT 1
                ),

                /* ---------- LOGISTIC ---------- */
                'logistic_emission_calculation', (
                    SELECT to_jsonb(ml)
                    FROM bom_emission_logistic_calculation_engine ml
                    WHERE ml.bom_id = bs.bom_id AND ml.product_id IS NULL
                    LIMIT 1
                ),

                /* ---------- TOTAL PCF ---------- */
                'pcf_total_emission_calculation', (
                    SELECT to_jsonb(pcfe)
                    FROM bom_emission_calculation_engine pcfe
                    WHERE pcfe.bom_id = bs.bom_id AND pcfe.product_id IS NULL
                    LIMIT 1
                )
            )
        ),
        '[]'::jsonb
    ) AS bom_list

FROM base_pcf bp
LEFT JOIN bom_supplier bs ON TRUE
LEFT JOIN product_life_cycle plc ON TRUE
GROUP BY bp.id, bp.code, bp.request_title, bp.status, bp.model_version, 
         bp.overall_pcf, bp.is_approved, bp.is_rejected, bp.is_draft, bp.created_date,
           plc.product_code, plc.ed_life_cycle_stage_id, plc.life_cycle_stage_name;
                `,
                [bom_pcf_id, product_code]
            );

            return res.status(200).send(
                generateResponse(true, "Secondary PCF + BOM + DQR fetched successfully", 200, result.rows[0])
            );

        } catch (error: any) {
            console.error("Error:", error);
            return res.status(500).send(
                generateResponse(false, error.message || "Failed to fetch data", 500, null)
            );
        }
    });
}

export async function getLinkedPCFsUsingProductCode(req: any, res: any) {
    const { product_code } = req.query;

    return withClient(async (client: any) => {
        try {
            const result = await client.query(
                `WITH base_pcf AS (
    SELECT
        pcf.id,
        pcf.code,
        pcf.product_code,
        pcf.request_title,
        pcf.priority,
        pcf.request_organization,
        pcf.due_date,
        pcf.request_description,
        pcf.status,
        pcf.model_version,
        pcf.overall_pcf,
        pcf.created_date
    FROM bom_pcf_request pcf
    WHERE pcf.product_code = $1 AND pcf.created_by =$2
)

SELECT
    base_pcf.*,

    /* ✅ Total components used */
    COUNT(DISTINCT b.id) AS total_component_used_count

FROM base_pcf
LEFT JOIN bom b
    ON b.bom_pcf_id = base_pcf.id

GROUP BY
    base_pcf.id,
    base_pcf.code,
    base_pcf.product_code,
    base_pcf.request_title,
    base_pcf.priority,
    base_pcf.request_organization,
    base_pcf.due_date,
    base_pcf.request_description,
    base_pcf.status,
    base_pcf.model_version,
    base_pcf.overall_pcf,
    base_pcf.created_date;
`,
                [product_code, req.user_id]
            );

            return res.status(200).send(
                generateResponse(true, "PCF request AND BOM fetched Successfully!", 200, result.rows)
            );

        } catch (error: any) {
            console.error("Error fetching PCF BOM list:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch PCF BOM list"
            });
        }
    });
}

// Create Cleint Input Questions
async function bulkInsert(client: any, tableName: string, columns: string[], rows: any[][]) {
    try {
        if (!rows || rows.length === 0) return;

        const values: any[] = [];
        const placeholders: string[] = [];
        let index = 1;

        for (const row of rows) {
            const rowPlaceholders = row.map(() => `$${index++}`).join(', ');
            placeholders.push(`(${rowPlaceholders})`);
            values.push(...row);
        }

        const query = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES ${placeholders.join(', ')}
    `;

        await client.query(query, values);
    } catch (error: any) {
        // ✅ LOG THE ACTUAL ERROR DETAILS
        console.error(`❌ BULK INSERT FAILED for Own emission insert table: ${tableName}`);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            table: error.table,
            column: error.column,
            dataType: error.dataType
        });
        console.error('Columns:', columns);
        console.error('First row data:', rows[0]);
        console.error('Values being inserted:', rows);

        throw error; // Re-throw to trigger rollback
    }
}

// MAIN API FUNCTION
export async function addSupplierSustainabilityData(req: any, res: any) {
    return withClient(async (client: any) => {
        await client.query("BEGIN");

        try {
            const {
                supporting_document_ids,
                additional_notes,
                client_id,
                product_id,
                supplier_general_info_questions,
                supplier_product_questions,
                scope_one_direct_emissions_questions,
                scope_two_indirect_emissions_questions,
                scope_three_other_indirect_emissions_questions,
                scope_four_avoided_emissions_questions
            } = req.body;

            // Validation
            if (!supplier_general_info_questions?.bom_pcf_id ||
                !supplier_general_info_questions?.client_id) {
                return res.send(generateResponse(false, "bom_pcf_id and client_id are required", 400, null));
            }

            const product_bom_pcf_id = supplier_general_info_questions.bom_pcf_id;
            const bom_pcf_id = supplier_general_info_questions.bom_pcf_id;
            const sgiq_id = ulid();
            const allDQRConfigs: any[] = [];

            const annual_reporting_period = supplier_general_info_questions.annual_reporting_period;
            scope_two_indirect_emissions_questions.client_id = client_id;

            const own_emission_id = ulid();

            const OwnEmissionInsert = `
                INSERT INTO own_emission (
                    id, code, bom_pcf_id, supporting_document_ids,
                    additional_notes, client_id, product_id
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                RETURNING *;
            `;

            await client.query(OwnEmissionInsert, [
                own_emission_id,
                `OWNE-${Date.now()}`,
                bom_pcf_id,
                supporting_document_ids,
                additional_notes,
                client_id,
                product_id
            ]);


            // ============================================
            // STEP 1: Insert General Info (REQUIRED FIRST)
            // ============================================
            const generalInsert = `
                INSERT INTO supplier_general_info_questions (
                    sgiq_id, bom_pcf_id, ere_acknowledge, repm_acknowledge, dc_acknowledge,
                    organization_name, core_business_activitiy, specify_other_activity, designation,
                    email_address, no_of_employees, specify_other_no_of_employees, annual_revenue,
                    specify_other_annual_revenue, annual_reporting_period,
                    availability_of_scope_one_two_three_emissions_data, client_id ,own_emission_id
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                RETURNING *;
            `;

            await client.query(generalInsert, [
                sgiq_id, bom_pcf_id,
                supplier_general_info_questions.ere_acknowledge ?? false,
                supplier_general_info_questions.repm_acknowledge ?? false,
                supplier_general_info_questions.dc_acknowledge ?? false,
                supplier_general_info_questions.organization_name,
                supplier_general_info_questions.core_business_activitiy,
                supplier_general_info_questions.specify_other_activity,
                supplier_general_info_questions.designation,
                supplier_general_info_questions.email_address,
                supplier_general_info_questions.no_of_employees,
                supplier_general_info_questions.specify_other_no_of_employees,
                supplier_general_info_questions.annual_revenue,
                supplier_general_info_questions.specify_other_annual_revenue,
                supplier_general_info_questions.annual_reporting_period,
                supplier_general_info_questions.availability_of_scope_one_two_three_emissions_data ?? false,
                client_id,
                own_emission_id
            ]);

            // DQR Rating Stage=====>
            const dataRatingId = ulid();

            const insertPCFDataRatingQuery = `
             INSERT INTO pcf_request_data_rating_stage (
                    id, bom_pcf_id, client_id ,own_emission_id
                )
                VALUES ($1,$2,$3,$4)
                RETURNING *;
            `;

            await client.query(insertPCFDataRatingQuery, [dataRatingId, bom_pcf_id, client_id, own_emission_id]);

            // ========> END

            // Insert scope questions (nested in general info) - BULK
            const scopeGeneralQuestions = supplier_general_info_questions.availability_of_scope_one_two_three_emissions_questions;
            if (Array.isArray(scopeGeneralQuestions) && scopeGeneralQuestions.length > 0) {
                const dqrRecordsNine: any[] = [];

                const insertRows = scopeGeneralQuestions.map(scope => {
                    const aosotte_id = ulid(); // Unique ID for each

                    // Store for DQR
                    dqrRecordsNine.push({
                        childId: aosotte_id,
                        data: {
                            country_iso_three: scope.country_iso_three,
                            scope_one: scope.scope_one,
                            scope_two: scope.scope_two,
                            scope_three: scope.scope_three,
                            own_emission_id
                        }
                    });

                    // Return row for bulk insert
                    return [aosotte_id, sgiq_id, scope.country_iso_three, scope.scope_one, scope.scope_two, scope.scope_three, own_emission_id];
                });

                // Bulk insert
                await bulkInsert(
                    client,
                    'availability_of_scope_one_two_three_emissions_questions',
                    ['aosotte_id', 'sgiq_id', 'country_iso_three', 'scope_one', 'scope_two', 'scope_three', 'own_emission_id'],
                    insertRows
                );

                // Add to DQR configs
                allDQRConfigs.push({
                    tableName: 'dqr_emission_data_rating_qnine',
                    columns: ['edrqn_id', 'sgiq_id', 'aosotte_id', 'data'],
                    parentId: sgiq_id,
                    records: dqrRecordsNine
                });


            }

            // ============================================
            // STEP 2: Process all sections IN PARALLEL
            // ============================================
            const insertPromises = [];

            // SUPPLIER PRODUCT QUESTIONS
            if (supplier_product_questions) {
                insertPromises.push(insertSupplierProduct(client, supplier_product_questions, sgiq_id, product_bom_pcf_id, own_emission_id));
            }

            await assertScopeThreeBomRowsValid(
                client,
                bom_pcf_id,
                supplier_general_info_questions?.sup_id ?? null,
                scope_three_other_indirect_emissions_questions
            );

            // SCOPE ONE
            if (scope_one_direct_emissions_questions) {
                insertPromises.push(insertScopeOne(client, scope_one_direct_emissions_questions, sgiq_id, product_bom_pcf_id, own_emission_id));
            }

            // SCOPE TWO
            if (scope_two_indirect_emissions_questions) {
                insertPromises.push(insertScopeTwo(client, scope_two_indirect_emissions_questions, sgiq_id, product_bom_pcf_id, annual_reporting_period, own_emission_id));
            }

            // SCOPE THREE
            if (scope_three_other_indirect_emissions_questions) {
                insertPromises.push(insertScopeThree(client, scope_three_other_indirect_emissions_questions, sgiq_id, product_bom_pcf_id, annual_reporting_period, own_emission_id));
            }

            // SCOPE FOUR
            if (scope_four_avoided_emissions_questions) {
                insertPromises.push(insertScopeFour(client, scope_four_avoided_emissions_questions, sgiq_id, product_bom_pcf_id, own_emission_id));
            }

            // Execute all inserts in parallel
            await Promise.all(insertPromises);

            // ============================================
            // STEP 3: Update PCF stages
            // ============================================

            // await client.query(
            //     `UPDATE pcf_request_data_collection_stage SET is_submitted = true,completed_date=NOW()
            //      WHERE bom_pcf_id = $1 AND client_id=$2;`,
            //     [bom_pcf_id, client_id]
            // );

            await client.query(
                `UPDATE own_emission SET is_quetions_filled = true
                 WHERE bom_pcf_id = $1 AND client_id=$2 AND product_id=$3;`,
                [bom_pcf_id, client_id, product_id]
            );

            console.log(`Creating ${allDQRConfigs.length} DQR table entries...`);
            await createDQRRecords(client, allDQRConfigs);

            await client.query("COMMIT");

            return res.send(
                generateResponse(true, "Client sustainability data added successfully", 200,
                    "Client sustainability data added successfully")
            );
        } catch (error: any) {
            await client.query("ROLLBACK");
            console.error("Error adding Client sustainability data:", error);
            return res.send(generateResponse(false, error.message, 400, null));
        }
    });
}

// HELPER FUNCTIONS - Each section in separate function

// async function insertSupplierProduct(client: any, data: any, sgiq_id: string, product_bom_pcf_id: string, own_emission_id: string) {
//     const spq_id = ulid();
//     const dqrQ11: any[] = [];
//     const allDQRConfigs: any[] = [];

//     // Insert parent
//     await client.query(
//         `INSERT INTO supplier_product_questions (
//             spq_id, sgiq_id, do_you_have_an_existing_pcf_report, pcf_methodology_used,
//             upload_pcf_report, required_environmental_impact_methods, any_co_product_have_economic_value,
//             own_emission_id
//         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
//         [spq_id, sgiq_id, data.do_you_have_an_existing_pcf_report, data.pcf_methodology_used,
//             data.upload_pcf_report, data.required_environmental_impact_methods, data.any_co_product_have_economic_value,
//             own_emission_id]
//     );

//     // Q11
//     dqrQ11.push({
//         childId: spq_id,
//         data: data.pcf_methodology_used
//     });
//     allDQRConfigs.push({
//         tableName: 'dqr_supplier_product_questions_rating_qeleven',
//         columns: ['spqrqe_id', 'sgiq_id', 'spq_id', 'data'],
//         parentId: sgiq_id,
//         records: dqrQ11
//     });

//     const dqrQ12: any[] = [];
//     // Q12
//     dqrQ12.push({
//         childId: spq_id,
//         data: data.upload_pcf_report
//     });
//     allDQRConfigs.push({
//         tableName: 'dqr_supplier_product_questions_rating_qtwelve',
//         columns: ['spqrqt_id', 'sgiq_id', 'spq_id', 'data'],
//         parentId: sgiq_id,
//         records: dqrQ12
//     });

//     const childInserts = [];

//     // Production site details - BULK
//     if (Array.isArray(data.production_site_details_questions) && data.production_site_details_questions.length > 0) {

//         const dqrQ13: any[] = [];
//         // Q13
//         const insertRows = data.production_site_details_questions.map((p: any) => {
//             const psd_id = ulid(); // correct child id

//             // Store DQR data
//             dqrQ13.push({
//                 childId: psd_id,
//                 data: {
//                     product_id: p.product_id,
//                     product_bom_pcf_id: product_bom_pcf_id,
//                     material_number: p.material_number,
//                     product_name: p.product_name,
//                     location: p.location,
//                     own_emission_id: own_emission_id
//                 }
//             });

//             // Row for bulk insert
//             return [psd_id, spq_id, p.product_id, product_bom_pcf_id, p.material_number, p.product_name, p.location, own_emission_id];
//         });

//         childInserts.push(bulkInsert(
//             client,
//             'production_site_details_questions',
//             ['psd_id', 'spq_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'product_name', 'location', 'own_emission_id'],
//             insertRows
//         ));

//         allDQRConfigs.push({
//             tableName: 'dqr_production_site_detail_rating_qthirteen',
//             columns: ['psdrqt_id', 'sgiq_id', 'psd_id', 'data'],
//             parentId: sgiq_id,
//             records: dqrQ13
//         });
//     }

//     // Product component manufactured - BULK
//     if (Array.isArray(data.product_component_manufactured_questions) && data.product_component_manufactured_questions.length > 0) {
//         const dqrQ15: any[] = [];

//         // Q15
//         const insertRows = data.product_component_manufactured_questions.map((p: any) => {
//             const pcm_id = ulid(); //unique child id

//             // Store DQR payload
//             dqrQ15.push({
//                 childId: pcm_id,
//                 data: {
//                     product_id: p.product_id,
//                     product_bom_pcf_id: product_bom_pcf_id,
//                     material_number: p.material_number,
//                     product_name: p.product_name,
//                     production_period: p.production_period,
//                     weight_per_unit: p.weight_per_unit,
//                     unit: p.unit,
//                     price: p.price,
//                     quantity: p.quantity,
//                     own_emission_id: own_emission_id
//                 }
//             });

//             // Return row for bulk insert
//             return [
//                 pcm_id, spq_id, p.product_id, product_bom_pcf_id, p.material_number, p.product_name, p.production_period, p.weight_per_unit, p.unit, p.price, p.quantity,
//                 own_emission_id
//             ];
//         });


//         childInserts.push(bulkInsert(
//             client,
//             'product_component_manufactured_questions',
//             ['pcm_id', 'spq_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'product_name', 'production_period', 'weight_per_unit', 'unit', 'price', 'quantity',
//                 'own_emission_id'
//             ],
//             insertRows
//             // data.product_component_manufactured_questions.map((p: any) =>
//             //     [ulid(), spq_id, p.product_name, p.production_period, p.weight_per_unit, p.unit, p.price, p.quantity]
//             // )
//         ));

//         allDQRConfigs.push({
//             tableName: 'dqr_product_component_manufactured_rating_qfiften',
//             columns: ['pcmrqf_id', 'sgiq_id', 'pcm_id', 'data'],
//             parentId: sgiq_id,
//             records: dqrQ15
//         });
//     }

//     // Co-product component - BULK
//     if (Array.isArray(data.co_product_component_economic_value_questions) && data.co_product_component_economic_value_questions.length > 0) {
//         const dqrQ15Point2: any[] = [];
//         const bomGroups: Record<string, any[]> = {};
//         // Q15
//         const insertRows = data.co_product_component_economic_value_questions.map((p: any) => {
//             const cpcev_id = ulid(); //unique child id

//             // Store DQR payload
//             dqrQ15Point2.push({
//                 childId: cpcev_id,
//                 data: {
//                     product_id: p.product_id,
//                     product_bom_pcf_id: product_bom_pcf_id,
//                     material_number: p.material_number,
//                     product_name: p.product_name,
//                     co_product_name: p.co_product_name,
//                     weight: p.weight,
//                     price_per_product: p.price_per_product,
//                     quantity: p.quantity,
//                     own_emission_id: own_emission_id
//                 }
//             });

//             if (!bomGroups[p.product_id]) bomGroups[p.product_id] = [];
//             bomGroups[p.product_id].push(p);

//             // Return row for bulk insert
//             return [
//                 cpcev_id, spq_id, p.product_id, product_bom_pcf_id, p.material_number, p.product_name, p.co_product_name, p.weight, p.price_per_product, p.quantity,
//                 own_emission_id
//             ];
//         });


//         childInserts.push(bulkInsert(
//             client,
//             'co_product_component_economic_value_questions',
//             ['cpcev_id', 'spq_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'product_name', 'co_product_name', 'weight', 'price_per_product', 'quantity',
//                 'own_emission_id'
//             ],
//             insertRows
//             // data.co_product_component_economic_value_questions.map((c: any) =>
//             //     [ulid(), spq_id, c.product_name, c.co_product_name, c.weight, c.price_per_product, c.quantity]
//             // )
//         ));


//         for (const [product_id, coProducts] of Object.entries(bomGroups)) {
//             //  Fetch BOM price

//             const bomRes = await client.query(`SELECT price FROM bom WHERE id = $1`, [product_id]);
//             const bomPrice = bomRes.rows[0]?.price || 0;

//             //  Calculate average price_per_product
//             const totalPrice = coProducts.reduce((sum, p) => sum + (p.price_per_product || 0), 0);
//             const avgPricePerProduct = totalPrice / (coProducts.length || 1);

//             // Compute ER safely
//             const ER = bomPrice / (avgPricePerProduct || 1);

//             // Update BOM table
//             await client.query(
//                 `UPDATE bom SET economic_ratio = $1 WHERE id = $2`,
//                 [ER, product_id]
//             );

//             let econAllocation = 'NA';
//             let phyMassAllocation = 'Physical';
//             let checkER = 'Physical';

//             if (ER > 5) {
//                 econAllocation = 'Economic';
//             }

//             //         await client.query(
//             //             `
//             // INSERT INTO allocation_methodology (
//             //     id,
//             //     product_id,
//             //     econ_allocation_er_greater_than_five,
//             //     phy_mass_allocation_er_less_than_five,
//             //     check_er_less_than_five,
//             //     product_bom_pcf_id,
//             //     own_emission_id
//             // )
//             // SELECT
//             //     $1,
//             //     $2::VARCHAR(255),
//             //     $3,
//             //     $4,
//             //     $5,
//             //     $6,
//             //     $7
//             // WHERE NOT EXISTS (
//             //     SELECT 1
//             //     FROM allocation_methodology
//             //     WHERE product_id = $2::VARCHAR(255)
//             // )
//             // `,
//             //             [
//             //                 ulid(),
//             //                 product_id,
//             //                 econAllocation,
//             //                 phyMassAllocation,
//             //                 checkER,
//             //                 product_bom_pcf_id,
//             //                 own_emission_id
//             //             ]
//             //         );


//             await client.query(
//                 `
// INSERT INTO allocation_methodology (
//     id,
//     product_id,
//     econ_allocation_er_greater_than_five,
//     phy_mass_allocation_er_less_than_five,
//     check_er_less_than_five,
//     product_bom_pcf_id,
//     own_emission_id
// )
// SELECT
//     $1,
//     $2::VARCHAR(255),
//     $3,
//     $4,
//     $5,
//     $6,
//     $7
// FROM (SELECT 1) AS dummy
// WHERE NOT EXISTS (
//     SELECT 1
//     FROM allocation_methodology
//     WHERE product_id = $2::VARCHAR(255)
// );
// `,
//                 [
//                     ulid(),
//                     product_id,
//                     econAllocation,
//                     phyMassAllocation,
//                     checkER,
//                     product_bom_pcf_id,
//                     own_emission_id
//                 ]
//             );


//             console.log(`BOM ID ${product_id} | BOM Price: ${bomPrice} | Avg Co-Product Price: ${avgPricePerProduct} | ER: ${ER}`);
//         }

//         allDQRConfigs.push({
//             tableName: 'dqr_co_product_component_manufactured_rating_qfiftenone',
//             columns: ['pcmrqfo_id', 'sgiq_id', 'cpcev_id', 'data'],
//             parentId: sgiq_id,
//             records: dqrQ15Point2
//         });
//     }

//     console.log(`Creating ${allDQRConfigs.length} DQR table entries...`);
//     await createDQRRecords(client, allDQRConfigs);
//     await Promise.all(childInserts);
// }
async function insertSupplierProduct(client: any, data: any, sgiq_id: string, product_bom_pcf_id: string, own_emission_id: string) {
    const spq_id = ulid();
    const allDQRConfigs: any[] = [];

    /* ---------------- Parent Insert ---------------- */
    await client.query(
        `
        INSERT INTO supplier_product_questions (
            spq_id,
            sgiq_id,
            do_you_have_an_existing_pcf_report,
            pcf_methodology_used,
            upload_pcf_report,
            required_environmental_impact_methods,
            any_co_product_have_economic_value,
            own_emission_id
        )
        VALUES ($1,$2,$3,$4::TEXT[],$5::TEXT[],$6::TEXT[],$7,$8)
        `,
        [
            spq_id,
            sgiq_id,
            data.do_you_have_an_existing_pcf_report,
            data.pcf_methodology_used,
            data.upload_pcf_report,
            data.required_environmental_impact_methods,
            data.any_co_product_have_economic_value,
            own_emission_id
        ]
    );

    /* ---------------- DQR Q11 ---------------- */
    allDQRConfigs.push({
        tableName: 'dqr_supplier_product_questions_rating_qeleven',
        columns: ['spqrqe_id', 'sgiq_id', 'spq_id', 'data'],
        parentId: sgiq_id,
        records: [{
            childId: spq_id,
            data: data.pcf_methodology_used
        }]
    });

    /* ---------------- DQR Q12 ---------------- */
    allDQRConfigs.push({
        tableName: 'dqr_supplier_product_questions_rating_qtwelve',
        columns: ['spqrqt_id', 'sgiq_id', 'spq_id', 'data'],
        parentId: sgiq_id,
        records: [{
            childId: spq_id,
            data: data.upload_pcf_report
        }]
    });

    /* ---------------- Production Site Details ---------------- */
    if (Array.isArray(data.production_site_details_questions) && data.production_site_details_questions.length) {
        const rows: any[] = [];
        const dqr: any[] = [];

        for (const p of data.production_site_details_questions) {
            const psd_id = ulid();

            rows.push([
                psd_id,
                spq_id,
                p.product_id,
                product_bom_pcf_id,
                p.material_number,
                p.product_name,
                p.location,
                own_emission_id,
                p.detailed_location
            ]);

            dqr.push({
                childId: psd_id,
                data: {
                    product_id: p.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: p.material_number,
                    product_name: p.product_name,
                    location: p.location,
                    own_emission_id: own_emission_id,
                    detailed_location: p.detailed_location
                }
            });
        }

        await bulkInsert(
            client,
            'production_site_details_questions',
            ['psd_id', 'spq_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'product_name', 'location', 'own_emission_id', 'detailed_location'],
            rows
        );

        allDQRConfigs.push({
            tableName: 'dqr_production_site_detail_rating_qthirteen',
            columns: ['psdrqt_id', 'sgiq_id', 'psd_id', 'data'],
            parentId: sgiq_id,
            records: dqr
        });
    }

    /* ---------------- Product Component Manufactured ---------------- */
    if (Array.isArray(data.product_component_manufactured_questions) && data.product_component_manufactured_questions.length) {
        const rows: any[] = [];
        const dqr: any[] = [];

        for (const p of data.product_component_manufactured_questions) {
            const pcm_id = ulid();

            rows.push([
                pcm_id,
                spq_id,
                p.product_id,
                product_bom_pcf_id,
                p.material_number,
                p.product_name,
                p.production_period,
                p.weight_per_unit,
                p.unit,
                p.price,
                p.quantity,
                own_emission_id
            ]);

            dqr.push({
                childId: pcm_id,
                data: {
                    product_id: p.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: p.material_number,
                    product_name: p.product_name,
                    production_period: p.production_period,
                    weight_per_unit: p.weight_per_unit,
                    unit: p.unit,
                    price: p.price,
                    quantity: p.quantity,
                    own_emission_id: own_emission_id
                }
            });
        }

        await bulkInsert(
            client,
            'product_component_manufactured_questions',
            [
                'pcm_id',
                'spq_id',
                'product_id',
                'product_bom_pcf_id',
                'material_number',
                'product_name',
                'production_period',
                'weight_per_unit',
                'unit',
                'price',
                'quantity',
                'own_emission_id'
            ],
            rows
        );

        allDQRConfigs.push({
            tableName: 'dqr_product_component_manufactured_rating_qfiften',
            columns: ['pcmrqf_id', 'sgiq_id', 'pcm_id', 'data'],
            parentId: sgiq_id,
            records: dqr
        });
    }

    /* ---------------- Co-Product Component ---------------- */
    if (Array.isArray(data.co_product_component_economic_value_questions) && data.co_product_component_economic_value_questions.length) {
        const rows: any[] = [];
        const dqr: any[] = [];
        const bomGroups: Record<string, any[]> = {};

        for (const p of data.co_product_component_economic_value_questions) {
            const cpcev_id = ulid();

            rows.push([
                cpcev_id,
                spq_id,
                p.product_id,
                product_bom_pcf_id,
                p.material_number,
                p.product_name,
                p.co_product_name,
                p.weight,
                p.price_per_product,
                p.quantity,
                own_emission_id
            ]);

            dqr.push({
                childId: cpcev_id,
                data: {
                    product_id: p.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: p.material_number,
                    product_name: p.product_name,
                    co_product_name: p.co_product_name,
                    weight: p.weight,
                    price_per_product: p.price_per_product,
                    quantity: p.quantity,
                    own_emission_id: own_emission_id
                }
            });

            if (p.product_id) {
                if (!bomGroups[p.product_id]) bomGroups[p.product_id] = [];
                bomGroups[p.product_id].push(p);
            }
        }

        await bulkInsert(
            client,
            'co_product_component_economic_value_questions',
            [
                'cpcev_id',
                'spq_id',
                'product_id',
                'product_bom_pcf_id',
                'material_number',
                'product_name',
                'co_product_name',
                'weight',
                'price_per_product',
                'quantity',
                'own_emission_id'
            ],
            rows
        );

        /* ---- Economic Ratio Calculation ---- */
        // Need to update below one
        for (const [product_id, coProducts] of Object.entries(bomGroups)) {
            const bomRes = await client.query(`SELECT price FROM bom WHERE id = $1`, [product_id]);
            const bomPrice = bomRes.rows[0]?.price || 0;

            const total = coProducts.reduce((s, p) => s + (p.price_per_product || 0), 0);
            const avg = total / (coProducts.length || 1);
            const ER = bomPrice / (avg || 1);

            await client.query(
                `UPDATE bom SET economic_ratio = $1 WHERE id = $2`,
                [ER, product_id]
            );

            const econ = ER > 5 ? 'Economic' : 'NA';

            await client.query(
                `
                INSERT INTO allocation_methodology (
                    id,
                    product_id,
                    econ_allocation_er_greater_than_five,
                    phy_mass_allocation_er_less_than_five,
                    check_er_less_than_five,
                    product_bom_pcf_id,
                    own_emission_id
                )
                SELECT $1, $2::VARCHAR(255), $3, $4, $5, $6, $7
                FROM (SELECT 1) AS dummy
                WHERE NOT EXISTS (
                    SELECT 1 FROM allocation_methodology WHERE product_id = $2::VARCHAR(255)
                )
                `,
                [ulid(), product_id, econ, 'Physical', 'Physical', product_bom_pcf_id, own_emission_id]
            );
        }

        allDQRConfigs.push({
            tableName: 'dqr_co_product_component_manufactured_rating_qfiftenone',
            columns: ['pcmrqfo_id', 'sgiq_id', 'cpcev_id', 'data'],
            parentId: sgiq_id,
            records: dqr
        });
    }

    /* ---------------- DQR Final Insert ---------------- */
    console.log(`Creating ${allDQRConfigs.length} DQR table entries...`);
    await createDQRRecords(client, allDQRConfigs);
}

async function insertScopeOne(client: any, data: any, sgiq_id: string, _product_bom_pcf_id: string, own_emission_id: string) {
    const sode_id = ulid();
    const allDQRConfigs: any[] = [];

    // Insert parent
    await client.query(
        `INSERT INTO scope_one_direct_emissions_questions
         (sode_id, sgiq_id, refrigerant_top_ups_performed, industrial_process_emissions_present,own_emission_id)
         VALUES ($1, $2, $3, $4,$5)`,
        [sode_id, sgiq_id, data.refrigerant_top_ups_performed ?? false, data.industrial_process_emissions_present ?? false, own_emission_id]
    );

    const childInserts = [];

    // Stationary combustion - needs nested handling
    const stationaryCombustionQuestions = data.stationary_combustion_on_site_energy_use_questions;

    if (Array.isArray(stationaryCombustionQuestions) && stationaryCombustionQuestions.length > 0) {
        const dqrQ16: any[] = [];
        const scoseuRows: any[] = [];
        const subFuelRows: any[] = [];

        for (const item of stationaryCombustionQuestions) {
            const scoseu_id = ulid();

            //Parent row
            scoseuRows.push([
                scoseu_id,
                sode_id,
                item.fuel_type,
                own_emission_id
            ]);

            // DQR payload (Q16)
            dqrQ16.push({
                childId: scoseu_id,
                data: JSON.stringify({
                    fuel_type: item.fuel_type
                })
            });

            // Sub fuel types (bulk collected)
            if (Array.isArray(item.scoseu_sub_fuel_type_questions) && item.scoseu_sub_fuel_type_questions.length > 0) {
                for (const s of item.scoseu_sub_fuel_type_questions) {
                    subFuelRows.push([
                        ulid(),
                        scoseu_id,
                        s.sub_fuel_type,
                        s.consumption_quantity,
                        s.unit,
                        own_emission_id
                    ]);
                }
            }
        }

        // Bulk insert parent table
        childInserts.push(
            bulkInsert(
                client,
                'stationary_combustion_on_site_energy_use_questions',
                ['scoseu_id', 'sode_id', 'fuel_type', 'own_emission_id'],
                scoseuRows
            )
        );

        // Bulk insert sub fuel types (if any)
        if (subFuelRows.length > 0) {
            childInserts.push(
                bulkInsert(
                    client,
                    'scoseu_sub_fuel_type_questions',
                    ['ssft_id', 'scoseu_id', 'sub_fuel_type', 'consumption_quantity', 'unit', 'own_emission_id'],
                    subFuelRows
                )
            );
        }

        //Register DQR Q16
        allDQRConfigs.push({
            tableName: 'dqr_stationary_combustion_on_site_energy_rating_qsixten',
            columns: ['scoserqs_id', 'sgiq_id', 'scoseu_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ16
        });
    }

    // Mobile combustion - BULK
    if (Array.isArray(data.mobile_combustion_company_owned_vehicles_questions) && data.mobile_combustion_company_owned_vehicles_questions.length > 0) {
        const dqrQ17: any[] = [];

        const insertRows = data.mobile_combustion_company_owned_vehicles_questions.map((p: any) => {
            const mccov_id = ulid(); // correct child id

            // Store DQR data
            dqrQ17.push({
                childId: mccov_id,
                data: {
                    fuel_type: p.fuel_type,
                    quantity: p.quantity,
                    unit: p.unit,
                    own_emission_id: own_emission_id
                }
            });

            // Row for bulk insert
            return [mccov_id, sode_id, p.fuel_type, p.quantity, p.unit, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'mobile_combustion_company_owned_vehicles_questions',
            ['mccov_id', 'sode_id', 'fuel_type', 'quantity', 'unit', 'own_emission_id'],
            insertRows
            // data.mobile_combustion_company_owned_vehicles_questions.map((v: any) =>
            //     [mccov_id, sode_id, v.fuel_type, v.quantity, v.unit]
            // )
        ));

        allDQRConfigs.push({
            tableName: 'dqr_mobile_combustion_company_owned_vehicles_rating_qseventen',
            columns: ['mccoqrqs_id', 'sgiq_id', 'mccov_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ17
        });
    }

    // Refrigerants - BULK
    if (Array.isArray(data.refrigerants_questions) && data.refrigerants_questions.length > 0) {

        const dqrQ19: any[] = [];

        const insertRows = data.refrigerants_questions.map((p: any) => {
            const refr_id = ulid(); // correct child id

            // Store DQR data
            dqrQ19.push({
                childId: refr_id,
                data: {
                    refrigerant_type: p.refrigerant_type,
                    quantity: p.quantity,
                    unit: p.unit,
                    own_emission_id: own_emission_id
                }
            });

            // Row for bulk insert
            return [refr_id, sode_id, p.refrigerant_type, p.quantity, p.unit, own_emission_id];
        });


        childInserts.push(bulkInsert(
            client,
            'refrigerants_questions',
            ['refr_id', 'sode_id', 'refrigerant_type', 'quantity', 'unit', 'own_emission_id'],
            insertRows
            // data.refrigerants_questions.map((r: any) => [ulid(), sode_id, r.refrigerant_type, r.quantity, r.unit])
        ));

        allDQRConfigs.push({
            tableName: 'dqr_refrigerants_rating_qnineten',
            columns: ['refrqn_id', 'sgiq_id', 'refr_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ19
        });
    }

    // Process emissions - BULK
    if (Array.isArray(data.process_emissions_sources_questions) && data.process_emissions_sources_questions.length > 0) {

        const dqrQ21: any[] = [];

        const insertRows = data.process_emissions_sources_questions.map((p: any) => {
            const pes_id = ulid(); // correct child id

            // Store DQR data
            dqrQ21.push({
                childId: pes_id,
                data: {
                    source: p.source,
                    gas_type: p.gas_type,
                    quantity: p.quantity,
                    unit: p.unit,
                    own_emission_id: own_emission_id
                }
            });

            // Row for bulk insert
            return [pes_id, sode_id, p.source, p.gas_type, p.quantity, p.unit, own_emission_id];
        });


        childInserts.push(bulkInsert(
            client,
            'process_emissions_sources_questions',
            ['pes_id', 'sode_id', 'source', 'gas_type', 'quantity', 'unit', 'own_emission_id'],
            insertRows
            // data.process_emissions_sources_questions.map((e: any) =>
            //     [ulid(), sode_id, e.source, e.gas_type, e.quantity, e.unit]
            // )
        ));

        allDQRConfigs.push({
            tableName: 'dqr_process_emissions_sources_qtwentyone',
            columns: ['pesqto_id', 'sgiq_id', 'pes_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ21
        });
    }

    await Promise.all(childInserts);

    console.log(`Creating ${allDQRConfigs.length} DQR table entries...`);
    await createDQRRecords(client, allDQRConfigs);
}

async function insertScopeTwo(client: any, data: any, sgiq_id: string, product_bom_pcf_id: string, annual_reporting_period: string, own_emission_id: string) {
    const stide_id = ulid();
    const allDQRConfigs: any[] = [];

    // Insert parent
    await client.query(
        `INSERT INTO scope_two_indirect_emissions_questions (
            stide_id, sgiq_id, do_you_acquired_standardized_re_certificates,
            methodology_to_allocate_factory_energy_to_product_level, methodology_details_document_url,
            energy_intensity_of_production_estimated_kwhor_mj, process_specific_energy_usage,
            do_you_use_any_abatement_systems, water_consumption_and_treatment_details,
            do_you_perform_destructive_testing, it_system_use_for_production_control,
            total_energy_consumption_of_it_hardware_production, energy_con_included_total_energy_pur_sec_two_qfortythree,
            do_you_use_cloud_based_system_for_production, do_you_use_any_cooling_sysytem_for_server,
            energy_con_included_total_energy_pur_sec_two_qfifty,own_emission_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,$17)`,
        [
            stide_id, sgiq_id,
            data.do_you_acquired_standardized_re_certificates ?? false,
            data.methodology_to_allocate_factory_energy_to_product_level ?? false,
            data.methodology_details_document_url,
            data.energy_intensity_of_production_estimated_kwhor_mj ?? false,
            data.process_specific_energy_usage ?? false,
            data.do_you_use_any_abatement_systems ?? false,
            data.water_consumption_and_treatment_details,
            data.do_you_perform_destructive_testing ?? false,
            data.it_system_use_for_production_control,
            data.total_energy_consumption_of_it_hardware_production ?? false,
            data.energy_con_included_total_energy_pur_sec_two_qfortythree ?? false,
            data.do_you_use_cloud_based_system_for_production ?? false,
            data.do_you_use_any_cooling_sysytem_for_server ?? false,
            data.energy_con_included_total_energy_pur_sec_two_qfifty ?? false,
            own_emission_id
        ]
    );

    const dqrQ26: any[] = [];
    dqrQ26.push({
        childId: stide_id,
        data: data.methodology_details_document_url
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_two_indirect_emissions_qtwentysix',
        columns: ['stieqts_id', 'sgiq_id', 'stide_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ26
    });

    const dqrQ31: any[] = [];
    dqrQ31.push({
        childId: stide_id,
        data: data.water_consumption_and_treatment_details
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_two_indirect_emissions_qthirtyone',
        columns: ['stideqto_id', 'sgiq_id', 'stide_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ31
    });

    const dqrQ41: any[] = [];
    dqrQ41.push({
        childId: stide_id,
        data: data.it_system_use_for_production_control
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_two_indirect_emissions_qfortyone',
        columns: ['stideqfo_id', 'sgiq_id', 'stide_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ41
    });

    const childInserts = [];

    if (Array.isArray(data.scope_two_indirect_emissions_from_purchased_energy_questions)) {

        // data.scope_two_indirect_emissions_from_purchased_energy_questions = data.client_id;

        const dqrQ22: any[] = [];

        const rows = data.scope_two_indirect_emissions_from_purchased_energy_questions.map((e: any) => {
            const stidefpe_id = ulid();

            e = data.client_id;
            prepareDQR({
                records: dqrQ22,
                childId: stidefpe_id,
                payload: {
                    energy_source: e.energy_source,
                    energy_type: e.energy_type,
                    quantity: e.quantity,
                    unit: e.unit,
                    client_id: data.client_id,
                    annual_reporting_period,
                    own_emission_id
                }
            });

            return [stidefpe_id, stide_id, e.energy_source, e.energy_type, e.quantity, e.unit, e.client_id, annual_reporting_period,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'scope_two_indirect_emissions_from_purchased_energy_questions',
            ['stidefpe_id', 'stide_id', 'energy_source', 'energy_type', 'quantity', 'unit', 'client_id', 'annual_reporting_period',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_scope_two_indirect_emis_from_pur_energy_qtwentytwo',
            columns: ['stidefpeqtt_id', 'sgiq_id', 'stidefpe_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ22
        });
    }

    if (Array.isArray(data.scope_two_indirect_emissions_certificates_questions)) {
        const dqrQ24: any[] = [];

        const rows = data.scope_two_indirect_emissions_certificates_questions.map((c: any) => {
            const stidec_id = ulid();

            prepareDQR({
                records: dqrQ24,
                childId: stidec_id,
                payload: c
            });

            return [
                stidec_id, stide_id,
                c.certificate_name, c.mechanism, c.serial_id,
                c.generator_id, c.generator_name,
                c.generator_location, c.date_of_generation, c.issuance_date,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'scope_two_indirect_emissions_certificates_questions',
            ['stidec_id', 'stide_id', 'certificate_name', 'mechanism', 'serial_id', 'generator_id', 'generator_name', 'generator_location', 'date_of_generation', 'issuance_date',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_scope_two_indirect_emissions_certificates_qtwentyfour',
            columns: ['stiecqtf_id', 'sgiq_id', 'stidec_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ24
        });
    }

    if (Array.isArray(data.energy_intensity_of_production_estimated_kwhor_mj_questions)) {
        const dqrQ27: any[] = [];

        const rows = data.energy_intensity_of_production_estimated_kwhor_mj_questions.map((i: any) => {
            const eiopekm_id = ulid();

            prepareDQR({
                records: dqrQ27,
                childId: eiopekm_id,
                payload: i
            });

            return [eiopekm_id, stide_id, i.product_id, product_bom_pcf_id, i.material_number, i.product_name, i.energy_intensity, i.unit,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'energy_intensity_of_production_estimated_kwhor_mj_questions',
            ['eiopekm_id', 'stide_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'product_name', 'energy_intensity', 'unit',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_energy_intensity_of_pro_est_kwhor_mj_qtwentyseven',
            columns: ['eiopekmqts_id', 'sgiq_id', 'eiopekm_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ27
        });

    }

    if (Array.isArray(data.process_specific_energy_usage_questions)) {
        const dqrQ28: any[] = [];

        const rows = data.process_specific_energy_usage_questions.map((p: any) => {
            const pseu_id = ulid();

            prepareDQR({
                records: dqrQ28,
                childId: pseu_id,
                payload: p
            });

            return [pseu_id, stide_id, p.process_specific_energy_type, p.quantity_consumed, p.unit, p.support_from_enviguide ?? false, p.bom_id, p.material_number, p.energy_type, annual_reporting_period,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'process_specific_energy_usage_questions',
            ['pseu_id', 'stide_id', 'process_specific_energy_type', 'quantity_consumed', 'unit', 'support_from_enviguide', 'bom_id', 'material_number', 'energy_type', 'annual_reporting_period',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_process_specific_energy_usage_qtwentyeight',
            columns: ['pseuqte_id', 'sgiq_id', 'pseu_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ28
        });

    }

    if (Array.isArray(data.abatement_systems_used_questions) && data.abatement_systems_used_questions.length > 0) {

        const dqrQ30: any[] = [];

        const rows = data.abatement_systems_used_questions.map((a: any) => {
            const asu_id = ulid();

            dqrQ30.push({
                childId: asu_id,
                data: JSON.stringify(a)
            });

            return [asu_id, stide_id, a.source, a.quantity, a.unit, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'abatement_systems_used_questions',
            ['asu_id', 'stide_id', 'source', 'quantity', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_abatement_systems_used_qthirty',
            columns: ['asuqt_id', 'sgiq_id', 'asu_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ30
        });
    }

    if (Array.isArray(data.type_of_quality_control_equipment_usage_questions)) {

        const dqrQ32: any[] = [];

        const rows = data.type_of_quality_control_equipment_usage_questions.map((q: any) => {
            const toqceu_id = ulid();

            dqrQ32.push({
                childId: toqceu_id,
                data: JSON.stringify(q)
            });

            return [toqceu_id, stide_id, q.equipment_name, q.quantity, q.unit, q.avg_operating_hours_per_month, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'type_of_quality_control_equipment_usage_questions',
            ['toqceu_id', 'stide_id', 'equipment_name', 'quantity', 'unit', 'avg_operating_hours_per_month', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_type_of_quality_control_equipment_usage_qthirtytwo',
            columns: ['toqceuqto_id', 'sgiq_id', 'toqceu_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ32
        });
    }

    if (Array.isArray(data.electricity_consumed_for_quality_control_questions)) {

        const dqrQ33: any[] = [];

        const rows = data.electricity_consumed_for_quality_control_questions.map((e: any) => {
            const ecfqc_id = ulid();

            dqrQ33.push({
                childId: ecfqc_id,
                data: JSON.stringify(e)
            });

            return [ecfqc_id, stide_id, e.energy_type, e.quantity, e.unit, e.period, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'electricity_consumed_for_quality_control_questions',
            ['ecfqc_id', 'stide_id', 'energy_type', 'quantity', 'unit', 'period', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_electricity_consumed_for_quality_control_qthirtythree',
            columns: ['ecfqcqtt_id', 'sgiq_id', 'ecfqc_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ33
        });
    }

    if (Array.isArray(data.quality_control_process_usage_questions)) {

        const dqrQ34: any[] = [];

        const rows = data.quality_control_process_usage_questions.map((q: any) => {
            const qcpu_id = ulid();

            dqrQ34.push({
                childId: qcpu_id,
                data: JSON.stringify(q)
            });

            return [qcpu_id, stide_id, q.process_name, q.quantity, q.unit, q.period, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'quality_control_process_usage_questions',
            ['qcpu_id', 'stide_id', 'process_name', 'quantity', 'unit', 'period', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_quality_control_process_usage_qthirtyfour',
            columns: ['qcpuqtf_id', 'sgiq_id', 'qcpu_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ34
        });
    }

    if (Array.isArray(data.quality_control_process_usage_pressure_or_flow_questions)) {

        const dqrQ341: any[] = [];

        const rows = data.quality_control_process_usage_pressure_or_flow_questions.map((p: any) => {
            const qcpupf_id = ulid();

            dqrQ341.push({
                childId: qcpupf_id,
                data: JSON.stringify(p)
            });

            return [qcpupf_id, stide_id, p.flow_name, p.quantity, p.unit, p.period, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'quality_control_process_usage_pressure_or_flow_questions',
            ['qcpupf_id', 'stide_id', 'flow_name', 'quantity', 'unit', 'period', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_quality_control_process_usage_pressure_or_flow_qthirtyfour',
            columns: ['qcpupfqtf_id', 'sgiq_id', 'qcpupf_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ341
        });
    }

    if (Array.isArray(data.quality_control_use_any_consumables_questions)) {

        const dqrQ35: any[] = [];

        const rows = data.quality_control_use_any_consumables_questions.map((c: any) => {
            const qcuac_id = ulid();

            dqrQ35.push({
                childId: qcuac_id,
                data: JSON.stringify(c)
            });

            return [qcuac_id, stide_id, c.consumable_name, c.mass_of_consumables, c.unit, c.period, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'quality_control_use_any_consumables_questions',
            ['qcuac_id', 'stide_id', 'consumable_name', 'mass_of_consumables', 'unit', 'period', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_quality_control_use_any_consumables_qthirtyfive',
            columns: ['qcuacqtf_id', 'sgiq_id', 'qcuac_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ35
        });
    }

    if (Array.isArray(data.weight_of_samples_destroyed_questions)) {

        const dqrQ37: any[] = [];

        const rows = data.weight_of_samples_destroyed_questions.map((w: any) => {
            const wosd_id = ulid();

            dqrQ37.push({
                childId: wosd_id,
                data: JSON.stringify(w)
            });

            return [wosd_id, stide_id, w.product_id, product_bom_pcf_id, w.material_number, w.component_name, w.weight, w.unit, w.period, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'weight_of_samples_destroyed_questions',
            ['wosd_id', 'stide_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'weight', 'unit', 'period', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_weight_of_samples_destroyed_qthirtyseven',
            columns: ['wosdqts_id', 'sgiq_id', 'wosd_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ37
        });
    }

    if (Array.isArray(data.defect_or_rejection_rate_identified_by_quality_control_questions)) {

        const dqrQ38: any[] = [];

        const rows = data.defect_or_rejection_rate_identified_by_quality_control_questions.map((d: any) => {
            const dorriqc_id = ulid();

            dqrQ38.push({
                childId: dorriqc_id,
                data: JSON.stringify(d)
            });

            return [dorriqc_id, stide_id, d.product_id, product_bom_pcf_id, d.material_number, d.component_name, d.percentage, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'defect_or_rejection_rate_identified_by_quality_control_questions',
            ['dorriqc_id', 'stide_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'percentage', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_defect_or_rej_rate_identified_by_quality_control_qthirtyeight',
            columns: ['dorriqcqte_id', 'sgiq_id', 'dorriqc_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ38
        });
    }

    if (Array.isArray(data.rework_rate_due_to_quality_control_questions)) {

        const dqrQ39: any[] = [];

        const rows = data.rework_rate_due_to_quality_control_questions.map((r: any) => {
            const rrdqc_id = ulid();

            dqrQ39.push({
                childId: rrdqc_id,
                data: JSON.stringify(r)
            });

            return [rrdqc_id, stide_id, r.product_id, product_bom_pcf_id, r.material_number, r.component_name, r.processes_involved, r.percentage,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'rework_rate_due_to_quality_control_questions',
            ['rrdqc_id', 'stide_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'processes_involved', 'percentage',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_rework_rate_due_to_quality_control_qthirtynine',
            columns: ['rrdqcqtn_id', 'sgiq_id', 'rrdqc_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ39
        });
    }

    if (Array.isArray(data.weight_of_quality_control_waste_generated_questions)) {

        const dqrQ40: any[] = [];

        const rows = data.weight_of_quality_control_waste_generated_questions.map((w: any) => {
            const woqcwg_id = ulid();

            dqrQ40.push({
                childId: woqcwg_id,
                data: JSON.stringify(w)
            });

            return [woqcwg_id, stide_id, w.product_id, product_bom_pcf_id, w.material_number, w.component_name, w.waste_type, w.waste_weight, w.unit, w.treatment_type,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'weight_of_quality_control_waste_generated_questions',
            ['woqcwg_id', 'stide_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'waste_type', 'waste_weight', 'unit', 'treatment_type',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_weight_of_quality_control_waste_generated_qforty',
            columns: ['woqcwgqf_id', 'sgiq_id', 'woqcwg_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ40
        });
    }

    if (Array.isArray(data.energy_consumption_for_qfortyfour_questions) && data.energy_consumption_for_qfortyfour_questions.length > 0) {

        const dqrQ44: any[] = [];

        const rows = data.energy_consumption_for_qfortyfour_questions.map((e: any) => {
            const ecfqff_id = ulid();

            dqrQ44.push({
                childId: ecfqff_id,
                data: JSON.stringify({
                    energy_purchased: e.energy_purchased,
                    energy_type: e.energy_type,
                    quantity: e.quantity,
                    unit: e.unit
                })
            });

            return [
                ecfqff_id,
                stide_id,
                e.energy_purchased,
                e.energy_type,
                e.quantity,
                e.unit,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'energy_consumption_for_qfortyfour_questions',
            ['ecfqff_id', 'stide_id', 'energy_purchased', 'energy_type', 'quantity', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_energy_consumption_for_qfortyfour_qfortyfour',
            columns: ['ecfqffqff_id', 'sgiq_id', 'ecfqff_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ44
        });
    }

    if (Array.isArray(data.cloud_provider_details_questions) && data.cloud_provider_details_questions.length > 0) {

        const dqrQ46: any[] = [];

        const rows = data.cloud_provider_details_questions.map((c: any) => {
            const cpd_id = ulid();

            dqrQ46.push({
                childId: cpd_id,
                data: JSON.stringify({
                    cloud_provider_name: c.cloud_provider_name,
                    virtual_machines: c.virtual_machines,
                    data_storage: c.data_storage,
                    data_transfer: c.data_transfer
                })
            });

            return [
                cpd_id,
                stide_id,
                c.cloud_provider_name,
                c.virtual_machines,
                c.data_storage,
                c.data_transfer,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'cloud_provider_details_questions',
            ['cpd_id', 'stide_id', 'cloud_provider_name', 'virtual_machines', 'data_storage', 'data_transfer', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_cloud_provider_details_qfortysix',
            columns: ['cpdqfs_id', 'sgiq_id', 'cpd_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ46
        });
    }

    if (Array.isArray(data.dedicated_monitoring_sensor_usage_questions) && data.dedicated_monitoring_sensor_usage_questions.length > 0) {

        const dqrQ47: any[] = [];

        const rows = data.dedicated_monitoring_sensor_usage_questions.map((d: any) => {
            const dmsu_id = ulid();

            dqrQ47.push({
                childId: dmsu_id,
                data: JSON.stringify({
                    type_of_sensor: d.type_of_sensor,
                    sensor_quantity: d.sensor_quantity,
                    energy_consumption: d.energy_consumption,
                    unit: d.unit
                })
            });

            return [
                dmsu_id,
                stide_id,
                d.type_of_sensor,
                d.sensor_quantity,
                d.energy_consumption,
                d.unit,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'dedicated_monitoring_sensor_usage_questions',
            ['dmsu_id', 'stide_id', 'type_of_sensor', 'sensor_quantity', 'energy_consumption', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_dedicated_monitoring_sensor_usage_qfortyseven',
            columns: ['dmsuqfs_id', 'sgiq_id', 'dmsu_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ47
        });
    }


    if (Array.isArray(data.annual_replacement_rate_of_sensor_questions) && data.annual_replacement_rate_of_sensor_questions.length > 0) {

        const dqrQ48: any[] = [];

        const rows = data.annual_replacement_rate_of_sensor_questions.map((a: any) => {
            const arros_id = ulid();

            dqrQ48.push({
                childId: arros_id,
                data: JSON.stringify({
                    consumable_name: a.consumable_name,
                    quantity: a.quantity,
                    unit: a.unit
                })
            });

            return [
                arros_id,
                stide_id,
                a.consumable_name,
                a.quantity,
                a.unit,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'annual_replacement_rate_of_sensor_questions',
            ['arros_id', 'stide_id', 'consumable_name', 'quantity', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_annual_replacement_rate_of_sensor_qfortyeight',
            columns: ['arrosqfe_id', 'sgiq_id', 'arros_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ48
        });
    }

    if (Array.isArray(data.energy_consumption_for_qfiftyone_questions) && data.energy_consumption_for_qfiftyone_questions.length > 0) {

        const dqrQ51: any[] = [];

        const rows = data.energy_consumption_for_qfiftyone_questions.map((e: any) => {
            const ecfqfo_id = ulid();

            dqrQ51.push({
                childId: ecfqfo_id,
                data: JSON.stringify({
                    energy_purchased: e.energy_purchased,
                    energy_type: e.energy_type,
                    quantity: e.quantity,
                    unit: e.unit
                })
            });

            return [
                ecfqfo_id,
                stide_id,
                e.energy_purchased,
                e.energy_type,
                e.quantity,
                e.unit,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'energy_consumption_for_qfiftyone_questions',
            ['ecfqfo_id', 'stide_id', 'energy_purchased', 'energy_type', 'quantity', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_energy_consumption_for_qfiftyone_qfiftyone',
            columns: ['ecfqfoqfo_id', 'sgiq_id', 'ecfqfo_id', 'data'],
            parentId: sgiq_id,
            records: dqrQ51
        });
    }


    await Promise.all(childInserts);

    console.log(`Creating ${allDQRConfigs.length} DQR table entries...`);
    await createDQRRecords(client, allDQRConfigs);
}

async function insertScopeThree(client: any, data: any, sgiq_id: string, product_bom_pcf_id: string, annual_reporting_period: string, own_emission_id: string) {
    const stoie_id = ulid();
    const allDQRConfigs: any[] = [];

    // Insert parent
    await client.query(
        `INSERT INTO scope_three_other_indirect_emissions_questions (
            stoie_id, sgiq_id, raw_materials_contact_enviguide_support,
            grade_of_metal_used, msds_link_or_upload_document,
            use_of_recycled_secondary_materials, percentage_of_pre_post_consumer_material_used_in_product,
            do_you_use_recycle_mat_for_packaging, percentage_of_recycled_content_used_in_packaging,
            do_you_use_electricity_for_packaging, energy_con_included_total_energy_pur_sec_two_qsixtysix,
            internal_or_external_waste_material_per_recycling, any_by_product_generated,
            do_you_track_emission_from_transport, mode_of_transport_used_for_transportation,
            mode_of_transport_enviguide_support, iso_14001_or_iso_50001_certified,
            standards_followed_iso_14067_GHG_catena_etc, do_you_report_to_cdp_sbti_or_other,
            measures_to_reduce_carbon_emissions_in_production, renewable_energy_initiatives_or_recycling_programs,
            your_company_info ,own_emission_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
            stoie_id, sgiq_id,
            data.raw_materials_contact_enviguide_support ?? false,
            data.grade_of_metal_used,
            data.msds_link_or_upload_document,
            data.use_of_recycled_secondary_materials ?? false,
            data.percentage_of_pre_post_consumer_material_used_in_product ?? false,
            data.do_you_use_recycle_mat_for_packaging ?? false,
            data.percentage_of_recycled_content_used_in_packaging,
            data.do_you_use_electricity_for_packaging ?? false,
            data.energy_con_included_total_energy_pur_sec_two_qsixtysix ?? false,
            data.internal_or_external_waste_material_per_recycling,
            data.any_by_product_generated ?? false,
            data.do_you_track_emission_from_transport ?? false,
            data.mode_of_transport_used_for_transportation ?? false,
            data.mode_of_transport_enviguide_support ?? false,
            data.iso_14001_or_iso_50001_certified ?? false,
            data.standards_followed_iso_14067_GHG_catena_etc ?? false,
            data.do_you_report_to_cdp_sbti_or_other ?? false,
            data.measures_to_reduce_carbon_emissions_in_production,
            data.renewable_energy_initiatives_or_recycling_programs,
            data.your_company_info,
            own_emission_id
        ]
    );

    const dqrQ53: any[] = [];
    dqrQ53.push({
        childId: stoie_id,
        data: data.grade_of_metal_used
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_three_other_indirect_emissions_qfiftythree',
        columns: ['stoieqft_id', 'sgiq_id', 'stoie_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ53
    });

    const dqrQ54: any[] = [];
    dqrQ54.push({
        childId: stoie_id,
        data: data.msds_link_or_upload_document
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_three_other_indirect_emissions_qfiftyfour',
        columns: ['stoieqff_id', 'sgiq_id', 'stoie_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ54
    });

    const dqrQ64: any[] = [];
    dqrQ64.push({
        childId: stoie_id,
        data: data.percentage_of_recycled_content_used_in_packaging
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_three_other_indirect_emissions_qsixtyfour',
        columns: ['stoieqsf_id', 'sgiq_id', 'stoie_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ64
    });

    const dqrQ69: any[] = [];
    dqrQ69.push({
        childId: stoie_id,
        data: data.internal_or_external_waste_material_per_recycling
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_three_other_indirect_emissions_qsixtynine',
        columns: ['stoieqsn_id', 'sgiq_id', 'stoie_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ69
    });


    const dqrQ79: any[] = [];
    dqrQ79.push({
        childId: stoie_id,
        data: data.measures_to_reduce_carbon_emissions_in_production
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_three_other_indirect_emissions_qseventynine',
        columns: ['stoieqsn_id', 'sgiq_id', 'stoie_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ79
    });

    const dqrQ80: any[] = [];
    dqrQ80.push({
        childId: stoie_id,
        data: data.renewable_energy_initiatives_or_recycling_programs
    });
    allDQRConfigs.push({
        tableName: 'dqr_scope_three_other_indirect_emissions_qeighty',
        columns: ['stoieqe_id', 'sgiq_id', 'stoie_id', 'data'],
        parentId: sgiq_id,
        records: dqrQ80
    });

    const childInserts = [];


    if (Array.isArray(data.raw_materials_used_in_component_manufacturing_questions)) {

        const dqr52: any[] = [];

        const rows = data.raw_materials_used_in_component_manufacturing_questions.map((m: any) => {
            const rmuicm_id = ulid();

            prepareDQR({
                records: dqr52,
                childId: rmuicm_id,
                payload: {
                    product_id: m.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: m.material_number,
                    material_name: m.material_name,
                    percentage: m.percentage,
                    annual_reporting_period,
                    own_emission_id
                }
            });

            return [rmuicm_id, stoie_id, m.product_id, product_bom_pcf_id, m.material_number, m.material_name, m.percentage, annual_reporting_period, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'raw_materials_used_in_component_manufacturing_questions',
            ['rmuicm_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'material_name', 'percentage', 'annual_reporting_period',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_raw_materials_used_in_component_manufacturing_qfiftytwo',
            columns: ['rmuicmqft_id', 'sgiq_id', 'rmuicm_id', 'data'],
            parentId: sgiq_id,
            records: dqr52
        });
    }

    if (Array.isArray(data.recycled_materials_with_percentage_questions)) {

        const dqr56: any[] = [];

        const rows = data.recycled_materials_with_percentage_questions.map((r: any) => {
            const rmwp_id = ulid();

            prepareDQR({
                records: dqr56,
                childId: rmwp_id,
                payload: {
                    product_id: r.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: r.material_number,
                    material_name: r.material_name,
                    percentage: r.percentage,
                    own_emission_id
                }
            });

            return [rmwp_id, stoie_id, r.product_id, product_bom_pcf_id, r.material_number, r.material_name, r.percentage, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'recycled_materials_with_percentage_questions',
            ['rmwp_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'material_name', 'percentage', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_recycled_materials_with_percentage_qfiftysix',
            columns: ['rmwpqfs_id', 'sgiq_id', 'rmwp_id', 'data'],
            parentId: sgiq_id,
            records: dqr56
        });
    }

    if (Array.isArray(data.pre_post_consumer_reutilization_percentage_questions)) {

        const dqr58: any[] = [];

        const rows = data.pre_post_consumer_reutilization_percentage_questions.map((p: any) => {
            const ppcrp_id = ulid();

            prepareDQR({
                records: dqr58,
                childId: ppcrp_id,
                payload: {
                    material_type: p.material_type,
                    percentage: p.percentage,
                    own_emission_id
                }
            });

            return [ppcrp_id, stoie_id, p.material_type, p.percentage, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'pre_post_consumer_reutilization_percentage_questions',
            ['ppcrp_id', 'stoie_id', 'material_type', 'percentage', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_pre_post_consumer_reutilization_percentage_qfiftyeight',
            columns: ['ppcrpqfe_id', 'sgiq_id', 'ppcrp_id', 'data'],
            parentId: sgiq_id,
            records: dqr58
        });
    }

    if (Array.isArray(data.pir_pcr_material_percentage_questions)) {

        const dqr59: any[] = [];

        const rows = data.pir_pcr_material_percentage_questions.map((p: any) => {
            const ppmp_id = ulid();

            prepareDQR({
                records: dqr59,
                childId: ppmp_id,
                payload: {
                    material_type: p.material_type,
                    percentage: p.percentage,
                    own_emission_id
                }
            });

            return [ppmp_id, stoie_id, p.material_type, p.percentage, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'pir_pcr_material_percentage_questions',
            ['ppmp_id', 'stoie_id', 'material_type', 'percentage', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_pir_pcr_material_percentage_qfiftynine',
            columns: ['ppmpqfn_id', 'sgiq_id', 'ppmp_id', 'data'],
            parentId: sgiq_id,
            records: dqr59
        });
    }

    if (Array.isArray(data.type_of_pack_mat_used_for_delivering_questions)) {

        const dqr60: any[] = [];

        const rows = data.type_of_pack_mat_used_for_delivering_questions.map((p: any) => {
            const topmudp_id = ulid();

            prepareDQR({
                records: dqr60,
                childId: topmudp_id,
                payload: p
            });

            return [topmudp_id, stoie_id, p.product_id, product_bom_pcf_id, p.material_number, p.component_name, p.packagin_type, p.packaging_size, p.unit, own_emission_id, p.treatment_type];
        });

        childInserts.push(bulkInsert(
            client,
            'type_of_pack_mat_used_for_delivering_questions',
            ['topmudp_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'packagin_type', 'packaging_size', 'unit', 'own_emission_id', 'treatment_type'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_type_of_pack_mat_used_for_delivering_qsixty',
            columns: ['topmudpqs_id', 'sgiq_id', 'topmudp_id', 'data'],
            parentId: sgiq_id,
            records: dqr60
        });
    }

    if (Array.isArray(data.weight_of_packaging_per_unit_product_questions)) {

        const dqr61: any[] = [];

        const rows = data.weight_of_packaging_per_unit_product_questions.map((w: any) => {
            const woppup_id = ulid();

            prepareDQR({
                records: dqr61,
                childId: woppup_id,
                payload: w
            });

            return [woppup_id, stoie_id, w.product_id, product_bom_pcf_id, w.material_number, w.component_name, w.packagin_weight, w.unit, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'weight_of_packaging_per_unit_product_questions',
            ['woppup_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'packagin_weight', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_weight_of_packaging_per_unit_product_qsixtyone',
            columns: ['woppupqso_id', 'sgiq_id', 'woppup_id', 'data'],
            parentId: sgiq_id,
            records: dqr61
        });
    }

    if (Array.isArray(data.energy_consumption_for_qsixtyseven_questions)) {

        const dqr67: any[] = [];

        const rows = data.energy_consumption_for_qsixtyseven_questions.map((e: any) => {
            const ecfqss_id = ulid();

            prepareDQR({
                records: dqr67,
                childId: ecfqss_id,
                payload: e
            });

            return [ecfqss_id, stoie_id, e.energy_purchased, e.energy_type, e.quantity, e.unit, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'energy_consumption_for_qsixtyseven_questions',
            ['ecfqss_id', 'stoie_id', 'energy_purchased', 'energy_type', 'quantity', 'unit', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_energy_consumption_for_qsixtyseven_qsixtyseven',
            columns: ['ecfqssqss_id', 'sgiq_id', 'ecfqss_id', 'data'],
            parentId: sgiq_id,
            records: dqr67
        });
    }

    if (Array.isArray(data.weight_of_pro_packaging_waste_questions)) {

        const dqr68: any[] = [];

        const rows = data.weight_of_pro_packaging_waste_questions.map((w: any) => {
            const woppw_id = ulid();

            prepareDQR({
                records: dqr68,
                childId: woppw_id,
                payload: {
                    product_id: w.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: w.material_number,
                    component_name: w.component_name,
                    waste_type: w.waste_type,
                    waste_weight: w.waste_weight,
                    unit: w.unit,
                    treatment_type: w.treatment_type,
                    annual_reporting_period,
                    own_emission_id
                }
            });

            return [woppw_id, stoie_id, w.product_id, product_bom_pcf_id, w.material_number, w.component_name, w.waste_type, w.waste_weight, w.unit, w.treatment_type, annual_reporting_period,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'weight_of_pro_packaging_waste_questions',
            ['woppw_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'waste_type', 'waste_weight', 'unit', 'treatment_type', 'annual_reporting_period',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_weight_of_pro_packaging_waste_qsixtyeight',
            columns: ['woppwqse_id', 'sgiq_id', 'woppw_id', 'data'],
            parentId: sgiq_id,
            records: dqr68
        });
    }

    if (Array.isArray(data.type_of_by_product_questions)) {

        const dqr71: any[] = [];

        const rows = data.type_of_by_product_questions.map((b: any) => {
            const topbp_id = ulid();

            prepareDQR({
                records: dqr71,
                childId: topbp_id,
                payload: {
                    product_id: b.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: b.material_number,
                    component_name: b.component_name,
                    by_product: b.by_product,
                    price_per_product: b.price_per_product,
                    quantity: b.quantity,
                    own_emission_id
                }
            });

            return [topbp_id, stoie_id, b.product_id, product_bom_pcf_id, b.material_number, b.component_name, b.by_product, b.price_per_product, b.quantity,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'type_of_by_product_questions',
            ['topbp_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'by_product', 'price_per_product', 'quantity',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_type_of_by_product_qseventyone',
            columns: ['topbpqso_id', 'sgiq_id', 'topbp_id', 'data'],
            parentId: sgiq_id,
            records: dqr71
        });
    }

    if (Array.isArray(data.co_two_emission_of_raw_material_questions)) {

        const dqr73: any[] = [];

        const rows = data.co_two_emission_of_raw_material_questions.map((c: any) => {
            const coteorm_id = ulid();

            prepareDQR({
                records: dqr73,
                childId: coteorm_id,
                payload: {
                    product_id: c.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: c.material_number,
                    component_name: c.component_name,
                    raw_material_name: c.raw_material_name,
                    transport_mode: c.transport_mode,
                    source_location: c.source_location,
                    destination_location: c.destination_location,
                    co_two_emission: c.co_two_emission
                }
            });

            return [
                coteorm_id,
                stoie_id,
                c.product_id,
                product_bom_pcf_id,
                c.material_number,
                c.component_name,
                c.raw_material_name,
                c.transport_mode,
                c.source_location,
                c.destination_location,
                c.co_two_emission,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'co_two_emission_of_raw_material_questions',
            ['coteorm_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'raw_material_name', 'transport_mode', 'source_location', 'destination_location', 'co_two_emission',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_co_two_emission_of_raw_material_qseventythree',
            columns: ['coteormqst_id', 'sgiq_id', 'coteorm_id', 'data'],
            parentId: sgiq_id,
            records: dqr73
        });
    }

    if (Array.isArray(data.mode_of_transport_used_for_transportation_questions)) {

        const dqr74: any[] = [];

        const rows = data.mode_of_transport_used_for_transportation_questions.map((t: any) => {
            const motuft_id = ulid();

            prepareDQR({
                records: dqr74,
                childId: motuft_id,
                payload: {
                    product_id: t.product_id,
                    product_bom_pcf_id: product_bom_pcf_id,
                    material_number: t.material_number,
                    component_name: t.component_name,
                    mode_of_transport: t.mode_of_transport,
                    weight_transported: t.weight_transported,
                    source_point: t.source_point,
                    drop_point: t.drop_point,
                    distance: t.distance
                }
            });

            return [
                motuft_id,
                stoie_id,
                t.product_id,
                product_bom_pcf_id,
                t.material_number,
                t.component_name,
                t.mode_of_transport,
                t.weight_transported,
                t.source_point,
                t.drop_point,
                t.distance,
                own_emission_id
            ];
        });

        childInserts.push(bulkInsert(
            client,
            'mode_of_transport_used_for_transportation_questions',
            ['motuft_id', 'stoie_id', 'product_id', 'product_bom_pcf_id', 'material_number', 'component_name', 'mode_of_transport', 'weight_transported', 'source_point', 'drop_point', 'distance',
                'own_emission_id'
            ],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_mode_of_transport_used_for_transportation_qseventyfour',
            columns: ['motuftqsf_id', 'sgiq_id', 'motuft_id', 'data'],
            parentId: sgiq_id,
            records: dqr74
        });
    }

    if (Array.isArray(data.destination_plant_component_transportation_questions)) {

        const dqr75: any[] = [];

        const rows = data.destination_plant_component_transportation_questions.map((d: any) => {
            const dpct_id = ulid();

            prepareDQR({
                records: dqr75,
                childId: dpct_id,
                payload: {
                    country: d.country,
                    state: d.state,
                    city: d.city,
                    pincode: d.pincode
                }
            });

            return [dpct_id, stoie_id, d.country, d.state, d.city, d.pincode, own_emission_id];
        });

        childInserts.push(bulkInsert(
            client,
            'destination_plant_component_transportation_questions',
            ['dpct_id', 'stoie_id', 'country', 'state', 'city', 'pincode', 'own_emission_id'],
            rows
        ));

        allDQRConfigs.push({
            tableName: 'dqr_destination_plant_component_transportation_qseventyfive',
            columns: ['dpctqsf_id', 'sgiq_id', 'dpct_id', 'data'],
            parentId: sgiq_id,
            records: dqr75
        });
    }

    await Promise.all(childInserts);
    console.log(`Creating ${allDQRConfigs.length} DQR table entries...`);
    await createDQRRecords(client, allDQRConfigs);
}

async function insertScopeFour(client: any, data: any, sgiq_id: string, _product_bom_pcf_id: string, own_emission_id: string) {
    const sfae_id = ulid();

    await client.query(
        `INSERT INTO scope_four_avoided_emissions_questions (
            sfae_id, sgiq_id, products_or_services_that_help_reduce_customer_emissions,
            circular_economy_practices_reuse_take_back_epr_refurbishment,
            renewable_energy_carbon_offset_projects_implemented , own_emission_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            sfae_id, sgiq_id,
            data.products_or_services_that_help_reduce_customer_emissions ?? false,
            data.circular_economy_practices_reuse_take_back_epr_refurbishment,
            data.renewable_energy_carbon_offset_projects_implemented,
            own_emission_id
        ]
    );
}

// DQR HELPER FUNCTION
async function createDQRRecords(client: any, dqrConfigs: any[]) {
    const insertPromises = [];

    for (const config of dqrConfigs) {
        if (config.records && config.records.length > 0) {
            const values: any[] = [];
            const placeholders: string[] = [];
            let index = 1;

            for (const record of config.records) {
                placeholders.push(`($${index++}, $${index++}, $${index++}, $${index++})`);
                values.push(
                    ulid(),                    // dqr_id
                    config.parentId,           // parent FK (sgiq_id, sode_id, etc.)
                    record.childId,            // child FK (aosotte_id, etc.)
                    JSON.stringify(record.data)
                );
            }

            const query = `
                INSERT INTO ${config.tableName}
                (${config.columns.join(', ')})
                VALUES ${placeholders.join(', ')}
            `;

            insertPromises.push(client.query(query, values));
        }
    }

    if (insertPromises.length > 0) {
        await Promise.all(insertPromises);
    }
}

function prepareDQR({
    records,
    childId,
    payload
}: {
    records: any[],
    childId: string,
    payload: any
}) {
    records.push({
        childId,
        data: JSON.stringify(payload)
    });
}
// it will end here


// pcfCalculate — REMOVED 2026-06-12.
// The legacy 5-formula calculation chain (materials / packaging / energy /
// transport / waste) tied to the 70-question supplier questionnaire was
// removed as part of the 28-question + EF-matching-engine rewrite.
// The new calculation engine will be wired here once it lands.
// All earlier git history is preserved on branch: backup/before-97-questions-2026-06-12
export async function pcfCalculate(req: any, res: any) {
    return res.status(503).send(
        generateResponse(
            false,
            "PCF calculation is being upgraded to the new emission-factor matching engine. This endpoint is temporarily unavailable.",
            503,
            null
        )
    );
}

