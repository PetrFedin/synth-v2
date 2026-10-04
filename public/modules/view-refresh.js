(function installViewRefresh(global) {
  'use strict';

  // «Открыть экран и дождаться, пока он получит данные». Каждый экран кэширует то, что загрузил
  // (`ui.loaded`), и перечитывает это только по кнопке «Обновить». Для захода из бокового меню этого
  // хватает: первый заход грузит, повторный показывает уже знакомое. Для «Перейти» из «Ждёт вас» — нет:
  // дело в реестре появилось именно потому, что сущность изменилась, а экран-владелец мог открыться
  // раньше и хранить старый (в том числе пустой) список — человек видел «RFQ не найдены», хотя сервер
  // уже отдавал два.
  //
  // Поэтому владелец данных сам говорит, как перечитать экран: `register(views, loader)`. Загрузчик
  // возвращает обещание, которое выполняется, когда данные получены. Один вид может иметь несколько
  // загрузчиков (заказы живут в рабочем пространстве, документы — в своём кэше по организациям).
  const registry = global.SynthaViewRefresh || (global.SynthaViewRefresh = {});
  const loaders = new Map();

  registry.register = (views, loader) => {
    for (const view of [].concat(views)) {
      if (!loaders.has(view)) loaders.set(view, []);
      loaders.get(view).push(loader);
    }
  };

  registry.has = (view) => loaders.has(view);
  registry.views = () => [...loaders.keys()];

  // Все загрузчики вида запускаются сразу, сбой одного не мешает остальным: экран сам покажет
  // ошибку своего чтения, а чужой сбой не должен оставить человека на предыдущем экране.
  registry.refresh = (view) => Promise.allSettled((loaders.get(view) || []).map((loader) => {
    try { return Promise.resolve(loader()); } catch (error) { return Promise.reject(error); }
  }));

  // Загрузка стартует до отрисовки: экран, открытый сразу после, видит `loading`, а не «пусто», и не
  // запускает собственное первое чтение поверх нашего.
  registry.open = async (view) => {
    state.view = view;
    const pending = registry.refresh(view);
    renderApp();
    await pending;
    if (state.view === view) renderApp();
  };

  // Экраны на общем рабочем пространстве (/v2/workspace): заказы, подборки, партнёры, шоурумы.
  registry.register(['orders', 'selections', 'partners', 'showrooms'], () => reload());
})(window);
