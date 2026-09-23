(function initializeMaterialLotActions(global) {
  'use strict';

  // Жизненный цикл партии материала: приёмка, входной контроль, выдача в производство.
  //
  // Весь этот контур существовал только как шаги скрипта. Измерено грепом по `public/`:
  // `grep -rn "v2/material-lots"` давало **одно** попадание — чтение в `materials.js`. Пять мутаций
  // (приёмка, выпуск из карантина, возврат в карантин, отклонение, выдача) не вызывались нигде.
  //
  // Это не мелочь в отчёте: выпуск партии к отгрузке требует непустого списка выдач
  // (`QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE`), а выдать материал человек не мог. То есть конец
  // производственного дня был недостижим целиком — не потому, что не положено, а потому, что
  // кнопок не было.
  //
  // Порядок здесь не выдуман: партия всегда приезжает в карантин, выпускается решением человека
  // после осмотра, и только выпущенная идёт в работу — и только в **работающее** исполнение.
  // Правила живут в домене (`material-lots/public.mjs`), экран лишь не предлагает того, что домен
  // отвергнет, и говорит, чего не хватает.

  const EXECUTIONS = { list: null, loading: false, bills: new Map() };

  function text(ru, en) { return global.odText ? global.odText(ru, en) : ru; }
  function note(message) { return el('p', { className: 'od-action-note', rawText: message }); }

  function canReceive(material) {
    const caps = global.SynthaUiCapabilities;
    return !!caps?.hasForOrganisation(state.workspace, material.brandId, caps.CAPABILITIES.INVENTORY_MANAGE);
  }
  function canJudge(lot) {
    const caps = global.SynthaUiCapabilities;
    return !!caps?.hasForOrganisation(state.workspace, lot.brandId, caps.CAPABILITIES.QUALITY_MANAGE);
  }
  function canIssue(lot) {
    const caps = global.SynthaUiCapabilities;
    return !!caps?.hasForOrganisation(state.workspace, lot.brandId, caps.CAPABILITIES.INVENTORY_MANAGE);
  }

  // Приёмка. Обязательны только номер партии и принятое количество — остальное есть не у всего:
  // красильной партии нет у пуговиц, цвета нет у фурнитуры, сертификат приходит не всегда.
  function receiveForm(material, palette = []) {
    const validation = global.SynthaUiValidation;
    const colours = palette.filter((colour) => colour.status === 'active');
    const fields = [
      textDef('lotReference', text('Номер партии', 'Lot reference'), '', 64),
      optionalTextDef('dyeLot', text('Красильная партия', 'Dye lot'), '', 64),
      optionalTextDef('supplierCode', text('Код поставщика', 'Supplier code'), '', 64),
      // Единица не приписывается к подписи сырым кодом: «Принято, m» — это код из базы, а не «м».
      // Количество печатает слой единиц, и он же называет единицу в подсказке.
      numberDef('receivedQuantity', text('Принято', 'Received'), '', false, 0),
      optionalTextDef('certificateReference', text('Сертификат', 'Certificate'), '', 200),
    ];
    // Цвет называется кодом из палитры этого полотна, а ссылку на управляемую запись подставляет
    // сервер: позволить назвать произвольный цвет значило бы записать оттенок, которого у полотна
    // нет. Поля нет вовсе, когда палитры нет — пустой список выбора хуже его отсутствия.
    if (colours.length) {
      fields.push(selectDef(
        'colourCode',
        text('Цвет партии', 'Lot colour'),
        [{ id: '', name: text('без цвета', 'no colour') }, ...colours.map((colour) => ({ id: colour.colourCode, name: colour.colourCode }))],
      ));
    }
    openForm(text('Принять партию', 'Receive a lot'), fields, (values) => {
      const body = {
        materialCode: material.code,
        lotReference: validation.requiredText(values.lotReference, text('Номер партии', 'Lot reference'), { minLength: 2, maxLength: 64 }),
        receivedQuantity: validation.number(values.receivedQuantity, `${text('Принято', 'Received')}`, { min: 0.0001 }),
      };
      for (const [field, label] of [['dyeLot', text('Красильная партия', 'Dye lot')], ['supplierCode', text('Код поставщика', 'Supplier code')], ['certificateReference', text('Сертификат', 'Certificate')]]) {
        const value = String(values[field] ?? '').trim();
        if (value) body[field] = validation.requiredText(value, label, { minLength: 1, maxLength: field === 'certificateReference' ? 200 : 64 });
      }
      const colourCode = String(values.colourCode ?? '').trim();
      if (colourCode) body.colourCode = colourCode;
      return mutate('/v2/material-lots', body);
    });
  }

  // Работающие исполнения бренда — единственное, куда материал может уйти. Список читается один
  // раз и вместе с ведомостью каждого: домен отвергает выдачу материала, которого в ведомости
  // изделия нет (`MATERIAL_LOT_NOT_IN_BILL`), и предлагать такое исполнение было бы обещанием.
  async function activeExecutionsFor(lot) {
    if (!EXECUTIONS.list) {
      if (EXECUTIONS.loading) return [];
      EXECUTIONS.loading = true;
      try {
        const loaded = await api('/v2/production-executions?limit=100');
        EXECUTIONS.list = (loaded?.items || loaded || []).filter((item) => item.status === 'active');
      } catch (problem) {
        EXECUTIONS.list = [];
      } finally {
        EXECUTIONS.loading = false;
      }
    }
    const fitting = [];
    for (const execution of EXECUTIONS.list) {
      const code = execution.executionCode || execution.code;
      if (!code) continue;
      if (!EXECUTIONS.bills.has(code)) {
        try {
          const trace = await api(`/v2/production-executions/${encodeURIComponent(code)}/material-traceability`);
          EXECUTIONS.bills.set(code, (trace?.materials || []).map((row) => row.materialCode));
        } catch (problem) {
          EXECUTIONS.bills.set(code, []);
        }
      }
      if (!EXECUTIONS.bills.get(code).includes(lot.materialCode)) continue;
      // Сколько этой партии уже стоит за этим исполнением — прямо в подписи выбора. Без этого
      // числа человек не может знать, что он сейчас перепишет.
      const already = issuedTo(lot, code);
      fitting.push({
        id: code,
        name: already > 0 ? `${code} — ${text('уже выдано', 'already issued')} ${unitAmount(already, lot.unit)}` : code,
      });
    }
    return fitting;
  }

  function issuedTo(lot, executionCode) {
    const issue = (lot.issues || []).find((row) => row.executionCode === executionCode);
    return Number(issue?.quantity ?? 0);
  }

  async function issueForm(lot) {
    const validation = global.SynthaUiValidation;
    const executions = await activeExecutionsFor(lot);
    if (!executions.length) {
      toast(text(
        'Материал уходит в работающее исполнение, у которого он есть в опубликованной ведомости. Таких сейчас нет: запустите производство изделия, где этот материал заявлен.',
        'Material goes into a running production execution whose published bill lists it. There is none right now: start production of a garment that declares this material.',
      ), 'error');
      return;
    }
    // Число здесь — **итог** по этому исполнению, а не добавка к нему.
    //
    // Домен считает выдачу уточнением: `issuedQuantity - alreadyIssuedToExecution + amount`. То
    // есть повторная выдача в то же исполнение не прибавляет, а переписывает. Проверено на себе:
    // форма называла поле «Количество», за исполнением уже стояло 300 м, я ввёл 50 — и стало 50,
    // а не 350. Модель законна и удобна для исправлений, но поле обязано называться так, как оно
    // работает, иначе человек молча уменьшает то, что хотел увеличить.
    const label = text('Всего выдано в это исполнение', 'Total issued into this execution');
    const ceiling = Number(lot.receivedQuantity ?? 0) - Number(lot.issuedQuantity ?? 0);
    openForm(text('Выдать в производство', 'Issue into production'), [
      selectDef('executionCode', text('Исполнение', 'Execution'), executions),
      { ...numberDef('quantity', label, '', false, 0),
        placeholder: `${text('итог, не добавка', 'the total, not an addition')}` },
      optionalTextDef('notes', text('Примечание', 'Notes'), '', 1000),
    ], (values) => {
      // Потолок — остаток партии плюс то, что уже стоит за этим исполнением: переписывая свою же
      // запись, человек вправе назвать любое число вплоть до всей партии.
      const already = issuedTo(lot, values.executionCode);
      return mutate(`/v2/material-lots/${encodeURIComponent(lot.id)}/issue`, {
        expectedVersion: lot.version,
        executionCode: values.executionCode,
        quantity: validation.number(values.quantity, label, { min: 0.0001, max: ceiling + already }),
        ...(String(values.notes ?? '').trim() ? { notes: String(values.notes).trim() } : {}),
      });
    });
  }

  // Приговор входного контроля: причина обязательна всегда. Партия, выпущенная без причины,
  // неотличима от той, которую никто не смотрел, — а входной контроль ровно для этого и есть.
  function verdictForm(lot, verdict, title) {
    const validation = global.SynthaUiValidation;
    openForm(title, [
      textDef('reason', text('Причина', 'Reason'), '', 1000),
      optionalTextDef('certificateReference', text('Сертификат', 'Certificate'), '', 200),
    ], (values) => {
      const body = {
        expectedVersion: lot.version,
        reason: validation.requiredText(values.reason, text('Причина', 'Reason'), { minLength: 2, maxLength: 1000 }),
      };
      const certificate = String(values.certificateReference ?? '').trim();
      if (certificate) body.certificateReference = certificate;
      return mutate(`/v2/material-lots/${encodeURIComponent(lot.id)}/${verdict}`, body);
    });
  }

  function lotActions(lot) {
    const actions = [];
    if (lot.status === 'quarantine') {
      if (canJudge(lot)) {
        actions.push(actionButton(text('Выпустить из карантина', 'Release from quarantine'), () => verdictForm(lot, 'release', text('Выпустить партию', 'Release the lot')), 'primary'));
      }
    } else if (lot.status === 'released') {
      if (canIssue(lot) && Number(lot.remainingQuantity ?? 0) > 0) {
        actions.push(actionButton(text('Выдать в производство', 'Issue into production'), () => issueForm(lot), 'primary'));
      }
      if (canJudge(lot)) {
        actions.push(actionButton(text('Вернуть в карантин', 'Back to quarantine'), () => verdictForm(lot, 'quarantine', text('Вернуть партию в карантин', 'Put the lot back into quarantine'))));
      }
    }
    // Отклонить можно партию, которая ещё не ушла в изделия: из сшитой вещи рулон не достать, и
    // домен это правило держит (`MATERIAL_LOT_ALREADY_IN_PRODUCTION`).
    if (lot.status !== 'rejected' && canJudge(lot)) {
      if (Number(lot.issuedQuantity ?? 0) === 0) {
        actions.push(actionButton(
          text('Отклонить', 'Reject'),
          () => verdictForm(lot, 'reject', text('Отклонить партию', 'Reject the lot')),
          'danger',
          text('Отклонённую партию вернуть нельзя. Отклонить?', 'A rejected lot cannot come back. Reject it?'),
        ));
      } else {
        actions.push(note(text(
          'Партия уже в изделиях — отклонить её нельзя, из сшитой вещи рулон не достать.',
          'This lot is already in garments — it cannot be rejected; the roll cannot be taken back out.',
        )));
      }
    }
    if (lot.status === 'rejected') {
      actions.push(note(text('Партия отклонена — это конечное состояние.', 'The lot is rejected — a final state.')));
    }
    return actions;
  }

  function reset() {
    EXECUTIONS.list = null;
    EXECUTIONS.loading = false;
    EXECUTIONS.bills.clear();
  }

  global.SynthaMaterialLotActions = Object.freeze({ canReceive, receiveForm, lotActions, issueForm, reset });
})(window);
