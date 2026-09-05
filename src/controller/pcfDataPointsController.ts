// ------------------------------------------------------------------
// PCF Data Points controller.
//
// After "Run PCF Calculation", the PCF request view page shows — PER
// COMPONENT — the full Catena-X PCF v3.0.0 data-point list with values,
// plus a download button that produces a per-component PDF.
//
//   GET /api/pcf-request/:bomPcfId/component/:componentId/pcf-data-points      -> JSON
//   GET /api/pcf-request/:bomPcfId/component/:componentId/pcf-data-points/pdf  -> PDF
// ------------------------------------------------------------------

import { generateResponse } from "../util/genRes.js";
import { buildDataPointsForComponent } from "../services/pcfDataPointsService.js";
import { generatePcfDataPointsPdfBuffer } from "../helper/pcfDataPointsPdfGenerator.js";

// GET .../pcf-data-points  — grouped rows (headers + fields with values)
export async function getDataPointsHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const { bomPcfId, componentId } = req.params;
        if (!bomPcfId || !componentId) {
            return res
                .status(400)
                .send(generateResponse(false, "bomPcfId and componentId are required", 400, null));
        }

        const result = await buildDataPointsForComponent(bomPcfId, componentId);
        if (!result) {
            return res
                .status(404)
                .send(
                    generateResponse(
                        false,
                        "no computed PCF data for this component yet — run PCF calculation first",
                        404,
                        null
                    )
                );
        }

        return res.status(200).send(generateResponse(true, "pcf data points", 200, result));
    } catch (err: any) {
        console.error("[pcf-data-points] getDataPointsHandler error:", err);
        return res.status(500).send(generateResponse(false, err?.message || "internal error", 500, null));
    }
}

// GET .../pcf-data-points/pdf  — per-component branded PDF download
export async function getDataPointsPdfHandler(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const { bomPcfId, componentId } = req.params;
        if (!bomPcfId || !componentId) {
            return res
                .status(400)
                .send(generateResponse(false, "bomPcfId and componentId are required", 400, null));
        }

        const result = await buildDataPointsForComponent(bomPcfId, componentId);
        if (!result) {
            return res
                .status(404)
                .send(
                    generateResponse(
                        false,
                        "no computed PCF data for this component yet — run PCF calculation first",
                        404,
                        null
                    )
                );
        }

        const pdfBuffer = await generatePcfDataPointsPdfBuffer({
            rows: result.rows,
            component: result.component,
            pcfRequestRef: bomPcfId,
            generatedDate: new Date().toISOString(),
        });

        const namePart = (result.component.productName || result.component.componentId || "component")
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        const dateStr = new Date().toISOString().split("T")[0];
        const filename = `PCF_Data_Points_${namePart}_${dateStr}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", pdfBuffer.length.toString());
        return res.end(pdfBuffer);
    } catch (err: any) {
        console.error("[pcf-data-points] getDataPointsPdfHandler error:", err);
        return res.status(500).send(generateResponse(false, err?.message || "internal error", 500, null));
    }
}
