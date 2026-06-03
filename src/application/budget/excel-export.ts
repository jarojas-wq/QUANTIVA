import type { ExportColumnSchema } from "./budget-config";
import { EXPORT_COLUMN_SCHEMAS } from "./budget-config";
import { parseDecimal } from "./budget-domain";

export function downloadBlobFile(fileName: string, blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

export function buildXlsxWorkbook(
  title: string,
  rows: Array<Record<string, string | number>>,
  columns: ExportColumnSchema[] = EXPORT_COLUMN_SCHEMAS.rvt
) {
  const activeColumns = columns.length > 0 ? columns : EXPORT_COLUMN_SCHEMAS.rvt;
  const headers = activeColumns.map((column) => String(column.header || "").trim() || column.key);
  const timestamp = new Date().toISOString();
  const worksheetRows = [
    `<row r="1">${headers
      .map((header, index) => buildInlineStringCell(getExcelCellRef(index, 1), header, 1))
      .join("")}</row>`,
    ...rows.map((row, index) => {
      const excelRow = index + 2;
      const dataCells = activeColumns
        .map((column, columnIndex) => {
          const cellRef = getExcelCellRef(columnIndex, excelRow);
          if (column.type === "number") {
            return buildNumberCell(cellRef, parseDecimal(row[column.key]), 2);
          }
          return buildInlineStringCell(cellRef, row[column.key] || "", 0);
        })
        .join("");
      return `<row r="${excelRow}">${dataCells}</row>`;
    })
  ].join("");
  const lastColumnRef = getExcelCellRef(Math.max(activeColumns.length - 1, 0), 1).replace(/[0-9]+$/g, "");
  const colsXml = activeColumns
    .map((column, index) => {
      const width = Number.isFinite(column.width) ? column.width : 20;
      const columnNumber = index + 1;
      return `<col min="${columnNumber}" max="${columnNumber}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumnRef}${Math.max(rows.length + 1, 1)}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colsXml}</cols>
  <sheetData>${worksheetRows}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Exportacion" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Quantiva</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Exportacion</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title><dc:creator>Quantiva</dc:creator><cp:lastModifiedBy>Quantiva</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;

  return createZipBlob(
    [
      { path: "[Content_Types].xml", data: contentTypesXml },
      { path: "_rels/.rels", data: rootRelsXml },
      { path: "docProps/app.xml", data: appXml },
      { path: "docProps/core.xml", data: coreXml },
      { path: "xl/workbook.xml", data: workbookXml },
      { path: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
      { path: "xl/styles.xml", data: stylesXml },
      { path: "xl/worksheets/sheet1.xml", data: worksheetXml }
    ],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function buildInlineStringCell(cellRef: string, value: unknown, styleIndex = 0) {
  return `<c r="${cellRef}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function buildNumberCell(cellRef: string, value: number, styleIndex = 0) {
  const numericValue = Number.isFinite(value) ? value : 0;
  return `<c r="${cellRef}" s="${styleIndex}"><v>${numericValue}</v></c>`;
}

function getExcelCellRef(columnIndex: number, rowNumber: number) {
  let index = columnIndex;
  let columnName = "";
  while (index >= 0) {
    columnName = String.fromCharCode((index % 26) + 65) + columnName;
    index = Math.floor(index / 26) - 1;
  }
  return `${columnName}${rowNumber}`;
}

function createZipBlob(entries: Array<{ path: string; data: string }>, mimeType: string) {
  const zipParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralDirectoryLength = 0;
  entries.forEach((entry) => {
    const fileNameBytes = encodeUtf8(entry.path);
    const dataBytes = encodeUtf8(entry.data);
    const checksum = crc32(dataBytes);
    const { date, time } = getZipDosDateTime();
    const localHeader = createZipLocalHeader(checksum, dataBytes.length, fileNameBytes.length, date, time);
    const centralHeader = createZipCentralDirectoryHeader(
      checksum,
      dataBytes.length,
      fileNameBytes.length,
      date,
      time,
      localOffset
    );
    zipParts.push(localHeader, fileNameBytes, dataBytes);
    centralDirectoryParts.push(centralHeader, fileNameBytes);
    localOffset += localHeader.length + fileNameBytes.length + dataBytes.length;
    centralDirectoryLength += centralHeader.length + fileNameBytes.length;
  });
  const endRecord = createZipEndRecord(entries.length, centralDirectoryLength, localOffset);
  const blobParts = [...zipParts, ...centralDirectoryParts, endRecord].map(toArrayBuffer);
  return new Blob(blobParts, { type: mimeType });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(String(value));
}

function createZipLocalHeader(crc: number, size: number, fileNameLength: number, dosDate: number, dosTime: number) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, fileNameLength, true);
  view.setUint16(28, 0, true);
  return bytes;
}

function createZipCentralDirectoryHeader(
  crc: number,
  size: number,
  fileNameLength: number,
  dosDate: number,
  dosTime: number,
  localOffset: number
) {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, fileNameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  return bytes;
}

function createZipEndRecord(entryCount: number, centralDirectoryLength: number, centralDirectoryOffset: number) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectoryLength, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return bytes;
}

function getZipDosDateTime(dateValue = new Date()) {
  const date = dateValue instanceof Date && !Number.isNaN(dateValue.getTime())
    ? dateValue
    : new Date();
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function crc32(bytes: Uint8Array) {
  const table = getCrc32Table();
  let crc = -1;
  bytes.forEach((byte) => {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  });
  return (crc ^ -1) >>> 0;
}

let crc32Table: number[] | null = null;

function getCrc32Table() {
  if (crc32Table) return crc32Table;
  crc32Table = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  });
  return crc32Table;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
