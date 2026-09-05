import { withClient } from '../util/database.js';
import { generateResponse } from '../util/genRes.js';
import { createDqrRatingService, getSupplierDqrDetailsService, updateDqrRatingService } from "../services/dqrRatingService.js";
import { getV3DqrDataPoints, isV3DqrType, updateV3DqrRating } from "../services/dqrV3Service.js";

const ALLOWED_TYPES = [
    "dqr_raw_material_product_rating",
    "dqr_recycled_material_content_rating",
    "dqr_pre_consumer_material_rating",
    "dqr_post_consumer_material_rating",
    "dqr_reutilization_material_rating",
    "dqr_recycled_copper_rating",
    "dqr_recycled_aluminum_rating",
    "dqr_recycled_steel_rating",
    "dqr_recycled_plastics_rating",
    "dqr_recycled_thermoplastics_rating",
    "dqr_recycled_plastic_fillers_rating",
    "dqr_recycled_fiber_content_rating",
    "dqr_recycling_process_rating",
    "dqr_track_transport_emissions_rating",
    "dqr_pcr_and_pir_rating",
    "dqr_bio_based_or_renewable_materials_rating",
    "dqr_main_alloy_metals_rating",
    "dqr_metal_grade_rating",
    "dqr_energy_sources_used_rating",
    "dqr_electricity_consumption_per_year_rating",
    "dqr_renewable_electricity_percentage_rating",
    "dqr_energy_intensity_per_unit_rating",
    "dqr_process_specific_energy_usage_rating",
    "dqr_abatement_system_energy_consumption_rating",
    "dqr_water_consumption_and_treatment_details_rating",
    "dqr_packaging_materials_used_rating",
    "dqr_packaging_weight_per_unit_rating",
    "dqr_recycled_packaging_percentage_rating",
    "dqr_transport_modes_used_rating",
    "dqr_logistics_provider_details_rating",
    "dqr_recycling_percentage_rating",
    "dqr_byproduct_types_rating",
    "dqr_byproduct_quantity_rating",
    "dqr_product_recycling_details_rating",
    "dqr_takeback_program_details_rating",
    "dqr_pcf_methodologies_used_rating",
    "dqr_emission_data_details_rating",
    "dqr_previous_reports_rating",
    "dqr_carbon_reduction_measures_rating",
    "dqr_renewable_energy_or_recycling_programs_rating",
    "dqr_primary_data_details_rating"
];


export async function createDqrRating(req: any, res: any) {
    try {
        const { type, bom_pcf_id, ...ratingData } = req.body;

        // ✅ Validate type
        if (!type || !ALLOWED_TYPES.includes(type)) {
            return res
                .status(400)
                .json(generateResponse(false, "Invalid or missing rating type", 400, { allowed_types: ALLOWED_TYPES }));
        }

        if (!ratingData[type] || !Array.isArray(ratingData[type]) || ratingData[type].length === 0) {
            return res
                .status(400)
                .json(generateResponse(false, `Missing or invalid data for ${type}`, 400, null));
        }

        const created_by = req.user_id || "system";
        const code = "DQR-" + Date.now();
        const records = ratingData[type];

        const inserted = await createDqrRatingService(type, records, created_by, code, bom_pcf_id);

        return res
            .status(200)
            .json(generateResponse(true, `${type} inserted successfully`, 200, inserted));
    } catch (error: any) {
        console.error("❌ Error in createDqrRating:", error.message);
        return res
            .status(500)
            .json(generateResponse(false, "Something went wrong", 500, error.message));
    }
}


export const DQR_CONFIG: Record<string, { table: string; pk: string }> = {
    // Q9 – Q13
    q9: { table: 'dqr_emission_data_rating_qnine', pk: 'edrqn_id' },
    q11: { table: 'dqr_supplier_product_questions_rating_qeleven', pk: 'spqrqe_id' },
    q12: { table: 'dqr_supplier_product_questions_rating_qtwelve', pk: 'spqrqt_id' },
    q13: { table: 'dqr_production_site_detail_rating_qthirteen', pk: 'psdrqt_id' },

    // Q15 – Q17
    q15: { table: 'dqr_product_component_manufactured_rating_qfiften', pk: 'pcmrqf_id' },
    q151: { table: 'dqr_co_product_component_manufactured_rating_qfiftenone', pk: 'pcmrqfo_id' },
    q16: { table: 'dqr_stationary_combustion_on_site_energy_rating_qsixten', pk: 'scoserqs_id' },
    q17: { table: 'dqr_mobile_combustion_company_owned_vehicles_rating_qseventen', pk: 'mccoqrqs_id' },

    // Q19 – Q22
    q19: { table: 'dqr_refrigerants_rating_qnineten', pk: 'refrqn_id' },
    dq21: { table: 'dqr_process_emissions_sources_qtwentyone', pk: 'pesqto_id' },
    q22: { table: 'dqr_scope_two_indirect_emis_from_pur_energy_qtwentytwo', pk: 'stidefpeqtt_id' },

    // Q24 – Q28
    q24: { table: 'dqr_scope_two_indirect_emissions_certificates_qtwentyfour', pk: 'stiecqtf_id' },
    q26: { table: 'dqr_scope_two_indirect_emissions_qtwentysix', pk: 'stieqts_id' },
    q27: { table: 'dqr_energy_intensity_of_pro_est_kwhor_mj_qtwentyseven', pk: 'eiopekmqts_id' },
    q28: { table: 'dqr_process_specific_energy_usage_qtwentyeight', pk: 'pseuqte_id' },

    // Q30 – Q33
    q30: { table: 'dqr_abatement_systems_used_qthirty', pk: 'asuqt_id' },
    q31: { table: 'dqr_scope_two_indirect_emissions_qthirtyone', pk: 'stideqto_id' },
    q32: { table: 'dqr_type_of_quality_control_equipment_usage_qthirtytwo', pk: 'toqceuqto_id' },
    q33: { table: 'dqr_electricity_consumed_for_quality_control_qthirtythree', pk: 'ecfqcqtt_id' },

    // Q34 – Q35
    q34: { table: 'dqr_quality_control_process_usage_qthirtyfour', pk: 'qcpuqtf_id' },
    q341: { table: 'dqr_quality_control_process_usage_pressure_or_flow_qthirtyfour', pk: 'qcpupfqtf_id' },
    q35: { table: 'dqr_quality_control_use_any_consumables_qthirtyfive', pk: 'qcuacqtf_id' },

    // Q37 – Q41
    q37: { table: 'dqr_weight_of_samples_destroyed_qthirtyseven', pk: 'wosdqts_id' },
    q38: { table: 'dqr_defect_or_rej_rate_identified_by_quality_control_qthirtyeight', pk: 'dorriqcqte_id' },
    q39: { table: 'dqr_rework_rate_due_to_quality_control_qthirtynine', pk: 'rrdqcqtn_id' },
    q40: { table: 'dqr_weight_of_quality_control_waste_generated_qforty', pk: 'woqcwgqf_id' },
    q41: { table: 'dqr_scope_two_indirect_emissions_qfortyone', pk: 'stideqfo_id' },

    // Q44 – Q48
    q44: { table: 'dqr_energy_consumption_for_qfortyfour_qfortyfour', pk: 'ecfqffqff_id' },
    q46: { table: 'dqr_cloud_provider_details_qfortysix', pk: 'cpdqfs_id' },
    q47: { table: 'dqr_dedicated_monitoring_sensor_usage_qfortyseven', pk: 'dmsuqfs_id' },
    q48: { table: 'dqr_annual_replacement_rate_of_sensor_qfortyeight', pk: 'arrosqfe_id' },

    // Q51 – Q54
    q51: { table: 'dqr_energy_consumption_for_qfiftyone_qfiftyone', pk: 'ecfqfoqfo_id' },
    q52: { table: 'dqr_raw_materials_used_in_component_manufacturing_qfiftytwo', pk: 'rmuicmqft_id' },
    q53: { table: 'dqr_scope_three_other_indirect_emissions_qfiftythree', pk: 'stoieqft_id' },
    q54: { table: 'dqr_scope_three_other_indirect_emissions_qfiftyfour', pk: 'stoieqff_id' },

    // Q56 – Q61
    q56: { table: 'dqr_recycled_materials_with_percentage_qfiftysix', pk: 'rmwpqfs_id' },
    q58: { table: 'dqr_pre_post_consumer_reutilization_percentage_qfiftyeight', pk: 'ppcrpqfe_id' },
    q59: { table: 'dqr_pir_pcr_material_percentage_qfiftynine', pk: 'ppmpqfn_id' },
    q60: { table: 'dqr_type_of_pack_mat_used_for_delivering_qsixty', pk: 'topmudpqs_id' },
    q61: { table: 'dqr_weight_of_packaging_per_unit_product_qsixtyone', pk: 'woppupqso_id' },

    // Q64 – Q69
    q64: { table: 'dqr_scope_three_other_indirect_emissions_qsixtyfour', pk: 'stoieqsf_id' },
    q67: { table: 'dqr_energy_consumption_for_qsixtyseven_qsixtyseven', pk: 'ecfqssqss_id' },
    q68: { table: 'dqr_weight_of_pro_packaging_waste_qsixtyeight', pk: 'woppwqse_id' },
    q69: { table: 'dqr_scope_three_other_indirect_emissions_qsixtynine', pk: 'stoieqsn_id' },

    // Q71 – Q75
    q71: { table: 'dqr_type_of_by_product_qseventyone', pk: 'topbpqso_id' },
    q73: { table: 'dqr_co_two_emission_of_raw_material_qseventythree', pk: 'coteormqst_id' },
    q74: { table: 'dqr_mode_of_transport_used_for_transportation_qseventyfour', pk: 'motuftqsf_id' },
    q75: { table: 'dqr_destination_plant_component_transportation_qseventyfive', pk: 'dpctqsf_id' },

    // Q79 – Q80
    q79: { table: 'dqr_scope_three_other_indirect_emissions_qseventynine', pk: 'stoieqsn_id' },
    q80: { table: 'dqr_scope_three_other_indirect_emissions_qeighty', pk: 'stoieqe_id' },
};

// ============== NEW APIsssssss
export async function getSupplierDQRDetailsList(req: any, res: any) {
    try {
        const page = Number(req.query.pageNumber) || 1;
        const limit = Number(req.query.pageSize) || 10;
        const offset = (page - 1) * limit;

        const { search, bom_pcf_id, client_id, supplier_id } = req.query;

        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        /* ---------- SEARCH ---------- */
        if (search) {
            conditions.push(`
                (
                    sgiq.organization_name ILIKE $${idx}
                    OR sgiq.core_business_activitiy ILIKE $${idx}
                    OR sd.supplier_name ILIKE $${idx}
                    OR sd.supplier_email ILIKE $${idx}
                )
            `);
            values.push(`%${search}%`);
            idx++;
        }


        if (bom_pcf_id) {
            conditions.push(`sgiq.bom_pcf_id = $${idx}`);
            values.push(bom_pcf_id);
            idx++;
        }

        /* ---------- CLIENT FILTER ---------- */
        if (client_id) {
            conditions.push(`sgiq.client_id = $${idx}`);
            values.push(client_id);
            idx++;
        }

        /* ---------- SUPPLIER FILTER ---------- */
        if (supplier_id) {
            conditions.push(`sgiq.sup_id = $${idx}`);
            values.push(supplier_id);
            idx++;
        }

        // const baseCondition = 'sgiq.client_id IS NULL';
        const baseCondition = 'sgiq.bom_pcf_id IS NOT NULL';

        const whereClause = conditions.length
            ? `WHERE ${baseCondition} AND ${conditions.join(' AND ')}`
            : `WHERE ${baseCondition}`;


        return withClient(async (client: any) => {

            // Total count
            const countResult = await client.query(
                `
                SELECT COUNT(*)
                FROM supplier_general_info_questions sgiq
                LEFT JOIN supplier_details sd
                    ON sd.sup_id = sgiq.sup_id
                ${whereClause}
                `,
                values
            );

            const totalRecords = Number(countResult.rows[0].count);
            const totalPages = Math.ceil(totalRecords / limit);

            // Data query
            const dataQuery = `
            WITH base_data AS (
    SELECT
        sgiq.*,

        -- Supplier Object
        json_build_object(
            'sup_id', sd.sup_id,
            'code', sd.code,
            'supplier_name', sd.supplier_name,
            'supplier_email', sd.supplier_email,
            'supplier_phone_number', sd.supplier_phone_number
        ) AS supplier_details,


        ---Client Details
         json_build_object(
            'user_id', ucl.user_id,
            'user_name', ucl.user_name,
            'user_role', ucl.user_role
        ) AS client_details,

        -- BOM ARRAY (IMPORTANT CHANGE)
        (
            SELECT COALESCE(
                json_agg(
                    json_build_object(
                        'bom_id', b.id,
                        'material_number', b.material_number,
                        'component_name', b.component_name,
                        'production_location', b.production_location
                    )
                    ORDER BY b.created_date DESC
                ),
                '[]'::json
            )
            FROM bom b
            WHERE b.bom_pcf_id = sgiq.bom_pcf_id
              AND b.supplier_id = sgiq.sup_id
        ) AS bom,

        -- BOM PCF Object
        json_build_object(
            'pcf_id', pcf.id,
            'code', pcf.code,
            'request_title', pcf.request_title,
            'priority', pcf.priority,
            'request_organization', pcf.request_organization,
            'due_date', pcf.due_date,
            'request_description', pcf.request_description
        ) AS bom_pcf

    FROM supplier_general_info_questions sgiq
    LEFT JOIN supplier_details sd 
        ON sd.sup_id = sgiq.sup_id
    LEFT JOIN users_table ucl 
        ON ucl.user_id = sgiq.client_id
    LEFT JOIN bom_pcf_request pcf 
        ON pcf.id = sgiq.bom_pcf_id
        ${whereClause}
)

SELECT
    bd.*,

    -- Conditional Scope 1,2,3 Emissions
    CASE
        WHEN bd.availability_of_scope_one_two_three_emissions_data = true
        THEN (
            SELECT json_agg(
                json_build_object(
                    'aosotte_id', aos.aosotte_id,
                    'country_iso_three', aos.country_iso_three,
                    'scope_one', aos.scope_one,
                    'scope_two', aos.scope_two,
                    'scope_three', aos.scope_three
                )
            )
            FROM availability_of_scope_one_two_three_emissions_questions aos
            WHERE aos.sgiq_id = bd.sgiq_id
        )
        ELSE NULL
    END AS scope_one_two_three_emissions

FROM base_data bd
ORDER BY bd.created_date DESC
LIMIT $${idx} OFFSET $${idx + 1};

        `;

            const result = await client.query(
                dataQuery,
                [...values, limit, offset]
            );

            //             const dqrCountQuery = `
            //    SELECT
            //     COUNT(*) AS total_dqr_count,
            //     COUNT(*) FILTER (WHERE dqr_completed = true) AS completed_dqr_count,
            //     COUNT(*) FILTER (WHERE dqr_completed = false) AS pending_dqr_count
            // FROM (
            //     SELECT
            //         sgiq.bom_pcf_id,
            //         sgiq.sup_id,
            //         COALESCE(BOOL_OR(prdrs.is_submitted), false) AS dqr_completed
            //     FROM supplier_general_info_questions sgiq
            //     LEFT JOIN pcf_request_data_rating_stage prdrs
            //         ON prdrs.bom_pcf_id = sgiq.bom_pcf_id
            //        AND prdrs.sup_id = sgiq.sup_id
            //     WHERE sgiq.bom_pcf_id IS NOT NULL
            //     GROUP BY sgiq.bom_pcf_id, sgiq.sup_id
            // ) dqr_status;

            // `;
            const dqrCountQuery = `
  SELECT
    COUNT(*) AS total_dqr_count,
    COUNT(*) FILTER (WHERE dqr_completed = true) AS completed_dqr_count,
    COUNT(*) FILTER (WHERE dqr_completed = false) AS pending_dqr_count
FROM (
    SELECT
        sgiq.sgiq_id, -- IMPORTANT: use sgiq_id instead
        COALESCE(BOOL_OR(prdrs.is_submitted), false) AS dqr_completed
    FROM supplier_general_info_questions sgiq
    LEFT JOIN pcf_request_data_rating_stage prdrs
        ON prdrs.bom_pcf_id = sgiq.bom_pcf_id
       AND prdrs.sup_id = sgiq.sup_id
    WHERE sgiq.bom_pcf_id IS NOT NULL
    GROUP BY sgiq.sgiq_id
) dqr_status;

`;

            const dqrCountResult = await client.query(dqrCountQuery);

            const {
                total_dqr_count,
                pending_dqr_count,
                completed_dqr_count
            } = dqrCountResult.rows[0];

            return res.status(200).json({
                status: true,
                message: "Success",
                pagination: {
                    page,
                    limit,
                    totalRecords,
                    totalPages,
                    totalCount: totalRecords
                },
                dqr_summary: {
                    total_dqr_count: Number(total_dqr_count),
                    pending_dqr_count: Number(pending_dqr_count),
                    completed_dqr_count: Number(completed_dqr_count)
                },
                data: result.rows
            });
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: false,
            message: "Internal server error"
        });
    }
}

export async function getSupplierDqrDetailsById(req: any, res: any) {
    try {
        const { sgiq_id } = req.query;

        if (!sgiq_id) {
            return res
                .status(400)
                .json(generateResponse(false, "sgiq_id is required", 400, null));
        }

        // V3 (28-Q) questionnaires don't populate the legacy dqr_* tables; derive
        // the data points from the V3 emission lines instead. Returns null for
        // legacy requests, which fall through to the original service below.
        const v3 = await getV3DqrDataPoints(sgiq_id);
        if (v3) {
            return res
                .status(200)
                .json(generateResponse(true, "Fetched successfully", 200, v3));
        }

        const data = await getSupplierDqrDetailsService(sgiq_id);

        if (!data) {
            return res
                .status(404)
                .json(generateResponse(false, "No data found for given sgiq_id", 404, null));
        }

        return res
            .status(200)
            .json(generateResponse(true, "Fetched successfully", 200, data));
    } catch (error: any) {
        console.error("❌ Error in getSupplierDqrDetailsById:", error.message);
        return res
            .status(500)
            .json(generateResponse(false, "Something went wrong", 500, error.message));
    }
}

export async function updateDqrRating(req: any, res: any) {
    try {
        const { type, records } = req.body;

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json(
                generateResponse(false, "Records array is required", 400, null)
            );
        }

        const updated_by = req.user_id || "system";

        // V3 questionnaire ratings (qv8/qv10/...) upsert into dqr_v3_rating and
        // advance the workflow once every emission line is rated.
        if (type && isV3DqrType(type)) {
            const v3Result = await updateV3DqrRating(type, records, updated_by);
            return res.status(200).json(
                generateResponse(true, "DQR rating updated successfully", 200, v3Result)
            );
        }

        if (!type || !DQR_CONFIG[type]) {
            return res.status(400).json(
                generateResponse(false, "Invalid DQR type", 400, Object.keys(DQR_CONFIG))
            );
        }

        const result = await updateDqrRatingService(type, records, updated_by);

        return res.status(200).json(
            generateResponse(true, "DQR rating updated successfully", 200, result)
        );
    } catch (error: any) {
        console.error(error);
        return res.status(500).json(
            generateResponse(false, "Internal server error", 500, error.message)
        );
    }
}
