# Syntha V2 — запуск в Cursor

Репозиторий является самостоятельным проектом Syntha V2.

## Первый запуск

```bash
cp .env.example .env
npm install
docker compose up -d
```

При `npm run dev`, `npm run db:migrate` и `npm run bootstrap:owner` приложение ждёт готовности PostgreSQL и применяет миграции через единый ledger `schema_migrations`. Повторный запуск пропускает уже применённые файлы; изменение применённой миграции блокируется checksum-ошибкой.

Замените `SYNTHA_BOOTSTRAP_PASSWORD` в `.env` на пароль длиной не менее 12 символов, затем создайте первого владельца и организацию:

```bash
npm run bootstrap:owner
```

Запуск приложения:

```bash
npm run dev
```

Откройте `http://127.0.0.1:4100`. Тот же процесс обслуживает standalone workspace, `/v2` API, `/health` и `/openapi.json`.

## Вход через API

```bash
curl -X POST http://127.0.0.1:4100/v2/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@syntha.local","password":"YOUR_PASSWORD"}'
```

Полученный `accessToken` используется как `Authorization: Bearer ...`. Все бизнес-мутации также требуют уникальный `Idempotency-Key`.

## Cursor

В `.vscode/tasks.json` находятся задачи установки, запуска PostgreSQL, миграций, проверки и dev-сервера. В `.vscode/launch.json` находится конфигурация `Syntha V2 API` для запуска через Run and Debug.

## Правила миграций

- Новая схема добавляется только новым нумерованным SQL-файлом в `db/migrations`.
- Применённые файлы не редактируются: SHA-256 checksum хранится в `schema_migrations`.
- Одновременно может работать несколько экземпляров migrator: PostgreSQL advisory lock сериализует применение.
- Каждый новый файл применяется в отдельной транзакции.

## Обязательная проверка перед коммитом

```bash
npm run verify
```

Она проверяет архитектурные границы, изоляцию V2, PostgreSQL-контракт, migration ledger, standalone UI и все тесты.
