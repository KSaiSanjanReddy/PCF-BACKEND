import { withClient } from "../util/database.js";
import { generateResponse } from "../util/genRes.js";
import {
    saveQuestionnaire,
    loadQuestionnaire,
    listByPcf,
    findMyResponse,
    markSubmitted,
    validateForSubmit,
    ValidationException,
    QuestionnaireInput,
} from "../services/questionnaireService.js";
import { computePcfFields } from "../services/formulaEngine.js";
import { buildPayloadFromResponse } from "../services/payloadAssembler.js";
import { publishPcfRequestToQuintari } from "../services/quintariPublishService.js";
import {
    generateQuestionnairePdfBuffer,
    type PdfSection,
} from "../helper/questionnairePdfGenerator.js";

// ============================================================
// Role helpers — single source of truth so swapping roles is one place.
// ============================================================

async function getUserRole(userId: string): Promise<string> {
    return withClient(async (client: any) => {
        const r = await client.query(
            `SELECT user_role FROM users_table WHERE user_id = $1`,
            [userId]
        );
        return String(r.rows[0]?.user_role || "").toLowerCase();
    });
}

// Resolve the caller's role. A supplier authenticates via supplier_details
// (authService sets req.is_supplier) and their user_id is a sup_id that isn't in
// users_table — so getUserRole would return "" and wrongly reject them. Treat an
// authenticated supplier as the "supplier" role. Per-handler ownership checks
// still confine a supplier to their own response, and super-admin-only handlers
// still reject them (isSuperAdminRole("supplier") === false).
async function resolveRole(req: any): Promise<string> {
    if (req.is_supplier) return "supplier";
    return getUserRole(req.user_id);
}

function isSuperAdminRole(role: string): boolean {
    return role === "superadmin" || role === "super admin";
}

function isSupplierRole(role: string): boolean {
    return role === "supplier";
}

// ============================================================
// POST /api/questionnaire/save
// Save (upsert) a questionnaire response. Supplier saves their own only;
// super admin can save on behalf of any supplier.
// ============================================================

export async function saveHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }

        const role = await resolveRole(req);
        const body = req.body as QuestionnaireInput;

        if (!body?.bomPcfRequestId || !body?.supplierId) {
            return res
                .status(400)
                .send(generateResponse(false, "bomPcfRequestId and supplierId are required", 400, null));
        }

        // Supplier may only save under their own user_id.
        if (isSupplierRole(role) && body.supplierId !== req.user_id) {
            return res
                .status(403)
                .send(generateResponse(false, "suppliers can only save their own questionnaire", 403, null));
        }
        if (!isSuperAdminRole(role) && !isSupplierRole(role)) {
            return res
                .status(403)
                .send(generateResponse(false, "only supplier or super admin can save", 403, null));
        }

        const result = await saveQuestionnaire(body);
        return res.status(200).send(generateResponse(true, "saved", 200, result));
    } catch (error: any) {
        if (error instanceof ValidationException) {
            return res.status(400).send(generateResponse(false, error.message, 400, { errors: error.errors }));
        }
        console.error("[questionnaire/save] error:", error);
        return res.status(500).send(generateResponse(false, error?.message ?? "save failed", 500, null));
    }
}

// ============================================================
// GET /api/questionnaire/:responseId
// Load a single saved response. Supplier can only load their own.
// ============================================================

export async function loadHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const responseId = req.params.responseId;
        if (!responseId) {
            return res
                .status(400)
                .send(generateResponse(false, "responseId is required", 400, null));
        }

        const data = await loadQuestionnaire(responseId);
        if (!data) {
            return res.status(404).send(generateResponse(false, "response not found", 404, null));
        }

        const role = await resolveRole(req);
        if (!isSuperAdminRole(role) && data.supplierId !== req.user_id) {
            return res
                .status(403)
                .send(generateResponse(false, "you can only view your own questionnaire", 403, null));
        }

        return res.status(200).send(generateResponse(true, "ok", 200, data));
    } catch (error: any) {
        console.error("[questionnaire/load] error:", error);
        return res.status(500).send(generateResponse(false, error?.message ?? "load failed", 500, null));
    }
}

// ============================================================
// GET /api/questionnaire/mine/:bomPcfRequestId
// Return the current supplier's own saved response (id + status + raw form
// snapshot) for this PCF request, so the form can reload what they last saved.
// ============================================================

export async function getMineHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId is required", 400, null));
        }
        // The form passes the supplier id from the URL (same as save). A supplier
        // may only load their own; super admin may load any. Falls back to the
        // caller's own id when no supplierId is supplied.
        const role = await resolveRole(req);
        const supplierId = req.query.supplierId ? String(req.query.supplierId) : req.user_id;
        if (!isSuperAdminRole(role) && supplierId !== req.user_id) {
            return res.status(403).send(generateResponse(false, "you can only load your own questionnaire", 403, null));
        }

        const mine = await findMyResponse(bomPcfRequestId, supplierId);
        // Not found is a normal "no draft yet" state, not an error.
        return res.status(200).send(generateResponse(true, "ok", 200, mine));
    } catch (error: any) {
        console.error("[questionnaire/mine] error:", error);
        return res.status(500).send(generateResponse(false, error?.message ?? "load failed", 500, null));
    }
}

// ============================================================
// GET /api/questionnaire/by-pcf/:bomPcfRequestId
// List all supplier responses for a PCF request. Super admin only.
// ============================================================

export async function listByPcfHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const role = await resolveRole(req);
        if (!isSuperAdminRole(role)) {
            return res
                .status(403)
                .send(generateResponse(false, "super admin only", 403, null));
        }

        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res
                .status(400)
                .send(generateResponse(false, "bomPcfRequestId is required", 400, null));
        }

        const rows = await listByPcf(bomPcfRequestId);
        return res.status(200).send(generateResponse(true, "ok", 200, rows));
    } catch (error: any) {
        console.error("[questionnaire/listByPcf] error:", error);
        return res.status(500).send(generateResponse(false, error?.message ?? "list failed", 500, null));
    }
}

// ============================================================
// POST /api/questionnaire/submit/:responseId
// Validate mandatory fields → mark submitted → trigger formula engine.
// Supplier submits their own; super admin may submit any.
// ============================================================

export async function submitHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const responseId = req.params.responseId;
        const loaded = await loadQuestionnaire(responseId);
        if (!loaded) {
            return res.status(404).send(generateResponse(false, "response not found", 404, null));
        }

        const role = await resolveRole(req);
        if (!isSuperAdminRole(role) && loaded.supplierId !== req.user_id) {
            return res
                .status(403)
                .send(generateResponse(false, "you can only submit your own questionnaire", 403, null));
        }

        const errors = validateForSubmit(loaded);
        if (errors.length > 0) {
            return res.status(400).send(
                generateResponse(
                    false,
                    `Submit blocked — ${errors.length} mandatory field(s) missing`,
                    400,
                    { errors }
                )
            );
        }

        await markSubmitted(responseId);
        let computed = null;
        let byMpn: Record<string, any> | null = null;
        try {
            // Multi-MPN: compute each component separately so submit response
            // is not one mixed total. Admin "Start PCF Calculation" also uses
            // per-MPN compute when writing bom_emission_* rows.
            const mpnRows = await withClient(async (client: any) => {
                const r = await client.query(
                    `SELECT DISTINCT product_id_or_mpn AS mpn
                       FROM sq_q8_bom
                      WHERE response_id = $1
                        AND product_id_or_mpn IS NOT NULL
                        AND TRIM(product_id_or_mpn) <> ''`,
                    [responseId],
                );
                return r.rows.map((row: any) => String(row.mpn).trim()).filter(Boolean);
            });
            // Dedupe by root MPN (IP00231 — x vs IP00231)
            const seen = new Set<string>();
            const mpns: string[] = [];
            for (const m of mpnRows) {
                const root = m.split(/\s*[—–-]/)[0].trim();
                if (seen.has(root)) continue;
                seen.add(root);
                mpns.push(root);
            }

            if (mpns.length >= 2) {
                byMpn = {};
                const primary = String(loaded.productIdUrn ?? "").trim();
                const primaryRoot = primary.split(/\s*[—–-]/)[0].trim();
                const persistMpn =
                    (primaryRoot && mpns.includes(primaryRoot) && primaryRoot) || mpns[0];
                for (const mpn of mpns) {
                    byMpn[mpn] = await computePcfFields(responseId, {
                        mpn,
                        persist: mpn === persistMpn,
                    });
                }
                computed = byMpn[persistMpn] || byMpn[mpns[0]] || null;
            } else {
                computed = await computePcfFields(responseId);
            }
        } catch (computeErr: any) {
            console.error(
                "[questionnaire/submit] formula engine error (submission still saved):",
                computeErr
            );
        }

        return res
            .status(200)
            .send(
                generateResponse(true, "submitted", 200, {
                    responseId,
                    computed,
                    ...(byMpn ? { byMpn } : {}),
                }),
            );
    } catch (error: any) {
        console.error("[questionnaire/submit] error:", error);
        return res.status(500).send(generateResponse(false, error?.message ?? "submit failed", 500, null));
    }
}

// ============================================================
// POST /api/questionnaire/publish/:responseId
// Assemble Catena-X v9 JSON for the supplier response → push to Quintari
// using the existing publishPcfRequestToQuintari pipeline. Super admin only.
// ============================================================

export async function publishHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const role = await resolveRole(req);
        if (!isSuperAdminRole(role)) {
            return res
                .status(403)
                .send(generateResponse(false, "super admin only", 403, null));
        }

        const responseId = req.params.responseId;
        const loaded = await loadQuestionnaire(responseId);
        if (!loaded) {
            return res.status(404).send(generateResponse(false, "response not found", 404, null));
        }
        if (loaded.status !== "submitted") {
            return res
                .status(400)
                .send(generateResponse(false, "response must be submitted before publishing", 400, null));
        }

        // Build the v9 JSON (also re-runs the formula engine for freshness).
        await buildPayloadFromResponse(responseId);

        // Hand off to the existing Quintari publisher tied to the underlying PCF request.
        const result = await publishPcfRequestToQuintari(loaded.bomPcfRequestId);

        console.log(
            `[questionnaire/publish] user=${req.user_id} response=${responseId} pcf=${loaded.bomPcfRequestId} ` +
                `${result.alreadyPublished ? "ALREADY-PUBLISHED" : "PUBLISHED"} ` +
                `twin=${result.digitalTwinId} pcfSubmodel=${result.pcfSubmodelId}`
        );

        const message = result.alreadyPublished
            ? "PCF already published to Quintari"
            : "PCF published to Quintari";
        return res.status(200).send(generateResponse(true, message, 200, result));
    } catch (error: any) {
        console.error("[questionnaire/publish] error:", error);
        const msg = error?.response?.data
            ? `Quintari error: ${JSON.stringify(error.response.data)}`
            : error?.message ?? "publish failed";
        return res.status(500).send(generateResponse(false, msg, 500, null));
    }
}

// ============================================================
// POST /api/questionnaire/pdf
// Render a branded PDF of the supplier questionnaire. Sections are built on
// the client (from V3 schema + formData via buildPdfSections.ts) and posted
// here for branded server-side rendering using the shared pdfkit helper.
// Body: { sections, supplier_name, submission_date?, reference_id?, bom_pcf_id? }
// ============================================================

export async function pdfHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const { sections, supplier_name, submission_date, reference_id, bom_pcf_id } = req.body || {};
        if (!Array.isArray(sections)) {
            return res.status(400).send(generateResponse(false, "sections array is required", 400, null));
        }

        let clientName: string | undefined;
        if (bom_pcf_id) {
            try {
                await withClient(async (client: any) => {
                    const r = await client.query(
                        `SELECT request_organization FROM bom_pcf_request WHERE id = $1 LIMIT 1`,
                        [bom_pcf_id]
                    );
                    if (r.rows.length > 0) clientName = r.rows[0].request_organization || undefined;
                });
            } catch (lookupErr) {
                console.warn("[questionnaire/pdf] could not fetch client name:", lookupErr);
            }
        }

        const pdfBuffer = await generateQuestionnairePdfBuffer({
            sections: sections as PdfSection[],
            supplierName: supplier_name || "Supplier",
            clientName,
            submissionDate: submission_date || new Date().toISOString(),
            referenceId: reference_id || undefined,
        });

        const sanitizedName = (supplier_name || "Supplier")
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        const dateStr = new Date(submission_date || Date.now())
            .toISOString()
            .split("T")[0];
        const filename = `Supplier_Questionnaire_${sanitizedName}_${dateStr}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", pdfBuffer.length.toString());
        return res.end(pdfBuffer);
    } catch (error: any) {
        console.error("[questionnaire/pdf] error:", error);
        return res.status(500).send(generateResponse(false, error?.message ?? "PDF generation failed", 500, null));
    }
}
