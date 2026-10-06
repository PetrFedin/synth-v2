import { invariant } from '../../core/errors.mjs';

const MAX_CSV_ROWS = 500;
const MAX_CSV_COLUMNS = 100;

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
  const text = latin1(bytes);
  const entries = [...new Set([...text.matchAll(/xl\/worksheets\/(sheet\d+\.xml)/g)].map(match => match[1]))].sort(naturalSheetSort);
  return result('xlsx-envelope', '1.0.0', [
    fragment('metadata', { key: 'xlsx-envelope' }, {
      worksheetEntryCount: entries.length,
      worksheetEntries: entries,
      cellValuesExtracted: false,
      note: 'ZIP envelope parser only; semantic workbook parser is a replaceable follow-up adapter.',
    }),
    ...entries.map(entry => fragment('sheet', { sheet: entry }, { archiveEntry: `xl/worksheets/${entry}`, structuralOnly: true })),
  ]);
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
