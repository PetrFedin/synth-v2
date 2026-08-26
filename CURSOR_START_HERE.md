# Syntha V2 — запуск в Cursor

Репозиторий является самостоятельным проектом Syntha V2.

## Первый запуск

Требуются Node.js 22+ и Docker с PostgreSQL 17. Для воспроизводимой установки используйте lockfile, а не плавающий dependency resolution:

```bash
cp .env.example .env
npm ci --ignore-scripts --no-audit --no-fund
docker compose up -d
```

`.env` нужен только как удобный локальный файл. Команды Syntha загружают его, если он существует, но не перезаписывают переменные, уже переданные средой Cursor/Cloud. Скопированный `.env.example` оставляет локальный сервер на `127.0.0.1`.

При `npm run dev`, `npm run db:migrate` и `npm run bootstrap:owner` используется единый migration ledger `schema_migrations`. Миграции защищены PostgreSQL advisory lock; повторный запуск пропускает уже применённые файлы, а изменение применённой миграции блокируется checksum-ошибкой.

Замените `SYNTHA_BOOTSTRAP_PASSWORD` в `.env` на пароль длиной не менее 12 символов, затем создайте первого владельца и организацию:

```bash
npm run bootstrap:owner
```

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

В `.vscode/tasks.json` находятся задачи lockfile-установки, запуска PostgreSQL, миграций, проверки и dev-сервера. В `.vscode/launch.json` конфигурация `Syntha V2 API` запускает тот же `scripts/start.mjs`, что и поддерживаемый production entrypoint, поэтому Run and Debug и terminal-start не расходятся по загрузке окружения.

Если Cursor/Cloud передаёт `SYNTHA_V2_DATABASE_URL` или `DATABASE_URL`, `PORT` и другие настройки напрямую, физический `.env` не требуется. При отсутствии `HOST` поддерживаемый startup adapter использует `0.0.0.0`; явный `HOST` имеет приоритет.

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

Проверки покрывают архитектурные границы, изоляцию V2, PostgreSQL-контракт, migration ledger, standalone UI и тесты приложения.
