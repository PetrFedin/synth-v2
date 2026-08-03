function collaborationThreadForm() {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  const owners = ownOrganisations().filter(item => caps.hasForOrganisation(state.workspace, item.id, caps.CAPABILITIES.COLLABORATION_WRITE));
  const subjects = integrationSubjectOptions();
  openForm(localText('\u041d\u043e\u0432\u0430\u044f \u0440\u0430\u0431\u043e\u0447\u0430\u044f \u0442\u0435\u043c\u0430','New collaboration thread'), [
    selectDef('ownerOrganisationId',localText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f','Organisation'),owners,item => item.name),
    selectDef('subjectKey',localText('\u0421\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0439 \u043e\u0431\u044a\u0435\u043a\u0442','Linked subject'),subjects,item => item.label),
    textDef('title',localText('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0442\u0435\u043c\u044b','Thread title'),'',160),
  ], values => {
    const subject = subjects.find(item => item.id === values.subjectKey);
    if (!subject) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/collaboration/threads', {
      ownerOrganisationId: values.ownerOrganisationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      title: validation.requiredText(values.title, 'Thread title', { minLength: 2, maxLength: 160 }),
    });
  });
}

function collaborationMessageForm(thread) {
  const validation = window.SynthaUiValidation;
  openForm(localText('\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435','New message'), [
    textDef('body',localText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435','Message'),'',5000),
  ], values => mutate(`/v2/collaboration/threads/${encodeURIComponent(thread.id)}/messages`, {
    body: validation.requiredText(values.body, 'Message', { minLength: 1, maxLength: 5000 }),
  }));
}

function collaborationThreadEntity(item) {
  const caps = window.SynthaUiCapabilities;
  const messages = (state.workspace.collaborationMessages || [])
    .filter(message => message.threadId === item.id)
    .sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const actions = [];
  const canWrite = caps.hasForOrganisation(state.workspace, item.ownerOrganisationId, caps.CAPABILITIES.COLLABORATION_WRITE);
  if (item.status === 'open' && canWrite) {
    actions.push(actionButton(localText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435','Message'), () => collaborationMessageForm(item)));
    actions.push(actionButton(localText('\u0412 \u0430\u0440\u0445\u0438\u0432','Archive'), () => mutate(`/v2/collaboration/threads/${encodeURIComponent(item.id)}/archive`, {}), 'danger', localText('\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043e\u0431\u0441\u0443\u0436\u0434\u0435\u043d\u0438\u0435 \u0432 \u0430\u0440\u0445\u0438\u0432?','Archive this thread?')));
  }
  const lastMessage = messages.at(-1)?.body;
  return entity(item.title, item.status, [
    `${localText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f','Organisation')}: ${orgName(item.ownerOrganisationId)}`,
    `${localText('\u041e\u0431\u044a\u0435\u043a\u0442','Subject')}: ${item.subjectType}: ${item.subjectId}`,
    `${localText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439','Messages')}: ${messages.length}`,
    lastMessage ? `${localText('\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435','Latest')}: ${lastMessage}` : '',
  ], actions);
}
