// Команда: кто работает в организации, с какой ролью и может ли он ещё входить.
//
// Экран живёт во вкладке «Команда» раздела «Контрагенты и доступы» (`renderPartners()` в
// omnidata-workspace.js); здесь только данные, формы и действия. Видят его и пользуются им те, у
// кого есть право `membership.manage`: состав с адресами почты и статусами — не то, что показывают
// каждому участнику.
//
// Данные подгружаются лениво по организациям, как у юридических лиц: список организаций короткий,
// а состав нужен только тем, кто им управляет. После каждого действия кэш организации сбрасывается —
// версия членства в нём устарела, а следующее действие обязано отправить свежую.
const teamState = window.SynthaTeamState
  || (window.SynthaTeamState = { data: {}, loading: {}, failed: {} });

const TEAM_ROLE_LABELS = Object.freeze({
  owner: ['Владелец', 'Owner'], admin: ['Администратор', 'Administrator'], sales: ['Продажи', 'Sales'],
  production: ['Производство', 'Production'], quality: ['Качество', 'Quality'], finance: ['Финансы', 'Finance'],
  buyer: ['Байер', 'Buyer'], viewer: ['Наблюдатель', 'Viewer'],
});
const TEAM_ROLES_BY_ORGANISATION_TYPE = Object.freeze({
  brand: ['admin', 'sales', 'production', 'quality', 'finance', 'viewer'],
  shop: ['admin', 'buyer', 'finance', 'viewer'],
});

function teamRoleLabel(role) {
  const pair = TEAM_ROLE_LABELS[role];
  return pair ? localText(pair[0], pair[1]) : String(role || '—');
}

function teamManageableOrganisations() {
  const caps = window.SynthaUiCapabilities;
  const allowedIds = new Set(caps.organisationIds(state.workspace, caps.CAPABILITIES.MEMBERSHIP_MANAGE));
  return ownOrganisations().filter((item) => allowedIds.has(item.id));
}

function loadTeam(organisationId) {
  if (teamState.data[organisationId] || teamState.loading[organisationId] || teamState.failed[organisationId]) return;
  teamState.loading[organisationId] = true;
  api(`/v2/organisations/${encodeURIComponent(organisationId)}/team`)
    .then((value) => { teamState.data[organisationId] = value; })
    .catch(() => { teamState.failed[organisationId] = true; })
    .finally(() => { teamState.loading[organisationId] = false; if (state.view === 'partners') renderApp(); });
}

function teamInvalidate(organisationId) {
  delete teamState.data[organisationId];
  delete teamState.failed[organisationId];
}

/** Строки по всем организациям, которыми можно управлять; загрузка запускается побочным эффектом. */
function teamRows() {
  const owned = teamManageableOrganisations();
  owned.forEach((org) => loadTeam(org.id));
  return owned.flatMap((org) => {
    const roster = teamState.data[org.id];
    return (roster?.items || []).map((item) => ({
      ...item, organisationId: org.id, orgName: org.name || org.id, actor: roster.actor, assignableRoles: roster.assignableRoles,
    }));
  });
}

function teamPersonName(item) { return item.displayName || item.email || item.userId; }

function teamStateLabel(item) {
  if (item.status === 'inactive') return localText('Отключён', 'Disabled');
  if (item.invitePending) return localText('Ждёт пароль', 'Awaiting password');
  return localText('Активен', 'Active');
}

function teamStateBadge(item) {
  const tone = item.status === 'inactive' ? 'revoked' : item.invitePending ? 'pending' : 'active';
  return el('span', { className: `badge ${tone}`, rawText: teamStateLabel(item) });
}

// Одноразовый токен показывается один раз: сервер нигде не хранит его открытым, а почтового канала
// нет, поэтому передать его человеку должен тот, кто приглашал.
function teamShowInviteToken(item, invite) {
  if (!invite?.token) return;
  const dialog = el('dialog', { className: 'app-confirm' });
  const form = el('form', { method: 'dialog' });
  const heading = el('header');
  heading.append(el('h2', { rawText: localText('Токен приглашения', 'Invitation token') }));
  const body = el('div', { className: 'app-confirm-question' });
  body.append(
    el('p', { rawText: localText(
      `Передайте токен сотруднику «${teamPersonName(item)}» лично. Он показывается один раз и нигде не сохраняется; по нему сотрудник задаёт пароль на странице входа («Принять приглашение»).`,
      `Hand the token to "${teamPersonName(item)}" in person. It is shown once and is not stored anywhere; they use it on the sign-in page ("Accept invitation") to set a password.`,
    ) }),
  );
  const field = el('input', { type: 'text', value: invite.token, readOnly: true, name: 'inviteToken' });
  field.addEventListener('focus', () => field.select());
  body.append(field);
  if (invite.expiresAt) body.append(el('p', { className: 'muted', rawText: localText(`Действует до ${formatDate(invite.expiresAt)}.`, `Valid until ${formatDate(invite.expiresAt)}.`) }));
  const footer = el('footer');
  const copy = el('button', { className: 'button secondary', type: 'button', rawText: localText('Скопировать', 'Copy') });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(invite.token); toast(localText('Токен скопирован.', 'Token copied.'), 'success'); }
    catch { field.select(); toast(localText('Выделите токен и скопируйте вручную.', 'Select the token and copy it manually.'), 'error'); }
  });
  const done = el('button', { className: 'button primary', type: 'submit', rawText: I18N.t('common.close') });
  footer.append(copy, done);
  form.append(heading, body, footer);
  dialog.append(form);
  // Состав в кэше сброшен действием, которое выдало токен; перерисовка запускает его перечитывание.
  dialog.addEventListener('close', () => { dialog.remove(); if (state.token) renderApp(); }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  field.focus();
}

function teamMutate(item, action, body) {
  return mutate(`/v2/organisations/${encodeURIComponent(item.organisationId)}/team/${encodeURIComponent(item.userId)}/${action}`, body)
    .then((result) => { teamInvalidate(item.organisationId); return result; });
}

function teamChangeRoleForm(item) {
  const roles = (item.assignableRoles || []).filter((role) => role !== item.role);
  openForm(localText('Сменить роль', 'Change role'), [
    selectDef('role', localText('Новая роль', 'New role'), roles, (role) => teamRoleLabel(role), roles[0]),
  ], (values) => teamMutate(item, 'role', { role: values.role, expectedVersion: item.version }));
}

function teamActions(item) {
  const caps = window.SynthaUiCapabilities;
  if (!caps.hasForOrganisation(state.workspace, item.organisationId, caps.CAPABILITIES.MEMBERSHIP_MANAGE)) return [];
  // Владельца трогает только владелец: сервер откажет остальным, а кнопка, которая заведомо
  // отвечает отказом, — не действие.
  if (item.role === 'owner' && item.actor?.role !== 'owner') return [];
  const isSelf = item.userId === item.actor?.userId;
  const actions = [];
  if (item.status === 'active') {
    actions.push(actionButton(localText('Сменить роль', 'Change role'), () => teamChangeRoleForm(item), 'primary'));
    if (item.invitePending) {
      actions.push(actionButton(localText('Новый токен приглашения', 'New invitation token'), async () => {
        const result = await teamMutate(item, 'reissue-invite', { expectedVersion: item.version });
        teamShowInviteToken(item, result.invite);
      }));
    }
    if (!isSelf) {
      actions.push(actionButton(
        localText('Отключить', 'Disable'),
        () => teamMutate(item, 'deactivate', { expectedVersion: item.version }),
        'danger',
        localText(
          'Отключить сотрудника? Он потеряет доступ к организации сразу; если других организаций у него нет, все его сессии будут завершены. Данные и история сохранятся.',
          'Disable this person? They lose access to the organisation immediately; if they belong to no other organisation, all their sessions end. Data and history are kept.',
        ),
      ));
    }
  }
  if (item.status === 'inactive') {
    actions.push(actionButton(localText('Включить', 'Enable'), async () => {
      const result = await teamMutate(item, 'reactivate', { expectedVersion: item.version });
      teamShowInviteToken(item, result.invite);
    }, 'primary'));
  }
  return actions;
}

function teamInviteForm() {
  const owned = teamManageableOrganisations();
  const validation = window.SynthaUiValidation;
  const rolesFor = (organisationId) => {
    const roster = teamState.data[organisationId];
    if (roster) return roster.assignableRoles;
    const type = owned.find((org) => org.id === organisationId)?.type;
    return TEAM_ROLES_BY_ORGANISATION_TYPE[type] || [];
  };
  openForm(localText('Пригласить сотрудника', 'Invite a team member'), [
    selectDef('organisationId', localText('Организация', 'Organisation'), owned),
    textDef('email', localText('Почта сотрудника', 'Team member email'), '', 254),
    optionalTextDef('displayName', localText('Имя (необязательно)', 'Name (optional)'), '', 160),
    dependentSelectDef('role', localText('Роль', 'Role'), 'organisationId', rolesFor, (role) => teamRoleLabel(role), undefined,
      localText('Для этой организации нет ролей, которые вы можете назначить.', 'There are no roles you can grant in this organisation.')),
  ], async (values) => {
    const organisationId = validation.requiredText(values.organisationId, localText('Организация', 'Organisation'), { minLength: 1, maxLength: 120 });
    const email = validation.requiredText(values.email, localText('Почта сотрудника', 'Team member email'), { minLength: 3, maxLength: 254 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(localText('Укажите корректный адрес электронной почты.', 'Enter a valid email address.'));
    const result = await mutate(`/v2/organisations/${encodeURIComponent(organisationId)}/team/invitations`, {
      email, ...(values.displayName ? { displayName: values.displayName.trim() } : {}), role: values.role,
    });
    teamInvalidate(organisationId);
    teamShowInviteToken(result.member, result.invite);
    return result;
  });
}

/** Страница входа: принять приглашение по одноразовому токену и задать пароль. Не требует сессии. */
function renderAcceptInvite(message = '') {
  clear(root);
  const wrap = el('main', { className: 'login-wrap' });
  const card = el('section', { className: 'card login' });
  card.append(languageSwitcher(), brandBlock(), el('p', { className: 'muted', rawText: localText('Введите токен приглашения и придумайте пароль (не короче 12 символов).', 'Enter your invitation token and choose a password (at least 12 characters).') }));
  if (message) card.append(notice(message, 'error'));
  const form = el('form');
  const token = inputField(localText('Токен приглашения', 'Invitation token'), 'text', { name: 'token', autocomplete: 'off', required: true });
  const password = inputField(I18N.t('auth.password'), 'password', { name: 'password', autocomplete: 'new-password', required: true, minlength: '12' });
  const submit = el('button', { className: 'button primary', rawText: localText('Задать пароль', 'Set password'), type: 'submit' });
  const back = el('button', { className: 'button secondary', rawText: localText('Назад ко входу', 'Back to sign in'), type: 'button' });
  back.addEventListener('click', () => renderLogin());
  form.append(token.label, password.label, submit, back);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setButtonBusy(submit, true, I18N.t('common.saving'));
    try {
      await api('/v2/auth/accept-invite', { method: 'POST', body: { token: token.control.value.trim(), password: password.control.value }, anonymous: true });
      renderLogin(localText('Пароль задан. Теперь можно войти.', 'Password set. You can sign in now.'));
    } catch (error) {
      showInlineError(form, error.message);
    } finally {
      if (submit.isConnected) setButtonBusy(submit, false, localText('Задать пароль', 'Set password'));
    }
  });
  card.append(form);
  wrap.append(card);
  root.append(wrap);
}
