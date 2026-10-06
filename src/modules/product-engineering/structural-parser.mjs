import { inflateRawSync } from 'node:zlib';
import { invariant } from '../../core/errors.mjs';

const MAX_CSV_ROWS = 500;
const MAX_CSV_COLUMNS = 100;
const MAX_XLSX_ENTRIES = 2048;
const MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_XLSX_COMPRESSION_RATIO = 100;
const MAX_XLSX_SHEETS = 256;
const MAX_XLSX_CELLS_PER_SHEET = 100_000;

export function parseEngineeringSourceStructure({ source, blob }) {
  invariant(source?.id && source?.mediaType, 'ENGINEERING_PARSE_SOURCE_REQUIRED', 'Source with media type is required');
  invariant(blob?.content instanceof Uint8Array, 'ENGINEERING_PARSE_BLOB_REQUIRED', 'Source bytes are required');
  invariant(blob.contentHash === source.contentHash, 'ENGINEERING_PARSE_HASH_MISMATCH', 'Source bytes do not match admitted source hash');

  switch (source.mediaType) {
    case 'application/pdf': return parsePdf(source, blob.content);
    case 'text/csv': return parseCsv(source, blob.content);
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return parseXlsxEnvelope(source, blob.content);
    case 'image/svg+xml': return parseSvg(source, blob.content);
    case 'image/png': return parsePng(source, blob.content);
    case 'image/jpeg': return parseJpeg(source, blob.content);
    case 'image/webp': return parseWebp(source, blob.content);
    default: invariant(false, 'ENGINEERING_PARSER_UNSUPPORTED', 'No structural parser is registered for source media type', { mediaType: source.mediaType });
  }
}

function parsePdf(source, bytes) {
  const text = latin1(bytes);
  const pages = [...text.matchAll(/\/Type\s*\/Page(?!s)\b/g)].length;
  const pageCount = Math.max(1, pages);
  return result('pdf-structure', '1.0.0', [
    fragment('metadata', { key: 'document' }, { mediaType: source.mediaType, pageCount, semanticTextExtracted: false }),
    ...Array.from({ length: pageCount }, (_, index) => fragment('document_page', { page: index + 1 }, { structuralOnly: true })),
  ]);
}

function parseCsv(source, bytes) {
  const text = utf8(bytes);
  const rows = parseCsvRows(text).slice(0, MAX_CSV_ROWS);
  const width = Math.min(MAX_CSV_COLUMNS, Math.max(0, ...rows.map(row => row.length)));
  const normalized = rows.map(row => row.slice(0, width));
  const endRow = Math.max(1, normalized.length);
  const endColumn = columnName(Math.max(1, width));
  return result('csv-structure', '1.0.0', [
    fragment('sheet', { sheet: 'CSV' }, { rowCount: normalized.length, columnCount: width, truncated: parseCsvRows(text).length > MAX_CSV_ROWS }),
    fragment('cell_range', { sheet: 'CSV', range: `A1:${endColumn}${endRow}` }, { rows: normalized }),
  ]);
}

function parseXlsxEnvelope(source, bytes) {
  const entries = readZipEntries(bytes);
  const workbook = xml(entries.get('xl/workbook.xml'));
  const relations = xml(entries.get('xl/_rels/workbook.xml.rels'));
  const relationMap = new Map(
    [...relations.matchAll(/<Relationship\b[^>]*\bId=["']([^"']+)["'][^>]*\bTarget=["']([^"']+)["'][^>]*\/?\s*>/gi)]
      .map(match => [match[1], normalizeWorkbookTarget(match[2])]),
  );
  const sharedStrings = parseSharedStrings(xml(entries.get('xl/sharedStrings.xml'), true));
  const sheetMatches = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)];
  invariant(sheetMatches.length <= MAX_XLSX_SHEETS, 'ENGINEERING_XLSX_RESOURCE_LIMIT', 'XLSX contains too many worksheets', { maxSheets: MAX_XLSX_SHEETS });
  const sheets = sheetMatches.map((match, index) => {
    const attrs = match[1];
    const name = xmlAttr(attrs, 'name') || `Sheet${index + 1}`;
    const relationId = xmlAttr(attrs, 'r:id');
    const entry = relationMap.get(relationId) ?? `xl/worksheets/sheet${index + 1}.xml`;
    return { name, relationId, entry };
  });
  const fragments = [
    fragment('metadata', { key: 'xlsx-workbook' }, {
      sheetCount: sheets.length,
      sheetNames: sheets.map(sheet => sheet.name),
      sharedStringCount: sharedStrings.length,
      cellValuesExtracted: true,
    }),
  ];
  for (const sheet of sheets) {
    const sheetXml = xml(entries.get(sheet.entry), true);
    const cells = parseWorksheetCells(sheetXml, sharedStrings);
    const range = worksheetRange(cells);
    fragments.push(fragment('sheet', { sheet: sheet.name }, {
      archiveEntry: sheet.entry,
      cellCount: cells.length,
      usedRange: range,
    }));
    if (cells.length) fragments.push(fragment('cell_range', { sheet: sheet.name, range }, {
      cells: cells.slice(0, 5000),
      truncated: cells.length > 5000,
    }));
  }
  return result('xlsx-structure', '1.0.0', fragments);
}

function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  invariant(eocd >= 0, 'ENGINEERING_XLSX_ZIP_INVALID', 'XLSX ZIP end-of-central-directory was not found');
  const entryCount = view.getUint16(eocd + 10, true);
  invariant(entryCount <= MAX_XLSX_ENTRIES, 'ENGINEERING_XLSX_RESOURCE_LIMIT', 'XLSX contains too many archive entries', { maxEntries: MAX_XLSX_ENTRIES });
  let offset = view.getUint32(eocd + 16, true);
  let totalUncompressedBytes = 0;
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    invariant(offset + 46 <= bytes.byteLength && view.getUint32(offset, true) === 0x02014b50, 'ENGINEERING_XLSX_ZIP_INVALID', 'XLSX central directory is invalid');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    invariant((flags & 0x0001) === 0, 'ENGINEERING_XLSX_ENCRYPTED_UNSUPPORTED', 'Encrypted XLSX ZIP entries are not accepted');
    invariant(uncompressedSize <= MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES, 'ENGINEERING_XLSX_RESOURCE_LIMIT', 'XLSX entry exceeds uncompressed size limit', { maxEntryBytes: MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES });
    totalUncompressedBytes += uncompressedSize;
    invariant(totalUncompressedBytes <= MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES, 'ENGINEERING_XLSX_RESOURCE_LIMIT', 'XLSX exceeds total uncompressed size limit', { maxTotalBytes: MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES });
    if (uncompressedSize > 0) {
      invariant(compressedSize > 0 || method === 0, 'ENGINEERING_XLSX_ZIP_INVALID', 'Compressed XLSX entry has invalid zero compressed size');
      if (method !== 0) invariant(uncompressedSize / compressedSize <= MAX_XLSX_COMPRESSION_RATIO, 'ENGINEERING_XLSX_RESOURCE_LIMIT', 'XLSX entry compression ratio is unsafe', { maxCompressionRatio: MAX_XLSX_COMPRESSION_RATIO });
    }
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    invariant(localOffset + 30 <= bytes.byteLength && view.getUint32(localOffset, true) === 0x04034b50, 'ENGINEERING_XLSX_ZIP_INVALID', 'XLSX local file header is invalid');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    invariant(dataOffset + compressedSize <= bytes.byteLength, 'ENGINEERING_XLSX_ZIP_INVALID', 'XLSX entry exceeds archive bounds');
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = new Uint8Array(inflateRawSync(compressed));
    else invariant(false, 'ENGINEERING_XLSX_COMPRESSION_UNSUPPORTED', 'XLSX contains unsupported ZIP compression', { method, name });
    invariant(content.byteLength === uncompressedSize, 'ENGINEERING_XLSX_ZIP_INVALID', 'XLSX entry size does not match central directory', { name });
    entries.set(name.replace(/^\//, ''), content);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(text) {
  if (!text) return [];
  return [...text.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(match => {
    const runs = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(value => xmlDecode(value[1]));
    return runs.join('');
  });
}

function parseWorksheetCells(text, sharedStrings) {
  if (!text) return [];
  const cells = [];
  for (const match of text.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
    const attrs = match[1];
    const ref = xmlAttr(attrs, 'r');
    if (!/^[A-Z]+[1-9][0-9]*$/.test(ref ?? '')) continue;
    const type = xmlAttr(attrs, 't') ?? 'n';
    const body = match[2];
    const valueText = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1];
    const inline = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/i)?.[1];
    let value = null;
    if (type === 's' && valueText !== undefined) value = sharedStrings[Number(valueText)] ?? null;
    else if (type === 'inlineStr' && inline !== undefined) value = [...inline.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(x => xmlDecode(x[1])).join('');
    else if (type === 'b' && valueText !== undefined) value = valueText === '1';
    else if (valueText !== undefined) {
      const number = Number(valueText);
      value = Number.isFinite(number) && valueText.trim() !== '' ? number : xmlDecode(valueText);
    }
    cells.push(Object.freeze({ ref, type, value }));
    invariant(cells.length <= MAX_XLSX_CELLS_PER_SHEET, 'ENGINEERING_XLSX_RESOURCE_LIMIT', 'XLSX worksheet contains too many cells', { maxCellsPerSheet: MAX_XLSX_CELLS_PER_SHEET });
  }
  return cells;
}

function worksheetRange(cells) {
  if (!cells.length) return 'A1:A1';
  let minRow = Infinity, maxRow = 1, minCol = Infinity, maxCol = 1;
  for (const cell of cells) {
    const match = cell.ref.match(/^([A-Z]+)([1-9][0-9]*)$/);
    const col = columnNumber(match[1]);
    const row = Number(match[2]);
    minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
  }
  return `${columnName(minCol)}${minRow}:${columnName(maxCol)}${maxRow}`;
}
function columnNumber(name) { let value=0; for(const ch of name) value=value*26+(ch.charCodeAt(0)-64); return value; }
function xml(bytes, optional=false) {
  if (!bytes) { invariant(optional, 'ENGINEERING_XLSX_PART_MISSING', 'Required XLSX XML part is missing'); return ''; }
  return utf8(bytes);
}
function xmlAttr(attributes, name) {
  const escaped=name.replace(':','\\:');
  return attributes.match(new RegExp(`(?:^|\\s)${escaped}=["']([^"']*)["']`, 'i'))?.[1] ?? null;
}
function xmlDecode(value) {
  return String(value).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function normalizeWorkbookTarget(target) {
  const clean=String(target).replace(/\\/g,'/').replace(/^\.\//,'');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

function parseSvg(source, bytes) {
  const text = utf8(bytes);
  invariant(!/<\s*(script|foreignObject|iframe|object|embed)\b/i.test(text) && !/\son[a-z]+\s*=/i.test(text), 'ENGINEERING_SVG_UNSAFE', 'SVG source contains active content');
  const root = text.match(/<svg\b([^>]*)>/i)?.[1] ?? '';
  const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
  const counts = {};
  for (const tag of ['path','line','polyline','polygon','rect','circle','ellipse','text','g']) counts[tag] = [...text.matchAll(new RegExp(`<${tag}\\b`, 'gi'))].length;
  return result('svg-structure', '1.0.0', [
    fragment('metadata', { key: 'svg' }, { viewBox, primitiveCounts: counts, semanticTextExtracted: false }),
  ]);
}

function parsePng(source, bytes) {
  invariant(bytes.byteLength >= 24, 'ENGINEERING_IMAGE_INVALID', 'PNG is too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return imageResult('png-structure', view.getUint32(16), view.getUint32(20));
}
function parseWebp(source, bytes) {
  const text = latin1(bytes.slice(0, Math.min(bytes.byteLength, 64)));
  if (text.slice(12,16) === 'VP8X' && bytes.byteLength >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return imageResult('webp-structure', width, height);
  }
  return imageResult('webp-structure', null, null);
}
function parseJpeg(source, bytes) {
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return imageResult('jpeg-structure', width, height);
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (!Number.isInteger(length) || length < 2) break;
    offset += 2 + length;
  }
  return imageResult('jpeg-structure', null, null);
}
function imageResult(parser, width, height) {
  return result(parser, '1.0.0', [fragment('metadata', { key: 'image' }, { width, height, calibratedScale: false })]);
}

function result(parser, parserVersion, fragments) { return Object.freeze({ parser, parserVersion, fragments: Object.freeze(fragments) }); }
function fragment(kind, locator, content) { return Object.freeze({ kind, locator: Object.freeze(locator), content: deepFreeze(content) }); }
function utf8(bytes) { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { invariant(false, 'ENGINEERING_TEXT_ENCODING_INVALID', 'Text source must be valid UTF-8'); } }
function latin1(bytes) { return new TextDecoder('latin1').decode(bytes); }
function naturalSheetSort(a,b) { return Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0); }
function columnName(number) { let n=number,out=''; while(n>0){n-=1;out=String.fromCharCode(65+(n%26))+out;n=Math.floor(n/26);} return out || 'A'; }
function parseCsvRows(text) {
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i+=1){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i+=1;}
      else if(ch==='"') quoted=false;
      else field+=ch;
    } else if(ch==='"') quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  return rows;
}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
