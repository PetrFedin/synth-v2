(function installOrderLifecycleActions() {
  'use strict';

  function localized(ru, en) {
    return typeof odText === 'function' ? odText(ru, en) : (I18N?.getLocale?.() === 'en' ? en : ru);
  }

  window.orderTermsEditForm = function orderTermsEditForm(order) {
    openForm(localized('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0443\u0441\u043b\u043e\u0432\u0438\u044f \u0437\u0430\u043a\u0430\u0437\u0430', 'Edit order terms'), orderTermsFields(order.terms), values => mutate(
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
      actions.push(actionButton(localized('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0443\u0441\u043b\u043e\u0432\u0438\u044f', 'Edit terms'), () => window.orderTermsEditForm(item)));
    }

    ownIds().filter(id => [item.brandId, item.shopId].includes(id)).forEach(organisationId => {
      if (!accepted.has(organisationId) && ['draft', 'ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, organisationId, caps.CAPABILITIES.ORDER_CONFIRM)) {
        actions.push(actionButton(
          `${localized('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c', 'Approve')}: ${orgName(organisationId)}`,
          () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { organisationId, expectedVersion: item.version }),
          'primary',
        ));
      }
    });

    if (item.status === 'ready' && canWrite) {
      actions.push(actionButton(
        localized('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443', 'Attach to cycle'),
        () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, { expectedVersion: item.version }),
        'primary',
      ));
    }

    if (item.status === 'attached' && canWrite) {
      actions.push(actionButton(localized('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Cancel order'), () => orderCancellationForm(item), 'danger'));
    }
    return actions;
  };
})();
