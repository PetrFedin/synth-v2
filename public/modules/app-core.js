const TOKEN_KEY = 'syntha-v2-session';
const SIDEBAR_KEY = 'syntha-v2-sidebar-collapsed';
const I18N = window.SynthaI18n;
const STAGES = ['campaign','collection','showroom','selection','order-builder','order','confirmation','deal-space'];
const NAV_GROUPS = Object.freeze([
  { label: null, items: [['overview','nav.overview','overview']] },
  { label: ['\u0420\u0410\u0417\u0420\u0410\u0411\u041e\u0422\u041a\u0410','DEVELOPMENT'], items: [['catalog','nav.catalog','catalog']] },
  { label: ['\u041e\u041f\u0422\u041e\u0412\u0410\u042f \u041a\u041e\u041c\u041c\u0415\u0420\u0426\u0418\u042f','WHOLESALE COMMERCE'], items: [
    ['showrooms','nav.showrooms','showrooms'],
    ['partners','nav.partners','partners'],
    ['selections','nav.selections','selections'],
    ['orders','nav.orders','orders'],
  ] },
  { label: ['\u0423\u041f\u0420\u0410\u0412\u041b\u0415\u041d\u0418\u0415','MANAGEMENT'], items: [
    ['calendar','nav.calendar','calendar'],
    ['notifications','nav.notifications','notifications'],
  ] },
]);
const NAV = NAV_GROUPS.flatMap(group => group.items);

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  user: null,
  workspace: emptyWorkspace(),
  notifications: [],
  view: 'overview',
  busy: false,
  sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === 'true',
};
const root = document.querySelector('#app');
let workspaceHydrating = false;
const workspacePaging = window.SynthaWorkspacePaging.create({
  request: (path, options) => api(path, options),
  getWorkspace: () => state.workspace,
  setWorkspace: workspace => { state.workspace = workspace; },
  onChange: () => {
    if (!workspaceHydrating && state.token && state.user) renderApp();
  },
  onError: error => {
    if (!workspaceHydrating && state.token && state.user) toast(error.message, 'error');
  },
  pageLimit: 100,
});
window.SynthaWorkspaceController = workspacePaging;

window.addEventListener('syntha:locale-changed', () => {
  if (state.token && state.user) renderApp();
  else renderLogin();
});

async function boot() {
  if (!state.token) return renderLogin();
  try { await reload(); renderApp(); }
  catch (error) {
    if (error?.status === 401) {
      clearSession();
      renderLogin(I18N.t('auth.sessionInvalid'));
    } else {
      renderStartupFailure(error);
    }
  }
}

async function reload() {
  workspacePaging.abortAll();
  const previous = { user: state.user, workspace: state.workspace, notifications: state.notifications };
  workspaceHydrating = true;
  try {
    const [me, workspace, notifications] = await Promise.all([
      api('/v2/auth/me'), api('/v2/workspace'), api('/v2/notifications').catch(() => []),
    ]);
    state.workspace = { ...emptyWorkspace(), ...workspace };
    workspacePaging.reset(state.workspace);
    const foundationReady = await Promise.all([
      workspacePaging.drain('memberships', { maxPages: 50 }),
      workspacePaging.drain('organisations', { maxPages: 50 }),
    ]);
    if (!foundationReady.every(Boolean)) throw workspaceFoundationError();
    state.user = me;
    state.notifications = Array.isArray(notifications) ? notifications : [];
  } catch (error) {
    state.user = previous.user;
    state.workspace = previous.workspace;
    state.notifications = previous.notifications;
    workspacePaging.reset(state.workspace);
    throw error;
  } finally {
    workspaceHydrating = false;
  }
}

function renderStartupFailure(error) {
  clear(root);
  const wrap = el('main', { className: 'login-wrap' });
  const card = el('section', { className: 'card login' });
  card.append(
    languageSwitcher(),
    brandBlock(),
    notice(error?.message || localText('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c Workspace.', 'Workspace could not be loaded.'), 'error'),
  );
  const actions = el('div', { className: 'row' });
  const retry = el('button', { className: 'button primary', rawText: localText('\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c', 'Retry'), type: 'button' });
  retry.addEventListener('click', async () => {
    setButtonBusy(retry, true, localText('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026'));
    try { await reload(); renderApp(); }
    catch (retryError) { renderStartupFailure(retryError); }
  });
  const signOut = el('button', { className: 'button', rawText: localText('\u0412\u044b\u0439\u0442\u0438', 'Sign out'), type: 'button' });
  signOut.addEventListener('click', () => { clearSession(); renderLogin(); });
  actions.append(retry, signOut);
  card.append(actions);
  wrap.append(card);
  root.append(wrap);
}

function workspaceFoundationError() {
  const error = new Error('WORKSPACE_FOUNDATION_INCOMPLETE: Membership and organisation context could not be loaded completely');
  error.code = 'WORKSPACE_FOUNDATION_INCOMPLETE';
  return error;
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
  form.addEventListener('submit', async event => {
    event.preventDefault();
    setButtonBusy(submit, true, I18N.t('auth.signingIn'));
    try {
      const data = await api('/v2/auth/login', { method: 'POST', body: { email: email.control.value, password: password.control.value }, anonymous: true });
      state.token = data.accessToken;
      sessionStorage.setItem(TOKEN_KEY, state.token);
      await reload();
      renderApp();
    } catch (error) {
      if (state.token) renderStartupFailure(error);
      else showInlineError(form, error.message);
    } finally {
      if (submit.isConnected) setButtonBusy(submit, false, I18N.t('auth.signIn'));
    }
  });
  card.append(form, el('p', { className: 'login-hint', text: I18N.t('auth.bootstrapHint') }));
  wrap.append(card);
  root.append(wrap);
}

function renderApp() {
  clear(root);
  const shell = el('div', { className: `shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}`.trim() });
  const sidebar = el('aside', { className: 'sidebar' });
  sidebar.append(brandBlock());

  const nav = el('nav', { className: 'nav', ariaLabel: I18N.translate('\u0420\u0430\u0437\u0434\u0435\u043b\u044b') });
  for (const group of NAV_GROUPS) {
    if (group.label) nav.append(el('div', { className: 'nav-group-label', rawText: localText(group.label[0], group.label[1]) }));
    for (const [id, labelKey, iconName] of group.items) {
      const button = el('button', {
        className: `nav-item ${state.view === id ? 'active' : ''}`.trim(),
        type: 'button',
        title: I18N.t(labelKey),
        ariaPressed: state.view === id ? 'true' : 'false',
      });
      button.append(icon(iconName), el('span', { className: 'nav-label', text: I18N.t(labelKey) }));
      button.addEventListener('click', () => { state.view = id; renderApp(); });
      nav.append(button);
    }
  }

  const footer = el('div', { className: 'sidebar-footer' });
  footer.append(languageSwitcher());
  const refresh = sidebarButton('refresh', I18N.t('common.refresh'));
  refresh.addEventListener('click', () => runAction(async () => { await reload(); renderApp(); }, refresh));
  const logout = sidebarButton('logout', I18N.t('common.logout'), 'danger');
  logout.addEventListener('click', () => runAction(async () => {
    await api('/v2/auth/logout', { method: 'POST' }).catch(() => null);
    clearSession();
    renderLogin();
  }, logout));
  const collapseLabel = state.sidebarCollapsed
    ? localText('\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043c\u0435\u043d\u044e','Expand menu')
    : localText('\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043c\u0435\u043d\u044e','Collapse menu');
  const collapse = sidebarButton(state.sidebarCollapsed ? 'expand' : 'collapse', collapseLabel);
  collapse.addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem(SIDEBAR_KEY, String(state.sidebarCollapsed));
    renderApp();
  });
  footer.append(refresh, logout, collapse);
  sidebar.append(nav, footer);

  const main = el('main', { className: 'main' });
  main.append(renderTopbar(), renderPageHeader());
  const content = el('section', { className: 'workspace-content' });
  content.append(renderView());
  main.append(content);

  shell.append(sidebar, main);
  root.append(shell, dialogHost(), el('div', { id: 'toast', className: 'toast' }));
  installSearchShortcut();
}

function renderTopbar() {
  const topbar = el('header', { className: 'topbar' });
  const breadcrumb = el('div', { className: 'breadcrumb' });
  breadcrumb.append(
    icon('back'),
    el('span', { className: 'breadcrumb-muted', rawText: 'SYNTHA' }),
    el('span', { className: 'breadcrumb-divider', rawText: '/' }),
    el('span', { className: 'breadcrumb-muted', rawText: viewSectionName(state.view) }),
    el('span', { className: 'breadcrumb-divider', rawText: '/' }),
    el('strong', { text: viewTitle(state.view) }),
  );

  const search = el('label', { className: 'global-search' });
  search.append(icon('search'));
  const input = el('input', {
    id: 'workspace-search',
    type: 'search',
    placeholder: localText('\u041f\u043e\u0438\u0441\u043a \u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u0440\u0430\u0437\u0434\u0435\u043b\u0435','Search current section'),
    ariaLabel: localText('\u041f\u043e\u0438\u0441\u043a \u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u0440\u0430\u0437\u0434\u0435\u043b\u0435','Search current section'),
  });
  input.addEventListener('input', () => filterCurrentView(input.value));
  search.append(input, el('kbd', { rawText: '\u2318K' }));

  const actions = el('div', { className: 'topbar-actions' });
  const unread = state.notifications.filter(item => item.status !== 'read').length;
  const notifications = el('button', {
    className: 'topbar-icon-button',
    type: 'button',
    title: I18N.t('nav.notifications'),
    ariaLabel: I18N.t('nav.notifications'),
  });
  notifications.append(icon('bell'));
  if (unread) notifications.append(el('span', { className: 'notification-count', rawText: String(unread) }));
  notifications.addEventListener('click', () => { state.view = 'notifications'; renderApp(); });

  const organisation = el('div', { className: 'topbar-organisation' });
  organisation.append(icon('building'), el('span', { rawText: ownOrganisationNames()[0] || I18N.t('common.noOrganisation') }));

  const displayName = state.user?.displayName || state.user?.email || I18N.t('common.user');
  const membership = state.workspace.memberships[0];
  const user = el('div', { className: 'topbar-user' });
  const userCopy = el('div', { className: 'user-copy' });
  userCopy.append(
    el('strong', { rawText: displayName }),
    el('small', { rawText: membership?.role || localText('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c','User') }),
  );
  user.append(el('span', { className: 'user-avatar', rawText: initials(displayName) }), userCopy);
  actions.append(notifications, organisation, user);
  topbar.append(breadcrumb, search, actions);
  return topbar;
}

function renderPageHeader() {
  const header = el('section', { className: 'page-header' });
  const title = el('div', { className: 'page-title' });
  title.append(
    el('p', { className: 'eyebrow', rawText: 'FASHION OPERATING SYSTEM' }),
    el('h2', { text: viewTitle(state.view) }),
    el('p', { className: 'muted', rawText: localText('\u0415\u0434\u0438\u043d\u043e\u0435 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0431\u0440\u0435\u043d\u0434\u0430, \u0440\u0435\u0442\u0435\u0439\u043b\u0435\u0440\u0430 \u0438 \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u043e\u0432','One workspace for brands, retailers and partners') }),
  );
  header.append(title, statusBadge('online'));
  return header;
}

function sidebarButton(iconName, label, variant = '') {
  const button = el('button', { className: `button sidebar-action ${variant}`.trim(), type: 'button', title: label, ariaLabel: label });
  button.append(icon(iconName), el('span', { className: 'button-label', rawText: label }));
  return button;
}

function localText(ru, en) { return I18N.getLocale() === 'en' ? en : ru; }
function initials(value) {
  return String(value || 'S').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'S';
}
function viewSectionName(view) {
  if (view === 'catalog') return localText('\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430','Development');
  if (['showrooms','partners','selections','orders'].includes(view)) return localText('\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u043a\u043e\u043c\u043c\u0435\u0440\u0446\u0438\u044f','Wholesale Commerce');
  if (['calendar','notifications'].includes(view)) return localText('\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435','Management');
  return localText('\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b','Workspace');
}

function installSearchShortcut() {
  window.onkeydown = event => {
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      document.querySelector('#workspace-search')?.focus();
    }
  };
}

function filterCurrentView(value) {
  const host = document.querySelector('.workspace-content');
  if (!host) return;
  const query = String(value || '').trim().toLocaleLowerCase();
  host.querySelectorAll('.stack').forEach(stack => {
    const entities = [...stack.querySelectorAll('.entity')];
    let visible = 0;
    entities.forEach(item => {
      const matches = !query || item.textContent.toLocaleLowerCase().includes(query);
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    stack.classList.toggle('search-empty-stack', Boolean(query) && entities.length > 0 && visible === 0);
  });
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
