import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import type { PcfDataPointRow, ComponentInfo } from "../services/pcfDataPointsService.js";

// ============================================================
// Per-component PCF Data Points PDF.
// Renders the ~118 Catena-X PCF v3.0.0 data points (grouped by their
// section headers) as level-styled bars + 3-column tables
// (Data Point | M&O | Value).  Same EnviGuide brand style as the
// questionnaire PDF.
// ============================================================

export interface PcfDataPointsPdfInput {
  rows: PcfDataPointRow[];
  component: ComponentInfo;
  /** ISO date; defaults to now */
  generatedDate?: string;
  pcfRequestRef?: string;
}

const COLORS = {
  brand: "#A3E635",
  brandDark: "#65A30D",
  text: "#1F2937",
  textOnBrand: "#111827",
  lightText: "#6B7280",
  border: "#D1D5DB",
  borderLight: "#E5E7EB",
  sectionBg: "#F7FEE7",
  tableHeaderBg: "#A3E635",
  tableAltRow: "#F9FAFB",
  white: "#FFFFFF",
};

const PAGE_MARGIN = 40;
const HEADER_HEIGHT = 55;
const FOOTER_HEIGHT = 40;
const FONT_REGULAR = "RobotoRegular";
const FONT_BOLD = "RobotoBold";
const FONT_ITALIC = "RobotoItalic";

// 3-column layout weights (Data Point | M&O | Value)
const COL_WEIGHTS = [0.6, 0.12, 0.28];

const sanitizeText = (text: any): string => {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/₹/g, "INR")
    .replace(/€/g, "EUR")
    .replace(/¥/g, "JPY")
    .replace(/£/g, "GBP");
};

const resolveAssetPath = (relativePath: string): string | null => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const candidates = [
      join(__dirname, "..", "assets", relativePath),
      join(__dirname, "..", "..", "assets", relativePath),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return null;
  } catch {
    return null;
  }
};

export const generatePcfDataPointsPdfBuffer = (
  input: PcfDataPointsPdfInput
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: HEADER_HEIGHT + 20,
          bottom: FOOTER_HEIGHT + 10,
          left: PAGE_MARGIN,
          right: PAGE_MARGIN,
        },
        bufferPages: true,
      });

      const regularPath = resolveAssetPath("fonts/Roboto-Regular.ttf");
      const boldPath = resolveAssetPath("fonts/Roboto-Bold.ttf");
      const italicPath = resolveAssetPath("fonts/Roboto-Italic.ttf");
      if (regularPath) doc.registerFont(FONT_REGULAR, regularPath);
      if (boldPath) doc.registerFont(FONT_BOLD, boldPath);
      if (italicPath) doc.registerFont(FONT_ITALIC, italicPath);

      const useFont = (name: string) => {
        try { doc.font(name); } catch { doc.font("Helvetica"); }
      };
      const fontRegular = () => useFont(regularPath ? FONT_REGULAR : "Helvetica");
      const fontBold = () => useFont(boldPath ? FONT_BOLD : "Helvetica-Bold");
      const fontItalic = () => useFont(italicPath ? FONT_ITALIC : "Helvetica-Oblique");

      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - PAGE_MARGIN * 2;
      const logoPath = resolveAssetPath("logo.png");
      const colWidths = COL_WEIGHTS.map((w) => contentWidth * w);

      const dateStr = new Date(input.generatedDate || Date.now()).toLocaleDateString(
        "en-GB",
        { day: "2-digit", month: "short", year: "numeric" }
      );

      // ---------- COVER TITLE ----------
      fontBold();
      doc
        .fillColor(COLORS.text)
        .fontSize(18)
        .text("PCF Data Points (Catena-X v3.0.0)", PAGE_MARGIN, doc.y, {
          width: contentWidth,
          lineBreak: false,
          ellipsis: true,
        });
      doc.moveDown(1);

      // ---------- INFO BOX ----------
      const infoRows: Array<[string, string]> = [];
      infoRows.push(["COMPONENT", input.component.productName || input.component.componentId]);
      if (input.component.productCode) infoRows.push(["PRODUCT CODE", input.component.productCode]);
      infoRows.push(["SUPPLIER", input.component.supplierName || input.component.companyName || "N/A"]);
      if (input.pcfRequestRef) infoRows.push(["PCF REQUEST", input.pcfRequestRef]);
      infoRows.push(["GENERATED", dateStr]);

      const infoBoxTop = doc.y;
      const infoRowHeight = 22;
      const boxPadding = 18;
      const infoBoxHeight = boxPadding * 2 + infoRows.length * infoRowHeight;

      doc
        .roundedRect(PAGE_MARGIN, infoBoxTop, contentWidth, infoBoxHeight, 5)
        .fillAndStroke(COLORS.sectionBg, COLORS.brandDark);

      let infoY = infoBoxTop + boxPadding;
      const labelX = PAGE_MARGIN + 20;
      const valueX = PAGE_MARGIN + 160;
      for (const [label, value] of infoRows) {
        fontBold();
        doc.fillColor(COLORS.lightText).fontSize(8).text(sanitizeText(label), labelX, infoY, { lineBreak: false });
        fontRegular();
        doc
          .fillColor(COLORS.text)
          .fontSize(11)
          .text(sanitizeText(value), valueX, infoY - 1, {
            lineBreak: false,
            width: contentWidth - (valueX - PAGE_MARGIN) - 20,
            ellipsis: true,
          });
        infoY += infoRowHeight;
      }
      doc.y = infoBoxTop + infoBoxHeight + 25;

      // ---------- BODY: headers + tables ----------
      // Buffer consecutive field rows, then flush as a 3-col table when the
      // next header arrives (or at the end).
      let pending: PcfDataPointRow[] = [];

      const flushTable = () => {
        if (pending.length === 0) return;
        drawDataTable(
          doc,
          pending,
          colWidths,
          contentWidth,
          pageHeight,
          fontRegular,
          fontBold
        );
        doc.y += 12;
        pending = [];
      };

      for (const row of input.rows) {
        if (row.kind === "header") {
          flushTable();
          drawHeaderBar(doc, row, contentWidth, pageHeight, fontBold);
        } else {
          pending.push(row);
        }
      }
      flushTable();

      // ---------- HEADERS + FOOTERS ----------
      const range = doc.bufferedPageRange();
      const totalPages = range.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(range.start + i);
        doc.page.margins.top = 0;
        doc.page.margins.bottom = 0;

        doc.rect(0, 0, pageWidth, HEADER_HEIGHT).fill(COLORS.white);
        doc.rect(0, HEADER_HEIGHT - 3, pageWidth, 3).fill(COLORS.brand);

        const logoHeight = 35;
        const logoY = (HEADER_HEIGHT - 3 - logoHeight) / 2;
        if (logoPath) {
          try {
            doc.image(logoPath, PAGE_MARGIN, logoY, { height: logoHeight });
          } catch {
            fontBold();
            doc.fillColor(COLORS.text).fontSize(14).text("enviguide", PAGE_MARGIN, logoY + 10, { lineBreak: false });
          }
        } else {
          fontBold();
          doc.fillColor(COLORS.text).fontSize(14).text("enviguide", PAGE_MARGIN, logoY + 10, { lineBreak: false });
        }

        fontRegular();
        doc
          .fillColor(COLORS.lightText)
          .fontSize(9)
          .text(`Page ${i + 1} of ${totalPages}`, PAGE_MARGIN, (HEADER_HEIGHT - 3) / 2 - 4, {
            align: "right",
            width: pageWidth - PAGE_MARGIN * 2,
            lineBreak: false,
          });

        doc
          .strokeColor(COLORS.borderLight)
          .lineWidth(0.5)
          .moveTo(PAGE_MARGIN, pageHeight - FOOTER_HEIGHT)
          .lineTo(pageWidth - PAGE_MARGIN, pageHeight - FOOTER_HEIGHT)
          .stroke();

        fontItalic();
        doc
          .fillColor(COLORS.lightText)
          .fontSize(7)
          .text(
            "This document is confidential and intended for internal use only.",
            PAGE_MARGIN,
            pageHeight - FOOTER_HEIGHT + 12,
            { lineBreak: false, width: contentWidth * 0.7 }
          );
        fontRegular();
        doc
          .fillColor(COLORS.lightText)
          .fontSize(7)
          .text(`Generated on ${dateStr}`, PAGE_MARGIN, pageHeight - FOOTER_HEIGHT + 12, {
            align: "right",
            width: contentWidth,
            lineBreak: false,
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// ============================================================
// Header bar — style varies by level (1 = darkest, 3 = light tint)
// ============================================================
function drawHeaderBar(
  doc: PDFKit.PDFDocument,
  row: PcfDataPointRow,
  contentWidth: number,
  pageHeight: number,
  fontBold: () => void
) {
  const level = row.level ?? 1;
  const barHeight = level === 1 ? 28 : level === 2 ? 24 : 20;
  const fontSize = level === 1 ? 12 : level === 2 ? 11 : 10;

  if (doc.y + barHeight + 40 > pageHeight - FOOTER_HEIGHT - 10) {
    doc.addPage();
  }

  const top = doc.y;
  if (level === 1) {
    doc.rect(PAGE_MARGIN, top, contentWidth, barHeight).fill(COLORS.brandDark);
    fontBold();
    doc.fillColor(COLORS.white);
  } else if (level === 2) {
    doc.rect(PAGE_MARGIN, top, contentWidth, barHeight).fill(COLORS.brand);
    fontBold();
    doc.fillColor(COLORS.textOnBrand);
  } else {
    doc.rect(PAGE_MARGIN, top, contentWidth, barHeight).fill(COLORS.sectionBg);
    doc.rect(PAGE_MARGIN, top, 4, barHeight).fill(COLORS.brandDark);
    fontBold();
    doc.fillColor(COLORS.text);
  }

  doc
    .fontSize(fontSize)
    .text(sanitizeText(row.label), PAGE_MARGIN + 12, top + (barHeight - fontSize) / 2, {
      lineBreak: false,
      width: contentWidth - 24,
      ellipsis: true,
    });
  doc.y = top + barHeight + 8;
}

// ============================================================
// 3-column data table (Data Point | M&O | Value)
// ============================================================
function drawDataTable(
  doc: PDFKit.PDFDocument,
  rows: PcfDataPointRow[],
  colWidths: number[],
  contentWidth: number,
  pageHeight: number,
  fontRegular: () => void,
  fontBold: () => void
) {
  const columns = ["Data Point", "M&O", "Value"];
  const cellPadding = 5;
  const colX = [
    PAGE_MARGIN,
    PAGE_MARGIN + colWidths[0],
    PAGE_MARGIN + colWidths[0] + colWidths[1],
  ];

  fontBold();
  doc.fontSize(8);
  const headerHeight =
    Math.max(...columns.map((c, i) => doc.heightOfString(c, { width: colWidths[i] - cellPadding * 2 }))) +
    cellPadding * 2;

  let y = doc.y;
  if (y + headerHeight + 20 > pageHeight - FOOTER_HEIGHT - 10) {
    doc.addPage();
    y = doc.y;
  }

  const drawHeader = (startY: number) => {
    doc.rect(PAGE_MARGIN, startY, contentWidth, headerHeight).fill(COLORS.tableHeaderBg);
    doc.strokeColor(COLORS.white).lineWidth(0.8);
    for (let i = 1; i < columns.length; i++) {
      doc.moveTo(colX[i], startY).lineTo(colX[i], startY + headerHeight).stroke();
    }
    fontBold();
    columns.forEach((col, i) => {
      doc
        .fillColor(COLORS.white)
        .fontSize(8)
        .text(col, colX[i] + cellPadding, startY + cellPadding, {
          width: colWidths[i] - cellPadding * 2,
          align: "left",
        });
    });
  };

  drawHeader(y);
  y += headerHeight;

  rows.forEach((row, rowIndex) => {
    const cells = [
      sanitizeText(row.label),
      sanitizeText(row.mandatoryOptional || ""),
      sanitizeText(row.display || "—"),
    ];

    fontRegular();
    doc.fontSize(8);
    const cellHeights = cells.map((cell, i) =>
      doc.heightOfString(cell || "-", { width: colWidths[i] - cellPadding * 2 })
    );
    const rowHeight = Math.max(...cellHeights, 12) + cellPadding * 2;

    if (y + rowHeight > pageHeight - FOOTER_HEIGHT - 20) {
      doc.addPage();
      y = doc.y;
      drawHeader(y);
      y += headerHeight;
    }

    const bgColor = rowIndex % 2 === 0 ? COLORS.white : COLORS.tableAltRow;
    doc.rect(PAGE_MARGIN, y, contentWidth, rowHeight).fill(bgColor);
    doc.strokeColor(COLORS.border).lineWidth(0.5).rect(PAGE_MARGIN, y, contentWidth, rowHeight).stroke();
    for (let i = 1; i < columns.length; i++) {
      doc.moveTo(colX[i], y).lineTo(colX[i], y + rowHeight).stroke();
    }

    fontRegular();
    cells.forEach((cell, i) => {
      const textH = cellHeights[i];
      doc
        .fillColor(COLORS.text)
        .fontSize(8)
        .text(cell || "-", colX[i] + cellPadding, y + (rowHeight - textH) / 2, {
          width: colWidths[i] - cellPadding * 2,
          align: "left",
        });
    });

    y += rowHeight;
  });

  doc.y = y;
}
