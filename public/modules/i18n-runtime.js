(function initializeSynthaI18n(global) {
  'use strict';

  const STORAGE_KEY = 'syntha-v2-locale';
  const SUPPORTED = Object.freeze(['ru', 'en']);
  const DEFAULT = 'ru';
  const indexOf = locale => locale === 'en' ? 1 : 0;

  const messages = {
    'document.title': ['Syntha V2 \u2014 Wholesale workspace', 'Syntha V2 \u2014 Wholesale workspace'],
    'language.selector': ['\u042f\u0437\u044b\u043a \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430', 'Interface language'],
    'language.ru': ['\u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'Russian'],
    'language.en': ['English', 'English'],
    'nav.overview': ['\u041e\u0431\u0437\u043e\u0440', 'Overview'],
    'nav.partners': ['\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b', 'Partners'],
    'nav.catalog': ['\u041a\u0430\u0442\u0430\u043b\u043e\u0433', 'Catalog'],
    'nav.showrooms': ['\u0428\u043e\u0443\u0440\u0443\u043c\u044b', 'Showrooms'],
    'nav.selections': ['\u041e\u0442\u0431\u043e\u0440\u044b', 'Selections'],
    'nav.orders': ['\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'],
    'nav.calendar': ['\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Calendar'],
    'nav.notifications': ['\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', 'Notifications'],
    'common.user': ['\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c', 'User'],
    'common.noOrganisation': ['\u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430', 'no organisation assigned'],
    'common.refresh': ['\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c', 'Refresh'],
    'common.logout': ['\u0412\u044b\u0439\u0442\u0438', 'Sign out'],
    'common.processing': ['\u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f\u2026', 'Processing\u2026'],
    'common.operationComplete': ['\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u044f \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0430', 'Operation completed'],
    'common.close': ['\u0417\u0430\u043a\u0440\u044b\u0442\u044c', 'Close'],
    'common.save': ['\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Save'],
    'common.saving': ['\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026', 'Saving\u2026'],
    'common.changesSaved': ['\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b', 'Changes saved'],
    'common.unsavedChangesConfirm': ['\u0415\u0441\u0442\u044c \u043d\u0435\u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f. \u0417\u0430\u043a\u0440\u044b\u0442\u044c \u0444\u043e\u0440\u043c\u0443 \u0438 \u043f\u043e\u0442\u0435\u0440\u044f\u0442\u044c \u0438\u0445?', 'There are unsaved changes. Close the form and discard them?'],
    'common.savedRefreshFailed': ['\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b, \u043d\u043e \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c.', 'Changes were saved, but refreshing data failed.'],
    'common.requestError': ['\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430', 'Request failed'],
    'common.noData': ['\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445: {label}', 'No available data: {label}'],
    'auth.password': ['\u041f\u0430\u0440\u043e\u043b\u044c', 'Password'],
    'auth.signIn': ['\u0412\u043e\u0439\u0442\u0438', 'Sign in'],
    'auth.signingIn': ['\u0412\u0445\u043e\u0434\u0438\u043c\u2026', 'Signing in\u2026'],
    'auth.sessionInvalid': ['\u0421\u0435\u0441\u0441\u0438\u044f \u043d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u044c\u043d\u0430. \u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0441\u043d\u043e\u0432\u0430.', 'The session is no longer valid. Sign in again.'],
    'auth.sessionEnded': ['\u0421\u0435\u0441\u0441\u0438\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430.', 'The session has ended.'],
    'auth.description': ['\u0410\u0432\u0442\u043e\u043d\u043e\u043c\u043d\u043e\u0435 wholesale-\u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0441 \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0439 PostgreSQL-\u0441\u0435\u0441\u0441\u0438\u0435\u0439.', 'Autonomous wholesale workspace with a PostgreSQL-owned session.'],
    'auth.bootstrapHint': ['\u041f\u0435\u0440\u0432\u044b\u0439 \u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439 npm run bootstrap:owner.', 'Create the first owner with npm run bootstrap:owner.'],
    'form.cancelOrder': ['\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Cancel order'],
    'form.cancellationReason': ['\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0442\u043c\u0435\u043d\u044b', 'Cancellation reason'],
  };

  const statuses = {
    online: ['\u043e\u043d\u043b\u0430\u0439\u043d','online'], active: ['\u0430\u043a\u0442\u0438\u0432\u043d\u043e','active'], pending: ['\u043e\u0436\u0438\u0434\u0430\u0435\u0442','pending'],
    draft: ['\u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a','draft'], open: ['\u043e\u0442\u043a\u0440\u044b\u0442\u043e','open'], published: ['\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e','published'],
    accepted: ['\u043f\u0440\u0438\u043d\u044f\u0442\u043e','accepted'], ready: ['\u0433\u043e\u0442\u043e\u0432','ready'], attached: ['\u043f\u0440\u0438\u043a\u0440\u0435\u043f\u043b\u0451\u043d','attached'],
    cancelled: ['\u043e\u0442\u043c\u0435\u043d\u0451\u043d','cancelled'], read: ['\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e','read'],
  };
  const stages = {
    campaign: ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f','Campaign'], collection: ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f','Collection'], showroom: ['\u0428\u043e\u0443\u0440\u0443\u043c','Showroom'],
    selection: ['\u041e\u0442\u0431\u043e\u0440','Selection'], 'order-builder': ['\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0442\u043e\u0440 \u0437\u0430\u043a\u0430\u0437\u0430','Order Builder'],
    order: ['\u0417\u0430\u043a\u0430\u0437','Order'], confirmation: ['\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435','Confirmation'], 'deal-space': ['DealSpace','DealSpace'],
  };
  for (const [key, pair] of Object.entries(statuses)) messages[`status.${key}`] = pair;
  for (const [key, pair] of Object.entries(stages)) messages[`stage.${key}`] = pair;
  Object.freeze(messages);

  const pairs = Object.freeze([
    ['\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f','Untitled'], ['\u0420\u0430\u0437\u0434\u0435\u043b\u044b','Sections'],
    ['\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0432\u044f\u0437\u0438','Active relationships'], ['\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 \u0446\u0438\u043a\u043b\u044b','Open cycles'],
    ['\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 pipeline','Commercial pipeline'], ['\u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f','Upcoming events'],
    ['\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f','Latest notifications'],
    ['\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b \u0435\u0449\u0451 \u043d\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u044b.','No commercial cycles yet.'],
    ['\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442.','The calendar is empty.'], ['\u041d\u043e\u0432\u044b\u0445 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043d\u0435\u0442.','No new notifications.'],
    ['\u0422\u043e\u0440\u0433\u043e\u0432\u044b\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b','Trade relationships and access'], ['\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c','Request relationship'],
    ['\u041e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f','Relationships'], ['\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f \u0432 \u0448\u043e\u0443\u0440\u0443\u043c\u044b','Showroom invitations'],
    ['\u041d\u0435\u0442 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0439 \u0441 \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430\u043c\u0438.','No counterparty relationships.'], ['\u041d\u0435\u0442 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0439.','No invitations.'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438, \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u0438 SKU','Campaigns, collections and SKUs'], ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e','Create campaign'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438','Campaigns'], ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438','Collections'], ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e','Create collection'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU','Create SKU'], ['\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c SKU','Edit SKU'], ['\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c','Edit'], ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No campaigns yet.'], ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No collections yet.'],
    ['\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 SKU \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No available SKUs yet.'], ['\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c','Publish'],
    ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u043e\u0443\u0440\u0443\u043c','Create showroom'], ['\u0420\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0448\u043e\u0443\u0440\u0443\u043c\u043e\u0432','Showroom workspace'],
    ['\u0428\u043e\u0443\u0440\u0443\u043c\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No showrooms yet.'], ['\u041d\u0430\u0447\u0430\u0442\u044c \u0446\u0438\u043a\u043b','Start cycle'],
    ['\u041e\u0442\u0431\u043e\u0440 \u0437\u0430\u043a\u0443\u043f\u0449\u0438\u043a\u0430','Buyer Selection'], ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection','Create selection'], ['\u041e\u0442\u0431\u043e\u0440\u044b','Selections'], ['Selections \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No selections yet.'],
    ['Order Builder \u0438 DealSpace','Order Builder and DealSpace'], ['\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437','Create order'], ['\u0417\u0430\u043a\u0430\u0437\u044b','Orders'], ['\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No orders yet.'],
    ['\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445 \u0441\u0434\u0435\u043b\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No confirmed deals yet.'], ['\u041e\u0431\u0449\u0438\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c','Shared calendar'],
    ['\u0421\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No events yet.'], ['\u0426\u0435\u043d\u0442\u0440 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439','Notification Center'], ['\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No notifications yet.'],
    ['\u041f\u0440\u0438\u043d\u044f\u0442\u044c','Accept'], ['\u041e\u0442\u043a\u0440\u044b\u0442\u044c','Open'], ['\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d','Invite shop'], ['\u041e\u0442\u043a\u0440\u044b\u0442\u044c DealSpace','Open DealSpace'],
    ['\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c SKU','Add SKU'], ['\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c','Submit'], ['\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443','Attach to cycle'], ['\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437','Cancel order'],
    ['\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e','Mark as read'], ['\u0421\u0442\u0440\u043e\u043a \u043d\u0435\u0442','No lines'], ['\u043d\u0435\u0442','none'],
    ['\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0442\u043e\u0440\u0433\u043e\u0432\u043e\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0435','Request trade relationship'], ['\u0412\u0430\u0448\u0430 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f','Your organisation'],
    ['ID \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430','Counterparty ID'], ['\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430','Organisation not found'],
    ['\u0411\u0440\u0435\u043d\u0434','Brand'], ['\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435','Name'], ['\u0421\u0435\u0437\u043e\u043d','Season'], ['\u041d\u0430\u0447\u0430\u043b\u043e','Start'], ['\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435','End'],
    ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f','Campaign'], ['\u0412\u0430\u043b\u044e\u0442\u0430','Currency'], ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f','Collection'], ['\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u0446\u0435\u043d\u0430','Wholesale price'], ['\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e','Sellable quantity'],
    ['\u041e\u0442\u043a\u0440\u044b\u0442\u0438\u0435','Opening'], ['\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435','Closing'], ['\u041c\u0430\u0433\u0430\u0437\u0438\u043d','Shop'], ['\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e','Valid until'],
    ['\u041d\u0430\u0447\u0430\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u0446\u0438\u043a\u043b','Start commercial cycle'], ['\u0421\u0432\u044f\u0437\u044c','Relationship'], ['\u0426\u0438\u043a\u043b','Cycle'],
    ['\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0438\u043b\u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c SKU','Add or update SKU'], ['\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e','Quantity'], ['\u041e\u0442\u0441\u0440\u043e\u0447\u043a\u0430, \u0434\u043d\u0435\u0439','Payment terms, days'],
    ['\u041f\u0440\u0435\u0434\u043e\u043f\u043b\u0430\u0442\u0430, %','Prepayment, %'], ['\u041d\u0430\u0447\u0430\u043b\u043e \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438','Delivery start'], ['\u041a\u043e\u043d\u0435\u0446 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438','Delivery end'],
    ['\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0442\u043c\u0435\u043d\u044b','Cancellation reason'], ['\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f wholesale-\u0441\u0438\u0441\u0442\u0435\u043c\u0430','Wholesale OS'],
  ]);

  const prefixes = Object.freeze([
    ['\u0417\u0430\u043f\u0440\u043e\u0441: ','Requested by: '], ['\u0428\u043e\u0443\u0440\u0443\u043c: ','Showroom: '], ['\u0414\u043e: ','Until: '], ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: ','Campaign: '],
    ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ','Collection: '], ['\u041f\u0435\u0440\u0435\u0439\u0442\u0438: ','Move to: '], ['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c: ','Approve: '],
    ['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e: ','Approved by: '], ['\u041f\u0440\u0438\u0447\u0438\u043d\u0430: ','Reason: '], ['\u041e\u0442\u043c\u0435\u043d\u0451\u043d: ','Cancelled at: '],
    ['\u0417\u0430\u043a\u0430\u0437: ','Order: '], ['\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f: ','Organisation: '],
  ]);

  function normalize(value) { const locale = String(value || '').toLowerCase().split('-')[0]; return SUPPORTED.includes(locale) ? locale : DEFAULT; }
  function readStored() { try { return global.localStorage?.getItem(STORAGE_KEY); } catch { return null; } }
  let current = normalize(readStored() || global.navigator?.language || DEFAULT);
  function interpolate(template, parameters) { return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => parameters[key] === undefined ? match : String(parameters[key])); }
  function t(key, parameters = {}) { const pair = messages[key]; return pair ? interpolate(pair[indexOf(current)], parameters) : key; }
  function translate(value) {
    if (typeof value !== 'string' || !value) return value;
    const target = indexOf(current);
    for (const pair of pairs) if (value === pair[0] || value === pair[1]) return pair[target];
    for (const pair of prefixes) {
      const source = value.startsWith(pair[0]) ? 0 : value.startsWith(pair[1]) ? 1 : -1;
      if (source >= 0) return pair[target] + translate(value.slice(pair[source].length));
    }
    if (current === 'en') {
      const payment = value.match(/^(.*), \u043e\u043f\u043b\u0430\u0442\u0430 (\d+) \u0434\u043d\.$/);
      if (payment) return `${payment[1]}, payment ${payment[2]} days`;
    }
    if (current === 'ru') {
      const payment = value.match(/^(.*), payment (\d+) days$/);
      if (payment) return `${payment[1]}, \u043e\u043f\u043b\u0430\u0442\u0430 ${payment[2]} \u0434\u043d.`;
    }
    return value;
  }
  function localeTag() { return current === 'ru' ? 'ru-RU' : 'en-GB'; }
  function formatDate(value) { if (!value) return '\u2014'; const date = new Date(value); if (Number.isNaN(date.valueOf())) return String(value); return new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: String(value).includes('T') ? 'short' : undefined }).format(date); }
  function formatNumber(value, options = {}) { return new Intl.NumberFormat(localeTag(), options).format(Number(value || 0)); }
  function applyDocument() { if (global.document?.documentElement) global.document.documentElement.lang = current; if (global.document) global.document.title = t('document.title'); }
  function setLocale(value) { const next = normalize(value); const changed = next !== current; current = next; try { global.localStorage?.setItem(STORAGE_KEY, current); } catch {} applyDocument(); if (changed && typeof global.dispatchEvent === 'function') { const event = typeof global.CustomEvent === 'function' ? new global.CustomEvent('syntha:locale-changed', { detail: { locale: current } }) : { type: 'syntha:locale-changed', detail: { locale: current } }; global.dispatchEvent(event); } return current; }
  function diagnostics() { return Object.freeze({ locales: [...SUPPORTED], locale: current, messageCount: Object.keys(messages).length, phraseCount: pairs.length, invalidMessageKeys: Object.entries(messages).filter(([, pair]) => !Array.isArray(pair) || pair.length !== 2).map(([key]) => key), invalidPhraseCount: pairs.filter(pair => !Array.isArray(pair) || pair.length !== 2).length }); }

  global.SynthaI18n = Object.freeze({ getLocale: () => current, setLocale, t, translate, formatDate, formatNumber, localeTag, diagnostics });
  applyDocument();
})(window);
