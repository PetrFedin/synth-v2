const TOKEN_KEY = 'syntha-v2-session';
const STAGES = ['campaign','collection','showroom','selection','order-builder','order','confirmation','deal-space'];
const NAV = [
  ['overview','\u041e\u0431\u0437\u043e\u0440'], ['partners','\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b'], ['catalog','\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438'], ['showrooms','\u0428\u043e\u0443\u0440\u0443\u043c\u044b'],
  ['selections','Selection'], ['orders','\u0417\u0430\u043a\u0430\u0437\u044b'], ['calendar','\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c'], ['notifications','\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f'],
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


async function boot() {
  if (!state.token) return renderLogin();
  try { await reload(); renderApp(); }
  catch { clearSession(); renderLogin('\u0421\u0435\u0441\u0441\u0438\u044f \u043d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u044c\u043d\u0430. \u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0441\u043d\u043e\u0432\u0430.'); }
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
  card.append(brandBlock(), el('p', { className: 'muted', text: '\u0410\u0432\u0442\u043e\u043d\u043e\u043c\u043d\u044b\u0439 wholesale workspace. \u0421\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u0430\u044f PostgreSQL-\u0441\u0435\u0441\u0441\u0438\u044f, \u0431\u0435\u0437 \u0432\u043d\u0435\u0448\u043d\u0435\u0433\u043e identity provider.' }));
  if (message) card.append(notice(message, 'error'));
  const form = el('form');
  const email = inputField('Email', 'email', { name: 'email', autocomplete: 'username', required: true, value: 'owner@syntha.local' });
  const password = inputField('\u041f\u0430\u0440\u043e\u043b\u044c', 'password', { name: 'password', autocomplete: 'current-password', required: true, minlength: '12' });
  const submit = el('button', { className: 'button primary', text: '\u0412\u043e\u0439\u0442\u0438', type: 'submit' });
  form.append(email.label, password.label, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setButtonBusy(submit, true, '\u0412\u0445\u043e\u0434\u0438\u043c\u2026');
    try {
      const data = await api('/v2/auth/login', { method: 'POST', body: { email: email.control.value, password: password.control.value }, anonymous: true });
      state.token = data.accessToken;
      sessionStorage.setItem(TOKEN_KEY, state.token);
      await reload();
      renderApp();
    } catch (error) { showInlineError(form, error.message); }
    finally { setButtonBusy(submit, false, '\u0412\u043e\u0439\u0442\u0438'); }
  });
  card.append(form, el('p', { className: 'login-hint', text: '\u041f\u0435\u0440\u0432\u044b\u0439 \u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439 npm run bootstrap:owner.' }));
  wrap.append(card); root.append(wrap);
}

function renderApp() {
  clear(root);
  const shell = el('div', { className: 'shell' });
  const sidebar = el('aside', { className: 'sidebar' });
  sidebar.append(brandBlock());
  const nav = el('nav', { className: 'nav', ariaLabel: '\u0420\u0430\u0437\u0434\u0435\u043b\u044b' });
  for (const [id, label] of NAV) {
    const button = el('button', { text: label, className: state.view === id ? 'active' : '' });
    button.addEventListener('click', () => { state.view = id; renderApp(); });
    nav.append(button);
  }
  const footer = el('div', { className: 'sidebar-footer' });
  const refresh = el('button', { className: 'button', text: '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c' });
  refresh.addEventListener('click', () => runAction(async () => { await reload(); renderApp(); }, refresh));
  const logout = el('button', { className: 'button danger', text: '\u0412\u044b\u0439\u0442\u0438' });
  logout.addEventListener('click', () => runAction(async () => {
    await api('/v2/auth/logout', { method: 'POST' }).catch(() => null);
    clearSession(); renderLogin();
  }, logout));
  footer.append(refresh, logout); sidebar.append(nav, footer);

  const main = el('main', { className: 'main' });
  const topbar = el('header', { className: 'topbar' });
  const heading = el('div');
  heading.append(el('p', { className: 'eyebrow', text: 'Syntha V2 / PostgreSQL' }), el('h2', { text: viewTitle(state.view) }), el('p', { className: 'muted', text: `${state.user?.displayName || state.user?.email || '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c'} \u00b7 ${ownOrganisationNames().join(', ') || '\u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430'}` }));
  topbar.append(heading, statusBadge('online'));
  main.append(topbar, renderView());
  shell.append(sidebar, main); root.append(shell, dialogHost(), el('div', { id: 'toast', className: 'toast' }));
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

