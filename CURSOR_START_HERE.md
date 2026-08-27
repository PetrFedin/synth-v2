# Syntha V2 — запуск в Cursor

Репозиторий является самостоятельным проектом Syntha V2.

## Первый запуск

Требуются Node.js 22+ и Docker с PostgreSQL 17. Для воспроизводимой установки используйте lockfile, а не плавающий dependency resolution:

```bash
cp .env.example .env
npm ci --ignore-scripts --no-audit --no-fund
docker compose up -d
```

`docker compose` поднимает две изолированные PostgreSQL 17 базы: рабочую dev-базу на `127.0.0.1:5434` и отдельную verification-базу на `127.0.0.1:5435`. Скопированный `.env.example` уже связывает `SYNTHA_V2_DATABASE_URL` с dev-базой, а `POSTGRES_TEST_URL` — только с verification-базой. PostgreSQL-backed тесты не должны использовать рабочие данные.

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

В `.vscode/tasks.json` находятся задачи lockfile-установки, запуска обеих PostgreSQL баз, миграций, повторяемого owner bootstrap, обычной проверки, PostgreSQL-backed проверки, collection acceptance и dev-сервера. В `.vscode/launch.json` конфигурация `Syntha V2 API` запускает тот же `scripts/start.mjs`, что и поддерживаемый production entrypoint, поэтому Run and Debug и terminal-start не расходятся по загрузке окружения.

Если Cursor/Cloud передаёт `SYNTHA_V2_DATABASE_URL` или `DATABASE_URL`, `PORT` и другие настройки напрямую, физический `.env` не требуется. При отсутствии `HOST` поддерживаемый startup adapter использует `0.0.0.0`; явный `HOST` имеет приоритет.

## Сквозная acceptance-проверка коллекции

После запуска приложения можно проверить реальный HTTP + PostgreSQL контур без сброса базы и без создания заказа/складского движения:

```bash
# в .env задайте отдельный acceptance-пароль
# SYNTHA_ACCEPTANCE_PASSWORD=...
npm run acceptance:collection
```

Команда идемпотентно устанавливает только зарезервированные acceptance organisation/membership reference records, создаёт или использует отдельного пользователя `syntha-acceptance-brand-owner`, проверяет `/health`, `/ready` и `/v2/auth/me`, а затем через тот же публичный `/v2` API выполняет:

`Campaign draft → Campaign open → Collection draft → Collection published`.

После HTTP-записи команда подтверждает созданные Campaign/Collection непосредственно в настроенной PostgreSQL-базе. Это защищает от опасной ситуации, когда `SYNTHA_ACCEPTANCE_BASE_URL` указывает на один environment, а `SYNTHA_V2_DATABASE_URL` — на другой. До и после сценария сравниваются downstream/warehouse/economics counters: CommercialPublication/PriceList/BuyerCatalog, Selection/Order, ProductSku inventory, warehouse movement ledger, SupplyCommitment и ActualCost должны остаться неизменными.

Для удалённого environment acceptance заблокирован по умолчанию. Разрешайте его только намеренно и только для нужного acceptance/staging target:

```bash
SYNTHA_ACCEPTANCE_BASE_URL=https://your-acceptance-host.example \
SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true \
SYNTHA_V2_DATABASE_URL='postgresql://...' \
SYNTHA_ACCEPTANCE_EMAIL='acceptance@example.com' \
SYNTHA_ACCEPTANCE_PASSWORD='...' \
npm run acceptance:collection
```

Вместо email/password можно передать короткоживущий `SYNTHA_ACCEPTANCE_TOKEN`, но он обязан аутентифицироваться именно как `syntha-acceptance-brand-owner`. Токены и пароли команда не выводит. `SYNTHA_ACCEPTANCE_RUN_ID` можно повторно использовать для проверки idempotency того же сценария; без него создаётся новый независимый acceptance run.

## Правила миграций

- Новая схема добавляется только новым нумерованным SQL-файлом в `db/migrations`.
- Применённые файлы не редактируются: SHA-256 checksum хранится в `schema_migrations`.
- Одновременно может работать несколько экземпляров migrator: PostgreSQL advisory lock сериализует применение.
- Каждый новый transactional migration-файл применяется в отдельной транзакции; online migrations следуют отдельному безопасному контракту migrator-а.

## Обязательная проверка перед коммитом

```bash
npm run verify
```

Для release candidate также запускайте PostgreSQL-backed gate:

```bash
npm run verify:postgres
```

После `cp .env.example .env && docker compose up -d` эта команда работает без ручного создания test database: `POSTGRES_TEST_URL` указывает на отдельный `postgres-test` service. Проверки покрывают архитектурные границы, изоляцию V2, PostgreSQL-контракт, migration ledger, standalone UI и тесты приложения. Live acceptance не входит автоматически в `verify`, потому что требует запущенный HTTP target и намеренно создаёт только namespace-isolated acceptance Campaign/Collection records.
