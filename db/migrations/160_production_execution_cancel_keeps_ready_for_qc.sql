BEGIN;

-- Отмена исполнения из ready-for-qc падала 500 SCHEMA_RULE_RESULT_INVALID. Миграция 154 научила
-- триггер enforce_production_execution_integrity принимать отменённое исполнение, у которого
-- ready_for_qc_at сохранён (все вехи пройдены, живой инспекции нет), и домен именно так и пишет:
-- время, когда исполнение стало готово к контролю, — след, который отмена не стирает. Но табличный
-- CHECK из миграции 023 по-прежнему требовал ready_for_qc_at IS NULL при status = 'cancelled', и
-- первая же настоящая отмена из ready-for-qc упиралась в него (триггер BEFORE, поэтому
-- проверка триггером проходила, а проверка CHECK — нет, и до сих пор это видел только сырой SQL
-- с отказом по другому правилу).
--
-- Ослабляется ровно одна ветка: cancelled допускает ready_for_qc_at как NULL (отменено в planned/
-- active), так и заполненным (отменено из ready-for-qc). Согласованность заполненного значения с
-- вехами по-прежнему держит триггер; здесь только порядок времени.
ALTER TABLE production_executions DROP CONSTRAINT production_executions_state_check;
ALTER TABLE production_executions ADD CONSTRAINT production_executions_state_check CHECK (
    (status = 'planned' AND started_at IS NULL AND ready_for_qc_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'active' AND started_at IS NOT NULL AND ready_for_qc_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'ready-for-qc' AND started_at IS NOT NULL AND ready_for_qc_at IS NOT NULL AND cancelled_at IS NULL AND payload #>> '{milestones,5,status}' = 'completed')
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL
        AND (ready_for_qc_at IS NULL OR (started_at IS NOT NULL AND ready_for_qc_at <= cancelled_at AND payload #>> '{milestones,5,status}' = 'completed')))
);

COMMIT;
