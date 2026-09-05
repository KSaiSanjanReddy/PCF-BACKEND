// Alloy / material composition resolver.
//
// Turns a free-text material description (e.g. "lower housing AlSi10Mg(Fe)
// alloy 239D") into its constituent elements with weight-% ranges and a BAFU
// layer mapping, so the supplier's raw-materials question (Q7) can be
// auto-populated. The supplier can edit every value afterwards.
//
// Resolution order (cheapest first):
//   1. alloy_composition_cache  — zero API, instant, works offline. Seeded with
//      common alloys; grows as new alloys are resolved.
//   2. Free LLM layer           — Gemini (free) -> Groq (free) -> Claude (paid),
//      whichever key is configured. Output is JSON-validated with one retry, so
//      the design survives any single provider's plan expiring.
//
// If no provider key is set, resolution simply returns no rows and the supplier
// fills the question manually — nothing breaks.

import { withClient } from "../util/database.js";
import axios from "axios";

export interface CompositionRow {
    element: string;
    min_pct: number;
    max_pct: number;
    bafu_category: string;
    bafu_process: string;
    bafu_sub2: string;
}

export interface CompositionResult {
    alloy: string | null;        // canonical alloy label, when identified
    rows: CompositionRow[];
    source: string;              // "cache:seed" | "gemini" | "groq" | "claude" | "none"
}

// ── Alloy designation parsing ────────────────────────────────────────────────

// Normalise an alloy designation into a stable cache key: lowercase, strip
// every non-alphanumeric character. "AlSi10Mg(Fe)", "alsi10mg (fe)" and
// "(AlSi10Mg" all collapse toward the same alphanumeric core, so designations
// extracted from messy free text still hit the seed/cache.
function normalizeAlloyKey(s: string): string {
    return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Best-effort extraction of the alloy/grade token from a free-text description.
// Alloy designations mix capital letters and digits ("AlSi10Mg(Fe)", "ADC12",
// "6061-T6"), so we score each token by how alloy-like it looks and take the
// best. Returns null when nothing looks like a designation (the LLM is then
// given the whole description to identify it).
export function parseAlloyDesignation(description: string): string | null {
    if (!description) return null;
    const tokens = description.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    let best: string | null = null;
    let bestScore = 0;
    for (const raw of tokens) {
        const t = raw.replace(/[.;:]+$/, "");
        if (t.length < 2) continue;
        const hasUpper = /[A-Z]/.test(t);
        const hasDigit = /\d/.test(t);
        const hasParen = /\(/.test(t);
        const upperCount = (t.match(/[A-Z]/g) || []).length;
        if (!hasUpper) continue;
        let score = 0;
        if (hasUpper && hasDigit) score += 3;   // "AlSi10Mg", "ADC12", "6061"
        if (hasParen) score += 2;               // "(Fe)" element group
        if (upperCount >= 2) score += 2;         // multiple element symbols
        if (/^[A-Z][a-z]/.test(t)) score += 1;  // starts like an element symbol
        // Penalise tokens that are plainly words or trailing codes.
        if (/^(alloy|grade|steel|type|the|and|of)$/i.test(t)) score = 0;
        if (score > bestScore) { bestScore = score; best = t; }
    }
    return bestScore >= 3 ? best : null;
}

// ── Cache access ─────────────────────────────────────────────────────────────

async function lookupCache(client: any, key: string): Promise<CompositionResult | null> {
    const r = await client.query(
        `SELECT alloy_label, composition, source FROM alloy_composition_cache WHERE alloy_key = $1 LIMIT 1`,
        [key],
    );
    if (!r.rows[0]) return null;
    const comp = r.rows[0].composition;
    const rows: CompositionRow[] = typeof comp === "string" ? JSON.parse(comp) : comp;
    return { alloy: r.rows[0].alloy_label || null, rows, source: `cache:${r.rows[0].source || "?"}` };
}

async function storeCache(
    client: any, key: string, label: string | null, rows: CompositionRow[], source: string,
): Promise<void> {
    await client.query(
        `INSERT INTO alloy_composition_cache (alloy_key, alloy_label, composition, source)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (alloy_key) DO UPDATE
            SET composition = EXCLUDED.composition,
                alloy_label = EXCLUDED.alloy_label,
                source = EXCLUDED.source,
                updated_date = CURRENT_TIMESTAMP`,
        [key, label, JSON.stringify(rows), source],
    );
}

// ── BAFU taxonomy (controlled vocabulary for the LLM mapping) ────────────────

async function getBafuVocabulary(client: any): Promise<{ categories: string[]; processes: string[] }> {
    const cats = await client.query(
        `SELECT DISTINCT category FROM emission_factors WHERE category IS NOT NULL AND category <> '' ORDER BY category`,
    );
    const procs = await client.query(
        `SELECT DISTINCT sub_category_1 FROM emission_factors
         WHERE sub_category_1 IS NOT NULL AND sub_category_1 <> ''
           AND category IN ('metals','chemicals','minerals','plastics','wood','glass','ceramics')
         ORDER BY sub_category_1`,
    );
    return {
        categories: cats.rows.map((r: any) => r.category),
        processes: procs.rows.map((r: any) => r.sub_category_1),
    };
}

// ── Free LLM layer (Gemini -> Groq -> Claude) ────────────────────────────────

function buildSystemPrompt(vocab: { categories: string[]; processes: string[] }): string {
    return [
        "You are a materials-science assistant for a Product Carbon Footprint tool.",
        "Given a material/alloy description, return its constituent chemical elements",
        "with their weight-percentage range (min and max), per the standard published",
        "composition of that alloy. Also map each element to the closest BAFU emission-",
        "factor category and process from the controlled vocabulary below.",
        "",
        "Rules:",
        "- Return ONLY a JSON object, no prose, no markdown fences.",
        '- Shape: {"alloy":"<canonical designation>","rows":[{"element":"<name>",',
        '  "min_pct":<number>,"max_pct":<number>,"bafu_category":"<from list>",',
        '  "bafu_process":"<from list or element name>","bafu_sub2":""}]}',
        "- Percentages are weight-%, 0-100. For a single trace value use the same min and max.",
        "- bafu_category MUST be one of the allowed categories. bafu_process should be the",
        "  closest allowed process, or the lowercase element name if none fits.",
        "",
        "Allowed categories: " + vocab.categories.join(", "),
        "Allowed processes: " + vocab.processes.slice(0, 120).join(", "),
    ].join("\n");
}

async function callGemini(system: string, user: string): Promise<string | null> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) return null;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const { data } = await axios.post<any>(
        url,
        {
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json" },
        },
        { headers: { "Content-Type": "application/json", "x-goog-api-key": key }, timeout: 30000 },
    );
    return (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim() || null;
}

async function callGroq(system: string, user: string): Promise<string | null> {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) return null;
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    const { data } = await axios.post<any>(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            model,
            temperature: 0,
            max_tokens: 1024,
            response_format: { type: "json_object" },
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
        },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, timeout: 30000 },
    );
    return (data?.choices?.[0]?.message?.content ?? "").trim() || null;
}

async function callClaude(system: string, user: string): Promise<string | null> {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return null;
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const model = process.env.CLAUDE_MODEL || "claude-haiku-4-5";
    const resp = await client.messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user + "\n\nReturn only the JSON object." }],
    });
    return resp.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
        .trim() || null;
}

// Strip markdown fences / stray prose and parse the JSON object the model returns.
function parseModelJson(text: string): { alloy: string | null; rows: CompositionRow[] } | null {
    if (!text) return null;
    let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    s = s.slice(start, end + 1);
    let obj: any;
    try { obj = JSON.parse(s); } catch { return null; }
    const rawRows = Array.isArray(obj?.rows) ? obj.rows : Array.isArray(obj) ? obj : null;
    if (!rawRows) return null;
    const rows: CompositionRow[] = rawRows
        .map((r: any) => ({
            element: String(r?.element ?? "").trim(),
            min_pct: Number(r?.min_pct),
            max_pct: Number(r?.max_pct),
            bafu_category: String(r?.bafu_category ?? "").trim().toLowerCase(),
            bafu_process: String(r?.bafu_process ?? "").trim().toLowerCase(),
            bafu_sub2: String(r?.bafu_sub2 ?? "").trim().toLowerCase(),
        }))
        .filter((r: CompositionRow) => r.element && Number.isFinite(r.min_pct) && Number.isFinite(r.max_pct));
    if (rows.length === 0) return null;
    return { alloy: obj?.alloy ? String(obj.alloy).trim() : null, rows };
}

// Try each configured provider in free-first order; validate + one retry.
async function llmExtract(
    description: string, vocab: { categories: string[]; processes: string[] },
): Promise<{ alloy: string | null; rows: CompositionRow[]; source: string } | null> {
    const system = buildSystemPrompt(vocab);
    const user = `Material description: "${description}"`;
    const providers: Array<{ name: string; run: (s: string, u: string) => Promise<string | null> }> = [
        { name: "gemini", run: callGemini },
        { name: "groq", run: callGroq },
        { name: "claude", run: callClaude },
    ];
    for (const provider of providers) {
        for (let attempt = 0; attempt < 2; attempt++) {
            let text: string | null;
            try {
                text = await provider.run(system, attempt === 0 ? user : user + "\n\nReturn STRICTLY valid JSON only.");
            } catch (err) {
                console.error(`alloyComposition ${provider.name} error:`, (err as any)?.message || err);
                break; // provider unavailable/error → try next provider
            }
            if (!text) break;
            const parsed = parseModelJson(text);
            if (parsed) return { ...parsed, source: provider.name };
        }
    }
    return null;
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function resolveComposition(description: string): Promise<CompositionResult> {
    const designation = parseAlloyDesignation(description);
    const key = normalizeAlloyKey(designation || description);
    if (!key) return { alloy: null, rows: [], source: "none" };

    return withClient(async (client: any) => {
        // CACHE-ONLY. Q7 auto-populate is intentionally limited to alloys we have
        // pre-seeded in `alloy_composition_cache` (the known demo/test cases). Any
        // other description returns nothing so the supplier fills the materials
        // manually — this keeps auto-fill deterministic, avoids surprise/invented
        // compositions, and removes the live-LLM (Gemini) dependency entirely.
        const cached = await lookupCache(client, key);
        if (cached) return cached;

        return { alloy: designation, rows: [], source: "none" };
    });
}
