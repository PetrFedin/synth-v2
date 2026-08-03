function calendarEventTypeLabel(value) {
  const labels = {
    production: ['\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e','production'], purchase: ['\u0437\u0430\u043a\u0443\u043f\u043a\u0430','purchase'], marketing: ['\u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433','marketing'],
    meeting: ['\u0432\u0441\u0442\u0440\u0435\u0447\u0430','meeting'], shipment: ['\u043e\u0442\u0433\u0440\u0443\u0437\u043a\u0430','shipment'], deadline: ['\u0441\u0440\u043e\u043a','deadline'],
    sample: ['\u043e\u0431\u0440\u0430\u0437\u0435\u0446','sample'], quality: ['\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430','quality'], other: ['\u0434\u0440\u0443\u0433\u043e\u0435','other'],
  };
  return labels[value]?.[I18N.getLocale() === 'en' ? 1 : 0] || value;
}

function calendarEventForm() {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  const owners = ownOrganisations().filter(item => caps.hasForOrganisation(state.workspace, item.id, caps.CAPABILITIES.CALENDAR_WRITE));
  const subjects = integrationSubjectOptions();
  openForm(localText('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u043e\u0431\u044b\u0442\u0438\u0435','Add calendar event'), [
    selectDef('ownerOrganisationId',localText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f','Organisation'),owners,item => item.name),
    selectDef('subjectKey',localText('\u0421\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0439 \u043e\u0431\u044a\u0435\u043a\u0442','Linked subject'),subjects,item => item.label),
    selectDef('eventType',localText('\u0422\u0438\u043f \u0441\u043e\u0431\u044b\u0442\u0438\u044f','Event type'),['meeting','shipment','deadline','sample','quality','production','purchase','marketing','other'],calendarEventTypeLabel),
    selectDef('visibility',localText('\u0412\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c','Visibility'),['organisation','trade','private']),
    textDef('title',localText('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435','Title'),'',200),
    dateTimeDef('startsAt',localText('\u041d\u0430\u0447\u0430\u043b\u043e','Starts at')),
    dateTimeDef('endsAt',localText('\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435','Ends at')),
    textDef('location',localText('\u041c\u0435\u0441\u0442\u043e \u0438\u043b\u0438 \u0441\u0441\u044b\u043b\u043a\u0430','Location or link'),localText('\u041e\u043d\u043b\u0430\u0439\u043d','Online'),300),
  ], values => {
    validation.dateRange(values.startsAt, values.endsAt, 'Event dates');
    const subject = subjects.find(item => item.id === values.subjectKey);
    if (!subject) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/calendar/events', {
      ownerOrganisationId: values.ownerOrganisationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      eventType: values.eventType,
      visibility: values.visibility,
      title: validation.requiredText(values.title, 'Event title', { minLength: 2, maxLength: 200 }),
      description: '', startsAt: toIso(values.startsAt), endsAt: toIso(values.endsAt), allDay: false,
      location: validation.requiredText(values.location, 'Location', { minLength: 1, maxLength: 300 }),
      participantOrganisationIds: integrationParticipantsForSubject(values.ownerOrganisationId, subject),
      reminders: [{ minutesBefore: 1440, channel: 'in_app' }],
    });
  });
}

function calendarEventEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const canWrite = caps.hasForOrganisation(state.workspace, item.ownerOrganisationId, caps.CAPABILITIES.CALENDAR_WRITE);
  if (canWrite && item.status === 'scheduled') {
    actions.push(actionButton(localText('\u041d\u0430\u0447\u0430\u0442\u044c','Start'), () => mutate(`/v2/calendar/events/${encodeURIComponent(item.id)}/status`, { status: 'in_progress' })));
    actions.push(actionButton(localText('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c','Cancel'), () => mutate(`/v2/calendar/events/${encodeURIComponent(item.id)}/status`, { status: 'cancelled' }), 'danger'));
  }
  if (canWrite && item.status === 'in_progress') actions.push(actionButton(localText('\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c','Complete'), () => mutate(`/v2/calendar/events/${encodeURIComponent(item.id)}/status`, { status: 'completed' }), 'primary'));
  const subject = item.subjectType && item.subjectId ? `${item.subjectType}: ${item.subjectId}` : localText('\u0411\u0435\u0437 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438','Unlinked');
  return entity(item.title, item.status, [
    `${localText('\u0422\u0438\u043f','Type')}: ${calendarEventTypeLabel(item.eventType)}`,
    `${formatDate(item.startsAt)} - ${formatDate(item.endsAt)}`,
    `${localText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f','Organisation')}: ${orgName(item.ownerOrganisationId)}`,
    `${localText('\u041e\u0431\u044a\u0435\u043a\u0442','Subject')}: ${subject}`,
    item.location ? `${localText('\u041c\u0435\u0441\u0442\u043e','Location')}: ${item.location}` : '',
  ], actions);
}
