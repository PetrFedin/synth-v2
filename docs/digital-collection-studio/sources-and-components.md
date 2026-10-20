# Источники и компонентная стратегия Digital Collection Studio

**Проверка публичных первичных источников:** 2026-10-20. **Статус всех интеграций этого документа: CANDIDATE / NOT INSTALLED.** Это выбор архитектурного направления, не заключение о юридической пригодности всех зависимостей и не техническая приёмка.

Связанный план: [README](README.md). Существующий Product Master, PostgreSQL, RBAC, outbox, Order/Inventory и production gates остаются источниками истины.

## 1. CLO: что подтверждено и как использовать

**CLO-01:** https://www.clo3d.com/en/product/clo — производитель описывает 2D patterns, 3D simulation, materials, fitting и grading. Это описание поставщика; независимая точность на конкретных материалах Syntha не проверена.

**CLO-02:** https://support.clo3d.com/hc/en-us/articles/115000297567-Modes — Simulation, Print Layout, Emulator. Print Layout предусматривает размещение лекал, расчёт расхода ткани и печатную раскладку. Расход ткани не равен полной экономике партии.

**CLO-03:** https://support.clo3d.com/hc/en-us/articles/360013316493-Register-API-Plug-In — официальный механизм plug-in; пример извлечения BOM из 3D garment; DLL/DYLIB. **CLO-04:** https://developer.clo3d.com/library.html — интеграция внешней PLM/DAM библиотеки внутри CLO. **CLO-05:** https://support.clo3d.com/hc/en-us/articles/360017616633-CLO-API-SDK-Guide — SDK должен соответствовать версии CLO.

### Два маршрута

1. **CLO Bridge (OPTIONAL / LICENSE-CONDITIONAL):** пользователь работает в своей лицензированной установке CLO, Syntha предоставляет версии изделий/материалов и принимает экспортированные артефакты через staging. До разработки проверить разрешённые операции, условия SDK/лицензии, версию, ОС, возможность автоматизации и распространения plug-in. Наличие документации API не даёт права встроить весь CLO в браузер или перепродавать его.
2. **Syntha native studio:** собственный веб-интерфейс, проверенные открытые компоненты и отдельно квалифицированная геометрия/симуляция. Нет зависимости от лицензии CLO, но есть самостоятельная инженерная ответственность. Не обещать полного паритета одной установкой пакета.

## 2. Компоненты с первичными источниками

| Кандидат | Подтверждённое назначение / лицензия верхнего уровня | Решение и границы |
|---|---|---|
| FreeSewing | Параметрические made-to-measure выкройки, MIT; https://github.com/freesewing/freesewing и https://github.com/freesewing/freesewing/blob/develop/LICENSE | Кандидат для 2D-построения. README сообщает о переносе на https://codeberg.org/freesewing/freesewing . Версию брать из текущего upstream после проверки, не считать старый GitHub актуальным релизом. Не готовый 3D cloth solver |
| GarmentCode / PyGarment | Параметрические панели, рёбра, компоненты и швейные интерфейсы; MIT repository; https://github.com/maria-korosteleva/GarmentCode ; https://pypi.org/project/pygarment/ | Сильный R&D-кандидат геометрии и параметрического authoring. Нужны проверки конструктора, промышленные припуски/узлы, robust import/export, стабильный worker. MIT-код не объявляет автоматически свободными все тела, датасеты и входные assets |
| GarmentCodeData research | Исследовательский набор и open-source draping pipeline; https://igl.ethz.ch/projects/GarmentCodeData/ | Только отдельная оценка dataset/body/model terms. Не скачивать и не включать данные/манекены автоматически; лицензирование code, dataset и body source — разные записи |
| Three.js | Browser 3D library, MIT; https://github.com/mrdoob/three.js | Основной кандидат viewer/scene/annotations. Сам по себе не создаёт производственные лекала и не гарантирует физику ткани |
| Blender | Открытое 3D-создание/рендер, GPL; https://www.blender.org/about/ ; https://www.blender.org/about/license/ | Отдельный worker или внешний authoring tool. Не копировать GPL-код в proprietary core без соответствующего анализа. Условия распространения программы/плагинов отдельно от прав на собственные выходные assets |
| Seamly2D | Параметрический 2D patternmaking, GPLv3+; https://github.com/FashionFreedom/Seamly2D | Опциональный внешний CAD/import route или самостоятельная совместимая поставка. Не готовая browser-библиотека под MIT; компоненты и распределение проверить отдельно |
| SVGnest | Нерегулярная 2D-раскладка, MIT; https://github.com/Jack000/SVGnest ; https://github.com/Jack000/SVGnest/blob/master/LICENSE.txt | Кандидат геометрического прототипа раскладки. Доработки обязательны для долевой, ворса, зеркал, совмещения рисунка, дефектов и размерной партии. Не объявлять generic nesting промышленным fashion marker |
| MaterialX | Material/look-development interchange, Apache-2.0; https://github.com/AcademySoftwareFoundation/MaterialX | Обмен внешним видом. Механика ткани хранится и измеряется отдельно. Texture/assets и сторонние части проверяются отдельно |
| NVIDIA Warp | GPU compute/simulation framework, Apache-2.0 верхнего уровня; https://github.com/NVIDIA/warp | Исследовательский backend, не готовый CLO. README отмечает отдельно лицензируемый libmathdx, в том числе prebuilt-пакеты. Нельзя назвать весь runtime исключительно Apache-2.0 без SBOM |
| Newton | Physics engine поверх Warp, ориентирован на roboticists/research; https://github.com/newton-physics/newton | Исследовательский альтернативный backend. Выбор по cloth benchmark и совместимости, а не наличию слова physics. Не обещать garment manufacturing qualification |
| OpenUSD | https://github.com/PixarAnimationStudios/OpenUSD | Уже предусмотрен родительским планом как scene interchange. Exact release/distribution license review до включения. Не заменяет PatternRevision и BOM |

### Выбор первого стека — проектное предложение

- 2D: собственная каноническая модель PatternRevision плюс адаптер FreeSewing или GarmentCode. Выбор после теста двух-трёх реальных категорий, не одновременно два независимых источника геометрии.
- Web: Three.js с разрешёнными GLB-производными, fallback на 2D и отключаемая загрузка тяжёлых файлов.
- Simulation/render: изолированный backend; сначала технически ограниченный протокол, затем усложнение. Blender и GarmentCode/Warp-подходы сравниваются по измеримому результату и операционным расходам.
- Marker: SVGnest-подобная геометрия плюс отдельный предметный fashion constraint layer.
- Materials: визуальный MaterialX + собственные версионированные механические данные с методом измерения.
- Cost/decision: существующие BOM/operations/quotes/FX/production constraints Syntha, не вычисления в браузерной сцене.

Это не решение устанавливать весь список сразу.

## 3. Ранее обсуждённые компоненты — сохранённые направления

Эти кандидаты уже обсуждались в проекте. В этом пакете они сохраняются в backlog, а не объявляются повторно полностью проверенными или установленными. Перед реализацией требуется exact-version/license/SBOM review.

| Кандидат / upstream | Роль в развитии Syntha | Ограничение |
|---|---|---|
| Docling — https://github.com/docling-project/docling | Входящие спецификации, счёт/котировка, таблицы мер; source-grounded extraction | Staging, scanner и human review; не прямой writer |
| DuckDB — https://github.com/duckdb/duckdb | Read-only аналитические срезы, Parquet и проверка экономики/спроса | Не вторые транзакционные остатки/заказы |
| StatsForecast — https://github.com/Nixtla/statsforecast | Прогнозный baseline заказов/продаж | Раздельные target series, out-of-time validation, не прогноз из лайков |
| Chronos — https://github.com/amazon-science/chronos-forecasting | Challenger на одинаковых исторических срезах | Проверить конкретные веса/стоимость; сравнивать с простым baseline |
| OR-Tools — https://github.com/google/or-tools | Assortment/production scheduling, MOQ, бюджет, ограниченные мощности | Возвращает предложения; не служит cloth solver и не пишет заказ |
| OpenEPCIS — https://github.com/openepcis | Traceability exchange, связь с Product Passport | Не готовое юридическое соответствие DPP |
| C2PA SDK — https://github.com/contentauth/c2pa-rs | Подписанное происхождение файлов и преобразований | Подпись не доказывает истинность модели/фото |
| Activepieces — https://github.com/activepieces/activepieces | Административные интеграции и внешние уведомления | Core/EE terms отдельно; без автономной финансовой власти |
| Temporal — https://github.com/temporalio/temporal | Сложные межсистемные длительные процессы при доказанной необходимости | Сначала использовать принятую очередь/outbox Syntha |
| OpenFGA — https://github.com/openfga/openfga | Исследование межорганизационных предметных прав | Сначала shadow mode, RBAC/SQL остаются действующими |
| Medusa — https://github.com/medusajs/medusa ; Saleor — https://github.com/saleor/saleor | Возможная отдельная B2C-вертикаль | Выбрать один при необходимости; не второй B2B Product/Order/Inventory |
| LiveKit — https://github.com/livekit/livekit | Переговоры по коллекции, совместный просмотр, встречи | Отдельное согласие на запись, доступ и lifecycle медиа |
| Virtual Try-On | Маркетинговая примерка / отдельный пилот | Конкретный коммерчески допустимый репозиторий не выбран. Фото-примерка не равна размерной/инженерной проверке |

## 4. Отраслевые ориентиры и перевод в backlog

- CLO: pattern/fit/material/simulation/marker → DCS-02/03/04.
- JOOR/NuORDER: digital collection, personal buyer access, linesheets, order intent → DCS-05 + WHS направления; повторно проверить актуальные возможности перед заявлением конкурентного паритета.
- Centric/FlexPLM/WFX/Kubix/Omnidata: продукт/поставщик/календарь/себестоимость/измерения → OPS направления. Нельзя говорить, что у них отсутствует функция, только потому что она не показана на скриншоте.
- Style3D/Browzwear и другие профессиональные 3D-fashion инструменты: дополнительные benchmark-кандидаты, а не подтверждённые открытые библиотеки.
- ERP/WMS/1C/ЭДО/маркировка/маркетплейсы: INT направления; требования зависят от конкретного партнёра и рынка.

## 5. Материалы, предоставленные в Project

`3D Innovation Whitepaper 2.pdf` описывает JOOR, цифровые каталоги, 3D/AR и партнёров VNTANA/iStaging/ORDRE, а также демонстрацию цветомоделей и передачу коллекции байерам. Это vendor whitepaper, а не независимое доказательство экономии или современная спецификация CLO. В документе есть примеры delivery windows 2022 года; его нельзя использовать как гарантию полного функционала поставщика в 2026.

Refabric deck, Centric offer, WFX и Omnidata презентации остаются отдельными источниками. Этот пакет не приписывает им новые возможности, которые здесь не были прочитаны и верифицированы.

## 6. Admission для любой сторонней зависимости

Перед внедрением зафиксировать upstream URL, tag/commit, package hash, license text/notice, transitive dependencies, code/data/weights/avatar/texture/font rights, способ распространения, возможность коммерческой эксплуатации, платные службы и географические ограничения. Не использовать библиотеки по случайным зеркалам, не загружать удалённые модели автоматически.

Требуются тестовая сборка в изоляции, реальные входы, offline/no-provider поведение, resource limits, no-egress по умолчанию, качество/скорость на воспроизводимом benchmark, обновление/откат и эксплуатационная стоимость. До прохождения этого чек-листа verdict остаётся CANDIDATE.

Нет доказательства, что найден единый свободный репозиторий, который после установки закрывает весь функционал CLO и полную производственную экономику. Реалистичная стратегия — поэтапная сборка и квалификация собственной предметной системы из проверенных частей.
