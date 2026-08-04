(function connectInstalledModulesToV7() {
  'use strict';

  const items = OD_V7_GROUPS.flatMap((group) => group.items);
  const activate = (englishLabel, view, ru, en) => {
    const item = items.find((candidate) => candidate.en === englishLabel);
    if (!item) return;
    item.view = view;
    item.ru = ru;
    item.en = en;
    item.planned = false;
  };

  if (window.SynthaPlanningCore) activate(
    'Line plan',
    'planning',
    '\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435',
    'Planning',
  );
  if (window.SynthaStylesCore) activate(
    'Styles and colourways',
    'styles',
    '\u041c\u043e\u0434\u0435\u043b\u0438 \u0438 \u0446\u0432\u0435\u0442\u043e\u0432\u044b\u0435 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b',
    'Styles and colourways',
  );
  if (window.SynthaMaterialsCore) activate(
    'Materials and trims',
    'materials',
    '\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430',
    'Materials and trims',
  );
  if (window.SynthaBomCore) activate(
    'BOM and costing',
    'boms',
    '\u0421\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u0438 \u0438 \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c',
    'BOM and costing',
  );
  if (window.SynthaMeasurementCore) activate(
    'Measurement charts',
    'measurements',
    '\u0422\u0430\u0431\u043b\u0438\u0446\u044b \u0438\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u0439',
    'Measurement charts',
  );
  if (window.SynthaLinesheetsWorkspace) activate(
    'Linesheets',
    'linesheets',
    '\u041b\u0438\u0441\u0442\u044b \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439',
    'Linesheets',
  );
})();