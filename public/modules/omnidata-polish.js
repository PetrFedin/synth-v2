const odOriginalPage = odPage;
odPage = (_title, header, content) => {
  const node = el('div', { className: 'od-view' });
  node.append(header.fragment, content);
  node.querySelectorAll('th').forEach(cell => {
    if (cell.textContent === '\u0417\u0430\u0430\u0437') cell.textContent = '\u0417\u0430\u043a\u0430\u0437';
  });
  return node;
};
void odOriginalPage;
