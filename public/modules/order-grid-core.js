(function installOrderGridCore(global) {
  'use strict';

  // The rules a buyer's order grid is written under, with no DOM in sight. JOOR's map (§64.2)
  // asks for a keyboard-first grid, paste from a spreadsheet with a preview before anything is
  // committed, invalid cells called out, row and column totals, units and money, minimum-order
  // feedback, a difference between "none" and "not ordered", and an undo for the last paste.
  // Everything here is the arithmetic and the judgement; linesheets.js draws it.

  function list(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value ?? '').trim(); }

  // What a person typed into a cell, read the way a person means it.
  //
  // Blank and zero are not the same thing, and the grid has to hold the difference: blank means
  // "I have not ordered this", zero means "I looked at it and I want none". The stored matrix has
  // no representation for a zero line — a line exists or it does not — so a zero removes the line
  // rather than being refused as an invalid quantity, which is what the old grid did. The reader
  // is told that is what happened; they are not told they made a mistake.
  const BLANK = Object.freeze({ kind: 'blank', quantity: null });
  const REMOVE = Object.freeze({ kind: 'remove', quantity: 0 });

  function readEntry(raw) {
    if (raw === null || raw === undefined) return BLANK;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === '') return BLANK;
    // A spreadsheet exports thousands with a space or a non-breaking space, and a European
    // sheet may carry a trailing decimal comma on a whole number.
    const cleaned = String(value).replace(/[\s  ']/g, '').replace(/[.,]0+$/, '');
    if (!/^-?\d+$/.test(cleaned)) return Object.freeze({ kind: 'invalid', quantity: null });
    const quantity = Number(cleaned);
    if (!Number.isSafeInteger(quantity)) return Object.freeze({ kind: 'invalid', quantity: null });
    if (quantity < 0) return Object.freeze({ kind: 'invalid', quantity });
    if (quantity === 0) return REMOVE;
    return Object.freeze({ kind: 'number', quantity });
  }

  // Judge one cell against the frozen price line it belongs to. The codes are the same ones the
  // matrix core refuses a save with, so what the grid shows in red is exactly what the server
  // would reject — the reader never gets a surprise at save time.
  function evaluateCell(cell, raw) {
    const entry = readEntry(raw);
    if (!cell) return Object.freeze({ ...entry, level: 'error', code: 'SKU_UNKNOWN' });
    if (entry.kind === 'blank') return Object.freeze({ ...entry, level: 'ok', code: '' });
    if (entry.kind === 'remove') return Object.freeze({ ...entry, level: 'ok', code: 'REMOVED' });
    if (entry.kind === 'invalid') return Object.freeze({ ...entry, level: 'error', code: 'QUANTITY_INVALID' });
    if (entry.quantity < cell.minimumOrderQuantity) {
      return Object.freeze({ ...entry, level: 'error', code: 'MOQ_NOT_MET' });
    }
    if (cell.availableToSell !== null && cell.availableToSell !== undefined && entry.quantity > cell.availableToSell) {
      return Object.freeze({ ...entry, level: 'error', code: 'AVAILABILITY_EXCEEDED' });
    }
    return Object.freeze({ ...entry, level: 'ok', code: '' });
  }

  // A cell that can never take a quantity: nothing available, or less available than the minimum
  // the brand will accept. Saying so is kinder than a disabled box with no reason attached.
  function cellClosedReason(cell) {
    if (!cell) return 'NO_SKU';
    if (cell.availableToSell === 0) return 'SOLD_OUT';
    if (cell.availableToSell !== null && cell.availableToSell !== undefined && cell.availableToSell < cell.minimumOrderQuantity) return 'BELOW_MOQ_STOCK';
    return '';
  }

  // A spreadsheet puts tabs between columns and newlines between rows. Excel quotes a field that
  // contains a tab or a newline, and doubles a quote inside it; a naive split on \t loses those.
  function parseClipboardGrid(raw) {
    const source = String(raw ?? '').replace(/\r\n?/g, '\n');
    if (!source) return Object.freeze([]);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"') {
          if (source[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
        } else field += character;
        continue;
      }
      if (character === '"' && field === '') { quoted = true; continue; }
      if (character === '\t') { row.push(field); field = ''; continue; }
      if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += character;
    }
    row.push(field);
    rows.push(row);
    // A trailing newline produces one empty row; a genuinely empty paste produces nothing.
    while (rows.length && rows[rows.length - 1].every(value => text(value) === '')) rows.pop();
    return Object.freeze(rows.map(entry => Object.freeze(entry.map(value => String(value)))));
  }

  // Where a paste lands. The anchor is the cell the caret was in; the block extends right and
  // down from there, the way every spreadsheet behaves.
  function anchorPosition(style, sku) {
    const rows = list(style?.rows);
    const sizes = list(style?.sizes);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      for (let sizeIndex = 0; sizeIndex < sizes.length; sizeIndex += 1) {
        const cell = rows[rowIndex]?.cells?.[sizes[sizeIndex].key];
        if (cell && cell.sku === sku) return Object.freeze({ row: rowIndex, column: sizeIndex });
      }
    }
    return null;
  }

  // What a paste would do, before it does any of it.
  //
  // Nothing is written here. The caller shows this plan, and only if the reader accepts it does
  // anything change — which is the whole point of §64.2's "paste preview before commit": a
  // spreadsheet pasted one column out of line silently rewrites a season's buy, and the person
  // who did it finds out at the brand's confirmation.
  function planPaste({ style, anchorSku, grid, quantities }) {
    const rows = list(style?.rows);
    const sizes = list(style?.sizes);
    const anchor = anchorPosition(style, text(anchorSku));
    if (!anchor) return Object.freeze({ anchor: null, changes: Object.freeze([]), outside: 0, unchanged: 0, errors: 0 });
    const current = quantities && typeof quantities === 'object' ? quantities : {};
    const changes = [];
    let outside = 0;
    let unchanged = 0;
    let errors = 0;
    list(grid).forEach((line, lineIndex) => {
      list(line).forEach((raw, columnIndex) => {
        const rowIndex = anchor.row + lineIndex;
        const sizeIndex = anchor.column + columnIndex;
        if (rowIndex >= rows.length || sizeIndex >= sizes.length) { if (text(raw) !== '') outside += 1; return; }
        const cell = rows[rowIndex]?.cells?.[sizes[sizeIndex].key];
        if (!cell) { if (text(raw) !== '') outside += 1; return; }
        const before = current[cell.sku] ?? '';
        const verdict = evaluateCell(cell, raw);
        const after = verdict.kind === 'blank' ? '' : String(verdict.quantity);
        if (String(before) === after) { unchanged += 1; return; }
        if (verdict.level === 'error') errors += 1;
        changes.push(Object.freeze({
          sku: cell.sku,
          row: rowIndex,
          column: sizeIndex,
          rowLabel: text(rows[rowIndex].code) || text(rows[rowIndex].nameEn) || text(rows[rowIndex].nameRu),
          sizeLabel: text(sizes[sizeIndex].code),
          before: String(before),
          after,
          raw: String(raw),
          kind: verdict.kind,
          level: verdict.level,
          code: verdict.code,
          minimumOrderQuantity: cell.minimumOrderQuantity,
          availableToSell: cell.availableToSell ?? null,
        }));
      });
    });
    return Object.freeze({ anchor, changes: Object.freeze(changes), outside, unchanged, errors });
  }

  // Applying a plan returns the next quantities map and the map it replaced, so undo is a
  // straight restore rather than an attempt to reverse each edit.
  function applyPlan(quantities, plan, { includeErrors = false } = {}) {
    const before = { ...(quantities && typeof quantities === 'object' ? quantities : {}) };
    const next = { ...before };
    let applied = 0;
    list(plan?.changes).forEach(change => {
      if (change.level === 'error' && !includeErrors) return;
      if (change.after === '') delete next[change.sku];
      else next[change.sku] = change.after;
      applied += 1;
    });
    return Object.freeze({ next, previous: Object.freeze(before), applied });
  }

  // Totals. Units and money, by row, by column, and for the style as a whole. Money is kept in
  // minor units until the very end so a hundred cells do not accumulate a floating-point drift.
  function unitPriceMinor(cell) {
    const raw = cell?.unitPrice;
    if (raw === null || raw === undefined) return 0;
    if (typeof raw === 'number' && Number.isSafeInteger(raw)) return raw;
    const number = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100);
  }

  function styleTotals(style, quantities) {
    const rows = list(style?.rows);
    const sizes = list(style?.sizes);
    const current = quantities && typeof quantities === 'object' ? quantities : {};
    const rowTotals = [];
    const columnUnits = sizes.map(() => 0);
    let units = 0;
    let amountMinor = 0;
    let lines = 0;
    let currency = '';
    rows.forEach((row, rowIndex) => {
      let rowUnits = 0;
      let rowAmount = 0;
      sizes.forEach((size, sizeIndex) => {
        const cell = row?.cells?.[size.key];
        if (!cell) return;
        const entry = readEntry(current[cell.sku]);
        if (entry.kind !== 'number') return;
        rowUnits += entry.quantity;
        rowAmount += entry.quantity * unitPriceMinor(cell);
        columnUnits[sizeIndex] += entry.quantity;
        lines += 1;
        if (!currency) currency = text(cell.currency);
      });
      rowTotals[rowIndex] = Object.freeze({ units: rowUnits, amountMinor: rowAmount });
      units += rowUnits;
      amountMinor += rowAmount;
    });
    return Object.freeze({
      rows: Object.freeze(rowTotals),
      columns: Object.freeze(columnUnits.map(value => Object.freeze({ units: value }))),
      units,
      amountMinor,
      lines,
      currency,
    });
  }

  global.SynthaOrderGrid = Object.freeze({
    readEntry,
    evaluateCell,
    cellClosedReason,
    parseClipboardGrid,
    anchorPosition,
    planPaste,
    applyPlan,
    styleTotals,
  });
})(typeof window === 'undefined' ? globalThis : window);
