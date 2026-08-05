# Syntha Fashion Platform — PLM / Supply + Wholesale Commerce

Статус: целевая продуктовая спецификация после пересмотра scope.  
Версия: 4.0, 5 августа 2026 года.  
Основной рынок: российские fashion-бренды, работающие с российскими и зарубежными фабриками, поставщиками материалов и поставщиками готовых изделий.  
Назначение: разделить управление разработкой, закупками и производством от B2B-коммерции бренда с магазинами, сохранив единое ядро товарных данных.

> Предыдущая расширенная карта версии 3.6 сохранена как библиотека будущих возможностей: `docs/archive/joor-retailer-cabinet-enterprise-capability-library-v3.6.md`.

---

## 1. Продуктовое решение

Syntha состоит из двух основных бизнес-доменов и общей платформенной основы:

```text
A. PRODUCT & SUPPLY
   PLM / sourcing / materials / samples / purchasing / production / quality / import readiness

B. WHOLESALE COMMERCE
   brand–retailer network / showroom / linesheets / price lists / assortments / wholesale orders

C. SHARED FOUNDATION
   organizations / users / product identity / documents / permissions / integrations / audit
```

Ключевой принцип:

```text
Разработать или закупить товар
→ подтвердить его техническую, закупочную и нормативную готовность
→ создать коммерческую проекцию
→ показать товар магазину
→ получить и подтвердить оптовый заказ
```

Syntha не должна смешивать:

- заказ бренда фабрике или поставщику;
- заказ магазина бренду;
- техническую карточку модели;
- коммерческую карточку товара;
- бухгалтерский документ;
- юридически значимый электронный документ.

Это разные сущности, связанные общим товарным идентификатором и версиями данных.

---

## 2. Границы двух бизнес-доменов

### 2.1 Product & Supply отвечает за

- планирование коллекции;
- создание или отбор моделей;
- выбор способа появления товара в коллекции;
- разработку изделия;
- материалы, ткани и фурнитуру;
- поставщиков и фабрики;
- запросы цен и коммерческие предложения;
- образцы и согласования;
- закупки материалов;
- заказ производства;
- закупку готовых изделий;
- производственный календарь;
- контроль качества;
- закупочную и фактическую себестоимость;
- импортную и нормативную готовность;
- подготовку товара к публикации в коммерческом каталоге.

### 2.2 Wholesale Commerce отвечает за

- представление бренда;
- привлечение и подключение магазинов;
- коммерческий каталог;
- коллекции, showrooms и linesheets;
- доступ магазинов к ассортименту и ценам;
- индивидуальные прайс-листы и условия;
- выбор товаров магазином;
- количества по цветам и размерам;
- черновики, согласование и подтверждение оптовых заказов;
- коммерческие документы;
- статусы оплаты и отгрузки;
- коммуникации бренда и магазина;
- аналитику B2B-продаж.

### 2.3 Shared Foundation отвечает за

- организации и юридические лица;
- пользователей и роли;
- единую идентичность модели, цветомодели и SKU;
- справочники категорий, сезонов, цветов, размеров, валют и единиц измерения;
- версионность;
- файлы и документы;
- журнал действий;
- интеграции;
- tenant isolation;
- общую поисковую индексацию;
- уведомления.

---

## 3. Три обязательные модели формирования коллекции

Российский бренд может одновременно использовать несколько способов создания ассортимента. Способ должен задаваться на уровне позиции коллекции, а не всей организации.

### 3.1 Route A — собственная разработка и контрактное производство

```text
Идея / Line Plan
→ Дизайн модели
→ BOM / Measurement Chart / Tech Pack
→ Материалы
→ Образцы
→ Выбор фабрики
→ Заказ производства
→ Производство
→ QC
→ Готовый товар
→ Коммерческий каталог
```

Применяется, когда бренд самостоятельно определяет конструкцию, материалы и спецификацию, а производство размещает в России или за рубежом.

### 3.2 Route B — собственная разработка + отдельная закупка ткани и комплектующих

```text
Разработка модели
→ Расчёт потребности
→ Закупка ткани / фурнитуры у одного или нескольких поставщиков
→ Поставка материалов на фабрику
→ Давальческое / контрактное производство
→ Контроль остатков материалов
→ Производство
→ QC
→ Коммерческий каталог
```

Эта схема должна поддерживать:

- владельца материала;
- поставщика материала;
- фабрику-получателя;
- цвет, лот и партию;
- заказ материала;
- резерв под модели;
- отгрузку материала на фабрику;
- фактическое потребление;
- остатки и возврат;
- стоимость материала в себестоимости изделия;
- валюту и условия закупки;
- документы на импорт материала.

### 3.3 Route C — закупка готовых изделий для включения в коллекцию

```text
Поиск готового изделия
→ Supplier Offer / Catalog
→ Отбор и образец
→ Решение о кастомизации
→ Закупка готового товара
→ Брендирование / этикетка / упаковка при необходимости
→ Входной QC
→ Российская нормативная и маркировочная готовность
→ Включение в коллекцию
→ Коммерческий каталог
```

Поддерживаемые варианты:

- `ODM_CUSTOMIZED` — готовая базовая модель поставщика с изменениями;
- `WHITE_LABEL` — готовый товар под брендом заказчика;
- `PRIVATE_LABEL_READY_GOODS` — товар разработан поставщиком и выпускается для бренда;
- `READY_GOODS_RESALE` — готовый товар закупается без производственной разработки;
- `CARRY_OVER` — товар переносится из предыдущей коллекции;
- `LOCAL_REBRANDING` — этикетка, упаковка или комплектность меняются после импорта.

Для Route C не нужно требовать полный BOM, BOL и конструкторскую документацию, если бренд ими не управляет. Обязательны коммерческие характеристики, состав, размерная сетка, подтверждающие документы, качество, маркировка и закупочная себестоимость.

---

## 4. Каноническая модель позиции коллекции

Каждая `CollectionItem` содержит:

- внутренний ID;
- бренд;
- сезон и коллекцию;
- development route;
- поставщика или фабрику;
- исходный supplier style code;
- внутренний style code бренда;
- модель;
- цветомодель;
- SKU;
- статус технической готовности;
- статус закупочной готовности;
- статус нормативной готовности;
- статус коммерческой готовности;
- закупочную себестоимость;
- плановую оптовую цену;
- плановую розничную цену;
- плановый объём;
- delivery window;
- ответственных.

### 4.1 Route-specific required fields

| Поле / объект | Собственная разработка | Материалы отдельно | Готовый товар |
|---|---:|---:|---:|
| Style master | Обязательно | Обязательно | Обязательно, упрощённо |
| BOM | Обязательно | Обязательно | Опционально |
| BOL | По необходимости | По необходимости | Не требуется |
| Measurement chart | Обязательно для размерного изделия | Обязательно | Импорт supplier size chart |
| Tech pack | Обязательно | Обязательно | Опционально / supplier spec |
| Material purchase orders | Опционально | Обязательно | Не требуется |
| Production order | Обязательно | Обязательно | Не требуется |
| Finished-goods purchase order | Не требуется | Не требуется | Обязательно |
| Samples | Обязательно | Обязательно | Рекомендуется |
| QC | Обязательно | Обязательно | Входной QC |
| Compliance documents | Обязательно | Обязательно | Обязательно |
| Commercial projection | Обязательно | Обязательно | Обязательно |

---

## 5. Разделение технической и коммерческой карточки

### 5.1 Product Technical Master

Владелец: Product & Supply.

Содержит:

- конструкцию;
- лекала и эскизы;
- BOM;
- BOL;
- measurement chart;
- техпак;
- материалы;
- фабричные комментарии;
- образцы;
- тесты;
- себестоимость;
- производственные версии;
- внутренние и конфиденциальные данные.

Техническая карточка не показывается магазину.

### 5.2 Commercial Product Projection

Владелец: Wholesale Commerce.

Содержит:

- артикул бренда;
- коммерческое название;
- описание;
- категорию;
- изображения;
- состав;
- цвета;
- размеры;
- страну происхождения;
- оптовую цену;
- рекомендованную розничную цену;
- MOQ / MOV;
- pack ratio;
- сроки поставки;
- доступность;
- документы, разрешённые для магазина;
- статус публикации.

### 5.3 Publication Gate

```text
Technical / Purchase Ready
+ Quality Ready
+ Russian Compliance Ready
+ Images and Commercial Content Ready
+ Wholesale Price Ready
+ Delivery Window Ready
→ COMMERCIAL_READY
```

После `COMMERCIAL_READY` создаётся неизменяемый snapshot коммерческих данных. Следующие изменения публикуются новой версией и проходят impact review по открытым assortments и orders.

---

# DOMAIN A — PRODUCT & SUPPLY

## 6. Планирование коллекции

Оставить:

- планы на год, сезон, коллекцию и drop;
- line plan;
- ассортиментный план;
- плановое количество моделей, цветов и SKU;
- плановые объёмы;
- target cost;
- target wholesale и retail price;
- календарь разработки и закупки;
- ответственных;
- импорт и экспорт Excel;
- статус готовности коллекции.

Не превращать модуль в сложную финансовую систему merchandise planning. OTB магазина относится к Wholesale Commerce и является отдельным расширением.

---

## 7. Модели, цветомодели и SKU

Оставить:

- style master;
- colorways;
- size scale;
- SKU generation;
- carry-over и lineage;
- supplier article;
- internal article;
- commercial article;
- эскизы и файлы;
- category attributes;
- lifecycle;
- readiness;
- история изменений.

Для закупаемого готового товара должна поддерживаться быстрая загрузка supplier catalog через XLSX/CSV с последующим mapping в справочники бренда.

---

## 8. Техническая разработка

Оставить для Route A и Route B:

- BOM;
- BOL как опционально углублённый производственный объект;
- measurement chart;
- правила градации;
- tolerance;
- construction details;
- sketches и callouts;
- labels и packaging;
- care instructions;
- tech pack templates;
- versioned export PDF/ZIP;
- approval history.

Для Route C технический блок упрощается до supplier specification, состава, размера, упаковки, этикетки и требований по кастомизации.

Omnidata подтверждает практическую необходимость карточек модели, BOM, BOL, measurement charts, техпаков, линейного планирования, поставщиков, образцов, заказов и интеграций. fileciteturn104file0

---

## 9. Материалы и закупка тканей

Обязательный модуль для российских брендов с зарубежным sourcing.

### 9.1 Material master

- ткань, фурнитура, упаковка, этикетка;
- supplier material code;
- состав;
- плотность;
- ширина;
- цвет;
- единица измерения;
- MOQ;
- price breaks;
- валюта;
- lead time;
- страна происхождения;
- сертификаты и протоколы;
- фотографии и swatches;
- approved / blocked state.

### 9.2 Material RFQ and quotation

- запрос цены;
- объём;
- цвет;
- качество;
- Incoterms;
- валюта;
- срок;
- sample requirement;
- quotation version;
- comparison;
- approval.

### 9.3 Material purchase order

- supplier;
- фабрика-получатель или склад бренда;
- quantity;
- price;
- currency;
- prepayment / balance;
- Incoterms;
- production date;
- shipment date;
- lot / dye lot;
- documents;
- status.

### 9.4 Material allocation and consumption

- резерв материала по модели и заказу;
- плановый расход;
- фактический расход;
- отклонение;
- wastage;
- остаток на фабрике;
- возврат или перенос остатка;
- ownership.

---

## 10. Поставщики и фабрики

Оставить практичную карточку:

- supplier / factory type;
- юридическое название;
- страна и адрес;
- контакты;
- банковские реквизиты как защищённые данные;
- категории товаров;
- доступные процессы;
- MOQ;
- валюты;
- Incoterms;
- lead time;
- sample capability;
- документы;
- история цен;
- качество;
- сроки;
- активный / заблокирован;
- связанные модели и заказы.

Убрать из core:

- глобальный production-network graph;
- worker voice;
- living-wage calculation;
- OECD remediation operating system;
- сложную модель beneficial ownership beyond basic counterparty verification;
- международные social-audit ecosystems как обязательное ядро.

Такие проверки можно подключать как enterprise add-on для компаний, которым они реально требуются.

---

## 11. Sourcing и выбор исполнителя

Поддерживать три типа запросов:

```text
MANUFACTURING_RFQ
MATERIAL_RFQ
FINISHED_GOODS_RFQ
```

Сравнение:

- цена;
- валюта;
- MOQ;
- срок образца;
- production lead time;
- Incoterms;
- включённые материалы;
- упаковка;
- маркировка;
- payment terms;
- tooling / development cost;
- допустимые отклонения;
- срок действия предложения.

Результат:

- выбранный supplier;
- выбранная quotation version;
- allocation моделей и объёмов;
- причины решения;
- approval.

---

## 12. Образцы

Оставить:

- sample request;
- sample type: proto, fit, size set, salesman, PPS, production, ready-goods sample;
- supplier / factory;
- requested date;
- received date;
- courier / tracking;
- version;
- measurements;
- fit review;
- visual review;
- material review;
- commercial review;
- comments с привязкой к изображению;
- approve / revise / reject;
- approved reference sample.

Для готовых изделий использовать сокращённый процесс: request → receive → commercial/quality/compliance review → approve for collection.

---

## 13. Заказы поставщикам

Необходимо три разных документа:

### 13.1 Production Order

Для изготовления товара по спецификации бренда.

### 13.2 Material Purchase Order

Для ткани, фурнитуры и упаковки.

### 13.3 Finished Goods Purchase Order

Для готовых изделий, ODM и white label.

Общие поля:

- supplier;
- buyer legal entity;
- contract reference;
- currency;
- Incoterms;
- payment schedule;
- lines by item/color/size;
- ordered quantity;
- confirmed quantity;
- unit price;
- delivery date;
- ship-to;
- documents;
- version;
- status;
- comments;
- change history.

```text
DRAFT
→ SENT
→ SUPPLIER_REVIEW
→ PARTIALLY_CONFIRMED / CONFIRMED
→ IN_PROGRESS
→ READY_TO_SHIP
→ SHIPPED
→ RECEIVED
→ CLOSED
```

---

## 14. Производственный календарь

Оставить только практичные milestones:

- заказ подтверждён;
- предоплата;
- материалы заказаны;
- материалы готовы;
- материалы на фабрике;
- sample / PPS approved;
- cutting;
- sewing / assembly;
- finishing;
- packing;
- inspection;
- cargo ready;
- shipped;
- received.

Поддерживать:

- planned / confirmed / actual date;
- owner;
- dependency;
- delay reason;
- revised forecast;
- alert;
- комментарий и attachment.

Не строить в core MES, detailed machine scheduling или multi-factory optimization.

---

## 15. Контроль качества

Оставить:

- inspection plan;
- pre-production / inline / final / incoming inspection;
- модель, SKU, партия и заказ;
- sample size;
- AQL как опциональный справочник;
- critical / major / minor defects;
- фотографии;
- measurement deviations;
- pass / conditional / fail;
- corrective action;
- reinspection;
- accepted quantity;
- rejected quantity;
- claim to supplier.

Для закупаемого готового товара основной процесс — входной контроль и приемка партии.

---

## 16. Себестоимость и импортная стоимость

Оставить:

```text
Product / Material Cost
+ Packaging
+ Development / Sample Cost allocation
+ Origin Logistics
+ International Freight
+ Insurance
+ Duty
+ Customs Fees
+ Broker
+ Certification
+ Marking
+ Domestic Delivery
+ FX Difference
= Planned / Actual Landed Cost
```

Поддерживать:

- target cost;
- supplier quotation;
- negotiated cost;
- PO cost;
- actual landed cost;
- валютный курс и дата курса;
- распределение дополнительных расходов по партии;
- план-факт;
- влияние на wholesale price и margin.

Не строить бухгалтерский ledger, treasury, hedging или полноценную ERP-бухгалтерию.

---

## 17. Импортная готовность

Для зарубежных материалов и готовых изделий оставить:

- supplier country;
- country of origin;
- ТН ВЭД ЕАЭС;
- описание товара для внешнеторговых документов;
- Incoterms;
- commercial invoice;
- packing list;
- contract / specification;
- transport document;
- customs declaration reference;
- importer legal entity;
- customs broker;
- gross / net weight;
- carton count;
- duty rate snapshot;
- expected и actual customs cost;
- certificate / declaration applicability;
- marking readiness.

Syntha хранит и связывает данные, но не заменяет таможенного представителя и государственные системы.

---

## 18. Российская нормативная готовность

### 18.1 ЕАЭС / продукция лёгкой промышленности

Оставить:

- тип продукции;
- применимый технический регламент;
- декларация или сертификат;
- номер документа;
- заявитель;
- изготовитель;
- продукция и scope;
- дата выдачи и срок действия;
- протоколы;
- EAC;
- состав;
- инструкции по уходу;
- маркировочный текст на русском языке;
- страна происхождения.

Основной отраслевой benchmark — ТР ТС 017/2011 «О безопасности продукции лёгкой промышленности», включая действующие изменения. 

### 18.2 «Честный знак»

Для маркируемых категорий оставить:

- маркируется / не маркируется;
- основание по ТН ВЭД ЕАЭС и ОКПД2;
- GTIN;
- карточка Национального каталога;
- manufacturer / importer role;
- заказ кодов;
- печать и нанесение;
- verification;
- aggregation при необходимости;
- ввод в оборот;
- передача кодов в оптовом обороте;
- связь с УПД;
- статус и ошибки обмена;
- вывод из оборота как внешнее событие.

С 2026 года перечень маркируемой продукции лёгкой промышленности расширен, поэтому правила должны быть конфигурируемыми по коду и дате, а не зашитыми в интерфейс.

### 18.3 Что не нужно для российского core

Убрать из обязательного продукта:

- EU Digital Product Passport Registry;
- ESPR;
- GPSR online-listing engine;
- EUDR;
- CSDDD;
- EU-specific unsold-goods reporting;
- американские consumer product rules;
- глобальную sanctions platform как отдельный продукт.

При экспорте бренда в соответствующую страну эти блоки могут подключаться отдельным market-compliance add-on.

---

# DOMAIN B — WHOLESALE COMMERCE

## 19. Организации, бренды и магазины

### Brand

- профиль;
- логотип и cover;
- описание;
- категории;
- контакты;
- юридические лица;
- sales team;
- территории;
- currencies;
- commercial terms;
- collections.

### Retailer

- организация;
- юридическое лицо;
- ИНН / КПП / реквизиты;
- тип магазина;
- физические точки;
- интернет-магазин;
- billing и shipping addresses;
- buyer team;
- категории и ценовой сегмент;
- контакты.

---

## 20. Connections и коммерческий доступ

```text
NOT_CONNECTED
→ REQUESTED
→ APPROVED
→ CONNECTED
→ SUSPENDED / DISCONNECTED
```

После подключения бренд назначает:

- price list;
- валюту;
- территорию;
- доступные коллекции;
- доступные категории;
- MOQ / MOV;
- payment terms;
- delivery terms;
- sales manager;
- разрешённые документы.

Connection не должна автоматически давать доступ ко всем товарам, ценам и будущим коллекциям.

---

## 21. Коммерческий каталог

Иерархия:

```text
Season
→ Collection
→ Drop / Delivery
→ Linesheet
→ Style
→ Colorway
→ SKU / Size
```

Обязательные функции:

- публикация из `Commercial Product Projection`;
- импорт готовых товаров;
- поиск;
- фильтры;
- grid / list;
- изображения и видео;
- цвета и размеры;
- wholesale и recommended retail price;
- delivery window;
- availability;
- MOQ / pack;
- documents;
- buyer-specific visibility;
- version history;
- Excel/PDF export.

Технические BOM, себестоимость, фабрика и внутренние комментарии магазинам не раскрываются.

---

## 22. Showroom и Linesheet

Оставить:

- digital showroom;
- collection story;
- looks;
- chapters;
- campaign assets;
- shoppable products;
- attached linesheets;
- access by retailer group;
- publish / unpublish;
- preview as buyer;
- shareable controlled link;
- export PDF/XLSX;
- базовую аналитику просмотров.

Не превращать showroom в сложную рекламную, retail-media или consumer-commerce платформу.

---

## 23. Прайс-листы и коммерческие условия

Оставить:

- RUB как основную валюту российского рынка;
- CNY, USD, EUR, TRY и другие валюты для внешних закупок и международных покупателей;
- base wholesale price;
- recommended retail price;
- customer-specific price list;
- effective dates;
- discounts;
- MOQ / MOV;
- pack ratio;
- payment terms;
- delivery terms;
- Incoterms для международной продажи;
- tax mode / VAT indication;
- approval;
- version.

Для core не нужны:

- сложный rebate engine;
- marketing funds;
- dynamic discounting;
- price optimization AI;
- конкурентный price scraping;
- automated markdown optimization.

---

## 24. Buying Workspace

Оставить два режима:

### 24.1 Simple Order Grid

- строки товаров;
- цвета;
- размеры;
- quantities;
- price;
- total;
- MOQ validation;
- copy/paste from Excel.

### 24.2 Visual Assortment — P1/P2

- canvas или structured board;
- drag-and-drop;
- must buy / consider / reject;
- grouping by delivery, category, store or capsule;
- budget totals;
- quantities;
- conversion to draft order.

Сложные enterprise rollups, clean rooms и algorithmic optimization не относятся к MVP.

---

## 25. Оптовый заказ магазина бренду

Order содержит:

- retailer organization;
- buyer;
- brand;
- seller legal entity;
- buyer legal entity;
- price list version;
- billing address;
- shipping address;
- delivery window;
- currency;
- payment terms;
- lines by style/color/size;
- ordered quantity;
- unit price;
- discount;
- total;
- buyer PO number;
- notes;
- attachments;
- internal approval if required.

```text
DRAFT
→ INTERNAL_REVIEW
→ SUBMITTED
→ BRAND_REVIEW
→ CHANGES_PROPOSED / PARTIALLY_CONFIRMED / CONFIRMED
→ IN_FULFILLMENT
→ SHIPPED
→ COMPLETED

Side states:
REJECTED / CANCELLED / ON_HOLD
```

---

## 26. Подтверждение и изменения заказа

После отправки заказ нельзя молча перезаписывать.

Бренд может:

- подтвердить полностью;
- подтвердить частично;
- изменить количество;
- изменить delivery date;
- изменить или подтвердить цену согласно правилам;
- предложить замену;
- отменить товар;
- отклонить заказ.

Retailer может:

- принять изменения;
- запросить корректировку;
- отменить разрешённые позиции;
- подтвердить новую версию.

Интерфейс показывает:

```text
Original Submitted Order
Current Brand Proposal
Current Agreed Order
Pending Changes
Change History
```

---

## 27. Российские документы и ЭДО

### 27.1 Внутри Syntha

- order confirmation;
- specification;
- proforma / invoice for payment;
- packing list;
- shipment notice;
- акт расхождений / claim attachment;
- PDF/XLSX export.

### 27.2 Через 1С / оператора ЭДО

- УПД;
- корректировочный УПД;
- юридически значимая подпись;
- идентификатор документа у оператора;
- статус отправки, получения, подписания или отклонения;
- маркировочные коды для соответствующих товаров;
- reconciliation с заказом и отгрузкой.

С 1 января 2026 года УПД является основным официально признанным формализованным электронным документом для подтверждения отгрузки через ЭДО. Syntha должна интегрироваться с российскими операторами ЭДО или 1С, но не пытаться самостоятельно стать оператором ЭДО.

---

## 28. Оплата и отгрузка

Для российского B2B core:

### Оплата

- банковский перевод по счёту;
- предоплата / частичная предоплата / постоплата;
- payment due date;
- manually or ERP-synced payment status;
- paid amount;
- balance;
- payment reference;
- overdue alert.

Не включать в core:

- Stripe;
- PayPal;
- escrow marketplace;
- seller payouts;
- factoring;
- reverse factoring;
- automated credit underwriting;
- international payment orchestration.

### Отгрузка

- ready to ship;
- shipment number;
- carrier;
- tracking;
- cartons;
- shipped quantity;
- expected delivery;
- delivered;
- discrepancy;
- documents.

Полноценные WMS и TMS остаются внешними системами.

---

## 29. Коммуникации и уведомления

Оставить:

- messages brand ↔ retailer;
- order thread;
- product questions;
- files;
- mentions;
- unread status;
- email;
- Telegram notifications как российский integration option;
- reminders;
- response SLA;
- activity feed.

Не строить отдельный enterprise case-management product для обычных коммерческих вопросов.

---

## 30. Аналитика

### Для бренда

- connected retailers;
- collection и product views;
- active buyers;
- draft / submitted / confirmed orders;
- order value;
- average order;
- conversion showroom → order;
- top products;
- sales by retailer, region, season, collection and manager;
- cancellations and unconfirmed quantities;
- planned versus ordered production quantity.

### Для магазина

- orders by brand;
- units and value;
- delivery calendar;
- confirmed versus requested;
- order history;
- budget usage where enabled.

### Для Product & Supply

- collection readiness;
- development delays;
- quotation comparison;
- sample turnaround;
- production milestones;
- QC result;
- planned versus actual landed cost.

Убрать из core process mining, digital twins, cross-tenant benchmarking и autonomous decision engines.

---

# SHARED FOUNDATION

## 31. Роли

### Brand internal

- Brand Owner / Admin;
- Product Manager;
- Designer;
- Technologist;
- Sourcing Manager;
- Production Manager;
- Quality Controller;
- Wholesale Sales Manager;
- Finance Viewer.

### External supply

- Supplier Admin;
- Factory Merchandiser;
- Material Supplier;
- Inspector.

### Retailer

- Retailer Admin;
- Buyer;
- Approver;
- Finance Viewer.

Доступ должен ограничиваться организацией, ролью, коллекцией, заказом и явно назначенными внешними объектами.

---

## 32. Владение данными и системы учёта

| Данные | System of record |
|---|---|
| Техническая модель, BOM, tech pack, samples | Syntha Product & Supply |
| Коммерческий каталог, showroom, price-list access | Syntha Wholesale Commerce |
| Оптовый order и его commercial version history | Syntha Wholesale Commerce |
| Заказ фабрике / закупка материала / готового товара | Syntha Product & Supply или ERP по выбранной архитектуре |
| Бухгалтерский учёт, проводки, НДС | 1С / ERP |
| Юридически значимый УПД | 1С / оператор ЭДО |
| Официальный статус маркировки | ГИС МТ «Честный знак» |
| Складские остатки | 1С / ERP / WMS |
| Таможенная декларация | внешняя таможенная система / брокер; Syntha хранит reference и документы |

Syntha не должна создавать конкурирующие остатки и бухгалтерские суммы без reconciliation и указания источника.

---

## 33. Российские интеграции

### P0

- 1С:ERP / 1С:Управление торговлей / 1С:Бухгалтерия через согласованный integration layer;
- XLSX / CSV import-export;
- операторы ЭДО;
- ГИС МТ «Честный знак» напрямую или через 1С / integration provider;
- email;
- cloud file storage.

### P1

- National Catalog / GTIN workflow;
- courier and logistics status providers;
- bank statement / payment status import через ERP;
- Telegram notifications;
- QMS / inspection providers;
- customs broker document exchange.

### P2

- marketplace content feeds;
- retailer ERP/EDI;
- advanced analytics warehouse;
- international supplier portal localization;
- buyer appointment calendar.

---

## 34. Языки, валюты и локализация

Обязательно:

- русский интерфейс;
- английский supplier-facing интерфейс;
- RUB;
- multi-currency закупки;
- configurable units;
- российские форматы адресов, реквизитов и налоговых полей;
- русскоязычные этикетки и инструкции;
- Unicode для китайских и турецких supplier documents.

Опционально:

- китайский и турецкий интерфейс поставщика;
- автоматический перевод комментариев с human review;
- шаблоны документов RU/EN.

Не нужна сложная глобальная localization operating system в первом контуре.

---

# ЧТО УБРАТЬ ИЗ ОСНОВНОГО SCOPE

## 35. Полностью вывести из core

### Не относится к двум целевым процессам

- consumer returns optimization;
- warranty и repair management;
- resale, rental и circular commerce;
- condition grading;
- product authenticity на serialized-item уровне;
- anti-diversion и grey-market investigations;
- retail media;
- store visits, planograms и computer vision;
- hosted-buyer event operating system;
- field-sales route optimization;
- consumer personalization;
- marketplace multi-seller settlement;
- payment escrow и payouts;
- clean rooms и privacy-safe peer benchmarks;
- multi-echelon inventory optimization;
- advanced supply-chain control tower;
- process mining;
- digital process twin;
- autonomous agentic planning;
- carbon accounting and product carbon footprint;
- worker grievance and living-wage operating system;
- complex contract lifecycle management;
- rebate, allowance and marketing-fund engines;
- supply-chain finance;
- global sanctions case-management platform;
- disaster-recovery details внутри продуктовой спецификации.

### Почему убираем

Эти функции:

- не являются обязательными для разработки/закупки коллекции;
- не являются обязательными для оптовой продажи бренда магазину;
- резко увеличивают стоимость и срок разработки;
- требуют других компетенций и регуляторной ответственности;
- отвлекают от качества основных сценариев.

---

## 36. Оставить как будущие add-ons

- Visual Assortment для сетей;
- OTB и store allocation;
- sell-through import;
- replenishment;
- advanced supplier scorecards;
- full QMS;
- marketplace integrations;
- EU market-compliance pack;
- social-compliance pack;
- advanced customs calculations;
- B2B online payment;
- AI recommendations;
- 3D samples;
- consumer fit intelligence.

Add-on не должен усложнять базовую модель данных и основной интерфейс до фактического подключения.

---

# ЦЕЛЕВЫЕ СКВОЗНЫЕ ПРОЦЕССЫ

## 37. Собственная разработка и производство

```text
Line Plan
→ Style
→ BOM / Measurements / Tech Pack
→ Material and Factory RFQ
→ Samples
→ Supplier Allocation
→ Material PO + Production Order
→ Production Calendar
→ QC
→ Import / Receipt
→ Russian Compliance and Marking Ready
→ Commercial Projection
→ Showroom
→ Retailer Order
→ Brand Confirmation
→ 1C / ERP
→ UПД / Shipment
```

---

## 38. Закупка материалов отдельно

```text
Style + BOM
→ Material Requirement
→ Material RFQ
→ Material PO
→ Shipment to Brand or Factory
→ Lot and Ownership Control
→ Reservation by Production Order
→ Consumption and Balance
→ Finished Production
→ QC
→ Commercial Projection
→ Wholesale Sale
```

---

## 39. Закупка готовых изделий

```text
Supplier Catalog
→ Product Candidate
→ Sample and Commercial Review
→ Customization / Branding Requirements
→ Finished Goods PO
→ Supplier Confirmation
→ Production or Supply Status
→ Import
→ Incoming QC
→ Declaration / Certificate / Russian Label
→ GTIN and Marking
→ Collection Item
→ Commercial Projection
→ Showroom
→ Retailer Order
```

---

## 40. Продажа магазину

```text
Retailer Discovers Brand
→ Connection Approved
→ Commercial Access Assigned
→ Collection / Linesheet Viewed
→ Quantities Entered
→ Draft Order
→ Internal Approval if needed
→ Submitted
→ Brand Confirms or Proposes Changes
→ Retailer Accepts
→ Confirmed Order
→ ERP / 1C Sync
→ Invoice / UПД
→ Shipment Status
```

---

# ПРИОРИТЕТЫ РАЗРАБОТКИ

## 41. P0 — обязательное ядро

### Shared

- organizations, legal entities, users and roles;
- product/style/color/SKU identity;
- files, versions and audit;
- dictionaries;
- XLSX import/export;
- integration framework.

### Product & Supply

- collection planning;
- development route;
- style master;
- BOM and measurements;
- material master;
- supplier/factory master;
- RFQ and quotation;
- samples;
- production/material/finished-goods purchase orders;
- milestone tracking;
- incoming/final QC;
- cost and landed cost;
- compliance document register;
- commercial readiness gate.

### Wholesale Commerce

- brand and retailer profiles;
- connections;
- catalog and collections;
- price lists and access;
- linesheets;
- order grid;
- order confirmation and amendments;
- messages and notifications;
- PDF/XLSX documents;
- basic analytics.

### Russia

- 1C integration base;
- EDO/UPD status integration;
- Russian legal-entity fields;
- EAEU compliance documents;
- marking applicability and GTIN/«Честный знак» preparation.

---

## 42. P1 — коммерчески сильная версия

- Visual Assortment;
- retailer internal approvals;
- store/door allocation;
- material ownership and factory balances;
- advanced sample review;
- supplier portal;
- inspection mobile interface;
- planned versus actual landed cost;
- National Catalog and marking integration;
- EDO operator integrations;
- shipment tracking;
- sell-through import;
- reorder drafts;
- account and sales-manager analytics.

---

## 43. P2 — масштабирование

- retailer ERP/EDI;
- advanced assortment planning;
- replenishment;
- AI-assisted mapping and product content preparation;
- 3D review;
- external QMS;
- international market compliance packs;
- advanced customs scenarios;
- multilingual supplier collaboration;
- appointments and market calendar;
- advanced executive analytics.

---

## 44. Главные продуктовые KPI

### Product & Supply

- time from line-plan item to approved product;
- sample approval cycle time;
- quotation turnaround;
- production on-time rate;
- material shortage rate;
- QC pass rate;
- planned versus actual landed cost;
- percentage of collection commercially ready by deadline.

### Wholesale Commerce

- time from connection to first order;
- showroom-to-order conversion;
- draft-to-submitted conversion;
- brand confirmation time;
- confirmed order value;
- cancellation rate;
- repeat-order rate;
- percentage of orders completed without manual Excel reconstruction.

### North Star

```text
Доля моделей коллекции,
которые прошли путь от плана или supplier offer
до подтверждённого оптового заказа магазина
в Syntha без потери версии, ручного дублирования и разрыва данных.
```

---

## 45. Критические UAT-сценарии

1. В одной коллекции находятся собственно разработанная модель, ODM-модель и полностью готовый закупленный товар.
2. Для готового товара система не требует BOM и BOL, но требует состав, размеры, документы и коммерческую готовность.
3. Ткань закупается в Китае и направляется напрямую на фабрику в другой стране; бренд остаётся владельцем материала.
4. Один material lot распределяется на две модели и два production orders.
5. Фактический расход ткани превышает плановый; система показывает влияние на себестоимость и остаток.
6. Factory quotation и finished-goods quotation сравниваются только внутри совместимого RFQ type.
7. Изменение BOM после утверждения образца создаёт новую product version.
8. Commercial catalog не раскрывает фабрику, себестоимость и технические комментарии.
9. Товар не публикуется магазину без оптовой цены и delivery window.
10. Товар, подлежащий маркировке, не получает Russian commercial-ready status без GTIN и marking plan.
11. Импортный ready-made товар получает новую этикетку бренда и отдельную версию commercial projection.
12. Retailer имеет доступ только к назначенной коллекции и price list.
13. Магазин вставляет количества из Excel в size/color grid.
14. MOQ нарушен; заказ нельзя отправить без разрешённого override.
15. После отправки order исходная версия сохраняется.
16. Brand частично подтверждает количества и предлагает новую дату.
17. Retailer принимает изменения; формируется current agreed order.
18. Order передаётся в 1С без технического BOM.
19. УПД status возвращается из внешнего ЭДО и связывается с shipment.
20. Для маркируемого товара коды и quantities reconciled с отгрузкой.
21. Supplier меняет банковские реквизиты; требуется защищённое подтверждение и audit.
22. Purchase order в CNY использует зафиксированный FX snapshot для плановой себестоимости.
23. Фактическая таможенная стоимость обновляет actual landed cost без изменения исходного planned snapshot.
24. Товар снят из коллекции, но исторические retailer orders и документы сохраняются.
25. Одна модель переносится в новый сезон с новой коммерческой ценой, сохраняя technical lineage.

---

## 46. Что считается успешным scope

Платформа соответствует цели, если она хорошо решает два результата:

### Результат 1 — товар создан или закуплен

Бренд может:

- разработать изделие;
- отдельно купить ткань;
- разместить контрактное производство;
- купить готовый товар;
- проконтролировать образец, заказ, качество, импорт и документы;
- включить любой из этих товаров в одну коллекцию.

### Результат 2 — товар продан магазину

Бренд может:

- опубликовать коммерчески готовую коллекцию;
- назначить магазину цены и условия;
- принять заказ по цветам и размерам;
- согласовать изменения;
- передать подтверждённый заказ в 1С/ERP;
- отразить документы, оплату и отгрузку.

Всё, что не усиливает эти два результата, не входит в основной roadmap.

---

## 47. Источники и evidence boundary

### Пользовательский источник

- Omnidata PLM Fashion 2026 — планирование коллекций, карточки моделей, BOM, материалы, BOL, цвета, measurement charts, техпаки, sourcing, образцы, заказы, производство, качество и интеграции. fileciteturn104file0

### Официальные российские и ЕАЭС-источники

- ЕЭК, ТР ТС 017/2011: `https://eec.eaeunion.org/comission/department/deptexreg/tr/bezopProductLegkProm.php`
- ФНС, электронный документооборот: `https://www.nalog.gov.ru/rn77/related_activities/el_doc/`
- ФНС, ЭДО между хозяйствующими субъектами: `https://www.nalog.gov.ru/rn77/related_activities/el_doc/el_bus_entities/`
- «Честный знак», сроки маркировки легпрома: `https://markirovka.ru/knowledge/tovarnye-gruppy/legkaya-promishlennost/etapy-i-sroki-markirovki-tovarov-legkoy-promyshlennosti`
- «Честный знак», перечни маркируемых товаров: `https://markirovka.ru/knowledge/tovarnye-gruppy/legkaya-promishlennost/kakie-tovary-podlezhat-obyazatelnoy-markirovke-legprom`
- 1С, интеграция с маркировкой: `https://portal.1c.ru/applications/1C-Marking`

### Evidence rule

- Omnidata используется как benchmark Product & Supply / PLM.
- JOOR и NuORDER используются как benchmark Wholesale Commerce.
- Наличие функции у benchmark не означает, что она обязательна для Syntha.
- Российские нормативные требования конфигурируются по категории, коду, роли, дате и юридическому лицу.
- Syntha не берёт на себя функции государственных систем, оператора ЭДО, бухгалтерской ERP или таможенного представителя.
