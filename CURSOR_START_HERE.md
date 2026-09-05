# Syntha V2 — запуск в Cursor

Репозиторий является самостоятельным проектом Syntha V2.

## Авторитетное ТЗ платформы

Перед любым изменением откройте [`ARCHITECTURE.md`](ARCHITECTURE.md). Это единый living master-spec Syntha V2: архитектура, домены и их связи, канонические сущности/lineage, API и PostgreSQL-контракты, статусы реализации, known gaps, UI/UX/ODS-параметры, экраны, поля/действия и Definition of Done.

**Любое изменение продукта или runtime должно синхронно менять `ARCHITECTURE.md` в том же PR.** Это относится к сущностям и полям, relations, API/OpenAPI, migrations, lifecycle/state transitions, ролям/действиям, экранам/блокам/таблицам/полям/кнопкам/иконкам, шрифтам/цветам/design tokens, deployment/env/workers и acceptance evidence. Для каждого изменённого блока нужно обновить фактическое поведение, IMPLEMENTED/PARTIAL/PLANNED/GAP-статус и change register. Детальные документы в `docs/` являются supporting specifications и не заменяют обновление master-spec.

`npm run validate:architecture` сохраняет обычную проверку module boundaries и в GitHub Actions дополнительно проверяет diff PR/push: если изменена управляемая code/runtime/UI/DB/spec-поверхность, а `ARCHITECTURE.md` отсутствует в том же diff, CI завершится ошибкой. Поэтому не оставляйте документацию «на потом» после реализации.

## Первый запуск

Требуются Node.js 22+ и Docker с PostgreSQL 17. Для воспроизводимой установки используйте lockfile, а не плавающий dependency resolution:

```bash
cp .env.example .env
npm ci --ignore-scripts --no-audit --no-fund
docker compose up -d
```

`docker compose` поднимает две изолированные PostgreSQL 17 базы: рабочую dev-базу на `127.0.0.1:5434` и отдельную verification-базу на `127.0.0.1:5435`. Скопированный `.env.example` уже связывает `SYNTHA_V2_DATABASE_URL` с dev-базой, а `POSTGRES_TEST_URL` — только с verification-базой. PostgreSQL-backed тесты и runtime smoke не должны использовать рабочие данные.

`.env` нужен только как удобный локальный файл. Команды Syntha загружают его, если он существует, но не перезаписывают переменные, уже переданные средой Cursor/Cloud. Скопированный `.env.example` оставляет локальный сервер на `127.0.0.1`.

При `npm run dev`, `npm run db:migrate` и `npm run bootstrap:owner` используется единый migration ledger `schema_migrations`. Миграции защищены PostgreSQL advisory lock; повторный запуск пропускает уже применённые файлы, а изменение применённой миграции блокируется checksum-ошибкой.

Замените `SYNTHA_BOOTSTRAP_PASSWORD` в `.env` на пароль длиной не менее 12 символов, затем создайте первого владельца и организацию:

```bash
npm run bootstrap:owner
```

`bootstrap:owner` безопасно повторяем. Первый успешный запуск создаёт детерминированные bootstrap identities; повторный запуск с теми же email/password/типом и названием организации возвращает уже существующего владельца и не создаёт дубль. Bootstrap не является reset/credential-rotation командой: другой пароль, другая организация, неоднозначная ownership topology или disabled user приводят к fail-closed ошибке. Параллельные bootstrap-запуски сериализуются PostgreSQL advisory lock.

Запуск приложения:

```bash
npm run dev
```

Откройте `http://127.0.0.1:4100`. Тот же процесс обслуживает standalone workspace, `/v2` API, `/health`, `/ready` и `/openapi.json`.

## Вход через API

```bash
curl -X POST http://127.0.0.1:4100/v2/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@syntha.local","password":"YOUR_PASSWORD"}'
```

Полученный `accessToken` используется как `Authorization: Bearer ...`. Все бизнес-мутации также требуют уникальный `Idempotency-Key`.

## Cursor

В `.vscode/tasks.json` находятся задачи lockfile-установки, запуска обеих PostgreSQL баз, миграций, повторяемого owner bootstrap, обычной проверки, PostgreSQL-backed проверки, отдельного runtime smoke, collection acceptance и dev-сервера. Новые acceptance-команды также можно запускать из terminal после настройки переменных из `.env.example`. В `.vscode/launch.json` конфигурация `Syntha V2 API` запускает тот же `scripts/start.mjs`, что и поддерживаемый production entrypoint, поэтому Run and Debug и terminal-start не расходятся по загрузке окружения.

Если Cursor/Cloud передаёт `SYNTHA_V2_DATABASE_URL` или `DATABASE_URL`, `PORT` и другие настройки напрямую, физический `.env` не требуется. При отсутствии `HOST` поддерживаемый startup adapter использует `0.0.0.0`; явный `HOST` имеет приоритет.

## Runtime smoke: настоящий production entrypoint

`npm run smoke:runtime` запускает отдельный дочерний процесс через тот же `scripts/start.mjs`, который используется `npm start`. Gate всегда перенаправляет приложение на `POSTGRES_TEST_URL`, отключает внешний outbox webhook и не использует `SYNTHA_V2_DATABASE_URL`/рабочую базу. Он проверяет реальную последовательность:

`process start → PostgreSQL connect → migrations → HTTP listen → GET /health → GET /ready → SIGTERM → graceful PostgreSQL/HTTP shutdown`.

Порт выбирается временный loopback, поэтому smoke не конфликтует с обычным dev-сервером на `4100`. По умолчанию startup должен уложиться в 30 секунд, graceful shutdown — в 15 секунд; при инфраструктурной необходимости эти пределы можно временно изменить через `SYNTHA_RUNTIME_SMOKE_STARTUP_TIMEOUT_MS` и `SYNTHA_RUNTIME_SMOKE_SHUTDOWN_TIMEOUT_MS`.

Этот gate автоматически входит в `npm run verify:postgres`. Поэтому release-candidate проверка доказывает не только модульные/PostgreSQL-контракты, но и то, что реальный поддерживаемый entrypoint действительно стартует и корректно завершается.

## Сквозные acceptance-проверки

Все acceptance-команды работают с зарезервированными acceptance organisations/actors и выполняют бизнес-мутации только через аутентифицированный публичный `/v2` runtime. Прямой SQL не используется как замена бизнес-командам; PostgreSQL читается для bootstrap управляемых reference data и доказательства, что HTTP и база относятся к одному environment.

После запуска приложения доступен базовый collection slice:

```bash
npm run acceptance:collection
```

Он выполняет `Campaign draft → open → Collection draft → published` и доказывает, что downstream commercial/buyer/warehouse/economics состояние не изменилось.

Для Product Readiness используйте:

```bash
npm run acceptance:product-readiness
```

Одна независимая ветка намеренно создаёт READY_GOODS без `categoryRef` и canonical Measurement Chart, требует BLOCKED ровно по `category + measurements` и HTTP 422 на projection. Вторая создаёт governed `APPAREL`, размерный ряд и опубликованный canonical Measurement Chart и требует настоящий `ProductReadinessSnapshot READY` с нулём blockers. Отрицательный сценарий не заменяется happy path.

Следующий коммерческий slice:

```bash
npm run acceptance:product-commercialization
```

Он сначала создаёт новый положительный READY-граф, затем через публичный runtime проходит:

`READY → CommercialProductProjectionVersion → Collection exact StyleVersion assignment → CommercialPublication → PriceListVersion → BuyerCatalogVersion`.

Для buyer-specific границы дополнительно создаются и проверяются open Showroom, активная связь brand↔shop и accepted showroom invitation. Используются два реальных actor context: `syntha-acceptance-brand-owner` и `syntha-acceptance-shop-owner`. Команда сверяет exact `StyleVersion`, `ProductSku`, readiness/projection IDs и hashes, валюту, wholesale/RRP/MOQ и immutable BuyerCatalog lineage с той же PostgreSQL; Selection, Order, SupplyCommitment, ActualCost и inventory movements в этом slice должны остаться неизменными.

В `.env` для локального запуска задаются:

```bash
SYNTHA_ACCEPTANCE_BASE_URL=http://127.0.0.1:4100
SYNTHA_ACCEPTANCE_EMAIL=acceptance@syntha.local
SYNTHA_ACCEPTANCE_PASSWORD=...
SYNTHA_ACCEPTANCE_SHOP_EMAIL=acceptance-shop@syntha.local
SYNTHA_ACCEPTANCE_SHOP_PASSWORD=...
```

Вместо brand email/password можно передать короткоживущий `SYNTHA_ACCEPTANCE_TOKEN`, вместо shop credentials — `SYNTHA_ACCEPTANCE_SHOP_TOKEN`; токены обязаны соответствовать ровно зарезервированным acceptance actors. `SYNTHA_ACCEPTANCE_RUN_ID` задаёт детерминированные idempotency keys. Токены и пароли команды не выводят.

Для удалённого environment acceptance заблокирован по умолчанию. Разрешайте его только намеренно и только для нужного acceptance/staging target:

```bash
SYNTHA_ACCEPTANCE_BASE_URL=https://your-acceptance-host.example \
SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true \
SYNTHA_V2_DATABASE_URL='postgresql://...' \
SYNTHA_ACCEPTANCE_EMAIL='acceptance@example.com' \
SYNTHA_ACCEPTANCE_PASSWORD='...' \
SYNTHA_ACCEPTANCE_SHOP_EMAIL='acceptance-shop@example.com' \
SYNTHA_ACCEPTANCE_SHOP_PASSWORD='...' \
npm run acceptance:product-commercialization
```

Текущий commercialization gate доказывает существующий executable contract, в котором Projection, CommercialPublication, PriceListVersion и BuyerCatalogVersion создаются как immutable `published` snapshots. Он не является доказательством ещё не реализованного staged lifecycle `DRAFT → READY → PUBLISHED → SUPERSEDED/ARCHIVED` и не заменяет последующий pricing-depth pass с market/effective dates. Эти ограничения фиксируются в `ARCHITECTURE.md`, а не скрываются за зелёным acceptance.

## Правила миграций

- Новая схема добавляется только новым нумерованным SQL-файлом в `db/migrations`.
- Применённые файлы не редактируются: SHA-256 checksum хранится в `schema_migrations`.
- Одновременно может работать несколько экземпляров migrator: PostgreSQL advisory lock сериализует применение.
- Каждый новый transactional migration-файл применяется в отдельной транзакции; online migrations следуют отдельному безопасному контракту migrator-а.

## Обязательная проверка перед коммитом

```bash
npm run verify
```

`verify` включает `validate:architecture`. Локально он проверяет архитектурные module boundaries; в GitHub Actions тот же validator дополнительно требует синхронного изменения `ARCHITECTURE.md` для управляемых продуктовых/runtime изменений.

Для release candidate также запускайте PostgreSQL-backed gate:

```bash
npm run verify:postgres
```

После `cp .env.example .env && docker compose up -d` эта команда работает без ручного создания test database: `POSTGRES_TEST_URL` указывает на отдельный `postgres-test` service. Проверки покрывают архитектурные границы, изоляцию V2, PostgreSQL-контракт, migration ledger, standalone UI, тесты приложения и реальный `npm start`-совместимый process smoke с `/health`, `/ready` и graceful shutdown. Live acceptance не входит автоматически в `verify`, поскольку требует отдельного запущенного HTTP target и намеренно создаёт namespace-isolated acceptance data. Для P0.3 отдельный GitHub workflow `Product Commercialization Acceptance` поднимает поддерживаемый runtime и запускает тот же `npm run acceptance:product-commercialization` против той же PostgreSQL 17 базы.
