(function connectInstalledModulesToV7() {
  'use strict';

  const items = OD_V7_GROUPS.flatMap((group) => group.items);
  const activate = (englishLabel, view, ru, en) => {
    const item = items.find((candidate) => candidate.en === englishLabel);
    if (!item) return;
    item.view = view; item.ru = ru; item.en = en; item.planned = false;
  };

  if (window.SynthaPlanningCore) activate('Line plan', 'planning', 'Планирование', 'Planning');
  if (window.SynthaStylesCore) activate('Styles and colourways', 'styles', 'Модели и цветовые варианты', 'Styles and colourways');
  if (window.SynthaMaterialsCore) activate('Materials and trims', 'materials', 'Материалы и фурнитура', 'Materials and trims');
  if (window.SynthaBomCore) activate('BOM and costing', 'boms', 'Спецификации и себестоимость', 'BOM and costing');
  if (window.SynthaMeasurementCore) activate('Measurement charts', 'measurements', 'Таблицы измерений', 'Measurement charts');
  if (window.SynthaSampleCore) activate('Samples', 'samples', 'Образцы', 'Samples');
  if (window.SynthaTechPackCore) activate('Tech Packs', 'tech-packs', 'Технические пакеты', 'Tech Packs');
  if (window.SynthaLinesheetsWorkspace) activate('Linesheets', 'linesheets', 'Листы коллекций', 'Linesheets');
})();
