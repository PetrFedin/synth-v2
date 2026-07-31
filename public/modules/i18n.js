(function initializeSynthaI18n(global) {
  'use strict';

  const STORAGE_KEY = 'syntha-v2-locale';
  const SUPPORTED_LOCALES = Object.freeze(['ru', 'en']);
  const DEFAULT_LOCALE = 'ru';

  const messages = Object.freeze({
    ru: Object.freeze({
      'document.title': 'Syntha V2 \u2014 Wholesale workspace',
      'language.selector': '\u042f\u0437\u044b\u043a \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430',
      'language.ru': '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
      'language.en': 'English',
      'nav.overview': '\u041e\u0431\u0437\u043e\u0440',
      'nav.partners': '\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b',
      'nav.catalog': '\u041a\u0430\u0442\u0430\u043b\u043e\u0433',
      'nav.showrooms': '\u0428\u043e\u0443\u0440\u0443\u043c\u044b',
      'nav.selections': '\u041e\u0442\u0431\u043e\u0440\u044b',
      'nav.orders': '\u0417\u0430\u043a\u0430\u0437\u044b',
      'nav.calendar': '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c',
      'nav.notifications': '\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f',
      'status.online': '\u043e\u043d\u043b\u0430\u0439\u043d',
      'status.active': '\u0430\u043a\u0442\u0438\u0432\u043d\u043e',
      'status.pending': '\u043e\u0436\u0438\u0434\u0430\u0435\u0442',
      'status.draft': '\u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a',
      'status.open': '\u043e\u0442\u043a\u0440\u044b\u0442\u043e',
      'status.published': '\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e',
      'status.accepted': '\u043f\u0440\u0438\u043d\u044f\u0442\u043e',
      'status.ready': '\u0433\u043e\u0442\u043e\u0432',
      'status.attached': '\u043f\u0440\u0438\u043a\u0440\u0435\u043f\u043b\u0451\u043d',
      'status.cancelled': '\u043e\u0442\u043c\u0435\u043d\u0451\u043d',
      'status.read': '\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e',
      'stage.campaign': '\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f',
      'stage.collection': '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',
      'stage.showroom': '\u0428\u043e\u0443\u0440\u0443\u043c',
      'stage.selection': '\u041e\u0442\u0431\u043e\u0440',
      'stage.order-builder': '\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0442\u043e\u0440 \u0437\u0430\u043a\u0430\u0437\u0430',
      'stage.order': '\u0417\u0430\u043a\u0430\u0437',
      'stage.confirmation': '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435',
      'stage.deal-space': 'DealSpace',
      'common.user': '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c',
      'common.noOrganisation': '\u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430',
      'common.refresh': '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c',
      'common.logout': '\u0412\u044b\u0439\u0442\u0438',
      'common.processing': '\u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f\u2026',
      'common.operationComplete': '\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u044f \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0430',
      'common.close': '\u0417\u0430\u043a\u0440\u044b\u0442\u044c',
      'common.save': '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c',
      'common.saving': '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026',
      'common.changesSaved': '\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b',
      'common.requestError': '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430',
      'common.noData': '\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445: {label}',
      'auth.password': '\u041f\u0430\u0440\u043e\u043b\u044c',
      'auth.signIn': '\u0412\u043e\u0439\u0442\u0438',
      'auth.signingIn': '\u0412\u0445\u043e\u0434\u0438\u043c\u2026',
      'auth.sessionInvalid': '\u0421\u0435\u0441\u0441\u0438\u044f \u043d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u044c\u043d\u0430. \u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0441\u043d\u043e\u0432\u0430.',
      'auth.sessionEnded': '\u0421\u0435\u0441\u0441\u0438\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430.',
      'auth.description': '\u0410\u0432\u0442\u043e\u043d\u043e\u043c\u043d\u043e\u0435 wholesale-\u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0441 \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0439 PostgreSQL-\u0441\u0435\u0441\u0441\u0438\u0435\u0439.',
      'auth.bootstrapHint': '\u041f\u0435\u0440\u0432\u044b\u0439 \u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439 npm run bootstrap:owner.',
      'form.cancelOrder': '\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437',
      'form.cancellationReason': '\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0442\u043c\u0435\u043d\u044b',
    }),
    en: Object.freeze({
      'document.title': 'Syntha V2 \u2014 Wholesale workspace',
      'language.selector': 'Interface language',
      'language.ru': 'Russian',
      'language.en': 'English',
      'nav.overview': 'Overview',
      'nav.partners': 'Partners',
      'nav.catalog': 'Catalog',
      'nav.showrooms': 'Showrooms',
      'nav.selections': 'Selections',
      'nav.orders': 'Orders',
      'nav.calendar': 'Calendar',
      'nav.notifications': 'Notifications',
      'status.online': 'online',
      'status.active': 'active',
      'status.pending': 'pending',
      'status.draft': 'draft',
      'status.open': 'open',
      'status.published': 'published',
      'status.accepted': 'accepted',
      'status.ready': 'ready',
      'status.attached': 'attached',
      'status.cancelled': 'cancelled',
      'status.read': 'read',
      'stage.campaign': 'Campaign',
      'stage.collection': 'Collection',
      'stage.showroom': 'Showroom',
      'stage.selection': 'Selection',
      'stage.order-builder': 'Order Builder',
      'stage.order': 'Order',
      'stage.confirmation': 'Confirmation',
      'stage.deal-space': 'DealSpace',
      'common.user': 'User',
      'common.noOrganisation': 'no organisation assigned',
      'common.refresh': 'Refresh',
      'common.logout': 'Sign out',
      'common.processing': 'Processing\u2026',
      'common.operationComplete': 'Operation completed',
      'common.close': 'Close',
      'common.save': 'Save',
      'common.saving': 'Saving\u2026',
      'common.changesSaved': 'Changes saved',
      'common.requestError': 'Request failed',
      'common.noData': 'No available data: {label}',
      'auth.password': 'Password',
      'auth.signIn': 'Sign in',
      'auth.signingIn': 'Signing in\u2026',
      'auth.sessionInvalid': 'The session is no longer valid. Sign in again.',
      'auth.sessionEnded': 'The session has ended.',
      'auth.description': 'Autonomous wholesale workspace with a PostgreSQL-owned session.',
      'auth.bootstrapHint': 'Create the first owner with npm run bootstrap:owner.',
      'form.cancelOrder': 'Cancel order',
      'form.cancellationReason': 'Cancellation reason',
    }),
  });

  const phrasePairs = Object.freeze([
    ['\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f', 'Untitled'],
    ['\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0432\u044f\u0437\u0438', 'Active relationships'],
    ['\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 \u0446\u0438\u043a\u043b\u044b', 'Open cycles'],
    ['\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 pipeline', 'Commercial pipeline'],
    ['\u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f', 'Upcoming events'],
    ['\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', 'Latest notifications'],
    ['\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b \u0435\u0449\u0451 \u043d\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u044b.', 'No commercial cycles yet.'],
    ['\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442.', 'The calendar is empty.'],
    ['\u041d\u043e\u0432\u044b\u0445 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043d\u0435\u0442.', 'No new notifications.'],
    ['\u0422\u043e\u0440\u0433\u043e\u0432\u044b\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Trade relationships and access'],
    ['\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c', 'Request relationship'],
    ['\u041e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f', 'Relationships'],
    ['\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f \u0432 \u0448\u043e\u0443\u0440\u0443\u043c\u044b', 'Showroom invitations'],
    ['\u041d\u0435\u0442 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0439 \u0441 \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430\u043c\u0438.', 'No counterparty relationships.'],
    ['\u041d\u0435\u0442 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0439.', 'No invitations.'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438, \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u0438 SKU', 'Campaigns, collections and SKUs'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', 'Create campaign'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns'],
    ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e', 'Create collection'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', 'Create SKU'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No campaigns yet.'],
    ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No collections yet.'],
    ['\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 SKU \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No available SKUs yet.'],
    ['\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u043e\u0443\u0440\u0443\u043c', 'Create showroom'],
    ['Showroom workspace', '\u0420\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0448\u043e\u0443\u0440\u0443\u043c\u043e\u0432'],
    ['\u0428\u043e\u0443\u0440\u0443\u043c\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No showrooms yet.'],
    ['\u041d\u0430\u0447\u0430\u0442\u044c \u0446\u0438\u043a\u043b', 'Start cycle'],
    ['Buyer Selection', '\u041e\u0442\u0431\u043e\u0440 \u0437\u0430\u043a\u0443\u043f\u0449\u0438\u043a\u0430'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection', 'Create selection'],
    ['Selections', '\u041e\u0442\u0431\u043e\u0440\u044b'],
    ['Selections \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No selections yet.'],
    ['Order Builder \u0438 DealSpace', 'Order Builder and DealSpace'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Create order'],
    ['\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'],
    ['\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No orders yet.'],
    ['\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445 \u0441\u0434\u0435\u043b\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No confirmed deals yet.'],
    ['\u041e\u0431\u0449\u0438\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Shared calendar'],
    ['\u0421\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No events yet.'],
    ['Notification Center', '\u0426\u0435\u043d\u0442\u0440 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439'],
    ['\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.', 'No notifications yet.'],
    ['\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'],
    ['\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'],
    ['\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', 'Invite shop'],
    ['\u041e\u0442\u043a\u0440\u044b\u0442\u044c DealSpace', 'Open DealSpace'],
    ['\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c SKU', 'Add SKU'],
    ['\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c', 'Submit'],
    ['\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443', 'Attach to cycle'],
    ['\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Cancel order'],
    ['\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e', 'Mark as read'],
    ['\u0421\u0442\u0440\u043e\u043a \u043d\u0435\u0442', 'No lines'],
    ['\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0442\u043e\u0440\u0433\u043e\u0432\u043e\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0435', 'Request trade relationship'],
    ['\u0412\u0430\u0448\u0430 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Your organisation'],
    ['ID \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430', 'Counterparty ID'],
    ['\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430', 'Organisation not found'],
    ['\u0411\u0440\u0435\u043d\u0434', 'Brand'],
    ['\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Name'],
    ['\u0421\u0435\u0437\u043e\u043d', 'Season'],
    ['\u041d\u0430\u0447\u0430\u043b\u043e', 'Start'],
    ['\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435', 'End'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'],
    ['\u0412\u0430\u043b\u044e\u0442\u0430', 'Currency'],
    ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'],
    ['Wholesale price', '\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u0446\u0435\u043d\u0430'],
    ['Sellable quantity', '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e'],
    ['\u041e\u0442\u043a\u0440\u044b\u0442\u0438\u0435', 'Opening'],
    ['\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435', 'Closing'],
    ['\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'],
    ['\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Valid until'],
    ['\u041d\u0430\u0447\u0430\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u0446\u0438\u043a\u043b', 'Start commercial cycle'],
    ['\u0421\u0432\u044f\u0437\u044c', 'Relationship'],
    ['\u0426\u0438\u043a\u043b', 'Cycle'],
    ['\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0438\u043b\u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c SKU', 'Add or update SKU'],
    ['\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e', 'Quantity'],
    ['\u041e\u0442\u0441\u0440\u043e\u0447\u043a\u0430, \u0434\u043d\u0435\u0439', 'Payment terms, days'],
    ['\u041f\u0440\u0435\u0434\u043e\u043f\u043b\u0430\u0442\u0430, %', 'Prepayment, %'],
    ['\u041d\u0430\u0447\u0430\u043b\u043e \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Delivery start'],
    ['\u041a\u043e\u043d\u0435\u0446 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Delivery end'],
    ['\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0442\u043c\u0435\u043d\u044b', 'Cancellation reason'],
    ['Wholesale OS', '\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f wholesale-\u0441\u0438\u0441\u0442\u0435\u043c\u0430'],
  ]);

  const prefixPairs = Object.freeze([
    ['\u0417\u0430\u043f\u0440\u043e\u0441: ', 'Requested by: '],
    ['\u0428\u043e\u0443\u0440\u0443\u043c: ', 'Showroom: '],
    ['\u0414\u043e: ', 'Until: '],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: ', 'Campaign: '],
    ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ', 'Collection: '],
    ['\u041f\u0435\u0440\u0435\u0439\u0442\u0438: ', 'Move to: '],
    ['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c: ', 'Approve: '],
    ['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e: ', 'Approved by: '],
    ['\u041f\u0440\u0438\u0447\u0438\u043d\u0430: ', 'Reason: '],
    ['\u041e\u0442\u043c\u0435\u043d\u0451\u043d: ', 'Cancelled at: '],
    ['\u0417\u0430\u043a\u0430\u0437: ', 'Order: '],
    ['\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f: ', 'Organisation: '],
  ]);

  const exactMaps = Object.freeze({
    ru: new Map(phrasePairs.map(([ru, en]) => [en, ru])),
    en: new Map(phrasePairs.map(([ru, en]) => [ru, en])),
  });

  function normalizeLocale(value) {
    const locale = String(value || '').toLowerCase().split('-')[0];
    return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  }

  function readStoredLocale() {
    try { return global.localStorage?.getItem(STORAGE_KEY); }
    catch { return null; }
  }

  let currentLocale = normalizeLocale(readStoredLocale() || global.navigator?.language || DEFAULT_LOCALE);

  function interpolate(template, parameters) {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => parameters[key] === undefined ? match : String(parameters[key]));
  }

  function t(key, parameters = {}) {
    const value = messages[currentLocale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
    return interpolate(value, parameters);
  }

  function translate(value) {
    if (typeof value !== 'string' || value.length === 0) return value;
    const exact = exactMaps[currentLocale].get(value);
    if (exact) return exact;
    for (const [ruPrefix, enPrefix] of prefixPairs) {
      const targetPrefix = currentLocale === 'ru' ? ruPrefix : enPrefix;
      const sourcePrefixes = currentLocale === 'ru' ? [enPrefix, ruPrefix] : [ruPrefix, enPrefix];
      for (const sourcePrefix of sourcePrefixes) if (value.startsWith(sourcePrefix)) return targetPrefix + value.slice(sourcePrefix.length);
    }
    if (currentLocale === 'en') {
      const payment = value.match(/^(.*), \u043e\u043f\u043b\u0430\u0442\u0430 (\d+) \u0434\u043d\.$/);
      if (payment) return `${payment[1]}, payment ${payment[2]} days`;
    }
    if (currentLocale === 'ru') {
      const payment = value.match(/^(.*), payment (\d+) days$/);
      if (payment) return `${payment[1]}, \u043e\u043f\u043b\u0430\u0442\u0430 ${payment[2]} \u0434\u043d.`;
    }
    return value;
  }

  function localeTag() { return currentLocale === 'ru' ? 'ru-RU' : 'en-GB'; }

  function formatDate(value) {
    if (!value) return '\u2014';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    return new Intl.DateTimeFormat(localeTag(), {
      dateStyle: 'medium',
      timeStyle: String(value).includes('T') ? 'short' : undefined,
    }).format(date);
  }

  function formatNumber(value, options = {}) {
    return new Intl.NumberFormat(localeTag(), options).format(Number(value || 0));
  }

  function applyDocumentLocale() {
    if (global.document?.documentElement) global.document.documentElement.lang = currentLocale;
    if (global.document) global.document.title = t('document.title');
  }

  function setLocale(value) {
    const nextLocale = normalizeLocale(value);
    const changed = nextLocale !== currentLocale;
    currentLocale = nextLocale;
    try { global.localStorage?.setItem(STORAGE_KEY, currentLocale); } catch {}
    applyDocumentLocale();
    if (changed && typeof global.dispatchEvent === 'function') {
      const event = typeof global.CustomEvent === 'function'
        ? new global.CustomEvent('syntha:locale-changed', { detail: { locale: currentLocale } })
        : { type: 'syntha:locale-changed', detail: { locale: currentLocale } };
      global.dispatchEvent(event);
    }
    return currentLocale;
  }

  function diagnostics() {
    const localeKeys = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, Object.keys(messages[locale]).sort()]));
    const reference = localeKeys[DEFAULT_LOCALE];
    const missing = {};
    for (const locale of SUPPORTED_LOCALES) missing[locale] = reference.filter(key => !localeKeys[locale].includes(key));
    return Object.freeze({ locales: [...SUPPORTED_LOCALES], locale: currentLocale, missing, phraseCount: phrasePairs.length });
  }

  global.SynthaI18n = Object.freeze({
    getLocale: () => currentLocale,
    setLocale,
    t,
    translate,
    formatDate,
    formatNumber,
    localeTag,
    diagnostics,
  });

  applyDocumentLocale();
})(window);
