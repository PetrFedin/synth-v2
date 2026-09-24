(function installOrderFulfillmentView(global) {
  'use strict';

  function text(ru, en) {
    return typeof localText === 'function' ? localText(ru, en) : (I18N?.getLocale?.() === 'en' ? en : ru);
  }
  function row(label, value) { return Object.freeze({ label, value: value === null || value === undefined || value === '' ? '—' : String(value) }); }
  function when(value) { return value ? formatDate(value) : '—'; }
  function place(location) {
    if (!location) return '—';
    return [location.name, location.city, location.countryCode].filter(Boolean).join(', ');
  }

  const CLAIM_RESOLUTIONS = Object.freeze({
    'accepted-for-replacement': ['принята: замена', 'accepted: replacement'],
    'accepted-for-return': ['принята: возврат', 'accepted: return'],
    'accepted-for-credit': ['принята: возмещение', 'accepted: credit'],
    'accepted-as-is': ['принята как есть', 'accepted as is'],
    rejected: ['отклонена', 'rejected'],
  });
  const CLAIM_REMEDIES = Object.freeze({
    replacement: ['замена', 'replacement'],
    return: ['возврат', 'return'],
    credit: ['возмещение', 'credit'],
    investigation: ['разбирательство', 'investigation'],
  });
  function labelled(table, key) {
    const pair = table[key];
    return pair ? text(pair[0], pair[1]) : (key || '—');
  }

  /**
   * «Где товар сейчас» — цепочка от плана отгрузки до решения по претензии.
   *
   * Строится сверху вниз в порядке событий, а не по таблицам: план, что уехало, что приехало, что
   * не сошлось, что из этого потребовали и чем кончилось. Недостача и повреждение показываются
   * всегда, когда они есть, — приёмка «всё сошлось» доказывает только счастливый путь, а вопрос
   * «а если привезли не всё» задают первым.
   */
  global.orderFulfillmentDialog = async function orderFulfillmentDialog(order) {
    const view = await api(`/v2/orders/${encodeURIComponent(order.id)}/fulfillment`);
    if (!view || view.orderId !== order.id) throw new Error(I18N.t('common.requestError'));

    const rows = [];
    if (!view.plans.length) {
      rows.push(row(text('Поставка', 'Fulfillment'), text('План отгрузки ещё не создан', 'No fulfillment plan yet')));
      openDetails(text('Поставка по заказу', 'Order fulfillment'), rows);
      return;
    }

    view.plans.forEach((plan, planIndex) => {
      const prefix = view.plans.length > 1 ? `${planIndex + 1}. ` : '';
      rows.push(row(`${prefix}${text('Маршрут', 'Route')}`, `${place(plan.shipFrom)} → ${place(plan.shipTo)}`));
      rows.push(row(`${prefix}${text('Отгрузка по плану', 'Planned shipment')}`, when(plan.plannedShipAt)));
      rows.push(row(`${prefix}${text('Доставка ожидается', 'Expected delivery')}`, when(plan.expectedDeliveryAt)));

      if (!plan.shipments.length) {
        rows.push(row(`${prefix}${text('Отгружено', 'Shipped')}`, text('ещё не отгружено', 'not shipped yet')));
        return;
      }

      plan.shipments.forEach((shipment) => {
        const shipped = (shipment.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
        rows.push(row(text('Отгрузка', 'Shipment'), `${shipment.shipmentNumber} · ${shipment.carrier || '—'} · ${shipment.trackingNumber || '—'}`));
        rows.push(row(text('Отгружено, шт.', 'Shipped, units'), `${shipped} · ${when(shipment.shippedAt)}`));

        const receipts = shipment.receipts || [];
        if (!receipts.length) {
          rows.push(row(text('Приёмка', 'Receipt'), text('груз в пути', 'in transit')));
          return;
        }
        const received = receipts.reduce((sum, receipt) => sum + (receipt.lines || []).reduce((lineSum, line) => lineSum + Number(line.receivedQuantity || 0), 0), 0);
        const last = receipts[receipts.length - 1];
        rows.push(row(text('Принято, шт.', 'Received, units'), `${received} · ${when(last.receivedAt)} · ${last.receiptReference || '—'}`));

        const lines = shipment.discrepancy?.lines || [];
        const damaged = lines.reduce((sum, line) => sum + Number(line.damagedQuantity || 0), 0);
        const rejected = lines.reduce((sum, line) => sum + Number(line.rejectedQuantity || 0), 0);
        const shortage = lines.reduce((sum, line) => sum + Number(line.shortageQuantity || 0), 0);
        const accepted = lines.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0);
        if (shortage || damaged || rejected) {
          rows.push(row(text('Принято к учёту, шт.', 'Accepted, units'), accepted));
          if (damaged) rows.push(row(text('Повреждено, шт.', 'Damaged, units'), damaged));
          if (rejected) rows.push(row(text('Отбраковано, шт.', 'Rejected, units'), rejected));
          rows.push(row(text('Недостача, шт.', 'Shortage, units'), shortage));
        } else {
          rows.push(row(text('Расхождения', 'Discrepancies'), text('нет, поставка сошлась', 'none, shipment matched')));
        }

        if (shipment.claim) {
          rows.push(row(text('Претензия', 'Claim'), `${shipment.claim.claimReference} · ${labelled(CLAIM_REMEDIES, shipment.claim.requestedRemedy)}`));
          rows.push(row(text('Причина претензии', 'Claim reason'), shipment.claim.reason));
          rows.push(row(text('Решение по претензии', 'Claim resolution'), shipment.claimResolution
            ? `${labelled(CLAIM_RESOLUTIONS, shipment.claimResolution.resolutionType)} · ${when(shipment.claimResolution.resolvedAt)}`
            : text('ждёт решения бренда', 'awaiting the brand decision')));
        } else if (shortage || damaged || rejected) {
          rows.push(row(text('Претензия', 'Claim'), text('не подана', 'not submitted')));
        }
      });
    });

    openDetails(text('Поставка по заказу', 'Order fulfillment'), rows);
  };
})(window);
