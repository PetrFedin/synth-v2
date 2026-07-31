const TOKEN_KEY = 'syntha-v2-session';
const I18N = window.SynthaI18n;
const STAGES = ['campaign','collection','showroom','selection','order-builder','order','confirmation','deal-space'];
const NAV = [
  ['overview','nav.overview'], ['partners','nav.partners'], ['catalog','nav.catalog'], ['showrooms','nav.showrooms'],
  ['selections','nav.selections'], ['orders','nav.orders'], ['calendar','nav.calendar'], ['notifications','nav.notifications'],
];

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  user: null,
  workspace: emptyWorkspace(),
  notifications: [],
  view: 'overview',
  busy: false,
};
const root = document.querySelector('#app');

window.addEventListener('syntha:locale-changed', () => {
  if (state.token && state.user) renderApp();
  else renderLogin();
});

async function boot() {
  if (!state.token) return renderLogin();
  try { await reload(); renderApp(); }
  catch { clearSession(); renderLogin(I18N.t('auth.sessionInvalid')); }
}

async function reload() {
  const [me, workspace, notifications] = await Promise.all([
    api('/v2/auth/me'), api('/v2/workspace'), api('/v2/notifications').catch(() => []),
  ]);
  state.user = me;
  state.workspace = { ...emptyWorkspace(), ...workspace };
  state.notifications = Array.isArray(notifications) ? notifications : [];
}

function renderLogin(message = '') {
  clear(root);
  const wrap = el('main', { className: 'login-wrap' });
  const card = el('section', { className: 'card login' });
  card.append(languageSwitcher(), brandBlock(), el('p', { className: 'muted', text: I18N.t('auth.description') }));
  if (message) card.append(notice(message, 'error'));
  const form = el('form');
  const email = inputField('Email', 'email', { name: 'email', autocomplete: 'username', required: true, value: 'owner@syntha.local' });
  const password = inputField(I18N.t('auth.password'), 'password', { name: 'password', autocomplete: 'current-password', required: true, minlength: '12' });
  const submit = el('button', { className: 'button primary', text: I18N.t('auth.signIn'), type: 'submit' });
  form.append(email.label, password.label, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setButtonBusy(submit, true, I18N.t('auth.signingIn'));
    try {
      const data = await api('/v2/auth/login', { method: 'POST', body: { email: email.control.value, password: password.control.value }, anonymous: true });
      state.token = data.accessToken;
      sessionStorage.setItem(TOKEN_KEY, state.token);
      await reload();
      renderApp();
    } catch (error) { showInlineError(form, error.message); }
    finally { setButtonBusy(submit, false, I18N.t('auth.signIn')); }
  });
  card.append(form, el('p', { className: 'login-hint', text: I18N.t('auth.bootstrapHint') }));
  wrap.append(card); root.append(wrap);
}

function renderApp() {
  clear(root);
  const shell = el('div', { className: 'shell' });
  const sidebar = el('aside', { className: 'sidebar' });
  sidebar.append(brandBlock());
  const nav = el('nav', { className: 'nav', ariaLabel: I18N.translate('\u0420\u0430\u0437\u0434\u0435\u043b\u044b') });
  for (const [id, labelKey] of NAV) {
    const button = el('button', { text: I18N.t(labelKey), className: state.view === id ? 'active' : '' });
    button.addEventListener('click', () => { state.view = id; renderApp(); });
    nav.append(button);
  }
  const footer = el('div', { className: 'sidebar-footer' });
  const refresh = el('button', { className: 'button', text: I18N.t('common.refresh') });
  refresh.addEventListener('click', () => runAction(async () => { await reload(); renderApp(); }, refresh));
  const logout = el('button', { className: 'button danger', text: I18N.t('common.logout') });
  logout.addEventListener('click', () => runAction(async () => {
    await api('/v2/auth/logout', { method: 'POST' }).catch(() => null);
    clearSession(); renderLogin();
  }, logout));
  footer.append(languageSwitcher(), refresh, logout); sidebar.append(nav, footer);

  const main = el('main', { className: 'main' });
  const topbar = el('header', { className: 'topbar' });
  const heading = el('div');
  heading.append(
    el('p', { className: 'eyebrow', text: 'Syntha V2 / PostgreSQL' }),
    el('h2', { text: viewTitle(state.view) }),
    el('p', { className: 'muted', text: `${state.user?.displayName || state.user?.email || I18N.t('common.user')} \u00b7 ${ownOrganisationNames().join(', ') || I18N.t('common.noOrganisation')}` }),
  );
  topbar.append(heading, statusBadge('online'));
  main.append(topbar, renderView());
  shell.append(sidebar, main); root.append(shell, dialogHost(), el('div', { id: 'toast', className: 'toast' }));
}

function languageSwitcher() {
  const group = el('div', { className: 'language-switcher', role: 'group', ariaLabel: I18N.t('language.selector') });
  for (const locale of ['ru', 'en']) {
    const button = el('button', {
      className: `language-option ${I18N.getLocale() === locale ? 'active' : ''}`,
      type: 'button',
      text: locale.toUpperCase(),
      title: I18N.t(`language.${locale}`),
      ariaPressed: I18N.getLocale() === locale ? 'true' : 'false',
    });
    button.addEventListener('click', () => I18N.setLocale(locale));
    group.append(button);
  }
  return group;
}

function renderView() {
  switch (state.view) {
    case 'partners': return renderPartners();
    case 'catalog': return renderCatalog();
    case 'showrooms': return renderShowrooms();
    case 'selections': return renderSelections();
    case 'orders': return renderOrders();
    case 'calendar': return renderCalendar();
    case 'notifications': return renderNotifications();
    default: return renderOverview();
  }
}
