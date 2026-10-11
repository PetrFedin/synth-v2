# synth-v2 — обязательные доработки / zero-new-cost execution

Snapshot: 2026-10-12. State: REQUIRED, not proof of implementation.

Canon: `ARCHITECTURE.md` is authoritative; `AGENTS.md` validation required for all runtime/UI changes.

| ID | P | Требуемое действие | Сквозная связь | Definition of Done |
|---|---|---|---|---|
| SYN-ZC-01 | P0 | Закрыть PostgreSQL authoritative Golden Path | Product Master → Readiness → Collection → Selection → Order Grid → Confirmation | end-to-end consistent DB, idempotency/outbox, migration checks |
| SYN-ZC-02 | P0 | Кабинеты бренда и закупщика без сломанных связей | Buyer Catalog → Selection → wholesale order → DealSpace → Supply | UI fields/buttons wired to server actions, permission matrix, browser E2E |
| SYN-ZC-03 | P0 | Сверить спецификацию и схему с живыми страницами | ARCHITECTURE.md → UI/API/OpenAPI → migrations → acceptance | `npm run validate:architecture` + CI evidence exact SHA, нет ложного LIVE |
| SYN-ZC-04 | P1 | Commercial analytics и инвесторская экономика | confirmed order → fulfilment → cost → margin → merchant KPIs | derived metrics have sources and documented formulas; no invented ROI |

## Обязательный нулевой бюджет и безопасная передача
- Дополнительная стоимость внедрения/эксплуатации нового контура: **0 ₽**. Запрещено включать биллинг, pay-as-you-go, платные CI minutes/API/AI/БД/storage, платные публикации, платные провайдеры, приобретать серверы/домены или выполнять реальные платежи. Уже существующая инфраструктура не доказывает нулевой совокупной стоимости; фиксировать только **incremental cost**.
- Только локальные/open-source инструменты и **доказанные** свободные остатки бесплатных тарифов. Если бесплатные лимиты/учётная запись не проверены: `BLOCKED_NO_FREE_CAPACITY`.
- Не заменять production demo-приложением; не подключать чужие БД; не записывать секреты в GitHub; не обходить CI, review, migrations и RBAC.
- Сначала проверить latest main/PR/CI, затем взять первое доступное P0. Для каждой задачи: implementation files, exact SHA, passing unit+negative+browser/device tests, persistence/restore evidence где применимо, live deployed SHA где нужен, ledger стоимости, статус `PLANNED/IN_CODE/CI_PASS/LIVE_VERIFIED/BLOCKED`.
- Этот файл — **дополнение** к существующему authoritative technical specification / AGENTS.md, а не замена. Не утверждать внедрение на основании создания документа.

Следующий агент: продолжай с первого открытого P0, **делай код и тесты**, не создавай одни планы. В конце обнови issue/PR с evidence и источник истины проекта; merge — только по существующим политикам.
