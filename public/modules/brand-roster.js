(function initializeBrandRoster(global) {
  'use strict';

  // Состав организации — кто в ней есть и с какой ролью.
  //
  // Рабочее пространство несёт **только своё** членство читателя: измерено живьём — маршрут
  // `/v2/organisations/{id}/members` отдаёт пять записей с ролями `owner, viewer, finance, admin,
  // admin`, а `workspace.memberships` одну. Поэтому любой экран, построенный на `workspace`,
  // показывает читателю его самого и называет матрицей ролей матрицу из одной строки.
  //
  // Загрузчик жил внутри `styles.js` — там он понадобился первым, для формы назначения
  // ответственных. Теперь он один на всех: второй экран с тем же вопросом не должен заводить
  // второй кэш, второе состояние загрузки и второй способ ошибиться.
  const ROSTER = { byOrganisation: new Map(), loading: new Set() };

  // Возвращает состав, если он уже прочитан, и `null`, пока читается. Экран, получивший `null`,
  // рисует то, что у него есть, и будет перерисован, когда состав придёт: просить экран ждать
  // значило бы держать его пустым ради данных, которые для него не единственные.
  function roster(organisationId, { onLoaded } = {}) {
    if (!organisationId) return null;
    if (ROSTER.byOrganisation.has(organisationId)) return ROSTER.byOrganisation.get(organisationId);
    if (!ROSTER.loading.has(organisationId)) {
      ROSTER.loading.add(organisationId);
      queueMicrotask(async () => {
        try {
          const loaded = await api(`/v2/organisations/${encodeURIComponent(organisationId)}/members`);
          ROSTER.byOrganisation.set(organisationId, Object.freeze(loaded.items || []));
        } catch (problem) {
          // Пустой состав вместо отсутствующего: иначе экран просил бы его снова и снова.
          ROSTER.byOrganisation.set(organisationId, Object.freeze([]));
        } finally {
          ROSTER.loading.delete(organisationId);
          if (typeof onLoaded === 'function') onLoaded();
        }
      });
    }
    return null;
  }

  // Человека называют именем, а не сгенерированным идентификатором: членство его не хранит, а
  // состав — хранит.
  function personName(member) {
    return member?.displayName || member?.email || member?.userId || '';
  }

  function reset() {
    ROSTER.byOrganisation.clear();
    ROSTER.loading.clear();
  }

  global.SynthaBrandRoster = Object.freeze({ roster, personName, reset });
})(window);
