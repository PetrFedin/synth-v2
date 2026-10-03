const odOriginalPage = odPage;
odPage = (_title, header, content) => {
  const node = el('div', { className: 'od-view' });
  // Заголовка нет у экранов, которые рисуют ошибку загрузки: данных нет, строить шапку не из чего
  // (справочники, портал поставщика, «Ждёт вас»). Безусловное `header.fragment` падало
  // TypeError, а стартовый экран при сбое запроса — это белое приложение сразу после входа.
  if (header && header.fragment) node.append(header.fragment);
  if (content) node.append(content);
  node.querySelectorAll('th').forEach(cell => {
    if (cell.textContent === '\u0417\u0430\u0430\u0437') cell.textContent = '\u0417\u0430\u043a\u0430\u0437';
  });
  return node;
};
void odOriginalPage;
