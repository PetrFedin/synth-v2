(function installOrderLifecycleActions() {
  'use strict';

  function localized(ru, en) {
    return typeof odText === 'function' ? odText(ru, en) : (I18N?.getLocale?.() === 'en' ? en : ru);
  }

  window.orderTermsEditForm = function orderTermsEditForm(order) {
    openForm(localized('Редактировать условия заказа', 'Edit order terms'), orderTermsFields(order.terms), values => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/terms`,
      { expectedVersion: order.version, terms: validatedOrderTerms(values) },
      'PATCH',
    ));
  };

  window.odOrderActions = function odOrderActions(item) {
    const caps = window.SynthaUiCapabilities;
    const actions = [];
    const accepted = new Set(odList(item.acceptedOrganisationIds));
    const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);

    if (['draft', 'ready'].includes(item.status) && canWrite) {
      actions.push(actionButton(localized('Редактировать условия', 'Edit terms'), () => window.orderTermsEditForm(item)));
    }

    ownIds().filter(id => [item.brandId, item.shopId].includes(id)).forEach(organisationId => {
      if (!accepted.has(organisationId) && ['draft', 'ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, organisationId, caps.CAPABILITIES.ORDER_CONFIRM)) {
        actions.push(actionButton(
          `${localized('Согласовать', 'Approve')}: ${orgName(organisationId)}`,
          () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { orderId: item.id, organisationId, expectedVersion: item.version }),
          'primary',
        ));
      }
    });

    if (item.status === 'ready' && canWrite) {
      actions.push(actionButton(
        localized('Прикрепить к циклу', 'Attach to cycle'),
        () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, { expectedVersion: item.version }),
        'primary',
      ));
    }

    if (item.status === 'attached' && canWrite) {
      actions.push(actionButton(localized('Отменить заказ', 'Cancel order'), () => orderCancellationForm(item), 'danger'));
    }
    return actions;
  };

  function commercialCycleActions(item) {
    const caps = window.SynthaUiCapabilities;
    const actions = [];
    const index = STAGES.indexOf(item.stage);
    const canAdvance = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
    const canConfirm = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_CONFIRM);

    if (canAdvance && index >= 0 && index < STAGES.indexOf('showroom')) {
      const targetStage = STAGES[index + 1];
      actions.push(actionButton(
        `${localized('Перейти', 'Advance')}: ${stageLabel(targetStage)}`,
        () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/advance`, { cycleId: item.id, targetStage }),
      ));
    }

    if (canConfirm && item.stage === 'order' && item.order?.status === 'attached' && Number(item.order.totalAmount) > 0) {
      actions.push(actionButton(
        localized('Открыть DealSpace', 'Open DealSpace'),
        () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/confirm`, {}),
        'primary',
      ));
    }
    return actions;
  }

  window.SynthaCommercialCycleActions = Object.freeze({ actionsFor: commercialCycleActions });

  const baseRegistry = window.odRegistry;
  if (typeof baseRegistry === 'function') {
    window.odRegistry = function odRegistryWithCommercialCycleActions(options) {
      if (options?.scope !== 'od-cycles' || typeof options.inspector !== 'function') return baseRegistry(options);
      const baseInspector = options.inspector;
      return baseRegistry({
        ...options,
        inspector(item) {
          const node = baseInspector(item);
          const actions = commercialCycleActions(item);
          if (!actions.length) return node;
          const footer = node.querySelector('.od-inspector-actions') || el('div', { className: 'od-inspector-actions' });
          actions.forEach(action => footer.append(action));
          if (!footer.isConnected) node.append(footer);
          return node;
        },
      });
    };
  }
})();
