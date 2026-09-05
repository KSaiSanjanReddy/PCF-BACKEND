// ------------------------------------------------------------------
// PCF Data Points service.
//
// After "Run PCF Calculation" for a PCF request, each COMPONENT (a bom row)
// has a saved supplier questionnaire response + computed emission fields.
// This service turns that into the ~118-row Catena-X PCF data-point view,
// with the ACTUAL value for each point (numbers default to 0, text to null
// when the supplier left it blank).
//
// The values are resolved against the very same JSON we publish to Quintari
// (buildPcfV9Payload output), so what the client sees == what gets published.
// ------------------------------------------------------------------

import { withClient } from "../util/database.js";
import { assembleEnviraanInput } from "./payloadAssembler.js";
import { buildPcfV9Payload } from "../util/buildPcfV9Payload.js";
import {
    PCF_DATA_POINTS_TEMPLATE,
    PcfDataPointTemplateRow,
} from "../util/pcfDataPointsTemplate.js";

// ---- output shapes ----

export interface PcfDataPointRow {
    kind: "header" | "field";
    level?: 1 | 2 | 3;
    label: string;
    /** raw Mandatory & Optional code from the spec ("M" | "O" | "D" | "Mif" | ...) */
    mandatoryOptional?: string;
    /** typed value (string | number | boolean | array | null) — for fields only */
    value?: unknown;
    /** display-ready string of `value` (booleans -> Yes/No, arrays joined, null -> "—") */
    display?: string;
}

export interface ComponentInfo {
    componentId: string;
    supplierId: string;
    productName: string;
    productCode: string;
    companyName: string;
    supplierName: string | null;
}

export interface ComponentDataPoints {
    component: ComponentInfo;
    rows: PcfDataPointRow[];
}

// ---- component -> response resolution ----

/**
 * Resolve the saved questionnaire response for one component of a PCF request.
 * componentId is a `bom.id`; bom.supplier_id + the request id locate the
 * supplier_questionnaire_response row.  Returns null if not found (e.g. the
 * component's supplier hasn't submitted / calculation hasn't run).
 */
async function resolveComponent(
    bomPcfId: string,
    componentId: string
): Promise<{ responseId: string; supplierId: string; supplierName: string | null } | null> {
    return withClient(async (client: any) => {
        const bomRow = (
            await client.query(
                `SELECT id, supplier_id FROM bom WHERE id = $1 AND bom_pcf_id = $2`,
                [componentId, bomPcfId]
            )
        ).rows[0];
        if (!bomRow) return null;

        const supplierId = String(bomRow.supplier_id);

        const resp = (
            await client.query(
                `SELECT id FROM supplier_questionnaire_response
                 WHERE bom_pcf_request_id = $1 AND supplier_id = $2
                 ORDER BY id DESC LIMIT 1`,
                [bomPcfId, supplierId]
            )
        ).rows[0];
        if (!resp) return null;

        // Best-effort supplier display name (supplier_details schema varies; tolerate absence).
        let supplierName: string | null = null;
        try {
            const sup = (
                await client.query(
                    `SELECT * FROM supplier_details WHERE sup_id = $1 LIMIT 1`,
                    [supplierId]
                )
            ).rows[0];
            if (sup) {
                supplierName =
                    sup.supplier_name ??
                    sup.company_name ??
                    sup.name ??
                    sup.sup_name ??
                    null;
            }
        } catch {
            supplierName = null;
        }

        return { responseId: String(resp.id), supplierId, supplierName };
    });
}

// ---- value resolution + formatting ----

/** Resolve a dotted path with [n] indices, e.g. "a.b[0].c", against an object. */
function getByPath(obj: any, path: string): unknown {
    if (!path) return undefined;
    const parts = path
        .replace(/\[(\d+)\]/g, ".$1")
        .split(".")
        .filter((p) => p.length > 0);
    let cur: any = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

/** Normalise a resolved value for the JSON `value` field (missing text -> null). */
function normaliseValue(raw: unknown): unknown {
    if (raw === undefined) return null;
    if (typeof raw === "string" && raw.trim() === "") return null;
    return raw;
}

function formatNumber(n: number): string {
    if (!isFinite(n)) return "0";
    if (Number.isInteger(n)) return String(n);
    return String(Number(n.toFixed(6)));
}

/** Human-readable string of a value for the display column / PDF. */
export function displayValue(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return formatNumber(v);
    const s = String(v);
    return s.trim() === "" ? "—" : s;
}

// ---- main entry ----

/**
 * Build the full per-component data-point list. Returns null if the component
 * has no submitted/computed response yet (caller should 404).
 */
export async function buildDataPointsForComponent(
    bomPcfId: string,
    componentId: string
): Promise<ComponentDataPoints | null> {
    const resolved = await resolveComponent(bomPcfId, componentId);
    if (!resolved) return null;

    // Assemble the flat input, then shape it into the exact publish payload so
    // displayed values == published values.
    const input = await assembleEnviraanInput(resolved.responseId);
    const payload = buildPcfV9Payload(input);

    const rows: PcfDataPointRow[] = PCF_DATA_POINTS_TEMPLATE.map((t: PcfDataPointTemplateRow) => {
        if (t.kind === "header") {
            return { kind: "header", level: t.level, label: t.label };
        }
        const raw = t.path === null ? null : getByPath(payload, t.path);
        const value = normaliseValue(raw);
        return {
            kind: "field",
            label: t.label,
            mandatoryOptional: t.mo,
            value,
            display: displayValue(value),
        };
    });

    const component: ComponentInfo = {
        componentId: componentId,
        supplierId: resolved.supplierId,
        productName: input.productName ?? "",
        productCode: input.productCode ?? "",
        companyName: input.companyName ?? "",
        supplierName: resolved.supplierName,
    };

    return { component, rows };
}
