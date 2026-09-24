import { invariant } from '../../core/errors.mjs';

// Ведомость как документ на изделие, а не как список строк одного SKU.
//
// Спецификация у нас ведётся на каталожный SKU — то есть на цвет и размер сразу. Это верно по сути:
// расход ткани на 48-й больше, чем на 40-й, и хранить одну цифру на все размеры значило бы закупать
// либо с запасом, либо с недостачей. Но у этого есть цена: **ряд не виден**. Автор заполняет
// пять отдельных ведомостей и не может сравнить их между собой, а именно сравнение и показывает
// опечатку.
//
// Здесь ряд собирается из того, что уже записано. Ничего не хранится: сетка — это проекция
// опубликованных ведомостей стиля, и второй её экземпляр разошёлся бы с ними при первой правке.
//
// Три расхождения сетка называет, но **не отказывает** ни в одном:
//
//   * у размера нет опубликованной ведомости — он ещё не посчитан, а не сломан;
//   * материал есть в одних размерах и пропал в других — почти всегда забыли строку, но бывает и
//     намеренно: подкладка не во всех ростах;
//   * расход не растёт с размером — обычно опечатка, однако раскладка на разных размерах ложится
//     по-разному, и отказать здесь значило бы запретить законный случай.
//
// Отказ уместен там, где запись бессмысленна. Здесь запись осмысленна, но подозрительна, и
// правильная реакция — показать её тому, кто может решить.

export const SIZE_LINE_EXCEPTIONS = Object.freeze([
  'size-without-published-bom',
  'material-missing-in-size',
  'consumption-not-graded',
]);

/**
 * Разбор одной ведомости: по типам материала с подсчётом и выходом полотна.
 *
 * Выход — частное нетто и брутто, а не отдельное поле: он уже задан процентом отходов, и хранить
 * его рядом значило бы завести второе мнение об одном числе. Семь процентов отходов дают выход
 * 93,46 %, а не 93 %, и разница видна на тираже.
 */
export function bomComposition(bom) {
  const lines = list(bom?.lines);
  const groups = new Map();
  let materialCost = 0;

  for (const line of lines) {
    const type = typeof line?.materialType === 'string' && line.materialType ? line.materialType : 'other';
    const cost = finiteOrZero(line?.lineCost);
    materialCost = round4(materialCost + cost);
    const group = groups.get(type) ?? { materialType: type, lineCount: 0, mainCount: 0, cost: 0 };
    group.lineCount += 1;
    if (line?.isMain) group.mainCount += 1;
    group.cost = round4(group.cost + cost);
    groups.set(type, group);
  }

  const ordered = [...groups.values()].sort((left, right) => left.materialType.localeCompare(right.materialType));
  return Object.freeze({
    lineCount: lines.length,
    materialCost,
    groups: Object.freeze(ordered.map((group) => Object.freeze({
      ...group,
      // Доля считается от себестоимости материалов, а не от полной: труд и логистика к ткани
      // отношения не имеют, и включать их значило бы занизить вес каждой группы.
      costShareBasisPoints: materialCost === 0 ? null : Math.round((group.cost / materialCost) * 10_000),
    }))),
    lines: Object.freeze(lines.map((line) => Object.freeze({
      lineId: line?.lineId ?? null,
      component: line?.component ?? null,
      materialCode: line?.materialCode ?? null,
      materialType: line?.materialType ?? null,
      unit: line?.unit ?? null,
      quantity: finiteOrNull(line?.quantity),
      grossQuantity: finiteOrNull(line?.grossQuantity),
      wastePercent: finiteOrNull(line?.wastePercent),
      isMain: Boolean(line?.isMain),
      placement: line?.placement ?? null,
      lineCost: finiteOrNull(line?.lineCost),
      efficiencyBasisPoints: efficiencyBasisPoints(line),
    }))),
    efficiencyBasisPoints: overallEfficiency(lines),
  });
}

/**
 * Выход полотна по строке: какая доля закупленного становится изделием.
 *
 * Считается только там, где есть что расходовать. У фурнитуры отходов обычно нет, и «выход 100 %»
 * на пуговице — не показатель, а шум, поэтому строка без отходов выхода не объявляет.
 */
export function efficiencyBasisPoints(line) {
  const net = finiteOrNull(line?.quantity);
  const gross = finiteOrNull(line?.grossQuantity);
  if (net === null || gross === null || gross <= 0) return null;
  if (net === gross) return null;
  return Math.round((net / gross) * 10_000);
}

/**
 * Размерный ряд стиля: расход каждого материала по размерам и итог ведомости на каждый размер.
 *
 * Строки приходят плоскими — по одной на (размер, материал), — и сетка собирается здесь, а не в
 * запросе: поворот таблицы в SQL пришлось бы переписывать при каждом новом столбце, а правило
 * «чем больше размер, тем больше расход» в запросе не выражается вовсе.
 */
export function styleSizeLine(rows) {
  const lines = list(rows);
  const currencies = new Set(lines.map((row) => row.currency).filter(Boolean));
  invariant(currencies.size <= 1, 'BOM_SIZE_LINE_CURRENCY_MIXED',
    'One style cannot state its bill in more than one currency', { currencies: [...currencies] });

  const sizes = new Map();
  for (const row of lines) {
    const code = requiredText(row?.sizeCode, 'BOM_SIZE_CODE_INVALID', 'Size code');
    const existing = sizes.get(code);
    if (existing) continue;
    sizes.set(code, Object.freeze({
      sizeCode: code,
      sizeSortOrder: Number(row.sizeSortOrder ?? 0),
      sizeNameRu: row.sizeNameRu ?? null,
      sizeNameEn: row.sizeNameEn ?? null,
      catalogSku: row.catalogSku ?? null,
      bomStatus: row.bomStatus ?? null,
      bomTotalCost: finiteOrNull(row.bomTotalCost),
    }));
  }
  // Ряд упорядочен по справочнику, а не по алфавиту: «10, 12, 8» — это то, что даёт сортировка
  // строк, и читать такой ряд невозможно.
  const orderedSizes = [...sizes.values()].sort((left, right) => left.sizeSortOrder - right.sizeSortOrder);

  const materials = new Map();
  for (const row of lines) {
    if (!row?.materialCode) continue;
    const key = row.materialCode;
    const entry = materials.get(key) ?? {
      materialCode: key,
      materialType: row.materialType ?? null,
      component: row.component ?? null,
      unit: row.unit ?? null,
      isMain: Boolean(row.isMain),
      placement: row.placement ?? null,
      bySize: new Map(),
    };
    entry.bySize.set(row.sizeCode, Object.freeze({
      quantity: finiteOrNull(row.quantity),
      grossQuantity: finiteOrNull(row.grossQuantity),
      wastePercent: finiteOrNull(row.wastePercent),
      lineCost: finiteOrNull(row.lineCost),
      efficiencyBasisPoints: efficiencyBasisPoints(row),
    }));
    materials.set(key, entry);
  }

  const exceptions = [];
  for (const size of orderedSizes) {
    if (size.bomStatus !== 'published') {
      exceptions.push(Object.freeze({
        code: 'size-without-published-bom', sizeCode: size.sizeCode, materialCode: null,
        detail: size.bomStatus === null ? 'ведомость не заведена' : `ведомость в состоянии «${size.bomStatus}»`,
      }));
    }
  }

  const assembled = [...materials.values()].map((entry) => {
    const consumption = orderedSizes.map((size) => entry.bySize.get(size.sizeCode) ?? null);

    orderedSizes.forEach((size, index) => {
      if (consumption[index] === null && size.bomStatus === 'published') {
        exceptions.push(Object.freeze({
          code: 'material-missing-in-size', sizeCode: size.sizeCode, materialCode: entry.materialCode,
          detail: 'материал есть в других размерах этого стиля',
        }));
      }
    });

    // Градация расхода проверяется только между соседними размерами, у которых обоих есть цифра:
    // пропуск в середине ряда — это уже названное расхождение, и объявлять из-за него ещё и
    // «расход упал» значило бы сообщить об одной ошибке дважды.
    let previous = null;
    let previousSize = null;
    for (let index = 0; index < consumption.length; index += 1) {
      const current = consumption[index];
      if (current === null || current.quantity === null) continue;
      if (previous !== null && current.quantity < previous) {
        exceptions.push(Object.freeze({
          code: 'consumption-not-graded', sizeCode: orderedSizes[index].sizeCode, materialCode: entry.materialCode,
          detail: `${previousSize} — ${previous}, ${orderedSizes[index].sizeCode} — ${current.quantity}`,
        }));
      }
      previous = current.quantity;
      previousSize = orderedSizes[index].sizeCode;
    }

    const stated = consumption.filter((value) => value !== null && value.quantity !== null);
    return Object.freeze({
      materialCode: entry.materialCode,
      materialType: entry.materialType,
      component: entry.component,
      unit: entry.unit,
      isMain: entry.isMain,
      placement: entry.placement,
      consumption: Object.freeze(consumption),
      statedSizeCount: stated.length,
      // Разброс по ряду говорит, градуирован расход вообще или во все размеры вписали одну цифру.
      minQuantity: stated.length === 0 ? null : Math.min(...stated.map((value) => value.quantity)),
      maxQuantity: stated.length === 0 ? null : Math.max(...stated.map((value) => value.quantity)),
      graded: stated.length > 1 && new Set(stated.map((value) => value.quantity)).size > 1,
    });
  });

  return Object.freeze({
    currency: currencies.size === 1 ? [...currencies][0] : null,
    sizes: Object.freeze(orderedSizes),
    materials: Object.freeze(assembled.sort(byMainThenCode)),
    exceptions: Object.freeze(exceptions),
    // Полнота важнее самой сетки: ряд, посчитанный по трём размерам из пяти, читается как ряд.
    publishedSizeCount: orderedSizes.filter((size) => size.bomStatus === 'published').length,
    sizeCount: orderedSizes.length,
    complete: orderedSizes.length > 0 && exceptions.length === 0,
  });
}

function byMainThenCode(left, right) {
  if (left.isMain !== right.isMain) return left.isMain ? -1 : 1;
  return String(left.materialCode).localeCompare(String(right.materialCode));
}

function list(value) { return Array.isArray(value) ? value : []; }
function round4(value) { return Math.round(value * 10_000) / 10_000; }
function finiteOrNull(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function finiteOrZero(value) { return finiteOrNull(value) ?? 0; }
// Общий выход взвешивается деньгами, а не количеством. Сложить метры ткани со штуками фурнитуры
// нельзя — получится число, которое ни к чему не относится; стоимость же общая для всех строк, и
// дорогая ткань влияет на итог сильнее, чем дешёвая подкладка, что и соответствует делу.
function overallEfficiency(lines) {
  let weighted = 0;
  let weight = 0;
  for (const line of lines) {
    const efficiency = efficiencyBasisPoints(line);
    if (efficiency === null) continue;
    const cost = finiteOrNull(line?.lineCost);
    if (cost === null || cost <= 0) continue;
    weighted += efficiency * cost;
    weight += cost;
  }
  return weight === 0 ? null : Math.round(weighted / weight);
}
function requiredText(value, code, label) {
  invariant(typeof value === 'string' && value.trim(), code, `${label} is required`, { value });
  return value.trim();
}
