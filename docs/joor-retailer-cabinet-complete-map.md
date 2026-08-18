# Платформа Syntha / Syntha Fashion Platform — Product & Supply + Wholesale Commerce

Статус / Status: единственная актуальная двуязычная продуктовая спецификация / the only current bilingual product source of truth for Syntha.  
Версия / Version: 4.4, 18 августа 2026 года.  
Основной рынок / Primary market: российские fashion-бренды, работающие с российскими и зарубежными фабриками, поставщиками материалов, готовых изделий и магазинами / Russian fashion brands working with domestic and international factories, material suppliers, finished-goods suppliers and retailers.  
Назначение / Purpose: связать Product & Supply и Wholesale Commerce через единое версионное ядро товара, сохранив отдельные процессы, права, документы, статусы и системы учёта / connect Product & Supply and Wholesale Commerce through one versioned product core while preserving separate processes, permissions, documents, states and systems of record.

> Все продуктовые решения, статусы, сущности, процессы, API-контракты, интеграции, UAT и приоритеты ведутся только в этом файле. Отдельные функциональные спецификации не создаются; устаревшие формулировки удаляются или заменяются здесь.

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

Omnidata PLM Fashion 2026 используется как benchmark для карточек модели, BOM, BOL, measurement charts, техпаков, линейного планирования, поставщиков, образцов, заказов и интеграций.

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

# ЦЕЛЕВЫЕ СКВОЗНЫЕ ПРОЦЕССЫ

## 35. Собственная разработка и производство

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
→ УПД / Shipment
```

---

## 36. Закупка материалов отдельно

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

## 37. Закупка готовых изделий

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

## 38. Продажа магазину

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
→ Invoice / УПД
→ Shipment Status
```

---

# ПРИОРИТЕТЫ РАЗРАБОТКИ

## 39. P0 — обязательное ядро

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

## 40. P1 — коммерчески сильная версия

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

## 41. P2 — масштабирование

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

## 42. Главные продуктовые KPI

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

## 43. Критические UAT-сценарии

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

## 44. Что считается успешным scope

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

## 45. Источники и evidence boundary

### Пользовательский источник

- Omnidata PLM Fashion 2026 — планирование коллекций, карточки моделей, BOM, материалы, BOL, цвета, measurement charts, техпаки, sourcing, образцы, заказы, производство, качество и интеграции.

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

---

# ДЕТАЛЬНАЯ ФУНКЦИОНАЛЬНАЯ СПЕЦИФИКАЦИЯ

## 46. Правило единственного актуального документа

Этот файл является единственным продуктовым source of truth для Syntha.

Правила ведения:

1. Новая функция сначала проверяется на соответствие двум целевым процессам:
   - разработать или закупить товар;
   - продать товар магазину.
2. Если функция относится к этим процессам, она добавляется в соответствующий домен этого файла.
3. Если функция полезна только отдельному крупному клиенту, она помечается `ADD-ON` и не включается в обязательный core.
4. Если функция не относится к целевым процессам, она не добавляется в этот документ.
5. Новая версия не создаёт параллельный документ. Предыдущая формулировка заменяется внутри этого файла.
6. Техническая реализация может иметь код, миграции и тесты в репозитории, но продуктовый смысл и границы функции всегда определяются здесь.
7. Любое изменение статуса, модели данных, lifecycle, интеграции или приоритета должно одновременно обновлять связанные UAT-сценарии.

Допустимые продуктовые статусы:

| Статус | Значение |
|---|---|
| `CORE` | Обязательная часть базовой платформы |
| `P1` | Следующий коммерчески значимый уровень |
| `P2` | Масштабирование после подтверждения core |
| `ADD-ON` | Подключаемый модуль для отдельных клиентов |
| `DECISION REQUIRED` | Требуется отдельное продуктовое решение |

---

## 47. Стандарт максимальной детализации

Каждый оставленный модуль описывается по одному шаблону:

1. бизнес-цель;
2. пользователи и роли;
3. canonical entities;
4. обязательные поля;
5. экраны и пользовательские действия;
6. lifecycle и статусы;
7. бизнес-правила и проверки;
8. права доступа;
9. документы и attachments;
10. интеграции;
11. события и audit;
12. аналитика;
13. UAT и критерии приёмки;
14. явные ограничения scope.

Функция не считается специфицированной, если описан только экран без данных, lifecycle, проверок и результата.

---

## 48. Bounded contexts и передача данных между доменами

### 48.1 Product & Supply

Владеет следующими объектами:

- `CollectionPlan`;
- `CollectionItem`;
- `Style` и `StyleVersion`;
- `Colorway`;
- `SKU` как техническая идентичность;
- `BOM`;
- `MeasurementChart`;
- `TechPack`;
- `Material`;
- `Supplier`;
- `Factory`;
- `RFQ` и `Quotation`;
- `SampleRequest` и `SampleVersion`;
- `MaterialPurchaseOrder`;
- `ProductionOrder`;
- `FinishedGoodsPurchaseOrder`;
- `Inspection`;
- `CostVersion`;
- `ComplianceRecord`;
- `ProductReadinessSnapshot`.

### 48.2 Wholesale Commerce

Владеет:

- `BrandProfile`;
- `RetailerProfile`;
- `Connection`;
- `CommercialAccessGrant`;
- `CommercialProductProjection`;
- `CatalogPublication`;
- `Showroom`;
- `Linesheet`;
- `PriceList`;
- `RetailerAssortment`;
- `WholesaleOrder`;
- `OrderAmendment`;
- `CommercialDocument`;
- `ShipmentStatus`;
- `PaymentStatus`.

### 48.3 Shared Foundation

Владеет:

- `Organization`;
- `LegalEntity`;
- `Location`;
- `User`;
- `Membership`;
- `RoleAssignment`;
- `FileAsset`;
- `CommentThread`;
- `DictionaryValue`;
- `IntegrationConnection`;
- `ExternalReference`;
- `AuditEntry`;
- `DomainEvent`.

### 48.4 Единственная точка передачи товара в коммерцию

```text
Product & Supply
→ ProductReadinessSnapshot
→ CommercialProductProjection
→ CatalogPublication
→ Wholesale Commerce
```

Wholesale Commerce не читает рабочие BOM, фабричные комментарии, закупочные цены или незавершённые технические версии напрямую.

### 48.5 Запрещённые смешения

- `ProductionOrder` не является `WholesaleOrder`;
- поставщик ткани не является магазином;
- фабричная quotation не является retailer price list;
- supplier invoice не является счётом магазину;
- technical SKU state не является retailer availability;
- `CommercialProductProjection` не изменяет утверждённый `StyleVersion`;
- 1С не должна создавать новый product master без controlled mapping обратно в Syntha.

---

## 49. Организации, юридические лица и права

### 49.1 Organization

Поля:

- immutable organization ID;
- type: `BRAND`, `RETAILER`, `SUPPLIER`, `FACTORY`, `SERVICE_PROVIDER`;
- display name;
- legal names;
- country;
- default language;
- default currency;
- timezone;
- status;
- owner users;
- created / verified / suspended timestamps.

### 49.2 LegalEntity

Поля для российской организации:

- полное и сокращённое наименование;
- ИНН;
- КПП;
- ОГРН / ОГРНИП;
- юридический адрес;
- фактический адрес;
- банковские реквизиты;
- система налогообложения;
- ставка и режим НДС;
- подписант;
- 1С external ID;
- ЭДО external ID.

Для зарубежной организации:

- registration number;
- tax number;
- registered address;
- bank country;
- bank details;
- beneficiary name;
- SWIFT / local clearing details;
- contract language;
- currency restrictions.

### 49.3 Membership

Поля:

- user;
- organization;
- role;
- status;
- effective from / to;
- invited by;
- accepted at;
- last active at;
- restricted collections / suppliers / retailer accounts;
- external-party flag.

### 49.4 Минимальная матрица ролей

| Действие | Brand Admin | Product | Sourcing | Production | Wholesale | Retailer Buyer | Supplier/Factory |
|---|---:|---:|---:|---:|---:|---:|---:|
| Управлять пользователями бренда | Да | Нет | Нет | Нет | Нет | Нет | Нет |
| Создавать Style | Да | Да | Нет | Нет | Нет | Нет | Нет |
| Утверждать техническую версию | Да | Да по полномочию | Нет | Нет | Нет | Нет | Нет |
| Создавать RFQ | Да | Опционально | Да | Да | Нет | Нет | Нет |
| Отвечать на RFQ | Нет | Нет | Нет | Нет | Нет | Нет | Да |
| Создавать supplier PO | Да | Нет | Да | Да | Нет | Нет | Нет |
| Обновлять production milestone | Да | Нет | Да | Да | Нет | Нет | Назначенные заказы |
| Публиковать каталог | Да | Нет | Нет | Нет | Да | Нет | Нет |
| Назначать retailer access | Да | Нет | Нет | Нет | Да | Нет | Нет |
| Создавать wholesale order | Нет | Нет | Нет | Нет | От имени клиента по разрешению | Да | Нет |
| Подтверждать wholesale order | Да | Нет | Нет | Нет | Да | Нет | Нет |

### 49.5 Обязательные правила доступа

- доступ всегда проверяется по organization ID;
- внешняя фабрика видит только явно назначенные модели, RFQ, samples и orders;
- магазин не видит другие магазины, их цены и заказы;
- sales manager видит только назначенные retailer accounts, если включено account scoping;
- банковские реквизиты поставщика доступны только ограниченным ролям;
- смена банковских реквизитов требует повторной аутентификации, причины и audit;
- переключение организации очищает открытые данные, кэш и фильтры предыдущей организации.

---

## 50. Идентичность товара и версионность

### 50.1 Иерархия

```text
ProductConcept
→ Style
→ StyleVersion
→ Colorway
→ SKU
→ CollectionItem
→ CommercialProductProjectionVersion
```

### 50.2 Style

Неизменяемые поля:

- internal style ID;
- owning brand;
- creation route;
- original supplier identity where applicable;
- lineage parent for carry-over / derivative product.

Изменяемые через версии поля:

- category;
- construction;
- material composition;
- measurements;
- labels;
- packaging;
- supplier specification;
- manufacturing notes.

### 50.3 Colorway

Поля:

- internal colorway ID;
- style ID;
- brand color code;
- commercial color name;
- supplier color code;
- color family;
- visual reference;
- approved material/color links;
- status;
- effective version.

### 50.4 SKU

Поля:

- immutable SKU ID;
- style version;
- colorway;
- size;
- barcode / GTIN when assigned;
- supplier SKU;
- brand SKU;
- commercial article;
- marking applicability;
- active dates;
- status.

### 50.5 Version creation triggers

Новая `StyleVersion` обязательна при изменении:

- BOM или состава;
- measurement chart;
- конструкции;
- основной фабрики, если меняется производственная спецификация;
- supplier base product для ODM/ready goods;
- обязательной этикетки;
- упаковки, влияющей на закупку или compliance;
- нормативно значимого атрибута.

Новая `CommercialProductProjectionVersion` обязательна при изменении:

- названия или описания;
- изображения;
- коммерческого состава;
- price list-visible attributes;
- recommended retail price;
- delivery window;
- MOQ / pack;
- availability;
- публикуемых документов.

### 50.6 Базовый lifecycle StyleVersion

```text
DRAFT
→ IN_DEVELOPMENT
→ SAMPLE_REVIEW
→ TECHNICALLY_APPROVED
→ SOURCING_APPROVED
→ PURCHASE_OR_PRODUCTION_READY
→ COMPLIANCE_READY
→ COMMERCIAL_READY
→ ACTIVE
→ DISCONTINUED
```

Side states:

```text
ON_HOLD / REJECTED / SUPERSEDED
```

Нельзя:

- редактировать утверждённую версию без создания новой;
- удалять версию, на которую ссылается заказ, образец, документ или commercial projection;
- переносить товар в новый сезон потерей lineage;
- повторно использовать SKU ID для другого сочетания style/color/size.

---

## 51. CollectionItem и управление route

### 51.1 CollectionItem

Обязательные поля:

- collection item ID;
- season / collection / drop;
- brand;
- style or supplier candidate;
- development route;
- planned category;
- planned launch date;
- planned delivery window;
- target cost;
- target wholesale price;
- target retail price;
- planned units;
- owner;
- readiness state;
- source and last update.

### 51.2 Route A — developed and manufactured

Required objects:

- StyleVersion;
- BOM;
- MeasurementChart where relevant;
- TechPack;
- sample approval;
- manufacturing RFQ or approved factory decision;
- ProductionOrder;
- final or agreed inspection;
- compliance record;
- commercial projection.

### 51.3 Route B — separately purchased materials

Дополнительно обязательны:

- MaterialRequirement;
- MaterialPurchaseOrder;
- material ownership;
- delivery destination;
- lot reservation;
- planned consumption;
- actual consumption or controlled estimate;
- leftover disposition.

### 51.4 Route C — finished goods / ODM / white label

Required objects:

- SupplierProductCandidate;
- supplier specification;
- sample or approved waiver;
- customization requirements where applicable;
- FinishedGoodsPurchaseOrder;
- incoming QC plan;
- composition and size information;
- Russian label / compliance readiness;
- commercial projection.

### 51.5 Изменение route

Изменение route допускается только до первого подтверждённого supplier order.

После подтверждённого supplier order:

- создаётся новый CollectionItem или новая sourcing branch;
- исходная ветка сохраняется;
- открытые расходы и commitments не переносятся автоматически;
- пользователь видит влияние на календарь, стоимость, samples и compliance.

---

## 52. Supplier и Factory Master

### 52.1 Разделение сущностей

- `Supplier` — коммерческий контрагент;
- `Factory` — физическая производственная площадка;
- один supplier может работать с несколькими factories;
- фабрика может быть собственной, контрактной или назначенной supplier;
- material supplier может не иметь manufacturing factory;
- готовые изделия могут закупаться у торгового supplier с указанным manufacturer.

### 52.2 Supplier fields

- supplier code;
- legal identity;
- supplier type;
- country;
- contacts by role;
- communication language;
- currencies;
- payment terms;
- Incoterms;
- MOQ / MOV;
- lead-time profiles;
- categories;
- material or product capabilities;
- bank details;
- contract references;
- document register;
- status;
- risk notes;
- responsible manager.

### 52.3 Factory fields

- factory code;
- legal operator;
- physical address;
- country / region;
- contact team;
- supported product categories;
- processes;
- sample room capability;
- indicative capacity;
- standard lead time;
- supported inspections;
- approved / restricted / blocked categories;
- status and reason;
- related suppliers;
- active production orders.

### 52.4 Lifecycle

```text
DRAFT
→ UNDER_REVIEW
→ APPROVED
→ ACTIVE
→ SUSPENDED
→ ARCHIVED
```

Rules:

- `APPROVED` requires required legal and banking fields;
- `ACTIVE` requires at least one valid category or material capability;
- suspended supplier cannot receive new RFQ or PO;
- existing orders remain visible and require explicit continuation decision;
- archive is allowed only when no unresolved active commitments exist;
- bank changes do not silently update already confirmed orders.

### 52.5 Supplier portal scope

Внешний supplier/factory пользователь может:

- maintain assigned contacts;
- receive RFQ;
- submit quotation;
- acknowledge sample request;
- confirm PO lines;
- propose dates and quantities;
- update assigned milestones;
- upload documents;
- respond to QC findings.

Он не может:

- менять brand product master;
- видеть quotations конкурентов;
- видеть retailer data;
- менять approved price or order version без buyer decision;
- видеть внутренние margin и target cost, если это не разрешено отдельно.

---

## 53. RFQ, quotations и supplier allocation

### 53.1 RFQ types

```text
MANUFACTURING_RFQ
MATERIAL_RFQ
FINISHED_GOODS_RFQ
```

Разные типы нельзя сравнивать в одной таблице award.

### 53.2 RFQ header

- RFQ number;
- brand legal entity;
- type;
- season / collection;
- currency or accepted currencies;
- requested delivery date;
- quotation deadline;
- invited suppliers;
- Incoterms options;
- payment expectations;
- attachments;
- owner;
- approvers;
- captured source version;
- status.

### 53.3 RFQ line

Depending on type:

- style / SKU / supplier product;
- BOM version;
- material specification;
- color;
- size range;
- quantity;
- MOQ expectation;
- packaging;
- labels;
- sample requirements;
- delivery destination;
- quality requirements;
- required documents.

### 53.4 Quotation

- supplier;
- quotation version;
- quotation currency;
- unit price;
- fixed development/tooling cost;
- included/excluded materials;
- sample cost;
- MOQ;
- production lead time;
- material lead time;
- Incoterms;
- payment schedule;
- quotation validity;
- proposed delivery;
- assumptions;
- exceptions;
- attachments;
- submission timestamp.

### 53.5 Lifecycle

```text
DRAFT
→ ISSUED
→ RESPONSES_OPEN
→ QUOTED
→ UNDER_COMPARISON
→ AWARDED
→ ALLOCATED
```

Side states:

```text
CANCELLED / EXPIRED / NO_AWARD
```

### 53.6 Authoritative rules

- source SKU, BOM, material specification or supplier product version is snapshotted at RFQ issue;
- material change after issue does not silently change the RFQ;
- supplier can quote only when invited and active;
- late quotation requires explicit acceptance by authorized user;
- quotation totals are calculated server-side;
- award stores exact quotation version;
- allocation quantity cannot exceed awarded quantity without a new decision;
- split award is allowed only when policy permits and every share is explicit;
- award does not create a supplier PO automatically without review;
- cancellation after award requires reason and impact review.

### 53.7 Comparison screen

Columns:

- normalized unit cost;
- currency and FX snapshot;
- fixed costs;
- MOQ;
- lead time;
- requested versus proposed delivery;
- payment terms;
- Incoterms;
- sample timing;
- included materials;
- expected landed-cost estimate;
- exceptions;
- supplier history;
- selected / rejected reason.

### 53.8 Events

- `rfq_created`;
- `rfq_issued`;
- `supplier_invited`;
- `quotation_submitted`;
- `quotation_revised`;
- `quotation_late_accepted`;
- `rfq_awarded`;
- `rfq_split_awarded`;
- `rfq_allocated`;
- `rfq_cancelled`.

---

## 54. Materials, ownership and factory balances

### 54.1 Canonical entities

- `Material`;
- `MaterialColor`;
- `MaterialSupplierOffer`;
- `MaterialRequirement`;
- `MaterialPurchaseOrder`;
- `MaterialShipment`;
- `MaterialReceipt`;
- `MaterialLot`;
- `MaterialReservation`;
- `MaterialConsumption`;
- `MaterialBalanceAdjustment`.

### 54.2 Material requirement calculation

Inputs:

- approved BOM version;
- planned production quantity;
- consumption per unit;
- wastage percentage;
- sample requirement;
- existing usable balance;
- minimum supplier order;
- safety allowance.

Output:

- gross required quantity;
- available quantity;
- reserved quantity;
- shortage;
- suggested purchase quantity;
- affected styles and orders.

### 54.3 Ownership model

Every material lot stores:

- legal owner;
- physical custodian;
- supplier;
- ship-from;
- ship-to;
- factory;
- source PO;
- related production orders;
- quantity received;
- quantity reserved;
- quantity consumed;
- quantity rejected;
- available balance;
- valuation basis.

### 54.4 Direct shipment to foreign factory

Required fields:

- brand as buyer/owner;
- material supplier;
- factory consignee;
- notify party where relevant;
- shipping documents;
- lot information;
- destination confirmation;
- factory receipt;
- discrepancy;
- ownership acknowledgement.

### 54.5 Rules

- receipt cannot exceed shipped quantity without discrepancy;
- reservation cannot exceed available usable balance;
- consumption cannot be posted to a non-approved production order;
- rejected quantity is excluded from available balance;
- unit conversion is versioned and auditable;
- dye lots must not be mixed when product rule prohibits mixing;
- manual adjustment requires reason, evidence and authorized role;
- leftover material requires disposition: carry forward, return, sell, write off or reallocate.

---

## 55. Samples and approvals

### 55.1 Entities

- `SampleRequest`;
- `SampleVersion`;
- `SampleShipment`;
- `SampleMeasurementSet`;
- `SampleReview`;
- `SampleComment`;
- `SampleDecision`;
- `ApprovedReferenceSample`.

### 55.2 Lifecycle

```text
REQUESTED
→ ACKNOWLEDGED
→ IN_DEVELOPMENT
→ SHIPPED
→ RECEIVED
→ UNDER_REVIEW
→ APPROVED / REVISION_REQUIRED / REJECTED
```

A revised sample creates a new `SampleVersion`; it does not overwrite measurements or comments of the previous version.

### 55.3 Review dimensions

- technical construction;
- measurements and tolerance;
- fit;
- material and color;
- workmanship;
- trims;
- labels;
- packaging;
- visual/commercial acceptance;
- compliance concerns;
- cost impact;
- timing impact.

### 55.4 Comment model

Each comment stores:

- author;
- timestamp;
- review dimension;
- image pin or measurement point;
- text;
- attachment;
- visibility: internal / supplier-visible;
- requested action;
- owner;
- resolution state.

### 55.5 Ready-goods simplified sample

For Route C:

```text
REQUESTED
→ RECEIVED
→ COMMERCIAL_REVIEW
→ QUALITY_REVIEW
→ COMPLIANCE_REVIEW
→ APPROVED_FOR_COLLECTION / REJECTED
```

Full technical fit and grading are optional unless the brand requests customization.

---

## 56. Supplier orders and controlled changes

### 56.1 Three separate order aggregates

| Aggregate | Purpose |
|---|---|
| `ProductionOrder` | Manufacture according to brand specification |
| `MaterialPurchaseOrder` | Purchase fabric, trims, labels or packaging |
| `FinishedGoodsPurchaseOrder` | Purchase finished, ODM or white-label goods |

### 56.2 Common order header

- internal order ID and number;
- order type;
- buyer legal entity;
- supplier legal entity;
- factory where relevant;
- contract and specification reference;
- currency;
- Incoterms;
- payment schedule;
- ship-to;
- delivery date/window;
- responsible users;
- source quotation version;
- version;
- status;
- attachments.

### 56.3 Common line fields

- line ID;
- product/material reference;
- source version;
- color;
- size;
- ordered quantity;
- supplier-confirmed quantity;
- unit price;
- tax if applicable;
- requested date;
- confirmed date;
- packaging;
- labels;
- line status;
- rejection/change reason.

### 56.4 Lifecycle

```text
DRAFT
→ INTERNAL_APPROVAL
→ SENT
→ SUPPLIER_REVIEW
→ CHANGES_PROPOSED / PARTIALLY_CONFIRMED / CONFIRMED
→ IN_PROGRESS
→ READY_TO_SHIP
→ SHIPPED
→ PARTIALLY_RECEIVED / RECEIVED
→ CLOSED
```

Side states:

```text
ON_HOLD / REJECTED / CANCELLED / DISPUTED
```

### 56.5 Change control

После `SENT` исходная версия неизменяема.

Любое изменение создаёт `SupplierOrderAmendment` с:

- инициатором;
- исходной версией;
- changed fields;
- reason;
- quantity and cost impact;
- timing impact;
- affected materials/samples;
- supplier response;
- buyer decision;
- effective version.

### 56.6 Validation

- supplier and factory must be active;
- source quotation must match selected version where required;
- quantity must meet approved MOQ or approved exception;
- currency and Incoterms must be present for foreign order;
- bank details change after approval triggers payment hold;
- order cannot close with unresolved receipt discrepancy;
- supplier cannot confirm an obsolete order version;
- received quantity must be reconciled at line level.

---

## 57. Production calendar and exception management

### 57.1 ProductionMilestone

Fields:

- milestone type;
- production order;
- style / line scope;
- planned date;
- supplier-confirmed date;
- latest forecast;
- actual date;
- owner;
- responsible external party;
- dependencies;
- evidence;
- status;
- delay reason;
- recovery action.

### 57.2 Milestone types

- order confirmation;
- deposit;
- materials ordered;
- materials ready;
- materials received at factory;
- PPS approved;
- cutting start/complete;
- sewing/assembly start/complete;
- finishing;
- packing;
- inspection;
- cargo ready;
- shipment;
- receipt.

### 57.3 Exception

An exception is created when:

- forecast exceeds tolerance;
- required material is not available;
- supplier proposes lower quantity;
- sample approval blocks start;
- inspection fails;
- shipment document is missing;
- cost change requires approval;
- compliance requirement blocks commercial readiness.

Exception fields:

- source object;
- severity;
- reason;
- detected at;
- owner;
- due date;
- affected quantity/value;
- affected launch/order;
- recovery plan;
- decision;
- closed at.


---

## 58. Quality control

### 58.1 Inspection types

- pre-production;
- inline;
- final;
- loading;
- incoming warehouse;
- ready-goods incoming.

### 58.2 Inspection fields

- inspection ID;
- order and line scope;
- supplier/factory;
- location;
- inspector;
- date;
- inspected quantity;
- sampling method;
- optional AQL level;
- critical/major/minor defect counts;
- measurements;
- photos and report;
- accepted/rejected quantity;
- result;
- conditional requirements;
- reinspection date.

### 58.3 Defect

Fields:

- category;
- severity;
- SKU / size / lot;
- quantity affected;
- description;
- evidence;
- suspected cause;
- correction;
- supplier response;
- responsibility;
- cost impact;
- state.

### 58.4 Lifecycle

```text
PLANNED
→ SCHEDULED
→ IN_PROGRESS
→ REPORT_SUBMITTED
→ REVIEWED
→ PASS / CONDITIONAL_PASS / FAIL
→ CLOSED
```

### 58.5 Rules

- failed inspection blocks `READY_TO_SHIP`, unless authorized conditional release exists;
- conditional pass has explicit conditions and expiry;
- incoming QC can reduce accepted quantity independently of shipped quantity;
- supplier claim references exact order, inspection and defect evidence;
- accepted reference sample and active specification version are shown during inspection;
- changing inspection result requires audit and reason.

---

## 59. Costing and landed cost

### 59.1 Cost versions

```text
TARGET
ESTIMATE
SUPPLIER_QUOTATION
NEGOTIATED
PO_COMMITTED
PLANNED_LANDED
ACTUAL_LANDED
RECONCILED
```

### 59.2 Cost components

- finished product or manufacturing cost;
- fabric;
- trims;
- labels;
- packaging;
- development/tooling;
- samples;
- origin logistics;
- international freight;
- insurance;
- customs duty;
- customs fees;
- broker;
- certification/testing;
- marking;
- domestic delivery;
- bank and payment fee when included by policy;
- FX difference.

### 59.3 Allocation methods

Additional costs can be allocated by:

- units;
- net weight;
- gross weight;
- volume;
- customs value;
- purchase value;
- manually approved distribution.

The method and source amounts are stored in every calculation version.

### 59.4 Rules

- money is stored with currency and precise decimal/minor-unit representation;
- FX snapshot stores rate, date and source;
- planned cost remains unchanged when actual cost arrives;
- actual landed cost requires source references;
- one expense cannot be allocated twice to the same scope;
- cost changes after published wholesale price create margin impact, not silent price change;
- Syntha does not create accounting postings.

### 59.5 Margin link

```text
Wholesale Net Price
- Actual or Planned Landed Cost
= Wholesale Gross Margin
```

Both price and cost versions used in the calculation must be traceable.

---

## 60. Russian compliance and marking control

### 60.1 ComplianceRequirement

Fields:

- product/category scope;
- ТН ВЭД ЕАЭС;
- ОКПД2 where used;
- legal entity role;
- country of origin;
- applicable regulation;
- required document type;
- effective dates;
- marking applicability;
- source and last review;
- rule version.

### 60.2 ComplianceDocument

- declaration/certificate/test protocol type;
- number;
- issuer/register reference;
- applicant;
- manufacturer;
- product scope;
- covered articles/models;
- issue/expiry dates;
- files;
- verification state;
- responsible user;
- blocking status.

### 60.3 Label readiness

Required data can include:

- brand;
- product name;
- manufacturer;
- importer;
- country of origin;
- composition;
- size;
- care instructions;
- EAC where applicable;
- production/import information;
- article and barcode;
- Russian-language text version.

### 60.4 Marking readiness

```text
Applicability Resolved
→ GTIN Assigned
→ National Catalog Card Ready
→ Codes Ordered
→ Codes Applied
→ Verification Passed
→ Introduction into Circulation Confirmed
→ Wholesale Transfer Ready
```

### 60.5 Rules

- applicability is calculated by rule version, code, role and date;
- manual override requires evidence and expiry/review date;
- commercial publication may be allowed before codes are applied only when policy permits pre-order and the exact block is visible;
- shipment of marking-required goods is blocked when required external status is missing;
- official status is stored as external reference, not invented inside Syntha;
- corrections from 1С or provider are reconciled rather than silently replacing local records.

---

## 61. Commercial Product Projection and catalog publication

### 61.1 Commercial projection fields

- projection ID and version;
- linked technical or purchased product version;
- brand article;
- commercial name;
- localized descriptions;
- category and commercial attributes;
- images/video;
- composition shown to buyer;
- colors;
- size scale;
- wholesale and recommended retail price references;
- delivery windows;
- MOQ/MOV;
- pack ratio;
- orderable flag;
- available quantity or availability mode;
- country of origin;
- buyer-visible documents;
- publication status.

### 61.2 Readiness dimensions

- product identity ready;
- content ready;
- price ready;
- delivery ready;
- order unit ready;
- compliance ready;
- image rights ready;
- publication scope assigned.

### 61.3 Lifecycle

```text
DRAFT
→ CONTENT_REVIEW
→ COMMERCIAL_REVIEW
→ READY_TO_PUBLISH
→ PUBLISHED
→ UPDATED
→ UNPUBLISHED
→ RETIRED
```

### 61.4 Change impact

A material change after publication identifies:

- affected catalog views;
- linesheets;
- showrooms;
- retailer assortments;
- draft orders;
- submitted orders;
- exports and shared links.

Changes to submitted or confirmed order lines do not alter those order snapshots. They create notification and, where needed, an amendment proposal.

### 61.5 Publication rules

- no publication without at least one image, orderable SKU, price context and delivery context;
- unpublished technical fields never appear in buyer export;
- product may be visible but not orderable only with an explicit reason;
- buyer-specific visibility is checked at request time;
- expired commercial projection cannot be added to a new order;
- carry-over product can reuse technical identity but must use current commercial version.

---

## 62. Connections, access and price lists

### 62.1 Connection

Fields:

- brand;
- retailer;
- initiating party;
- request message;
- status;
- decision maker;
- reason;
- connected from/to;
- assigned sales manager;
- account notes;
- last activity.

Lifecycle:

```text
NOT_CONNECTED
→ REQUESTED
→ UNDER_REVIEW
→ CONNECTED
→ SUSPENDED / DISCONNECTED
```

### 62.2 CommercialAccessGrant

Defines:

- retailer organization/legal entity;
- collection and category scope;
- product scope;
- price list;
- currency;
- territory;
- delivery destinations;
- MOQ/MOV policy;
- payment terms;
- document visibility;
- effective dates;
- sales manager;
- status.

### 62.3 PriceList

Fields:

- price list ID/version;
- legal seller;
- currency;
- tax/VAT presentation;
- valid from/to;
- default terms;
- eligible retailer groups;
- lines by SKU/style/category;
- base wholesale price;
- optional discount;
- recommended retail price;
- minimums;
- approval status.

Lifecycle:

```text
DRAFT
→ UNDER_APPROVAL
→ APPROVED
→ SCHEDULED
→ ACTIVE
→ EXPIRED / REVOKED / SUPERSEDED
```

### 62.4 Price resolution order

```text
Exact Retailer/SKU Price
→ Retailer Group/SKU Price
→ Retailer/Category Rule
→ Assigned Base Price List
→ No Price / Block Order
```

The result stores the rule and version that resolved the price.

### 62.5 Rules

- connection alone grants no catalog or price access;
- expired access blocks new order lines but preserves historical orders;
- price used in submitted order is snapshotted;
- price change cannot modify submitted or confirmed order;
- unauthorized user cannot export a broader catalog than visible in UI;
- disconnect does not delete documents, orders or audit history.

---

## 63. Showroom and Linesheet detail

### 63.1 Showroom

Fields:

- showroom ID/version;
- brand;
- season/collection;
- title and story;
- cover;
- chapters;
- looks;
- hotspots;
- linked products;
- visible retailer groups;
- publish dates;
- owner;
- status.

Actions:

- create from collection;
- reorder chapters;
- attach products;
- preview as selected retailer;
- publish/unpublish;
- duplicate for another market;
- share controlled link;
- view engagement analytics.

### 63.2 Linesheet

Fields and settings:

- collection/drop;
- included products;
- sorting;
- visible commercial fields;
- price list context;
- language;
- currency;
- image layout;
- quantity matrix enabled/disabled;
- export template;
- version.

### 63.3 Controlled share link

Stores:

- resource and version;
- recipient or access group;
- expiry;
- allowed actions;
- password/one-time access where enabled;
- download permission;
- views;
- revoked timestamp.

Anonymous public access is disabled by default for wholesale prices.

---

## 64. Buying workspace, wholesale orders and amendments

### 64.1 Draft order

Header:

- retailer;
- buyer legal entity;
- seller legal entity;
- price list context;
- currency;
- billing and shipping address;
- delivery window;
- payment terms;
- buyer PO number;
- notes;
- owner;
- last saved at.

Line:

- commercial projection version;
- SKU;
- color;
- size;
- quantity;
- pack;
- unit price;
- discount;
- line total;
- requested delivery;
- availability result;
- validation messages.

### 64.2 Quantity entry

Required UX:

- keyboard-first grid;
- paste from Excel;
- paste preview before commit;
- invalid cell highlighting;
- row/column totals;
- units and value totals;
- pack and MOQ feedback;
- zero/remove distinction;
- undo last paste;
- autosave with visible status.

### 64.3 Validation before submission

- active connection and access;
- valid price list;
- orderable commercial version;
- valid SKU;
- MOQ/MOV;
- pack multiple;
- currency consistency;
- required addresses;
- delivery window;
- internal approval where configured;
- product cancellation or replacement;
- duplicate buyer PO warning.

### 64.4 WholesaleOrder lifecycle

```text
DRAFT
→ INTERNAL_REVIEW
→ APPROVED_INTERNAL
→ SUBMITTED
→ BRAND_REVIEW
→ CHANGES_PROPOSED / PARTIALLY_CONFIRMED / CONFIRMED
→ IN_FULFILLMENT
→ PARTIALLY_SHIPPED / SHIPPED
→ COMPLETED
```

Side states:

```text
REJECTED / CANCELLED / ON_HOLD / DISPUTED
```

### 64.5 Brand confirmation

Brand can decide at line level:

- accept requested quantity/date/price;
- accept partial quantity;
- propose new quantity;
- propose new delivery date;
- propose permitted replacement;
- reject line;
- hold line for clarification.

### 64.6 Order amendment

Every amendment stores:

- source order version;
- proposer;
- affected lines/fields;
- old and proposed values;
- reason;
- commercial impact;
- date impact;
- comments;
- retailer response;
- accepted effective version.

### 64.7 Order truth views

The UI always separates:

- submitted order;
- latest brand proposal;
- current agreed order;
- pending amendments;
- fulfilled quantities;
- document/ERP status.

### 64.8 Cancellation

Cancellation policy evaluates:

- order state;
- agreed cancellation deadline;
- production/procurement commitment;
- shipped quantities;
- responsible party;
- required approval;
- cancellation reason.

Cancellation never deletes the order.

---

## 65. Documents, 1С, ЭДО, payment and shipment status

### 65.1 Commercial documents inside Syntha

- order confirmation;
- specification;
- invoice for payment / proforma;
- packing list;
- shipment notice;
- discrepancy act attachment;
- claim attachment;
- PDF/XLSX order export.

Each document stores:

- type;
- issuer and recipient;
- related order/version/shipment;
- number/date;
- currency/value where relevant;
- file;
- generated/uploaded source;
- version;
- status;
- external references.

### 65.2 1С integration contract

Outbound:

- organizations and legal entities;
- product/SKU mapping;
- confirmed wholesale order;
- supplier orders where architecture requires;
- commercial terms;
- shipment preparation data;
- marking references.

Inbound:

- ERP document IDs;
- invoice/payment status;
- stock/availability where enabled;
- shipment status;
- receipt status;
- УПД/ЭДО status;
- marking exchange result;
- errors and reconciliation data.

### 65.3 Mapping

Every mapped object stores:

- Syntha ID;
- external system;
- external ID;
- mapping version;
- mapped at;
- mapped by;
- last synchronized at;
- source of truth;
- conflict status.

### 65.4 Integration rules

- outbound requests use idempotency keys;
- inbound messages are deduplicated;
- retry does not create duplicate orders/documents;
- integration failure does not silently mark business action successful;
- every failed message has owner, retry state and payload reference;
- manual fallback records who performed it;
- conflicting data is shown for reconciliation;
- accounting amounts from 1С are not overwritten by user-entered estimates.

### 65.5 Payment status

```text
NOT_INVOICED
→ INVOICED
→ PARTIALLY_PAID
→ PAID
```

Side states:

```text
OVERDUE / PAYMENT_ON_HOLD / REFUNDED / DISPUTED
```

Core stores status and references, not banking processing.

### 65.6 Shipment status

```text
NOT_READY
→ PREPARING
→ READY_TO_SHIP
→ SHIPPED
→ IN_TRANSIT
→ DELIVERED
```

Side states:

```text
PARTIALLY_SHIPPED / DELAYED / LOST / DISCREPANCY
```

Line-level shipped and delivered quantities are required for partial fulfillment.

---

## 66. API, events and technical invariants

### 66.1 API principles

- API version prefix;
- resource-oriented reads;
- explicit commands for lifecycle transitions;
- no state-changing GET requests;
- pagination for registries;
- filter and sort allowlist;
- organization scope in authorization context;
- consistent error codes;
- request correlation ID;
- OpenAPI contract for public/internal integrations.

### 66.2 Mutation requirements

Every important mutation uses:

- `Idempotency-Key`;
- `expectedVersion` or equivalent optimistic concurrency;
- actor authorization at execution time;
- reason for destructive or exceptional actions;
- audit record;
- domain event in the same successful transaction or reliable outbox.

### 66.3 Money and quantity

- amount always includes currency;
- monetary precision is deterministic;
- quantities use decimal-capable type where units require it;
- units of measure are explicit;
- unit conversion rules are versioned;
- rounding method is stored for calculated financial values;
- display formatting never changes stored value.

### 66.4 Time

- storage uses UTC timestamps;
- business dates preserve local timezone context;
- delivery windows use explicit start/end date;
- supplier and buyer timezone is displayed;
- deadlines define whether end time is inclusive;
- date changes after confirmation are amendments.

### 66.5 AuditEntry

Stores:

- actor;
- organization;
- action;
- object type/ID/version;
- before/after reference or patch;
- reason;
- timestamp;
- request/correlation ID;
- IP/device metadata where permitted;
- integration source;
- success/failure.

### 66.6 Core event catalog

Product & Supply:

- `collection_item_created`;
- `development_route_selected`;
- `style_version_created`;
- `style_version_approved`;
- `bom_version_published`;
- `sample_requested`;
- `sample_decided`;
- `rfq_issued`;
- `quotation_submitted`;
- `rfq_awarded`;
- `supplier_order_sent`;
- `supplier_order_confirmed`;
- `material_received`;
- `material_reserved`;
- `material_consumed`;
- `production_milestone_changed`;
- `inspection_completed`;
- `landed_cost_recalculated`;
- `compliance_readiness_changed`;
- `product_commercial_ready`.

Wholesale Commerce:

- `connection_requested`;
- `connection_approved`;
- `commercial_access_assigned`;
- `price_list_activated`;
- `commercial_projection_published`;
- `showroom_published`;
- `order_draft_saved`;
- `wholesale_order_submitted`;
- `order_change_proposed`;
- `wholesale_order_confirmed`;
- `order_exported_to_erp`;
- `payment_status_changed`;
- `shipment_status_changed`;
- `edo_status_changed`.

### 66.7 Event envelope

Every event includes:

- event ID;
- event type/version;
- occurred at;
- organization ID;
- aggregate type/ID/version;
- actor/source;
- correlation/causation IDs;
- payload;
- data classification;
- schema version.

---

## 67. Целевая карта экранов

### 67.1 Shared

```text
Dashboard
Organizations
Legal Entities
Team and Roles
Locations
Dictionaries
Files
Notifications
Integrations
Audit Log
Settings
```

### 67.2 Product & Supply

```text
Collections
├── Collection Plan
├── Collection Items
├── Readiness Board
└── Calendar

Products
├── Styles
├── Colorways
├── SKUs
├── BOM
├── Measurements
├── Tech Packs
└── Commercial Readiness

Materials
├── Material Library
├── Requirements
├── RFQs
├── Purchase Orders
├── Lots and Balances
└── Consumption

Suppliers
├── Supplier Registry
├── Factory Registry
├── Documents
└── Performance

Sourcing
├── RFQs
├── Quotations
├── Comparison
└── Awards

Samples
├── Requests
├── In Transit
├── Review
└── Approved References

Orders to Suppliers
├── Production Orders
├── Material POs
├── Finished Goods POs
├── Amendments
└── Receipts

Production
├── Milestone Calendar
├── Exceptions
└── Supplier Updates

Quality
├── Inspection Plans
├── Reports
├── Defects
└── Claims

Costing
├── Cost Versions
├── Landed Cost
└── Plan/Actual

Compliance
├── Requirements
├── Documents
├── Labels
└── Marking Readiness
```

### 67.3 Wholesale Commerce

```text
Brand Profile
Retailers
Connections
Commercial Access
Catalog
Collections
Showrooms
Linesheets
Price Lists
Buying Workspace
Orders
Order Changes
Documents
Payments
Shipments
Messages
Wholesale Analytics
```

### 67.4 Navigation rules

- user sees only modules allowed by role;
- retailer does not see Product & Supply navigation;
- supplier sees a reduced portal, not brand internal navigation;
- every registry supports saved filters and export where permitted;
- every object page shows status, owner, last update and next required action;
- destructive actions are not hidden behind ambiguous icons;
- mobile is optimized for review, messaging, milestone updates and inspections, not for large BOM/order grids.

---

## 68. Expanded UAT and acceptance criteria

### 68.1 Organization and access

1. User belongs to two brands and switches account without seeing cached data from the previous brand.
2. Factory user sees only assigned production orders and samples.
3. Retailer buyer cannot access another retailer price list through a copied URL.
4. Suspended supplier cannot receive a new RFQ.
5. Bank-details change creates an audit event and does not change an approved payment instruction silently.

### 68.2 Product identity

6. One Style has two versions with different BOM; old sample remains linked to the old version.
7. Carry-over item keeps technical lineage but receives a new commercial price version.
8. Supplier SKU and brand SKU remain separate searchable identifiers.
9. Same SKU ID cannot be reassigned to a different size.
10. Discontinued product remains visible in historical orders.

### 68.3 Route A/B/C

11. Route A blocks commercial readiness without required technical approval.
12. Route B blocks production release when material shortage remains unresolved.
13. Route C approves ready goods without requiring a BOL.
14. Changing Route C supplier product creates a new sourced-product branch.
15. Route cannot change silently after a confirmed supplier order.

### 68.4 RFQ and quotation

16. RFQ captures exact BOM/material/supplier-product version at issue.
17. Supplier cannot submit quotation when not invited.
18. Late quotation requires explicit buyer acceptance.
19. Award references the exact quotation version.
20. Split award quantities equal approved allocation total.
21. Material and finished-goods quotations cannot be compared as if they were identical scope.

### 68.5 Materials

22. Fabric purchased in China is delivered directly to a Turkish factory while ownership remains with the Russian brand.
23. Factory receipt discrepancy reduces usable balance.
24. One lot is reserved across two production orders without exceeding available quantity.
25. Dye-lot mixing restriction blocks invalid allocation.
26. Manual balance adjustment requires reason and evidence.
27. Actual consumption updates leftover quantity without changing original planned consumption.

### 68.6 Samples

28. Revised sample creates a new version and preserves old comments.
29. Supplier-visible and internal comments remain separated.
30. Measurement deviation links to the correct point and sample version.
31. Ready-goods sample follows simplified review.
32. Rejected sample blocks the relevant readiness gate.

### 68.7 Supplier orders and production

33. Supplier confirms only part of a production-order line.
34. Supplier proposes a later date and buyer accepts it as a new order version.
35. Obsolete order version cannot be confirmed.
36. Failed milestone opens an exception with affected launch date.
37. Partial receipt keeps order open.
38. Order cannot close with unresolved quantity discrepancy.

### 68.8 Quality

39. Failed final inspection blocks ready-to-ship.
40. Conditional pass has explicit conditions and expiry.
41. Incoming QC of ready goods reduces accepted quantity.
42. Supplier claim links order, inspection, defects and cost impact.
43. Changed inspection result requires audit and authorization.

### 68.9 Costing

44. Planned landed cost remains unchanged after actual customs cost arrives.
45. Expense allocation method is reproducible.
46. One logistics invoice cannot be allocated twice.
47. FX snapshot remains linked to the purchasing decision.
48. Cost increase changes margin analysis but not published price automatically.

### 68.10 Compliance and marking

49. Marking applicability changes by rule effective date.
50. Expired declaration blocks commercial readiness according to policy.
51. Product with incomplete Russian label shows blocking fields.
52. Marking-required shipment is blocked without required external readiness.
53. External provider correction creates reconciliation rather than silent overwrite.

### 68.11 Commercial catalog and access

54. Technical BOM and supplier cost are absent from buyer exports.
55. Retailer sees only assigned collection and price list.
56. Expired commercial access blocks new order but not order history.
57. Product update identifies affected draft and submitted orders.
58. Unpublished product cannot be added through a direct API call.
59. Controlled share link expires and can be revoked.

### 68.12 Wholesale orders

60. Buyer pastes an Excel quantity matrix and reviews validation before saving.
61. MOQ violation blocks submission without approved override.
62. Submitted order stores exact commercial and price versions.
63. Brand partially confirms quantities and proposes a new date.
64. Retailer accepts amendment and current agreed order updates.
65. Original submitted order remains unchanged.
66. Cancelled order remains searchable and auditable.
67. Partial shipment updates line quantities and order state correctly.

### 68.13 Integrations

68. Retried 1С export does not create a duplicate order.
69. Failed ERP export remains visible as failed, not completed.
70. External ID conflict opens reconciliation.
71. УПД status returns from EDO and links to the correct order/shipment.
72. Payment update from 1С preserves source and timestamp.
73. Manual fallback is auditable.

---

## 69. Delivery decomposition

### 69.1 Foundation wave

- organizations and legal entities;
- memberships and roles;
- dictionaries;
- files/comments/audit;
- product identity and versions;
- integration framework;
- money, quantity and date primitives.

### 69.2 Product & Supply wave 1

- collection items and route selection;
- style/colorway/SKU;
- BOM and measurements;
- suppliers/factories;
- RFQ/quotation/award;
- samples;
- supplier orders.

### 69.3 Product & Supply wave 2

- material ownership/lots/balances;
- production calendar;
- quality;
- landed cost;
- compliance and marking readiness;
- commercial readiness gate.

### 69.4 Wholesale Commerce wave 1

- brand/retailer profiles;
- connections;
- commercial access;
- price lists;
- catalog publication;
- linesheets;
- simple buying grid;
- wholesale orders and amendments.

### 69.5 Wholesale Commerce wave 2

- showrooms;
- retailer approvals;
- supplier and retailer portals;
- documents;
- payment/shipment status;
- 1С/ЭДО/marking integrations;
- analytics.

### 69.6 Scale wave

- Visual Assortment;
- door allocation;
- sell-through and reorder;
- retailer EDI;
- multilingual supplier collaboration;
- add-on compliance packs;
- AI-assisted mapping after data quality is stable.

---

## 70. Product decision filter

Перед добавлением любой функции задаются вопросы:

1. Помогает ли она создать, закупить, подготовить или произвести товар?
2. Помогает ли она показать товар магазину, согласовать цену или получить оптовый заказ?
3. Нужна ли она российскому бренду в типовом процессе или только отдельной enterprise-компании?
4. Является ли Syntha правильной system of record для этих данных?
5. Можно ли интегрироваться с 1С, ЭДО, «Честным знаком», WMS, TMS или другой внешней системой вместо дублирования?
6. Какой measurable outcome функция улучшает?
7. Какие новые риски, роли, документы и проверки она создаёт?
8. Может ли она быть add-on без усложнения core?

Функция включается в core только при положительном ответе на первый или второй вопрос и подтверждённой необходимости для основного целевого пользователя.

Финальная граница продукта остаётся неизменной:

```text
Создать, заказать или купить товар
→ подготовить его для российского рынка
→ включить в коллекцию
→ открыть коммерческий доступ магазину
→ получить, согласовать и подтвердить оптовый заказ
→ передать исполнение и юридические документы в российский учётный контур
```

---

## 71. Двуязычная продуктовая модель / Bilingual Product Model

### 71.1 Назначение / Purpose

Syntha проектируется как двуязычная российская fashion-платформа для брендов, которые:

- разрабатывают изделия самостоятельно;
- размещают производство в России, ЕАЭС, Китае, Турции, Индии, Вьетнаме и других странах;
- отдельно закупают ткань, фурнитуру, упаковку и этикетки;
- закупают ODM, white-label, private-label или полностью готовые изделия;
- продают коллекции российским и зарубежным магазинам через B2B wholesale commerce;
- используют российский учетный и юридический контур: 1С, ЭДО, УПД, Национальный каталог и ГИС МТ «Честный знак».

Syntha is designed as a bilingual Russian fashion platform for brands that develop products, source materials, manufacture or purchase finished goods internationally, and sell collections to retailers through controlled B2B wholesale workflows.

### 71.2 Языковой принцип / Language principle

- русский язык — основной язык внутренней работы российского бренда;
- English — обязательный язык supplier, factory, agent и international buyer collaboration;
- системные коды, API-поля, event names и enum values фиксируются на английском;
- пользовательские названия, описания, инструкции и документы могут иметь версии `ru` и `en`;
- перевод не заменяет оригинал: система хранит source text, translated text, translation status и reviewer;
- денежные, количественные и нормативные значения не переводятся и не преобразуются без явного правила;
- поставщик может отвечать на английском, а бренд видеть параллельно оригинал и утвержденный перевод;
- юридически значимый документ хранится на языке его подписания; перевод является отдельным файлом или представлением.

### 71.3 Двуязычный интерфейс / Bilingual user interface

Каждый экран поддерживает:

- переключение `Русский / English` без выхода из объекта;
- сохранение языка пользователя в профиле;
- локализованные navigation labels, field labels, tooltips, validation messages и email templates;
- отображение исходного текста рядом с переводом для critical fields;
- fallback: выбранный язык → язык организации → исходный язык → системный English label;
- поиск по русскому и английскому названию, артикулу, supplier code и transliterated term;
- экспорт RU, EN или RU+EN;
- двуязычный PDF/Excel template selection;
- language-aware sorting и полнотекстовый поиск.

### 71.4 Объекты локализации / Localization entities

```text
LocalizedText
TranslationVariant
TranslationReview
LanguagePreference
DocumentLanguageVersion
TerminologyEntry
CountryLanguageProfile
```

`LocalizedText` содержит:

- object type / object ID / field key;
- source language;
- source value;
- target language;
- translated value;
- translation method: `MANUAL`, `IMPORTED`, `MACHINE_ASSISTED`;
- status: `DRAFT`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `SUPERSEDED`;
- translator and reviewer;
- created/approved timestamps;
- terminology version;
- confidentiality class.

### 71.5 Терминологический словарь / Terminology governance

Платформа ведет утвержденный RU/EN glossary для fashion, производства и wholesale. Термин может иметь:

- canonical English term;
- preferred Russian term;
- forbidden or deprecated translations;
- domain: PLM, sourcing, production, quality, trade, wholesale, finance, compliance;
- category-specific meaning;
- abbreviation;
- examples;
- owner;
- effective version.

Например:

| English | Русский | Правило |
|---|---|---|
| Style | Модель | Не переводить как «стиль» в product master |
| Colorway | Цветомодель | Отдельная комбинация модели и цвета |
| Bill of Materials | Спецификация материалов / BOM | BOM сохраняется как международное сокращение |
| Bill of Labor | Спецификация операций / BOL | Не смешивать с логистическим bill of lading |
| Tech Pack | Технический пакет / техпак | Содержит утвержденный snapshot |
| Linesheet | Лайншит / ассортиментный лист | Коммерческий документ для buyer |
| Wholesale Order | Оптовый заказ магазина | Не смешивать с Production Order |
| Delivery Window | Окно поставки | Диапазон дат, не одна дата |
| Marking Code | Код маркировки | В российском контуре — внешний статус ГИС МТ |

---

## 72. Систематизированная архитектура benchmark-функций / Ordered Benchmark Architecture

### 72.1 Принцип использования benchmark

Функциональность не копируется по интерфейсу конкретного продукта. Она систематизируется по бизнес-процессу и владельцу данных:

```text
OMNIDATA + CENTRIC
→ Product planning
→ Product development
→ Materials and specifications
→ Sourcing and suppliers
→ Samples and approvals
→ Supplier orders and production
→ Quality, costing and readiness

JOOR + NUORDER
→ Brand and retailer network
→ Commercial catalog
→ Showrooms and linesheets
→ Retailer access and price lists
→ Assortment and order writing
→ Wholesale order collaboration
→ Sales and order analytics
```

Omnidata и Centric подтверждают необходимость единого продуктового контура, версионных карточек, BOM/BOL, measurement charts, tech packs, materials, sourcing, quotations, supplier collaboration, samples, orders, quality и интеграций.

### 72.2 Карта функциональных источников / Capability source map

| Домен Syntha | Основной benchmark | Что берем как функциональный принцип | Российская адаптация |
|---|---|---|---|
| Collection Planning | Omnidata, Centric | line plan, assortment matrix, calendar, readiness | сезонность РФ, Excel, рублевые и валютные планы |
| Product Master | Omnidata, Centric | style/colorway/SKU, history, reusable product data | RU/EN fields, ЕАЭС и маркировочные атрибуты |
| Specifications | Omnidata, Centric | BOM, BOL, measurements, tech pack, version control | давальческие материалы, шаблоны зарубежных фабрик |
| Supplier Sourcing | Omnidata, Centric | RFQ, quote comparison, allocation, supplier portal | CNY/TRY/USD/EUR, Incoterms, российское юрлицо-покупатель |
| Samples | Omnidata, Centric | sample requests, fit/measurement review, approvals | международная доставка образцов, двуязычные comments |
| Supplier Orders | Omnidata, Centric | product/size/color orders, status, ERP exchange | Production PO, Material PO, Finished Goods PO, 1С |
| Quality | Omnidata, Centric | inspections, defects by SKU, photos, reports | входной контроль импорта, claim package |
| Retailer Network | JOOR, NuORDER | discovery, connection, retailer profile | российские реквизиты, controlled access, без обязательного marketplace settlement |
| Catalog and Showroom | JOOR, NuORDER | digital catalog, linesheet, virtual showroom | RU/EN commercial content, RUB and export price lists |
| Assortment | JOOR, NuORDER | visual and grid selection, doors, deliveries, rollups | simple order grid first; doors and rollups as scalable capability |
| Wholesale Orders | JOOR, NuORDER | order entry, confirmation, status, reporting | 1С export, ЭДО/УПД status, маркируемые SKU |

### 72.3 Непрерывная цепочка объектов / End-to-end object chain

```text
CollectionPlan
→ CollectionItem
→ Style / SupplierProductCandidate
→ StyleVersion
→ Colorway / SKU
→ BOM / Measurement / TechPack or SupplierSpecification
→ RFQ / Quotation / Award
→ Sample / Approval
→ SupplierOrder
→ Production or Supply Milestones
→ Inspection / Receipt
→ CostVersion / ComplianceReadiness
→ ProductReadinessSnapshot
→ CommercialProductProjection
→ CatalogPublication / Linesheet / Showroom
→ CommercialAccessGrant / PriceList
→ RetailerAssortment / DraftOrder
→ WholesaleOrder / Amendment
→ ERP / EDO / Shipment / Payment Status
```

Ни один downstream-объект не должен читать случайную рабочую версию upstream-объекта. Связь всегда содержит точный ID и version.

---

## 73. Международный операционный профиль / International Operating Profile

### 73.1 CountryProfile

Для каждой страны создается конфигурируемый профиль:

- ISO country code;
- official and working languages;
- currencies;
- timezone;
- address format;
- phone format;
- registration and tax identifiers;
- banking fields;
- customary payment terms;
- working-week calendar;
- public holidays;
- units commonly used by suppliers;
- permitted Incoterms;
- document templates;
- export/import responsibility hints;
- default label language requirements;
- data transfer and access notes;
- enabled integration providers.

CountryProfile не является юридической консультацией. Он определяет данные, workflow и проверки, которые организация обязана подтвердить.

### 73.2 OrganizationMarketProfile

Одна организация может иметь разные настройки по рынкам:

- selling market;
- buying/source market;
- legal entity;
- default price list currency;
- tax/VAT display;
- contract language;
- logistics routes;
- importer/exporter role;
- required certificates and labels;
- allowed payment methods;
- assigned local representative;
- active dates.

### 73.3 Международная коммуникация / Cross-border collaboration

Обязательные возможности:

- RU/EN comments with original text preserved;
- timezone-aware deadlines;
- date display in local format with unambiguous ISO value;
- metric units as canonical storage;
- supplier-entered local units with controlled conversion;
- multi-currency quotations and orders;
- explicit Incoterms edition and named place;
- bilingual RFQ, PO, sample request, inspection report and claim templates;
- local and international address versions;
- attachment classification by document type;
- tracking number and courier data;
- sender/recipient business calendar.

### 73.4 Multi-currency model

Every amount stores:

```text
original amount
original currency
transaction currency
reporting currency
FX rate
FX rate date
FX source
conversion method
rounding rule
```

Rules:

- supplier quote remains in original currency;
- comparison can show normalized RUB and selected reporting currency;
- confirmed PO snapshots the decision FX rate separately from accounting rate;
- actual payment and customs values may use different rates;
- price and cost history never loses original currency;
- currency conversion is presentation unless a controlled calculation version is created.

---

## 74. Workflow, календарь и stage gates / Workflow, Calendar and Stage Gates

### 74.1 WorkflowTemplate

Поля:

- template ID/version;
- process type;
- applicable product categories;
- development route;
- supplier/factory type;
- country/market profile;
- tasks and milestones;
- relative offsets;
- dependencies;
- responsible role;
- required outputs;
- approval gates;
- escalation policy;
- active dates.

### 74.2 Task

- task type;
- object scope;
- title RU/EN;
- owner and responsible role;
- planned start/due date;
- supplier-visible flag;
- predecessor/successor;
- required attachment/data;
- status;
- completion evidence;
- delay reason;
- escalation level.

Lifecycle:

```text
PLANNED → READY → IN_PROGRESS → SUBMITTED → ACCEPTED → COMPLETED
```

Side states:

```text
BLOCKED / OVERDUE / CANCELLED / WAIVED
```

### 74.3 StageGate

Gate содержит:

- gate type;
- object/version;
- required checks;
- approver roles;
- quorum or sequential approval;
- due date;
- decision;
- conditions;
- exceptions;
- evidence snapshot.

Типовые gates:

- collection brief approved;
- style concept approved;
- BOM/measurement approved;
- sample approved;
- sourcing award approved;
- supplier order release approved;
- production shipment approved;
- compliance ready;
- commercial publish approved;
- wholesale order approved.

### 74.4 Mass planning

- apply workflow template to selected CollectionItems;
- recalculate dates from launch or delivery date;
- preserve manual overrides with reason;
- compare original baseline, current plan and actual;
- highlight critical-path delay;
- bulk reassign owner;
- bulk move dates with preview of downstream impact;
- exclude country holidays;
- notify external party in its timezone and language.

### 74.5 Связи с другими разделами

- CollectionItem creates development calendar;
- SampleDecision releases or blocks technical gate;
- RFQAward releases PO preparation;
- material shortage blocks production start;
- failed inspection blocks shipment;
- compliance readiness blocks commercial publication or shipment according to policy;
- changed delivery date triggers commercial impact review.

---

## 75. Планирование коллекций / Collection Planning

### 75.1 Структура / Hierarchy

```text
BusinessYear
→ Season
→ Collection
→ Capsule / Drop
→ LinePlan
→ CollectionItem
```

### 75.2 CollectionPlan fields

- year, season, collection and drop;
- brand and legal entity;
- target market;
- launch and delivery windows;
- category/subcategory;
- audience/gender/age;
- price architecture;
- target SKU/style/color counts;
- target units;
- target cost, wholesale and retail price;
- route mix: own development/material-owned/ready goods;
- supplier/factory geography;
- responsible team;
- budget reference;
- baseline version;
- approval status.

### 75.3 Assortment matrix

Dimensions may include:

- category;
- subcategory;
- product role;
- price band;
- color family;
- size range;
- delivery/drop;
- new/carry-over;
- source route;
- supplier;
- market;
- planned units;
- status/readiness.

Functions:

- plan vs actual counts;
- empty-cell and over-plan warnings;
- duplicate role/price/color concentration;
- placeholder creation;
- convert placeholder to Style or SupplierProductCandidate;
- mass import/export Excel;
- saved views;
- approval snapshot;
- readiness rollup.

### 75.4 CollectionItem decisions

At item level users select:

- `DEVELOP_AND_MANUFACTURE`;
- `DEVELOP_WITH_SEPARATE_MATERIALS`;
- `ODM_CUSTOMIZED`;
- `WHITE_LABEL`;
- `PRIVATE_LABEL_READY_GOODS`;
- `READY_GOODS_RESALE`;
- `CARRY_OVER`;
- `LOCAL_REBRANDING`.

The selected route determines required fields, workflow, documents, cost structure and readiness gates.

### 75.5 Planning screen / Экран

- frozen columns for article/image/category;
- configurable metrics;
- RU/EN names;
- inline editing with permissions;
- change history by cell;
- warnings and blockers;
- baseline comparison;
- calendar side panel;
- linked style/supplier candidate;
- readiness badges;
- export with filter snapshot.

### 75.6 Analytics

- planned vs created styles;
- planned vs commercially ready;
- route mix;
- category completeness;
- average delay by gate;
- target vs quoted/committed cost;
- supplier/factory concentration;
- launch readiness forecast.

---

## 76. Product Master: модель, цветомодель и SKU / Style, Colorway and SKU

### 76.1 Style workspace

Tabs:

```text
Overview / Обзор
Classification / Классификация
Design / Дизайн
Colors / Цвета
BOM
BOL
Measurements / Измерения
Construction / Конструкция
Labels & Packaging / Этикетки и упаковка
Samples / Образцы
Sourcing / Сорсинг
Costs / Себестоимость
Compliance / Соответствие
Commercial Projection / Коммерческая проекция
History / История
```

### 76.2 Style fields

- immutable internal ID;
- brand style code;
- supplier base style code;
- RU/EN model name;
- season/carry-over lineage;
- category taxonomy;
- audience/gender/age;
- silhouette, fit and construction type;
- source route;
- owner and responsible team;
- supplier/factory references;
- sketches, patterns, CAD and references;
- status and readiness;
- confidentiality;
- created/current/effective versions.

### 76.3 Category Attribute Pack

Категория определяет набор обязательных и optional fields:

- apparel: fit, sleeve, neckline, closure, length;
- footwear: construction, heel, outsole, last, width;
- bags: shape, closure, strap, compartments, dimensions;
- accessories: material, dimensions, functional attributes;
- ready goods: supplier attributes mapped to brand taxonomy.

Attribute definition includes:

- RU/EN label;
- datatype;
- allowed values;
- unit;
- mandatory rule;
- route/category applicability;
- commercial visibility;
- compliance significance;
- version and deprecation.

### 76.4 Colorway

- brand color code;
- RU/EN commercial color name;
- supplier color code/name;
- internal color reference;
- material-color links;
- visual swatch;
- Pantone/licensed reference where available;
- HEX/RGB/LAB for digital display;
- lab dip approval;
- color status;
- effective dates;
- images by colorway.

### 76.5 Size and SKU

- size scale and market labels;
- canonical size code;
- RU/EU/IT/US/UK/alpha display mapping where used;
- supplier size;
- brand size;
- SKU ID;
- brand SKU/article;
- supplier SKU;
- GTIN;
- pack/prepack membership;
- marking applicability;
- weight and dimensions;
- active/orderable dates;
- lifecycle.

### 76.6 Product duplication and carry-over

User chooses what to copy:

- classification;
- BOM;
- measurements;
- colorways;
- packaging;
- supplier/factory;
- sample history reference;
- commercial content.

Copied data creates a new controlled version and preserves origin lineage. Cost, active price, compliance expiry and current availability never copy silently.

---

## 77. BOM, BOL, Measurement Chart и Tech Pack

### 77.1 BOM / Спецификация материалов

BOM header:

- style version;
- BOM type;
- season/drop;
- base colorway;
- applicable factories;
- status/version;
- effective date;
- owner/approver.

BOM line:

- component type;
- material and material color;
- placement;
- supplier;
- main/lining/trim/label/packaging role;
- consumption;
- unit;
- wastage;
- efficiency;
- size and color applicability;
- substitute group;
- unit price and currency snapshot;
- lead time;
- source and notes;
- attachment.

Rules:

- all orderable colorways must resolve required components;
- size-dependent trim/packaging rules are explicit;
- approved BOM is immutable;
- substitute requires approval and impact review;
- composition shown commercially is calculated from controlled material data and reviewed;
- material shortage is traceable to affected SKUs and production orders.

### 77.2 BOL / Спецификация операций

BOL is enabled by category and business need.

Fields:

- operation code/name RU/EN;
- sequence;
- operation type;
- equipment;
- skill/grade;
- standard minutes;
- cost per minute or operation;
- factory-specific rate;
- setup time;
- quality checkpoint;
- predecessor;
- notes/media;
- version.

BOL supports:

- operation library;
- copy from similar style;
- factory comparison;
- labor cost calculation;
- critical operation flags;
- export in tech pack;
- version comparison.


### 77.3 Measurement Chart

Entities:

- MeasurementPoint;
- MeasurementChart;
- GradeRule;
- ToleranceRule;
- SampleMeasurementSet.

Fields:

- POM code and RU/EN description;
- diagram reference;
- measurement method;
- base size;
- values by size;
- grade increment;
- tolerance minus/plus;
- critical flag;
- unit;
- source/import;
- version.

Functions:

- automatic grading;
- manual override with reason;
- compare versions;
- compare sample actuals;
- highlight out-of-tolerance values;
- import from Excel/Grafis-compatible template;
- export RU/EN;
- lock approved rows;
- measurement diagram with numbered points.

### 77.4 Tech Pack

TechPackTemplate is configured by:

- product category;
- factory;
- language;
- route;
- market;
- required sections;
- document layout.

Generated snapshot includes selected versions of:

- cover and identifiers;
- sketches/callouts;
- construction details;
- colorways;
- BOM;
- BOL where enabled;
- Measurement Chart;
- labels and packaging;
- care instructions;
- sample decisions;
- testing requirements;
- quality points;
- change summary.

Lifecycle:

```text
DRAFT → GENERATED → INTERNAL_REVIEW → RELEASED_TO_FACTORY → SUPERSEDED
```

Every release stores recipient, language, template version, source object versions and checksum. Supplier download is logged.

---

## 78. Материалы, цвета и тестирование / Materials, Colors and Testing

### 78.1 Material taxonomy

```text
FABRIC
LINING
TRIM
HARDWARE
THREAD
LABEL
PACKAGING
PRINT
EMBROIDERY
CHEMICAL_OR_FINISH
OTHER_COMPONENT
```

### 78.2 Material card

- internal material ID/code;
- RU/EN name and description;
- supplier material code;
- type/subtype;
- composition with percentages;
- construction/weave/knit;
- weight/density;
- width;
- thickness;
- finish;
- color and supplier color;
- unit of measure;
- MOQ and price breaks;
- lead time;
- currency and Incoterms;
- manufacturer and supplier;
- country of origin;
- care impact;
- certificates/test protocols;
- image and physical swatch reference;
- approved/restricted/blocked status.

### 78.3 MaterialColor and lab dip

Lifecycle:

```text
REQUESTED → SUBMITTED → RECEIVED → REVIEWED → APPROVED / REVISE / REJECTED
```

Data:

- material;
- brand color reference;
- supplier color code;
- lab values where available;
- physical swatch location;
- visual files;
- light/source conditions;
- reviewer;
- comments;
- approved use scope.

### 78.4 Testing

TestRequest:

- material/product/sample scope;
- test type;
- method/standard;
- laboratory;
- requested date;
- specimen and lot;
- required threshold;
- result values;
- pass/fail;
- protocol;
- reviewer;
- validity and reuse conditions.

Examples:

- shrinkage;
- color fastness;
- abrasion;
- pilling;
- seam strength;
- dimensional stability;
- composition verification;
- product-specific safety tests.

Test outcome updates material/product readiness only within the defined scope, lot and validity.

### 78.5 Material requirement and balance

```text
Approved BOM
× Production quantity
+ Sample need
+ Wastage
- Usable owned balance
= Net requirement
```

System separates:

- planned requirement;
- purchase requirement;
- ordered;
- shipped;
- received;
- usable;
- reserved;
- consumed;
- rejected;
- remaining.

---

## 79. Supplier, Factory, Agent и Service Provider

### 79.1 Counterparty roles

One organization may have several roles:

- material supplier;
- finished-goods supplier;
- manufacturing supplier;
- physical factory;
- sourcing agent;
- inspection company;
- laboratory;
- logistics provider;
- customs broker;
- certification body/reference.

Role assignment is effective-dated and determines fields and access.

### 79.2 Supplier onboarding

Workflow:

```text
INVITED
→ PROFILE_IN_PROGRESS
→ DOCUMENTS_SUBMITTED
→ COMMERCIAL_REVIEW
→ BANK_REVIEW
→ CAPABILITY_REVIEW
→ APPROVED
→ ACTIVE
```

Data collection:

- legal identity;
- addresses and registrations;
- contacts by role;
- languages/timezone;
- bank account and beneficiary;
- currencies;
- payment terms;
- Incoterms and ports;
- categories/materials;
- MOQ/MOV;
- sample and production lead times;
- manufacturer/factory relationships;
- certificates/documents;
- contract references;
- data processing/access consent where applicable.

### 79.3 Factory capability

- product categories;
- processes;
- machinery/equipment summary;
- sample room;
- monthly indicative capacity;
- minimum run;
- supported materials;
- packaging/label capabilities;
- supported inspection stages;
- export experience;
- standard lead times;
- working calendar;
- assigned supplier/agent;
- active restrictions.

Capacity is indicative until reserved/confirmed in a specific order. It is not represented as guaranteed availability.

### 79.4 Supplier performance

Operational metrics:

- RFQ response rate/time;
- quote accuracy;
- sample turnaround;
- sample approval rounds;
- confirmed vs requested lead time;
- milestone adherence;
- on-time shipment;
- quantity fill rate;
- incoming/final QC pass rate;
- defect rate;
- document completeness;
- claim frequency and response time;
- cost variance.

Metrics show period, denominator and data coverage. Manual ratings are stored separately from calculated facts.

---

## 80. RFQ, quotation, comparison and allocation

### 80.1 RFQ creation modes

- from CollectionItem;
- from approved StyleVersion;
- from MaterialRequirement;
- from SupplierProductCandidate;
- bulk from selected items;
- copy previous season with current source snapshots.

### 80.2 Bid package

Contains:

- bilingual cover/instructions;
- exact product/material versions;
- requested quantities and size/color split;
- requested sample types;
- packaging and labels;
- delivery destination;
- requested Incoterms options;
- quote currency options;
- price-break structure;
- development/tooling questions;
- required certificates/documents;
- deadline and clarification channel.

### 80.3 Supplier quotation interface

Supplier can:

- accept/decline invitation;
- quote all or selected lines;
- enter price breaks;
- distinguish included/excluded materials;
- enter sample/tooling/packaging charges;
- propose MOQ, lead time, payment and Incoterms;
- attach assumptions;
- mark deviations;
- save draft;
- submit signed or final version;
- revise until deadline or controlled reopening.

### 80.4 Normalized comparison

Comparison includes:

- original quote amount/currency;
- normalized product cost;
- FX snapshot;
- expected landed cost;
- quantity breaks;
- fixed charges allocated and unallocated;
- payment schedule;
- cash timing;
- sample timing;
- production lead time;
- transport assumptions;
- document gaps;
- supplier history;
- risk/exception notes.

No ranking is presented without visible criteria and weighting. User can select price-only, weighted score or manual decision with reason.

### 80.5 Award and allocation

Award stores:

- exact quotation version;
- selected supplier/factory;
- selected lines;
- awarded quantity;
- price and terms;
- decision reason;
- approvers;
- rejected alternatives;
- conditions;
- expiration for PO creation.

Allocation can split by:

- style;
- colorway;
- size;
- market;
- delivery;
- quantity percentage;
- factory.

Allocated totals must reconcile to approved demand. Split orders retain separate cost, schedule and quality paths.

---

## 81. Образцы и согласования / Samples and Approvals

### 81.1 Sample types

```text
PROTO
FIT
SIZE_SET
COLOR
MATERIAL_SWATCH
SALESMAN
PRE_PRODUCTION / PPS
PRODUCTION
READY_GOODS
PACKAGING
LABEL
```

### 81.2 Sample request

- style/supplier candidate and version;
- sample type and number;
- requested color/size;
- quantity;
- factory/supplier;
- target date;
- ship-to;
- courier account;
- required materials/tech pack;
- review checklist;
- reviewers;
- sample cost;
- status.

### 81.3 Sample receipt and review

Receipt captures:

- tracking;
- dispatch/receipt dates;
- received quantity;
- condition;
- physical sample ID/tag;
- storage/return location;
- linked version.

Review panels:

- construction;
- measurements;
- fit;
- workmanship;
- material/color;
- trims;
- branding;
- packaging;
- commercial appearance;
- compliance/document readiness;
- cost and timeline impact.

### 81.4 Annotations

- pin on image;
- drawing/shape;
- numbered comment;
- measurement point link;
- attachment;
- internal or supplier-visible visibility;
- RU/EN text;
- resolved/unresolved;
- owner and due date.

### 81.5 Decision

```text
APPROVED
APPROVED_WITH_CONDITIONS
REVISION_REQUIRED
REJECTED
WAIVED_BY_AUTHORIZED_USER
```

Decision stores source specification versions, comments, approvers, conditions, next sample type and downstream release/block actions.

---

## 82. Supplier Orders and Production Execution / Заказы поставщикам и производство

### 82.1 Order types

```text
ProductionOrder
MaterialPurchaseOrder
FinishedGoodsPurchaseOrder
```

Each aggregate has separate numbering, fields, permissions and lifecycle.

### 82.2 ProductionOrder specifics

- approved StyleVersion/TechPack;
- factory;
- lines by SKU/color/size;
- quantity and tolerance;
- manufacturing cost;
- included/excluded materials;
- brand-owned material reservations;
- sample/PPS condition;
- production start/end;
- inspection plan;
- packaging/label version;
- ship window.

### 82.3 MaterialPurchaseOrder specifics

- material/material color;
- supplier;
- brand owner;
- consignee: brand warehouse or factory;
- ordered unit/quantity;
- rolls/pieces where used;
- dye lot requirements;
- price breaks;
- required date;
- production/shipment milestones;
- testing/certificate requirements;
- related production demand.

### 82.4 FinishedGoodsPurchaseOrder specifics

- SupplierProductCandidate and approved supplier specification;
- customization/branding version;
- lines by supplier SKU and mapped brand SKU;
- packaging/label requirements;
- composition/size documents;
- incoming QC plan;
- GTIN/marking responsibility;
- commercial readiness dependencies.

### 82.5 Supplier confirmation

Supplier confirms at line level:

- quantity;
- price;
- production/supply dates;
- ship date;
- factory;
- material responsibility;
- packaging;
- deviations;
- payment milestone.

Changes never overwrite buyer-submitted order version. They create a comparison and explicit buyer acceptance.

### 82.6 Production milestones

Milestone groups:

- commercial: PO, contract, deposit;
- materials: ordered, ready, shipped, factory received;
- development: sample/PPS approval;
- manufacturing: cutting, assembly/sewing, finishing;
- quality: inline/final inspection;
- logistics: packing, cargo ready, documents, shipment, receipt.

Each milestone supports planned, supplier-confirmed, forecast and actual date plus evidence.

### 82.7 Production board

Views:

- calendar;
- Gantt-like milestone timeline;
- order list;
- style/collection readiness;
- supplier/factory workload;
- exception queue;
- material shortage view;
- shipment readiness.

Filters:

- season/collection;
- supplier/factory/country;
- order type;
- category;
- owner;
- milestone;
- delay severity;
- shipment window.

---

## 83. Quality Management / Управление качеством

### 83.1 QualityPlan

- product/order scope;
- inspection stages;
- sample reference;
- active specification versions;
- checkpoints;
- sampling/AQL settings where used;
- measurement points;
- packaging and label checks;
- inspector/provider;
- required report language;
- escalation rules.

### 83.2 Inspection execution

Mobile/web functions:

- scan/search order, SKU or carton;
- load active specification and sample images;
- record inspected quantity;
- enter defect counts;
- photograph defect;
- annotate image;
- enter measurements;
- work offline with controlled sync;
- sign/submit report;
- create corrective action;
- recommend result.

### 83.3 Defect taxonomy

Defect definition:

- category and subcategory RU/EN;
- severity default;
- product-category applicability;
- example images;
- counting rule;
- responsibility hints;
- corrective-action template;
- active version.

Defect occurrence:

- order/style/SKU/lot/carton;
- location;
- quantity affected;
- evidence;
- measurement deviation;
- suspected cause;
- supplier response;
- disposition;
- cost impact.

### 83.4 Results and release

```text
PASS
CONDITIONAL_PASS
FAIL
REINSPECTION_REQUIRED
```

Release decision is separate from inspector recommendation and requires authorized role where policy demands.

### 83.5 Supplier claim

Claim package:

- supplier/order/receipt;
- inspection and defect references;
- accepted/rejected quantity;
- requested action: rework, replacement, discount, credit note, compensation;
- evidence files;
- amount/currency;
- supplier response;
- negotiated outcome;
- ERP reference;
- closure.

---

## 84. Costing and Landed Cost / Себестоимость и импортная стоимость

### 84.1 Product costing layers

```text
Target Cost
Initial Estimate
Supplier Quotation
Negotiated Cost
PO Committed Cost
Planned Landed Cost
Actual Landed Cost
Reconciled Cost
```

### 84.2 Product cost sheet

- direct material by BOM;
- material wastage;
- labor/BOL;
- packaging and labels;
- development/tooling;
- sample allocation;
- supplier margin/included costs where disclosed;
- manufacturing or finished-goods price;
- currency and FX;
- overhead allocation policy where used.

### 84.3 Landed-cost shipment

- shipment/receipt scope;
- supplier orders;
- goods value;
- freight;
- insurance;
- duty;
- customs fees;
- broker;
- certification/testing;
- marking;
- domestic logistics;
- bank/payment costs when included;
- other documented expense.

### 84.4 Allocation engine

User previews allocation by:

- units;
- purchase value;
- customs value;
- net/gross weight;
- volume;
- carton count;
- manual controlled shares.

Preview shows per-line impact and unallocated remainder before commit.

### 84.5 Margin connection

```text
Resolved Wholesale Net Price
- Selected Planned or Actual Landed Cost
= Wholesale Gross Margin
```

Margin view must display:

- price list/version;
- cost version;
- currency and FX basis;
- tax presentation;
- per-unit and total result;
- threshold alert;
- affected retailers/orders if cost changed after price publication.

### 84.6 Cost permissions

- product/design users may see target cost according to role;
- suppliers do not see internal margin or competing quotes;
- retailers never see supplier cost or landed cost;
- finance can lock actual/reconciled cost;
- exports obey field-level permissions.

---

## 85. Cross-Border Trade / Внешнеэкономическая деятельность

### 85.1 TradeCase

A TradeCase groups purchasing, shipment and customs readiness for one movement.

Fields:

- importer/exporter legal entity;
- supplier/seller;
- consignee;
- notify party;
- country of origin/export/import;
- Incoterms edition, rule and named place;
- contract/specification;
- purchase orders;
- commercial invoice;
- packing list;
- transport documents;
- broker;
- customs classification;
- weights/cartons;
- planned/actual dates;
- status.

### 85.2 Customs classification

At product/SKU scope:

- ТН ВЭД ЕАЭС code;
- description RU/EN;
- classification source;
- decision owner;
- effective dates;
- duty/VAT snapshot;
- supporting documents;
- confidence/review status;
- related product attributes.

Classification change creates impact review for open purchase orders, labels, certificates, marking and landed cost.

### 85.3 Shipping documents

Document register supports:

- document type;
- number/date;
- issuer;
- language;
- source order/shipment;
- version;
- status;
- original/copy/translation;
- required-before milestone;
- validation result;
- expiry where relevant.

### 85.4 Direct material shipment to factory

The system supports triangle relationships:

```text
Russian Brand = Buyer and Material Owner
Foreign Material Supplier = Seller/Shipper
Foreign Factory = Consignee/Custodian
```

Required reconciliation:

- PO quantity;
- shipped quantity;
- supplier packing data;
- factory receipt;
- lot/dye lot;
- usable/rejected quantity;
- ownership acknowledgement;
- reservation to ProductionOrder.

### 85.5 Export wholesale

For a Russian brand selling abroad:

- export price list and currency;
- buyer country/legal entity;
- Incoterms;
- export documents;
- commercial invoice and packing list;
- product origin and classification;
- buyer-visible certificates;
- shipment status;
- ERP/EDO or external-document references;
- market-specific commercial content.

---

## 86. Российский контур / Russian Market Control Layer

### 86.1 Product compliance

`RussianComplianceProfile` links:

- product/category;
- style/SKU scope;
- ТН ВЭД ЕАЭС;
- ОКПД2 where applicable;
- technical regulation;
- applicant;
- manufacturer;
- importer;
- declaration/certificate/test protocol;
- label requirements;
- EAC applicability;
- marking applicability;
- effective rule version.

### 86.2 Document readiness

The system validates:

- document type required;
- document number and dates;
- applicant/manufacturer alignment;
- covered product description and articles;
- file presence;
- expiry;
- verification/review state;
- link to imported or manufactured product version.

### 86.3 Russian label content

LabelContentVersion supports:

- product name;
- brand;
- article;
- manufacturer;
- importer/authorized organization;
- country of origin;
- composition;
- size;
- care symbols/text;
- production date/batch where applicable;
- EAC;
- GTIN/barcode;
- marking placement note;
- RU text and approved EN reference;
- layout/artwork file;
- approver;
- effective version.

### 86.4 Marking applicability

Decision inputs:

- ТН ВЭД ЕАЭС;
- ОКПД2;
- product category;
- production/import date;
- legal entity role;
- rule effective date;
- exceptional/transition case.

Decision output:

- applicable yes/no/review required;
- rule version/source;
- responsible organization;
- required timeline;
- blocking milestones;
- evidence.

### 86.5 National Catalog and GTIN

Product-level workflow:

```text
Product Data Complete
→ GTIN Source Resolved
→ National Catalog Draft
→ Submitted
→ Accepted / Correction Required
→ GTIN Linked to SKU/Product
```

Syntha stores mapping and exchange status; official catalog data remains external system data.

### 86.6 Marking process status

```text
NOT_APPLICABLE
APPLICABILITY_REVIEW
GTIN_REQUIRED
CATALOG_CARD_REQUIRED
CODES_REQUIRED
CODES_ORDERED
CODES_RECEIVED
APPLIED
VERIFIED
INTRODUCED_INTO_CIRCULATION
WHOLESALE_TRANSFER_READY
```

Events from 1С/provider/ГИС МТ are reconciled by external ID, quantity and code scope.

### 86.7 1С boundary

Syntha owns:

- product-development master;
- technical versions;
- supplier collaboration;
- commercial catalog/access;
- wholesale order commercial history.

1С/ERP owns or confirms:

- accounting master mapping;
- stock and warehouse accounting;
- invoice/payment accounting;
- VAT/accounting values;
- УПД generation;
- official marking operations according to chosen integration architecture.

### 86.8 EDO/УПД

EDOStatus record:

- document type/number;
- operator;
- external ID;
- sender/receiver;
- related order/shipment;
- created/sent/delivered/signed/rejected/corrected status;
- status timestamp;
- rejection reason;
- correction link;
- marking-code reconciliation summary;
- source payload reference.

---

## 87. Commercial Product Projection / Коммерческая карточка товара

### 87.1 Projection ownership

Commercial Product Projection is not a duplicate Style. It is an approved, market-specific commercial snapshot generated from a ready technical or purchased product version.

### 87.2 Projection dimensions

One product may have separate projections by:

- market/country;
- language;
- wholesale channel;
- retailer group;
- season/drop;
- price context;
- delivery window;
- effective period.

### 87.3 Commercial fields

- brand article;
- commercial name RU/EN;
- short and long description RU/EN;
- category and searchable attributes;
- composition and care;
- country of origin;
- colors and size scale;
- images/video/360 assets;
- wholesale/RRP reference;
- MOQ/MOV/pack;
- prebook/ATS/availability mode;
- delivery window;
- buyer-visible documents;
- commercial badges/notes;
- publication and orderability status.

### 87.4 Content workflow

```text
DRAFT
→ DATA_COMPLETENESS_REVIEW
→ IMAGE_REVIEW
→ TRANSLATION_REVIEW
→ COMMERCIAL_REVIEW
→ COMPLIANCE_REVIEW
→ READY_TO_PUBLISH
→ PUBLISHED
```

### 87.5 Content inheritance and override

- global product content provides defaults;
- market projection overrides regulatory/market text;
- retailer projection may override title, assortment note or exclusive image with permission;
- price is resolved by PriceList, not copied into uncontrolled text;
- content override stores source, owner, reason and effective dates.

### 87.6 Publication impact

A change identifies affected:

- linesheets;
- showrooms;
- retailer access grants;
- assortments;
- draft orders;
- submitted orders;
- exports/shared links;
- marketplace/ERP feeds where enabled.

---

## 88. Brand, Retailer and Connection Network / Бренд, магазин и подключение

### 88.1 BrandProfile

- brand identity and legal sellers;
- logo/cover/story RU/EN;
- categories and positioning;
- markets and territories;
- wholesale contacts;
- collections;
- supported currencies;
- default commercial terms;
- showroom/catalog visibility;
- verification status;
- response SLA.

### 88.2 RetailerProfile

- retailer organization;
- Russian or foreign legal entities;
- retail format;
- website and channels;
- stores/doors/warehouses/e-commerce locations;
- buying team;
- categories and price positioning;
- billing/shipping addresses;
- currencies;
- languages;
- assigned brands and sales managers;
- order history summary;
- profile verification.

### 88.3 Retailer discovery and onboarding

Brand may:

- create retailer manually;
- invite by email;
- import accounts from 1С/CRM;
- approve incoming connection;
- search network profile where enabled;
- merge duplicate retailer profiles under controlled review.

Retailer may:

- create organization profile;
- invite buyers;
- request connection;
- choose legal entity and destinations;
- browse permitted discovery catalog;
- maintain contacts and addresses.

### 88.4 Connection lifecycle

```text
NOT_CONNECTED
→ REQUESTED
→ PROFILE_REVIEW
→ COMMERCIAL_REVIEW
→ CONNECTED
→ SUSPENDED / DISCONNECTED
```

Connection decision records initiating party, reviewer, reason, dates, assigned manager and next commercial action.

### 88.5 Commercial access

Access is separate from connection and defines:

- legal buyer/seller;
- collection/category/product scope;
- price list;
- currency;
- territory;
- delivery destinations;
- payment/delivery terms;
- document visibility;
- order type availability;
- effective dates;
- approver.

---

## 89. Catalog, Linesheet and Showroom / Каталог, лайншит и шоурум

### 89.1 Catalog registry

Functions:

- search by RU/EN text and article;
- filter by collection, category, color, size, price, delivery, availability, new/carry-over;
- buyer-specific visibility;
- grid/list/compact view;
- compare selected products;
- save favorites/custom list;
- export permitted fields;
- add to assortment/order;
- show update indicators.

### 89.2 Linesheet builder

- select source collection and products;
- organize by delivery/category/look/custom order;
- set visible fields;
- choose RU, EN or bilingual template;
- choose assigned price-list context;
- include/exclude quantity grid;
- show product status/availability;
- apply retailer group visibility;
- preview as retailer;
- publish version;
- export PDF/XLSX;
- create controlled share link.

### 89.3 Showroom builder

Components:

- cover and story;
- chapter;
- image/video;
- look;
- shoppable hotspot;
- linked product group;
- CTA to linesheet/order;
- market language variant;
- retailer visibility.

Actions:

- drag/reorder;
- duplicate market version;
- replace asset while preserving history;
- schedule publication;
- preview desktop/mobile;
- preview as selected retailer;
- unpublish/revoke share;
- inspect engagement.

### 89.4 Buyer product detail

Shows only commercial data:

- image gallery;
- article/name;
- description;
- composition/care;
- colors/sizes;
- wholesale/RRP;
- delivery;
- MOQ/pack;
- availability;
- downloadable permitted documents;
- quantity entry;
- related looks/products;
- message/question action.

### 89.5 Catalog change indicators

Buyer can see:

- new product;
- price changed;
- delivery changed;
- availability changed;
- product replaced;
- product cancelled;
- content/document updated.

Submitted order snapshots remain unchanged; changes are communicated through amendment workflow.

---

## 90. Price Lists and Commercial Terms / Прайс-листы и коммерческие условия

### 90.1 PriceBook structure

```text
PriceBook
→ PriceListVersion
→ PriceListLine
→ CommercialTermSet
→ CommercialAccessGrant
```

### 90.2 PriceListVersion

- seller legal entity;
- market;
- currency;
- tax/VAT display;
- valid from/to;
- price basis;
- approval;
- status;
- eligible retailer groups;
- default payment/delivery terms;
- price lines;
- change reason.

### 90.3 Price line

- style/SKU/category scope;
- base wholesale price;
- recommended retail price;
- optional retailer discount;
- quantity break;
- pack/MOQ/MOV;
- effective dates;
- replacement/supersession;
- approval state.

### 90.4 CommercialTermSet

- payment type;
- prepayment percentage;
- payment due days/date rule;
- credit limit reference where imported;
- cancellation deadline;
- order minimum;
- shipping terms;
- Incoterms for export;
- claims/shortage notification period;
- document language;
- bank/payment instructions source;
- effective version.

### 90.5 Resolution

At quote/order time system resolves:

1. exact retailer/SKU override;
2. retailer group/SKU;
3. retailer/category rule;
4. assigned price list;
5. block when no valid price.

Resolved output stores the exact rule/version and is snapshotted into the order.

### 90.6 Change control

- price list cannot be edited after activation; create new version;
- activation can be scheduled;
- overlapping versions require priority decision;
- open drafts show price refresh preview;
- submitted/confirmed orders keep original price;
- sales manager override requires authority, reason, threshold and approval;
- cost changes never change wholesale price automatically.

---

## 91. Buying Workspace and Assortments / Рабочее место закупщика

### 91.1 Simple Order Grid — базовый режим

- products in rows;
- color/size matrix;
- keyboard navigation;
- Excel paste;
- order quantities;
- price and totals;
- MOQ/pack validation;
- delivery grouping;
- notes;
- save draft;
- validation summary.

### 91.2 RetailerAssortment

Entity fields:

- retailer/legal entity;
- brand(s) according to enabled mode;
- season/collection;
- doors or destinations;
- deliveries;
- currency;
- budget/target where enabled;
- selected products;
- quantities;
- status/version;
- owners/collaborators.

### 91.3 Doors and destinations

Door can represent:

- physical store;
- warehouse;
- e-commerce site;
- regional allocation destination;
- temporary/pop-up location.

Door attributes:

- region/city;
- format;
- size/cluster;
- climate;
- price tier;
- category capacity;
- delivery address;
- active dates.

### 91.4 Visual Assortment

- freeform or structured board;
- drag products/looks/placeholders;
- group by category, delivery, door, capsule or commercial role;
- must buy/consider/reject;
- notes and comments;
- budget/unit totals;
- duplicate/cannibalization indicators when data exists;
- size curve and door allocation when enabled;
- convert approved selection to draft order or order intent.

### 91.5 Rollup

Rollup aggregates authorized assortments without losing source ownership:

- totals by brand/category/delivery/door;
- product overlap;
- financial targets;
- saved views;
- drill-down;
- controlled editing only where permission allows.

### 91.6 Order intent

Retailer may share preliminary intent:

- selected products;
- quantities;
- totals;
- delivery and door breakdown;
- confidence/status;
- comments;
- effective snapshot.

OrderIntent is not a binding WholesaleOrder. Brand can use it for planning but cannot convert it into confirmed sale without retailer submission/approval.

---

## 92. Wholesale Order and Amendments / Оптовый заказ и изменения

### 92.1 Order creation channels

- retailer self-service;
- brand sales manager on behalf of retailer with permission;
- import from approved Excel template;
- conversion from assortment/order intent;
- integration from retailer ERP/EDI where enabled;
- reorder from historical order using current catalog/price validation.

### 92.2 Header

- order ID/number;
- retailer and buyer user;
- seller/buyer legal entities;
- price list and access grant versions;
- currency;
- tax/VAT presentation;
- payment terms;
- billing/shipping destination;
- delivery window;
- buyer PO reference;
- sales manager;
- language;
- notes/attachments;
- status/version.

### 92.3 Line

- commercial projection version;
- SKU/style/color/size;
- requested quantity;
- confirmed quantity;
- shipped/delivered quantity;
- unit price/discount;
- line total;
- requested/confirmed delivery;
- availability response;
- pack/MOQ;
- replacement reference;
- status/reason.

### 92.4 Submission validation

- buyer authority;
- active connection/access;
- seller/buyer legal entity;
- price and term validity;
- orderable product version;
- quantity minimum and pack;
- delivery window;
- address;
- currency consistency;
- internal approval;
- duplicate PO warning;
- marking/compliance policy relevant to promised shipment.

### 92.5 Brand review

Brand sees side-by-side:

- buyer requested;
- available/expected;
- proposed by brand;
- impact on order value;
- reason;
- order/production linkage where authorized.

Decisions can be bulk or line-level.

### 92.6 Amendment

Amendment types:

- quantity;
- price allowed by policy;
- delivery date/window;
- cancellation;
- replacement;
- address/terms before fulfillment;
- split shipment.

Amendment lifecycle:

```text
DRAFT → PROPOSED → COUNTERED → ACCEPTED / REJECTED / WITHDRAWN
```

Accepted amendment creates a new agreed order version. Original submitted and all intermediate proposals remain immutable.

### 92.7 Fulfillment allocation

Confirmed order can link to:

- available stock from ERP;
- incoming FinishedGoodsPurchaseOrder;
- ProductionOrder;
- mixed supply sources.

This link is operational and does not expose supplier/factory data to retailer.

---

## 93. Commercial Documents, Payment and Shipment / Документы, оплата и отгрузка

### 93.1 CommercialDocument

Types:

- order confirmation;
- specification;
- proforma/invoice for payment;
- packing list;
- shipment notice;
- discrepancy report;
- claim attachment;
- ERP/EDO document reference.

Fields:

- document type/number;
- language;
- issuer/recipient;
- order/shipment scope;
- source versions;
- generated/uploaded/external;
- status;
- file and checksum;
- created/sent timestamps;
- external ID.

### 93.2 Document generation

Template controls:

- legal entity;
- market/language;
- currency;
- visible fields;
- signature blocks;
- attachments;
- bilingual layout;
- revision numbering;
- source data versions.

### 93.3 Payment status

Core records:

- invoice reference;
- invoiced amount/currency;
- due date;
- paid amount;
- balance;
- status;
- payment reference;
- source: manual/ERP/bank import through ERP;
- last synchronized at;
- dispute/hold reason.

### 93.4 Shipment

- shipment ID;
- order(s) and lines;
- ship-from/ship-to;
- carrier/provider;
- tracking;
- carton count;
- gross/net weight;
- shipped quantities;
- expected/actual dates;
- packing list;
- transport document;
- marking reconciliation reference;
- status;
- discrepancy.

### 93.5 Partial shipment

- allocate quantity per order line;
- prevent cumulative shipped quantity over confirmed unless controlled exception;
- update order status;
- generate shipment-specific documents;
- reconcile delivery and discrepancy;
- preserve remaining open quantity.

---

## 94. Collaboration, Messages and Notifications / Совместная работа

### 94.1 CommentThread

Thread can attach to:

- style/version;
- BOM line;
- material;
- RFQ/quotation;
- sample/annotation;
- supplier order;
- milestone/exception;
- inspection/defect;
- commercial product;
- retailer/order/amendment.

### 94.2 Message visibility

```text
INTERNAL_BRAND
SUPPLIER_VISIBLE
RETAILER_VISIBLE
SELECTED_PARTICIPANTS
```

Visibility cannot be broadened after posting without explicit copy/new message. Internal comments never appear in supplier or retailer export.

### 94.3 Message functions

- RU/EN text and optional approved translation;
- mention;
- attachment;
- image annotation;
- task conversion;
- reply/thread;
- resolve/reopen;
- edit window with history;
- read state;
- email/Telegram notification according to preference.

### 94.4 Notification rules

Events:

- assignment;
- approval required;
- deadline approaching/overdue;
- supplier response;
- sample shipped/received;
- order change;
- inspection failure;
- document missing;
- price/access update;
- wholesale order submitted/confirmed;
- ERP/EDO integration failure.

Each notification has recipient, channel, language, quiet hours, grouping and deep link.

### 94.5 Daily work queue

User dashboard shows:

- my tasks;
- approvals;
- overdue items;
- supplier/retailer responses;
- blocked products/orders;
- integration errors assigned to user;
- recent changes;
- saved filters.

---

## 95. Analytics and Operational Reporting / Аналитика

### 95.1 Reporting principles

- every metric has definition and owner;
- numerator/denominator and excluded data are visible;
- currency conversion basis is visible;
- time period and timezone are explicit;
- users see only authorized organizations/accounts;
- drill-down reaches source transactions;
- manual data and system facts are distinguishable.

### 95.2 Product & Supply dashboards

Collection:

- planned/created/approved/commercially ready;
- readiness by gate;
- delay by category/owner/supplier;
- route mix;
- planned vs committed units/cost.

Sourcing:

- RFQ response rate/time;
- quote spread;
- award cycle time;
- supplier allocation;
- expected landed-cost comparison.

Samples:

- turnaround;
- rounds to approval;
- failure reasons;
- overdue samples;
- sample cost.

Production:

- milestone adherence;
- order status/value;
- material shortage;
- supplier/factory delays;
- forecast vs confirmed dates.

Quality:

- pass rate;
- defects by severity/category/SKU/supplier;
- accepted/rejected quantity;
- claim amount and closure.

Cost:

- target/quote/PO/planned landed/actual landed variance;
- FX impact;
- logistics/customs share;
- margin impact.

### 95.3 Wholesale dashboards

- connected and active retailers;
- collection/product/showroom views;
- buyer engagement;
- draft/submitted/confirmed order funnel;
- order value/units;
- immediate vs prebook;
- order status;
- top products/retailers/sales managers;
- confirmation time;
- amendment/cancellation rate;
- shipment/payment status;
- repeat orders.

### 95.4 Cross-domain reporting

- CollectionItem → commercial publication → order value;
- planned production units → wholesale demand → confirmed supply;
- cost version → price version → margin;
- product readiness delay → showroom/order impact;
- supplier performance → launch/order fulfillment impact.

Cross-domain report uses explicit joins between versioned IDs and does not infer missing relationships.

### 95.5 Export and schedules

- XLSX/CSV/PDF according to permission;
- saved report view;
- scheduled email delivery;
- RU/EN column labels;
- filter snapshot;
- generated timestamp;
- data coverage warning;
- export audit.

---

## 96. Integration Architecture / Архитектура интеграций

### 96.1 IntegrationConnection

- organization/legal entity;
- system type;
- environment;
- authentication reference;
- endpoint/provider;
- enabled objects/directions;
- mapping version;
- schedule/webhook mode;
- owner;
- health/status;
- last successful sync.

### 96.2 Priority integrations

Russian core:

- 1С:ERP;
- 1С:Управление торговлей;
- 1С:Бухгалтерия where relevant;
- EDO operator through 1С or direct connector;
- ГИС МТ/«Честный знак» through 1С or integration provider;
- National Catalog/GTIN workflow;
- email;
- cloud/object file storage;
- XLSX/CSV.

International operations:

- supplier portal;
- courier/tracking;
- logistics provider;
- customs broker exchange;
- QMS/laboratory provider;
- retailer ERP/EDI;
- PLM/CAD/Grafis/Adobe-related file exchange where contracted.

### 96.3 Canonical mapping

MappingRecord:

- Syntha object/field;
- external system/object/field;
- direction;
- transformation;
- dictionary mapping;
- default/fallback;
- mandatory flag;
- version;
- effective dates;
- test cases;
- owner.

### 96.4 Integration message

- message ID;
- connection;
- operation/object;
- business key;
- payload reference;
- idempotency key;
- correlation ID;
- status;
- attempts;
- error code/message;
- owner;
- created/processed timestamps.

### 96.5 Reconciliation

Reconciliation screen shows:

- matched;
- missing in Syntha;
- missing externally;
- conflicting values;
- quantity/value mismatch;
- stale mapping;
- duplicate external ID;
- suggested action;
- source-of-truth decision.

### 96.6 Reliability

- outbox for business events;
- idempotent consumers;
- retry with backoff;
- dead-letter/error queue;
- manual replay with audit;
- payload retention according to classification;
- schema versioning;
- integration SLA dashboard.

---

## 97. Permissions, Security and Data Boundaries / Права и безопасность

### 97.1 Permission dimensions

Access decision includes:

- user/membership;
- organization;
- role;
- object type;
- object organization;
- collection/account/supplier scope;
- lifecycle state;
- field confidentiality;
- action;
- effective date.

### 97.2 Field classifications

```text
PUBLIC_COMMERCIAL
PARTNER_VISIBLE
INTERNAL
CONFIDENTIAL_COST
BANKING_SENSITIVE
PERSONAL_DATA
LEGAL_DOCUMENT
SYSTEM_SECRET
```

### 97.3 External portal isolation

Supplier/factory:

- assigned RFQ, samples, orders, milestones, documents and findings only;
- no competing quotations;
- no retailer data;
- no internal margin/target unless explicitly shared;
- no product version edit outside allowed response fields.

Retailer:

- own profile, access, catalog, price, assortment, orders and documents only;
- no other retailer data;
- no technical product, supplier/factory or cost information.

### 97.4 Sensitive changes

Require re-authentication and audit:

- bank details;
- payment instruction;
- legal entity identifiers;
- user role escalation;
- API credentials;
- supplier/retailer merge;
- price override beyond threshold;
- release after failed quality/compliance gate.

### 97.5 Audit and history

Audit supports:

- before/after values or patch;
- actor/source;
- organization;
- reason;
- timestamp;
- request/correlation ID;
- object/version;
- success/failure;
- export/download actions for sensitive documents.

---

## 98. Целевая навигация и экраны / Target Navigation and Screens

### 98.1 Main navigation — Brand internal

```text
Home / Главная
Collections / Коллекции
Products / Продукты
Materials / Материалы
Suppliers / Поставщики
Sourcing / Сорсинг
Samples / Образцы
Supplier Orders / Заказы поставщикам
Production / Производство
Quality / Качество
Costing / Себестоимость
Compliance / Соответствие
Wholesale / Оптовые продажи
Analytics / Аналитика
Messages / Сообщения
Integrations / Интеграции
Administration / Администрирование
```

### 98.2 Wholesale subnavigation

```text
Brand Profile
Retailers
Connections
Commercial Access
Catalog
Showrooms
Linesheets
Price Lists
Assortments
Orders
Order Changes
Documents
Payments
Shipments
Wholesale Analytics
```

### 98.3 Supplier portal

```text
Home
Profile
RFQs
Quotations
Samples
Orders
Production Updates
Documents
Quality Findings
Messages
```

### 98.4 Retailer portal

```text
Home
Discover / Connected Brands
Catalogs
Showrooms
Linesheets
Assortments
Draft Orders
Orders
Documents
Shipments
Messages
Company & Locations
```

### 98.5 Object page standard

Every object page includes:

- identifier and bilingual name;
- status;
- owner;
- organization;
- current version;
- key dates;
- next action;
- readiness/validation summary;
- related objects;
- files/comments;
- history/audit;
- permitted actions.

### 98.6 Registry standard

- search;
- filters;
- saved views;
- sort;
- configurable columns;
- bulk actions;
- export;
- pagination;
- status badges;
- warning indicators;
- permission-aware totals;
- deep links.

---

## 99. API and Domain Contracts / API и доменные контракты

### 99.1 Command pattern

Lifecycle transitions use explicit commands, for example:

```text
POST /styles/{id}/versions/{versionId}/approve
POST /rfqs/{id}/issue
POST /quotations/{id}/submit
POST /supplier-orders/{id}/send
POST /samples/{id}/decide
POST /inspections/{id}/complete
POST /commercial-projections/{id}/publish
POST /connections/{id}/approve
POST /wholesale-orders/{id}/submit
POST /order-amendments/{id}/accept
```

### 99.2 Read resources

- versioned resource URLs;
- pagination;
- allowed filters/sorts;
- language parameter;
- currency/reporting context;
- field projection according to permission;
- ETag/version;
- related links.

### 99.3 Error model

Error contains:

- stable error code;
- RU/EN user message;
- field/object path;
- blocking/warning severity;
- remediation hint;
- correlation ID;
- details allowed by role.

### 99.4 Domain event groups

Planning and product:

- plan/version approved;
- CollectionItem route selected/changed;
- StyleVersion created/approved/superseded;
- BOM/measurement/tech pack released;
- product readiness changed.

Sourcing/supply:

- RFQ issued;
- quotation submitted;
- award approved;
- sample requested/decided;
- supplier order sent/confirmed/amended;
- material shipped/received/reserved/consumed;
- milestone delayed/completed;
- inspection completed;
- claim opened/closed;
- landed cost recalculated.

Wholesale:

- connection requested/approved;
- access assigned/expired;
- price list activated;
- product/linesheet/showroom published;
- assortment shared;
- order submitted;
- change proposed/accepted;
- order confirmed;
- payment/shipment/EDO status changed.

### 99.5 Cross-domain event rules

- `product_commercial_ready` may create/update CommercialProductProjection draft;
- `commercial_projection_published` updates permitted catalogs and search index;
- `wholesale_order_confirmed` sends controlled ERP export request;
- `cost_version_activated` creates margin-impact task, not price change;
- `compliance_readiness_revoked` blocks new publication/shipment according to policy and opens impact case;
- `supplier_order_delay_detected` identifies affected CollectionItems and confirmed retailer promises.

---

## 100. Сквозные UAT-сценарии / End-to-End Acceptance Scenarios

### 100.1 Bilingual and cross-border

1. Russian product manager creates RU model name and EN factory name; both are searchable.
2. Supplier enters an English quotation; brand reviewer sees original and approved RU translation.
3. RU/EN tech packs use the same immutable BOM and measurement versions.
4. Date shown to Chinese supplier and Moscow manager preserves one deadline and both timezones.
5. Unit conversion from supplier yards to canonical meters is versioned and reproducible.
6. CNY quote comparison in RUB preserves original amount and selected FX snapshot.
7. A bilingual legal/commercial document retains source language and separate translation status.

### 100.2 Omnidata/Centric Product & Supply flow

8. Line-plan placeholder becomes Route A Style and inherits calendar tasks.
9. Route B product calculates material shortage from BOM, owned factory balance and production quantity.
10. Route C ready goods proceeds without BOL but cannot publish without composition, sizes, QC and Russian readiness.
11. BOM change after approved sample creates new StyleVersion and invalidates related release gate.
12. Measurement actuals outside tolerance are visible against the correct sample version.
13. Factory-specific tech pack contains exact released versions and download audit.
14. Material dye-lot rule blocks mixing two lots in one restricted production batch.
15. Supplier quotation cannot alter issued RFQ source versions.
16. Split award creates separate supplier orders with reconciled total quantity.
17. Supplier confirms partial quantity and proposes date; brand must explicitly accept.
18. Failed final inspection blocks cargo-ready release.
19. Incoming QC reduces accepted ready-goods quantity and creates claim evidence.
20. Actual landed cost updates margin analysis but not active wholesale price.

### 100.3 JOOR/NuORDER Wholesale flow

21. Retailer connection approval does not expose catalog until CommercialAccessGrant is active.
22. Retailer sees only assigned collection, price list, currency and documents.
23. Linesheet RU and EN versions resolve the same product and price versions.
24. Buyer enters quantities with keyboard and Excel paste; invalid pack cells are highlighted before save.
25. Assortment selection converts to draft order without losing delivery and door context.
26. Shared order intent is visible to brand but remains non-binding.
27. Submitted order snapshots product, price, terms and delivery data.
28. Brand partially confirms quantities and proposes a later delivery.
29. Retailer accepts amendment; original submitted order remains unchanged.
30. Product commercial update notifies affected draft/submitted orders without rewriting them.
31. Partial shipment updates line and order status and preserves remaining quantity.
32. Sales overview totals reconcile to submitted/confirmed orders under the selected currency rule.

### 100.4 Russian execution

33. Confirmed wholesale order exports once to 1С despite retry.
34. 1С returns external document ID, invoice and payment status with source timestamps.
35. УПД status from EDO links to the correct shipment and order.
36. Product marking applicability uses effective rule version, codes and legal entity role.
37. Product requiring marking cannot reach shipment release without configured external readiness.
38. National Catalog/GTIN correction creates reconciliation rather than overwriting product identity.
39. Imported goods link commercial invoice, packing list, customs reference and actual landed cost.
40. Russian label version is linked to the exact product/composition version.

### 100.5 Security and data boundaries

41. Supplier cannot access competitor quotation by URL.
42. Retailer cannot access another retailer price or order.
43. Cost and factory data are excluded from buyer export/API.
44. Bank-detail change puts payment instruction on hold and requires approval.
45. Organization switch clears prior tenant data and open cached views.
46. Sensitive document download creates audit entry.

---

## 101. Последовательность реализации / Implementation Sequence

### 101.1 Wave A — Bilingual Foundation

- organizations/legal entities/locations;
- RU/EN UI framework;
- terminology/localized fields;
- roles and tenant isolation;
- dictionaries/category attribute packs;
- files/comments/audit;
- money/unit/time primitives;
- integration/outbox framework.

### 101.2 Wave B — Omnidata/Centric Product Core

- CollectionPlan and CollectionItem routes;
- Style/Colorway/SKU/versioning;
- BOM;
- Measurement Chart;
- Tech Pack;
- material/color library;
- supplier/factory registry;
- workflow/calendar/gates.

### 101.3 Wave C — Sourcing and Supply Execution

- RFQ/quotation/comparison/award;
- supplier portal;
- samples/annotations/approvals;
- three supplier order types;
- material ownership/lots/reservations;
- production milestones/exceptions;
- quality and claims;
- costing/landed cost;
- trade/compliance readiness.

### 101.4 Wave D — JOOR/NuORDER Wholesale Core

- Brand/Retailer profiles;
- connections and access;
- CommercialProductProjection;
- catalog and linesheets;
- price lists/terms;
- simple order grid;
- WholesaleOrder and amendments;
- messages/documents;
- basic wholesale analytics.

### 101.5 Wave E — Russian Operational Integration

- 1С product/order mapping;
- order export and status inbound;
- EDO/УПД status;
- payment/shipment status;
- GTIN/National Catalog mapping;
- marking readiness exchange;
- reconciliation/error workbench.

### 101.6 Wave F — Advanced retained capabilities

- showrooms;
- visual assortments;
- doors/deliveries/rollups;
- order intent;
- retailer internal approval;
- sell-through/reorder when reliable feeds exist;
- multilingual supplier enhancements;
- retailer ERP/EDI.

### 101.7 Delivery rule

A wave is complete only when it includes:

- domain entities and migrations;
- API/OpenAPI;
- permissions;
- RU/EN UI;
- events/audit;
- integration contracts where required;
- automated tests;
- UAT evidence;
- migration/import template;
- operational monitoring.

---

## 102. RU/EN Canonical Glossary / Канонический словарь

| System code / English | Русский интерфейс | Definition |
|---|---|---|
| Collection Plan | План коллекции | Плановая структура сезона/коллекции |
| Collection Item | Позиция плана коллекции | Планируемая единица, которая станет моделью или закупаемым товаром |
| Style | Модель | Каноническая идентичность изделия бренда |
| Style Version | Версия модели | Неизменяемая версия технических данных |
| Colorway | Цветомодель | Модель в конкретном цвете |
| SKU | SKU / товарная единица | Сочетание версии модели, цвета и размера |
| Supplier Product Candidate | Кандидат товара поставщика | Готовая/ODM модель до принятия в product master |
| Material | Материал | Ткань, фурнитура, этикетка или упаковка |
| Material Lot | Партия материала | Физически полученная партия с владельцем и балансом |
| BOM | Спецификация материалов | Компоненты и расходы изделия |
| BOL | Спецификация операций | Последовательность и нормативы операций |
| Measurement Chart | Таблица измерений | Значения, градация и допуски по размерам |
| Tech Pack | Технический пакет | Released snapshot для фабрики |
| RFQ | Запрос котировки | Формальный запрос предложения поставщикам |
| Quotation | Коммерческое предложение | Версионный ответ поставщика |
| Award | Решение о выборе | Утвержденный выбор quotation/supplier |
| Allocation | Распределение | Разделение объема по поставщикам/фабрикам |
| Sample | Образец | Физическая версия изделия/материала для review |
| PPS | Предпроизводственный образец | Final sample before production release |
| Production Order | Заказ на производство | Заказ изготовления по спецификации бренда |
| Material Purchase Order | Заказ материала | Закупка ткани/фурнитуры/упаковки |
| Finished Goods Purchase Order | Заказ готового товара | Закупка ready goods/ODM/white label |
| Production Milestone | Производственный этап | Плановая/подтвержденная/фактическая точка исполнения |
| Inspection | Проверка качества | Контроль партии/образца по плану |
| Defect | Дефект | Зафиксированное несоответствие |
| Landed Cost | Импортная полная себестоимость | Стоимость товара с распределенными расходами до назначения |
| Product Readiness Snapshot | Снимок готовности товара | Версионный результат всех readiness gates |
| Commercial Product Projection | Коммерческая карточка | Market-specific buyer-visible product version |
| Brand Profile | Профиль бренда | Коммерческое представление бренда |
| Retailer Profile | Профиль магазина | Организация покупателя, команда и locations |
| Connection | Подключение | Relationship approval между brand и retailer |
| Commercial Access Grant | Коммерческий доступ | Scope коллекций, цен и условий для retailer |
| Price List | Прайс-лист | Версионные оптовые цены и правила |
| Linesheet | Лайншит | Коммерческий ассортиментный документ |
| Showroom | Цифровой шоурум | Визуальное коммерческое представление коллекции |
| Assortment | Ассортимент закупщика | Рабочий документ выбора и распределения |
| Door | Точка/направление распределения | Store, warehouse, e-commerce or other destination |
| Order Intent | Намерение заказа | Предварительные selections/quantities, not binding |
| Wholesale Order | Оптовый заказ | Заказ магазина бренду |
| Order Amendment | Изменение заказа | Согласуемая версия изменений после submission |
| Shipment | Отгрузка | Физическое исполнение подтвержденного заказа |
| Commercial Document | Коммерческий документ | Order confirmation, invoice reference, packing list etc. |
| External Reference | Внешняя ссылка/ID | Identity in 1С, EDO, marking or provider system |

---

## 103. Source Register and Evidence Mapping / Реестр источников

### 103.1 Product & Supply benchmarks

Omnidata PLM Fashion 2026 confirms the functional sequence and key objects for:

- planning and calendars;
- digital style cards;
- materials and BOM;
- BOL operations;
- colors;
- measurement charts;
- tech packs;
- supplier sourcing and allocation;
- samples;
- supplier orders, production status and ERP exchange;
- quality inspections and defects.

Centric materials are used only as a benchmark for retained Product & Supply principles such as centralized product data, supplier quotation comparison, supplier portal collaboration, product specifications, mobile capture/review and visual collaboration. Commercial offer prices and confidential project terms are not part of this specification.

### 103.2 Wholesale benchmarks

Official JOOR materials confirm the benchmark direction of brand-retailer connections, virtual showrooms, linesheets, order management, reporting, retailer buying and visual assortment. Official NuORDER materials confirm wholesale catalogs, account-specific pricing and visibility, virtual showrooms, retailer profiles, product directory, collaborative assortments, doors, deliveries, rollups, order intents and sales reporting.

### 103.3 Russian official sources

The current Russian control layer is maintained against official sources for:

- ТР ТС 017/2011 and EAEU amendments;
- light-industry marking rules and transition dates;
- product description/GTIN/National Catalog workflows;
- mandatory EDO and UПД/УПД handling for marked wholesale turnover;
- 1С integration with marking and accounting processes.

Regulatory rules are implemented as effective-dated configuration. Hard-coded category lists without rule version and source are prohibited.

### 103.4 Evidence statuses

| Status | Meaning |
|---|---|
| `SOURCE CONFIRMED` | Supported directly by supplied or official benchmark material |
| `RUSSIAN REQUIREMENT` | Derived from current official Russian/EAEU source and requires effective-date control |
| `SYNTHA DECISION` | Product architecture decision for Syntha |
| `CONFIGURABLE` | Varies by organization, category, country or contract |
| `UAT REQUIRED` | Requires controlled end-to-end verification |

### 103.5 Final architecture rule

```text
Omnidata/Centric depth for making and buying products
+
JOOR/NuORDER clarity for selling products wholesale
+
Russian legal, accounting, marking and EDO integration boundary
+
RU/EN international supplier and buyer collaboration
=
Syntha operating model
```

---

## 104. Каркас полной сквозной спецификации / Complete End-to-End Specification Framework

### 104.1 Цель / Objective

RU: Каждый модуль Syntha должен быть описан не как изолированный экран, а как часть завершённой цепочки от бизнес-намерения до подтверждённого результата, внешнего документа, статуса исполнения и измеримого эффекта.

EN: Every Syntha module is specified as part of a completed business chain, not as an isolated screen. A flow is complete only when it produces a controlled result, downstream status, external-system reference where required and measurable outcome.

Для каждого процесса обязательны / Every process must define:

1. trigger / инициирующее событие;
2. preconditions / предусловия;
3. actors and permissions / роли и права;
4. source objects and versions / исходные объекты и версии;
5. commands and user actions / команды и действия;
6. validations and blocking rules / проверки и блокировки;
7. state transitions / переходы статусов;
8. resulting objects and snapshots / результирующие объекты и снимки;
9. domain events / доменные события;
10. integrations and external references / интеграции и внешние ссылки;
11. exceptions and recovery / исключения и восстановление;
12. audit trail / аудит;
13. analytics and SLA / аналитика и SLA;
14. UAT evidence / доказательства приёмки.

### 104.2 Универсальный объект действия / Universal Action Record

Каждое значимое действие создаёт `ActionExecution`:

- action ID;
- command type;
- aggregate type and ID;
- source version;
- requested by;
- organization and role;
- request timestamp;
- expected version;
- validation result;
- approval requirement;
- execution status;
- resulting version;
- emitted events;
- integration messages;
- correlation ID;
- error/recovery reference.

Lifecycle:

```text
REQUESTED
→ VALIDATING
→ APPROVAL_REQUIRED / READY_TO_EXECUTE
→ EXECUTING
→ SUCCEEDED / FAILED
→ COMPENSATED where applicable
```

### 104.3 Completion rule / Правило завершённости

Процесс не считается завершённым, если:

- пользователь получил только визуальное подтверждение без сохранённого результата;
- статус изменён без проверки обязательных зависимостей;
- внешняя интеграция не вернула подтверждение, но UI показывает успех;
- новая версия потеряла связь с исходной;
- ошибка не имеет владельца и recovery action;
- отсутствует конечный UAT-сценарий.

---

## 105. Сквозной граф зависимостей / Cross-Domain Dependency Graph

### 105.1 Основная цепочка / Primary chain

```text
CollectionStrategy
→ CollectionPlan
→ CollectionItem
→ DevelopmentRoute
→ Product/Supplier Candidate
→ Technical or Purchase Readiness
→ Supplier Decision
→ Supplier Order
→ Production/Supply Execution
→ Quality Acceptance
→ Import and Russian Readiness
→ ProductReadinessSnapshot
→ CommercialProductProjection
→ Price and Access
→ Catalog/Linesheet/Showroom
→ Retailer Assortment
→ WholesaleOrder
→ Order Agreement
→ ERP/1C Execution
→ EDO/UPD and Shipment
→ Payment and Delivery Status
```

### 105.2 Обязательные связи / Mandatory relationships

| Upstream object | Downstream object | Связь / Relationship | Правило / Rule |
|---|---|---|---|
| `CollectionItem` | `StyleVersion` or `SupplierProductCandidate` | source identity | Один активный sourcing branch на конкретную версию решения |
| `StyleVersion` | `BOM`, `MeasurementChart`, `TechPack` | technical version set | Released objects resolve to one immutable source set |
| `RFQ` | `QuotationVersion` | supplier response | Quotation references exact RFQ version |
| `Award` | Supplier Order | commercial commitment | PO cannot use unawarded terms without override approval |
| Supplier Order | Milestones/Inspections/Receipts | execution scope | All facts resolve to order line and version |
| `ProductReadinessSnapshot` | `CommercialProductProjectionVersion` | publication source | Projection stores source snapshot ID |
| `PriceListVersion` | Wholesale Order line | price source | Submitted line stores exact price resolution |
| `CommercialAccessGrant` | Catalog/Order | visibility authority | Access is checked on every read and command |
| `WholesaleOrderVersion` | ERP/1C document | execution mapping | External ID maps to agreed version, not mutable draft |
| Shipment | UPD/EDO/marking references | legal execution | Quantities and codes reconcile at line level |

### 105.3 Dependency status / Статус зависимости

Each dependency is represented as:

```text
NOT_REQUIRED
REQUIRED_NOT_STARTED
IN_PROGRESS
READY
BLOCKED
WAIVED
EXPIRED
```

A waiver stores authorized user, reason, evidence, scope and expiry/review date.

---

## 106. Двуязычные данные, локализация и поиск / Bilingual Data, Localization and Search

### 106.1 TranslatableValue

Любое переводимое поле хранится как набор значений, а не как одна строка:

- field key;
- source language;
- source text;
- translated language;
- translated text;
- translation method: `HUMAN`, `MACHINE_DRAFT`, `IMPORT`;
- translator;
- reviewer;
- review status;
- terminology warnings;
- effective version.

Lifecycle:

```text
SOURCE_READY
→ TRANSLATION_DRAFT
→ LANGUAGE_REVIEW
→ APPROVED
→ SUPERSEDED
```

### 106.2 Минимальные языковые требования / Minimum language requirements

| Object | RU required | EN required | Rule |
|---|---:|---:|---|
| Internal Russian legal entity | Да | Опционально | English used for foreign contract/export context |
| Foreign supplier/factory profile | Да, краткое имя | Да | Original legal name remains unchanged |
| Style commercial name | Да | Да for international sales | Publication blocked by target-market language policy |
| Tech Pack | Configurable | Да for foreign factory | Factory language can override default |
| RFQ instructions | Да | Да for foreign supplier | Supplier sees selected language plus original |
| Label text | Да | Optional other language | Russian version controlled separately |
| Linesheet/Showroom | Да | Да for international buyer | One version may contain both languages |
| Error/notification template | Да | Да | Recipient language selected by membership preference |

### 106.3 Search index

Index contains:

- Russian normalized text;
- English normalized text;
- original supplier text;
- transliteration;
- style/article/SKU/GTIN;
- material and color codes;
- legal entity identifiers;
- document numbers;
- synonyms from controlled glossary.

Search results show matched field and language. Access filtering occurs before result rendering.

### 106.4 Terminology governance

`TerminologyTerm` stores:

- canonical system code;
- RU label;
- EN label;
- allowed synonyms;
- prohibited/ambiguous variants;
- domain;
- definition;
- example;
- owner;
- effective version.

Changing a canonical UI label does not change API field names or historical document text.

---

## 107. Планирование коллекции End-to-End / Collection Planning End-to-End

### 107.1 Trigger / Триггер

RU: Бренд создаёт сезон, коллекцию, capsule или drop и фиксирует плановые коммерческие и производственные ограничения.

EN: A brand opens a season, collection, capsule or drop and establishes commercial, product and sourcing targets.

### 107.2 Preconditions

- active brand organization and legal entity;
- season/calendar dictionaries;
- category and size dictionaries;
- currencies and planning exchange-rate policy;
- user with Collection Planning permission.

### 107.3 Planning objects

- `BusinessYear`;
- `Season`;
- `Collection`;
- `Capsule`;
- `Drop`;
- `CollectionPlanVersion`;
- `CollectionItem`;
- `CalendarTemplate`;
- `PlanningTarget`;
- `ApprovalDecision`.

### 107.4 Collection plan dimensions

- category/subcategory;
- gender/age group;
- route;
- source country;
- supplier/factory candidate;
- style count;
- colorway count;
- SKU count;
- planned units;
- target cost;
- target wholesale and retail price;
- target margin;
- launch date;
- delivery window;
- channel/market;
- owner;
- readiness target date.

### 107.5 User actions

- create from template;
- copy previous season with controlled carry-over;
- import XLSX with preview and mapping;
- create placeholders;
- split/merge planning rows;
- assign route and owner;
- create calendar milestones from template;
- compare plan versions;
- submit for approval;
- approve/reject with comments;
- baseline approved plan;
- create execution objects from approved positions.

### 107.6 Validations

- every approved row has category, route, owner and target dates;
- target cost and price use declared currency;
- total plan reconciles by hierarchy;
- duplicate style/carry-over links are flagged;
- route-specific mandatory planning data is checked;
- baseline cannot be edited; changes create new version;
- deleted planning row with downstream objects becomes `CANCELLED`, not physically deleted.

### 107.7 Outputs

- approved `CollectionPlanVersion`;
- executable `CollectionItem` records;
- generated tasks and calendar;
- planned demand for sourcing/material calculation;
- initial collection readiness dashboard.

### 107.8 Events

- `collection_plan_created`;
- `collection_plan_imported`;
- `collection_plan_submitted`;
- `collection_plan_approved`;
- `collection_plan_baselined`;
- `collection_item_activated`;
- `collection_item_cancelled`.

### 107.9 UAT closure

A planning E2E test must prove that an approved row becomes a route-specific CollectionItem, inherits dates/targets, creates traceable downstream work and remains linked to its planning baseline.

---

## 108. Route A End-to-End — собственная разработка и контрактное производство / Own Development and Contract Manufacturing

### 108.1 Full path

```text
CollectionItem
→ Style and StyleVersion
→ Colorways and Size Scale
→ BOM/Measurements/Construction
→ Tech Pack Draft
→ Sample Requests
→ Technical Approval
→ Manufacturing RFQ
→ Quotation/Award
→ Released Tech Pack
→ Production Order
→ Materials and PPS Readiness
→ Production Milestones
→ Inline/Final QC
→ Shipment/Import/Receipt
→ Compliance and Marking Readiness
→ ProductReadinessSnapshot
→ CommercialProductProjection
```

### 108.2 Technical readiness gate

Required conditions are configured by category and include:

- approved StyleVersion;
- all orderable colorways resolved;
- complete BOM;
- approved measurement chart;
- construction and callouts;
- labels/packaging version;
- approved required sample;
- test results where required;
- target/negotiated cost reviewed;
- factory decision;
- released Tech Pack.

### 108.3 Release to production command

`ReleaseProductionOrder` validates:

- supplier/factory active;
- award or approved direct-source decision;
- exact technical source versions;
- required material availability or confirmed responsibility;
- sample/PPS policy;
- packaging/label version;
- order quantity and MOQ;
- currency, Incoterms, payment schedule;
- quality plan;
- compliance assumptions;
- authorized approval.

### 108.4 Change after production release

A technical change creates `ProductionChangeRequest`:

- affected specifications;
- old/new version;
- supplier feasibility response;
- cost impact;
- schedule impact;
- material impact;
- sample/retest requirement;
- order-line impact;
- commercial projection impact;
- approval and effective point.

No approved production version is overwritten.

### 108.5 End condition

Route A is complete only when accepted quantities, actual source version, quality result, landed-cost state, compliance state and commercial projection source can be traced to the original CollectionItem.

---

## 109. Route B End-to-End — отдельная закупка материалов / Separate Material Procurement

### 109.1 Full path

```text
CollectionItem
→ Style/BOM
→ Material Requirement
→ Existing Balance Check
→ Material RFQ
→ Material Quotation/Award
→ Material Purchase Order
→ Shipment to Brand or Factory
→ Factory Receipt and Lot Creation
→ Testing/Acceptance
→ Reservation to Production Order
→ Production Order Release
→ Consumption
→ Balance/Variance/Disposition
→ Finished Product QC
→ Product Readiness
```

### 109.2 Material requirement engine

Inputs:

- BOM version;
- production quantities by color/size;
- sample requirement;
- consumption rules;
- wastage;
- unit conversion;
- usable owned balances;
- existing reservations;
- MOQ and price break;
- safety allowance.

Outputs:

- gross requirement;
- available balance;
- shortage;
- recommended purchase;
- expected excess;
- affected production orders;
- required-by date.

### 109.3 Cross-border direct shipment

For supplier-country → factory-country movement the system stores:

- buyer and legal owner;
- seller;
- manufacturer where different;
- consignee factory;
- notify party;
- ship-from/ship-to;
- Incoterms;
- invoice/packing list/transport references;
- test/certificate scope;
- customs/import responsibility by route;
- shipment quantities;
- factory receipt and discrepancy;
- ownership acknowledgement.

### 109.4 Lot controls

- immutable lot ID;
- supplier and manufacturer lot;
- dye lot;
- material/color/version;
- received and usable quantities;
- testing status;
- owner and custodian;
- restrictions;
- reservations;
- consumption;
- valuation;
- remaining balance.

### 109.5 Blocking rules

- production cannot consume unreceived or blocked lot;
- reservation cannot exceed usable balance;
- dye-lot restriction applies at style/color/order level;
- unit conversion must be effective and approved;
- discrepancy requires resolution before final receipt;
- actual consumption above tolerance creates exception and cost impact;
- leftover requires disposition decision.

### 109.6 End condition

Every finished quantity can be traced to reserved material lots, planned and actual consumption, variance, ownership and resulting landed cost.

---

## 110. Route C End-to-End — готовые изделия, ODM и white label / Finished Goods, ODM and White Label

### 110.1 Full path

```text
Supplier Catalog/Offer
→ SupplierProductCandidate
→ Data Mapping
→ Sample or Waiver
→ Commercial/Quality/Compliance Review
→ Customization and Branding Specification
→ Finished Goods RFQ/Quotation
→ Award
→ Finished Goods Purchase Order
→ Supplier Confirmation
→ Supply/Production Milestones
→ Shipment and Import
→ Incoming QC
→ Russian Label/Compliance/GTIN/Marking Readiness
→ Brand SKU Mapping
→ ProductReadinessSnapshot
→ CommercialProductProjection
```

### 110.2 SupplierProductCandidate

Fields:

- supplier product ID/article;
- manufacturer;
- original name and description;
- category;
- images;
- composition;
- colors;
- supplier sizes;
- supplier SKUs/barcodes;
- MOQ/MOV;
- price and currency;
- lead time;
- country of origin;
- documents;
- customization options;
- data completeness;
- mapping status.

### 110.3 Mapping workbench

Functions:

- upload XLSX/CSV/API catalog;
- map supplier fields to canonical fields;
- detect duplicate candidates;
- map categories/colors/sizes/units;
- preserve raw source row;
- validate composition totals;
- create proposed brand article/SKU;
- show unresolved fields;
- approve mapping template for reuse;
- version supplier data refresh.

### 110.4 Customization specification

Optional controlled objects:

- brand label;
- hangtag;
- packaging;
- color change;
- material change;
- logo/print/embroidery;
- size-label mapping;
- bundle/kit composition;
- Russian-language information;
- approval sample requirement.

### 110.5 Simplified technical rule

A full brand-owned BOM/BOL is not required unless customization or quality policy requires it. Supplier specification, composition, dimensions/size mapping, branding, packaging, quality and compliance information remain versioned and mandatory according to category.

### 110.6 End condition

The accepted imported item must have an auditable chain from supplier candidate and source documents to brand SKU, incoming QC, Russian readiness and buyer-visible commercial version.

---

## 111. Supplier Collaboration End-to-End / Сквозная работа с поставщиком

### 111.1 Supplier workspace

External supplier/factory portal contains:

- Home / required actions;
- RFQ invitations;
- quotation drafts and submissions;
- sample requests and shipments;
- assigned product/specification packages;
- supplier orders and amendments;
- material shipments/receipts assigned to factory;
- production milestones;
- inspection findings and corrective actions;
- document requests;
- message threads;
- profile and banking-change workflow.

### 111.2 Task inbox

Every external task contains:

- task type;
- object and version;
- requested action;
- due date/timezone;
- priority;
- requester;
- required fields/files;
- visibility;
- SLA;
- state;
- escalation.

Lifecycle:

```text
OPEN → ACKNOWLEDGED → IN_PROGRESS → SUBMITTED → ACCEPTED / REVISION_REQUIRED → CLOSED
```

### 111.3 Secure collaboration rules

- supplier sees only explicitly assigned objects;
- supplier cannot see competing quotations or internal margins;
- downloaded specifications are versioned and logged;
- comments support internal and shared visibility;
- bank-detail change triggers controlled verification and payment hold policy;
- supplier confirmation always references exact buyer version;
- supplier cannot mark inspection or buyer approval as completed.

### 111.4 Communication continuity

Email/notification links open the exact object, version and required action. Reply by email may be captured only when sender identity and thread token are validated. Attachments are virus-scanned and classified.

---

## 112. Образцы End-to-End / Samples End-to-End

### 112.1 Sample dependency graph

```text
SampleRequest
→ Supplier Acknowledgement
→ SampleVersion
→ Shipment
→ Receipt
→ Measurement/Fit/Visual Review
→ Decision
→ Required Corrections
→ Next Sample or Approval
→ Downstream Release
```

### 112.2 Sample round controls

- sample type and round number;
- source Style/BOM/Measurement/Customization versions;
- requested versus actual material/color;
- requested/received sizes;
- due dates;
- physical sample ID;
- shipping chain;
- review panels;
- decision and conditions;
- downstream blockers.

### 112.3 Measurement review

The review screen shows:

- approved/target values;
- actual values;
- tolerance range;
- absolute and percentage deviation;
- pass/fail per POM;
- image/diagram reference;
- comment and correction;
- comparison with previous sample round.

### 112.4 Fit and visual review

Supports:

- model/body measurements reference;
- fit session date/location;
- reviewer group;
- annotated photos/video;
- issue category;
- severity;
- correction instruction;
- owner and due date;
- internal/supplier-visible split.

### 112.5 Decision propagation

`APPROVED` may release sourcing or production conditions. `REVISION_REQUIRED` creates the next required task. `REJECTED` blocks the branch. `APPROVED_WITH_CONDITIONS` creates explicit dated conditions that must be resolved before the configured gate.

---

## 113. Quality Management End-to-End / Управление качеством End-to-End

### 113.1 Quality chain

```text
QualityPolicy
→ QualityPlan
→ InspectionRequest
→ Inspection Execution
→ Defects/Measurements/Evidence
→ Inspector Recommendation
→ Authorized Release Decision
→ Corrective Action/Reinspection
→ Accepted and Rejected Quantities
→ Supplier Claim/Commercial Resolution
→ Receipt and Cost Update
```

### 113.2 QualityPolicy

Configured by:

- brand/legal entity;
- category;
- route;
- supplier/factory risk level;
- country;
- order value/quantity;
- inspection stage;
- sampling/AQL method;
- mandatory checks;
- release authority;
- evidence requirements;
- conditional-release rules.

### 113.3 Inspection checklist types

- construction and workmanship;
- measurements;
- material/color;
- print/embroidery/logo;
- labels and Russian text;
- packaging;
- quantity and assortment;
- carton marking;
- barcode/GTIN readability;
- Data Matrix/marking check where applicable;
- documentation;
- transport/loading condition.

### 113.4 Defect and nonconformity

`Nonconformity` stores:

- requirement source;
- failed checkpoint;
- defect taxonomy version;
- severity;
- affected item/SKU/lot/carton;
- affected and inspected quantity;
- evidence;
- root-cause hypothesis;
- containment action;
- corrective action;
- owner;
- due date;
- verification;
- closure.

### 113.5 Release decision

The release screen shows:

- inspector recommendation;
- policy thresholds;
- critical/major/minor counts;
- measurement failures;
- open corrective actions;
- accepted/rejected quantities;
- commercial and schedule impact;
- required approver;
- decision reason.

### 113.6 Quantity truth

System separately stores:

- ordered;
- supplier confirmed;
- produced/supplied;
- inspected;
- passed;
- conditionally passed;
- rejected;
- shipped;
- received;
- accepted into stock.

These quantities reconcile but are never silently collapsed into one number.

### 113.7 Quality-to-cost link

Rejected/reworked/replaced quantities and claims update actual cost analysis using controlled references. A supplier credit note or compensation remains an external accounting reference when managed in 1С.

---

## 114. Costing End-to-End / Сквозная себестоимость

### 114.1 Cost lineage

```text
Planning Target
→ BOM/BOL Estimate or Supplier Offer
→ Quotation Version
→ Award Terms
→ PO Committed Cost
→ Planned Landed Cost
→ Shipment Expenses
→ Actual Landed Cost
→ Reconciled Cost
→ Margin Impact
```

### 114.2 CostVersion

- version type;
- scope: style/colorway/SKU/order/shipment;
- source versions;
- base currency;
- transaction currencies;
- FX source/date/rate;
- component lines;
- allocation rules;
- calculated totals;
- assumptions;
- owner/approver;
- created/effective timestamp;
- status.

### 114.3 Cost component controls

Every component stores:

- component type;
- source document/reference;
- amount and currency;
- recoverable/non-recoverable tax treatment where configured;
- quantity basis;
- allocation method;
- allocated objects;
- rounding method;
- variance reason;
- evidence.

### 114.4 Margin views

- planned wholesale margin;
- current expected margin;
- actual margin using reconciled landed cost;
- margin by style/color/SKU/order/retailer;
- currency effect;
- sourcing variance;
- freight/customs variance;
- quality/claim effect;
- price-version reference.

A cost change never silently changes an active price list or submitted wholesale order.

---

## 115. Международная торговля и российская готовность End-to-End / International Trade and Russian Readiness

### 115.1 Trade lane profile

`TradeLaneProfile` is configured for:

- exporter country;
- importer country;
- ship-from and destination;
- legal entities;
- product/material category;
- Incoterms;
- transport mode;
- required documents;
- responsible parties;
- expected lead times;
- customs broker;
- currency/payment restrictions;
- compliance and marking steps.

### 115.2 Shipment dossier

- supplier order lines;
- seller/exporter/manufacturer;
- buyer/importer/consignee;
- country of origin;
- commodity description RU/EN;
- ТН ВЭД ЕАЭС;
- quantity and units;
- net/gross weight;
- cartons/packing details;
- commercial invoice;
- packing list;
- transport document;
- contract/specification;
- certificate/declaration references;
- customs declaration reference;
- broker and status;
- duty/customs-cost snapshots;
- discrepancy and receipt.

### 115.3 Compliance applicability decision

Inputs:

- category;
- product attributes;
- composition;
- intended use/age group;
- ТН ВЭД ЕАЭС;
- ОКПД2 where applicable;
- manufacturer/importer role;
- country of origin;
- effective date;
- market/legal entity.

Output:

- applicable requirements;
- required evidence/documents;
- marking applicability;
- label fields;
- blocking gates;
- rule version and source reference.

### 115.4 Russian label pack

`RussianLabelVersion` contains:

- product name;
- brand/trademark;
- manufacturer;
- importer/applicant where applicable;
- country of origin;
- composition;
- size;
- care instructions/symbols;
- EAC and other required marks;
- article/GTIN;
- production information where applicable;
- packaging/label layout;
- source product version;
- reviewer and approval.

### 115.5 Marking chain

```text
Applicability Decision
→ Product Description Ready
→ GTIN Mapping
→ National Catalog Card Reference
→ Code Order Reference
→ Printing/Application Plan
→ Applied/Verified Quantities
→ Introduction into Circulation Reference
→ Wholesale Transfer/UPD Readiness
→ Reconciliation
```

Official external states remain authoritative. Syntha stores requested, received, reconciled and failed exchange states plus external references.

### 115.6 Readiness gate

Russian readiness can be:

```text
NOT_ASSESSED
ASSESSMENT_IN_PROGRESS
DOCUMENTS_REQUIRED
DOCUMENTS_UNDER_REVIEW
LABEL_READY
MARKING_PREPARED
READY_FOR_IMPORT
READY_FOR_CIRCULATION
READY_FOR_WHOLESALE_TRANSFER
BLOCKED
```

Each state is derived from explicit checks, not manually painted green.

---

## 116. Product Readiness and Commercial Publication End-to-End / Готовность и публикация товара

### 116.1 Readiness dimensions

- identity;
- technical or supplier specification;
- sourcing/order;
- material;
- sample;
- quality;
- cost;
- trade/import;
- compliance;
- label;
- GTIN/marking;
- commercial content;
- images/rights;
- price;
- delivery;
- order-unit/pack;
- access scope.

### 116.2 ReadinessCheckResult

- dimension;
- rule/check ID and version;
- status;
- required object;
- current object/version;
- blocking reason;
- owner;
- due date;
- evidence;
- waiver;
- last evaluated at.

### 116.3 ProductReadinessSnapshot

Immutable snapshot stores:

- product/style/SKU scope;
- route;
- source technical/purchase versions;
- results of all checks;
- accepted quantities where relevant;
- compliance rule version;
- cost version;
- generated at;
- approved by;
- publication eligibility;
- expiry/review conditions.

### 116.4 Commercial projection creation

The creation wizard:

1. selects readiness snapshot;
2. selects market/language;
3. maps commercial attributes;
4. selects media and rights;
5. defines size/color presentation;
6. assigns price context;
7. defines delivery/availability mode;
8. selects buyer-visible documents;
9. validates RU/EN content;
10. submits projection for commercial approval.

### 116.5 Publication impact control

Before update/unpublish the system lists:

- active catalogs;
- linesheets;
- showrooms;
- access grants;
- assortments;
- draft orders;
- submitted/confirmed order snapshots;
- exports/share links;
- affected retailers.

The user chooses publication action and communication plan. Historical order data never changes.

---

## 117. Catalog, Linesheet and Showroom End-to-End / Каталог, лайншит и шоурум

### 117.1 Catalog view resolution

For every buyer request:

```text
User Membership
+ Retailer Organization
+ Connection
+ CommercialAccessGrant
+ Publication Scope
+ Price Resolution
+ Language/Currency
+ Effective Date
= Buyer Catalog View
```

### 117.2 Catalog functions

- search and filters;
- saved views;
- grid/list/quick view;
- product comparison;
- favorites/shortlist;
- size/color availability;
- delivery filters;
- price/RRP/margin display as permitted;
- MOQ/MOV/pack display;
- buyer-visible documents;
- add to assortment/order;
- controlled XLSX/PDF export;
- view analytics.

### 117.3 Linesheet lifecycle

```text
DRAFT → CONTENT_READY → PRICE_CONTEXT_ASSIGNED → REVIEWED → PUBLISHED → SUPERSEDED / ARCHIVED
```

Linesheet version stores product projection versions, price/access context, sort order, visible fields, language, currency and export template.

### 117.4 Showroom lifecycle

```text
DRAFT → CURATION → PREVIEW → SCHEDULED → PUBLISHED → UNPUBLISHED → ARCHIVED
```

Components:

- cover/story;
- chapters;
- visual boards;
- looks;
- hotspots;
- products;
- campaign media;
- linesheet links;
- buyer CTA;
- retailer-group visibility;
- publication window.

### 117.5 Controlled sharing

A share link never expands permissions. It can narrow:

- recipient;
- resource/version;
- language/currency;
- view/download/order actions;
- expiry;
- password/one-time token;
- watermark;
- revocation.

---

## 118. Retailer Assortment and Wholesale Order End-to-End / Ассортимент и оптовый заказ

### 118.1 Assortment chain

```text
Catalog/Showroom View
→ Favorite/Shortlist
→ RetailerAssortment
→ Doors and Deliveries
→ Budget/Quantity Review
→ Order Intent where used
→ Draft Wholesale Order
→ Internal Retailer Approval
→ Submission
→ Brand Review
→ Amendment Negotiation
→ Current Agreed Order
```

### 118.2 RetailerAssortment

- retailer/legal entity;
- brand/collection;
- owner/team;
- selected product versions;
- status: must buy/consider/reject;
- quantities;
- doors;
- deliveries;
- budget/category totals;
- notes;
- internal visibility;
- source and last update.

### 118.3 Doors and deliveries

Door types:

- store;
- warehouse;
- e-commerce;
- franchise;
- regional distributor;
- other controlled destination.

Delivery allocation stores quantity by SKU × door × delivery window. Rollups reconcile to assortment/order totals.

### 118.4 Order entry quality

- keyboard navigation;
- color/size matrix;
- Excel copy/paste;
- paste preview;
- invalid-cell explanation;
- pack conversion;
- MOQ/MOV checks;
- budget and total updates;
- autosave and conflict handling;
- undo/redo for local editing actions;
- duplicate SKU and buyer-PO warnings.

### 118.5 Submission snapshot

Submitted order stores:

- exact commercial projection versions;
- exact price resolution and terms;
- access-grant version;
- quantities;
- addresses;
- delivery windows;
- buyer legal entity;
- buyer PO/reference;
- approvers;
- submitted timestamp;
- source assortment/intent references.

### 118.6 Brand review workbench

For each line the brand sees:

- requested quantity/date/price;
- availability and production commitment;
- MOQ/pack;
- proposed action;
- replacement options;
- internal notes;
- buyer-visible reason;
- resulting value/date impact.

### 118.7 Amendment closure

An amendment is complete only after the authorized receiving party accepts/rejects it. Accepted changes create a new immutable agreed order version. Pending proposals do not change fulfillment truth.

---

## 119. Fulfillment, 1С, ЭДО and Wholesale Transfer End-to-End / Исполнение, 1С, ЭДО и оптовая передача

### 119.1 ERP handoff

Only an approved agreed order version is eligible for export. Export package includes:

- seller/buyer legal entities;
- mapped products/SKUs;
- quantities and prices;
- tax/VAT context;
- delivery and payment terms;
- addresses;
- marking applicability references;
- source order/version;
- idempotency key.

### 119.2 ERP acknowledgement

The order is not marked exported until Syntha receives or records:

- external order/document ID;
- accepted/rejected status;
- line mapping result;
- validation errors;
- source timestamp.

Partial mapping creates reconciliation, not partial silent success.

### 119.3 Fulfillment quantities

At order-line level:

```text
Agreed
→ Reserved/Planned
→ Ready
→ Shipped
→ Delivered
→ Accepted
```

Side quantities:

```text
Cancelled / Backordered / Rejected / Returned-to-sender / Discrepancy
```

### 119.4 Shipment package

- shipment ID;
- order versions/lines;
- warehouse/location;
- cartons;
- quantities;
- carrier/tracking;
- planned/actual dates;
- packing list;
- marking-code batch references where required;
- ERP document IDs;
- EDO/UPD references;
- delivery/discrepancy status.

### 119.5 EDO/UPD state

```text
NOT_CREATED
→ CREATED_EXTERNALLY
→ SENT
→ DELIVERED_TO_OPERATOR
→ RECEIVED_BY_COUNTERPARTY
→ SIGNED / REJECTED / CORRECTION_REQUIRED
→ COMPLETED
```

Syntha displays source system, last status time, external ID and failure reason.

### 119.6 Wholesale marking reconciliation

For marking-required items the check compares:

- shipment SKU and quantity;
- expected code count;
- codes assigned to shipment/document;
- external validation result;
- UPD transfer reference;
- unresolved differences.

Shipment/legal completion is blocked according to effective policy when required reconciliation fails.

---

## 120. Integration Contracts and Reconciliation / Интеграционные контракты и сверка

### 120.1 IntegrationMessage

- message ID;
- connector;
- direction;
- business operation;
- source object/version;
- idempotency key;
- payload schema version;
- created/sent/received timestamps;
- attempt count;
- status;
- external response/reference;
- error code and message RU/EN;
- owner;
- next retry;
- reconciliation case.

Lifecycle:

```text
CREATED → QUEUED → SENT → ACKNOWLEDGED → COMPLETED
```

Failure states:

```text
RETRYABLE_FAILED / PERMANENT_FAILED / RECONCILIATION_REQUIRED / CANCELLED
```

### 120.2 Connector boundaries

| Connector | Syntha sends | Syntha receives | Authoritative boundary |
|---|---|---|---|
| 1С/ERP | mappings, agreed orders, supplier orders if configured, shipment preparation | IDs, accounting docs, stock/payment/shipment/receipt statuses | Accounting and stock truth remain external |
| EDO provider | document request/reference through integration | delivery/signature/rejection/correction status | Legal-signature truth remains with operator |
| Marking provider/1С | product/GTIN/code-operation requests as configured | official operation/status/errors | Official marking truth remains external |
| Logistics provider | shipment/tracking request | tracking milestones/exceptions | Physical carrier status remains external |
| Supplier/retailer EDI | controlled business documents | acknowledgements/changes/statuses | Mapping and business acceptance remain explicit |

### 120.3 ReconciliationCase

- object and external mapping;
- conflicting values;
- source timestamps;
- source-of-truth rule;
- business impact;
- automatic resolution proposal;
- assigned owner;
- due date;
- resolution action;
- before/after references;
- audit.

### 120.4 Recovery rules

- retry preserves idempotency key;
- manual export/import uses same business operation reference;
- user can never convert an integration failure to success without external reference or authorized manual evidence;
- dead-letter items remain searchable and assigned;
- correction creates a new message/version rather than editing transmitted history.

---

## 121. Экранный стандарт и функциональная глубина / Screen Standard and Functional Depth

### 121.1 Registry screen

Every registry includes:

- scoped search;
- filters and saved views;
- configurable columns;
- sorting;
- pagination/virtualization;
- bulk selection and permitted bulk actions;
- status/owner/next action;
- data quality indicators;
- export respecting visibility;
- import where supported;
- empty/loading/error states;
- RU/EN labels and values.

### 121.2 Object workspace

Standard zones:

1. header: identity, version, state, owner, primary action;
2. readiness/validation summary;
3. tabs by domain;
4. related objects and dependency graph;
5. activity/comments;
6. documents/files;
7. history/version comparison;
8. integration/external references;
9. audit and events for authorized roles.

### 121.3 Command UX

A lifecycle action dialog shows:

- current state/version;
- requested target state;
- checks passed/failed;
- affected downstream objects;
- required reason/files;
- approval requirement;
- external operations;
- irreversible effects;
- confirmation and resulting next step.

### 121.4 Data-quality panel

Shows:

- missing required fields;
- invalid dictionary values;
- untranslated mandatory content;
- duplicate identifiers;
- stale/expired documents;
- unresolved mappings;
- integration conflicts;
- blocking/non-blocking classification;
- owner and fix action.

---

## 122. Notifications, Tasks, SLA and Escalation / Уведомления, задачи, SLA и эскалации

### 122.1 NotificationRule

- event;
- condition;
- recipient role/user/organization;
- channel: in-app/email/Telegram where enabled;
- language;
- urgency;
- quiet hours/timezone;
- template version;
- deduplication window;
- escalation policy.

### 122.2 Required-action notification

Contains:

- business object;
- exact required action;
- due date;
- impact if missed;
- deep link;
- owner;
- current status;
- language selected for recipient.

### 122.3 SLA examples

- RFQ acknowledgement;
- quotation submission;
- sample acknowledgement and dispatch;
- milestone update;
- inspection report submission;
- corrective-action response;
- wholesale-order brand review;
- retailer amendment response;
- integration-error ownership.

SLA timers support pause reasons, business calendars and supplier/retailer timezones.

---

## 123. Permissions and Confidentiality Matrix / Матрица прав и конфиденциальности

### 123.1 Permission dimensions

Access decision combines:

- organization;
- membership status;
- role;
- domain action;
- object assignment;
- collection/account scope;
- legal entity;
- market/territory;
- field classification;
- object state;
- temporary delegation.

### 123.2 Field classifications

```text
PUBLIC_COMMERCIAL
CONNECTED_BUYER
INTERNAL_BRAND
SUPPLY_PARTNER_SHARED
CONFIDENTIAL_COST
BANKING_RESTRICTED
LEGAL_RESTRICTED
PERSONAL_DATA
```

### 123.3 Critical separation rules

- retailer never sees technical BOM, supplier cost or other retailers;
- supplier never sees retailer orders, competitor quotations or unrestricted target margins;
- inspector sees assigned quality scope and active specifications;
- sales user cannot change technical source data;
- product/sourcing user cannot publish price without commercial permission;
- banking data export and change are separately permissioned;
- support/admin access is logged and time-bound.

### 123.4 Delegation

Temporary delegation stores grantor, grantee, exact actions, scope, start/end time, reason and revocation. It never grants broader organization access than the grantor owns.

---

## 124. Failure and Recovery Matrix / Матрица сбоев и восстановления

| Stage | Failure | Blocking result | Recovery |
|---|---|---|---|
| Collection plan | invalid import/mapping | rows not committed | preview errors, mapping correction, re-import |
| Product version | concurrent update | command rejected | reload, compare versions, reapply controlled changes |
| RFQ | supplier not active | invitation blocked | complete onboarding/approval |
| Quotation | late/obsolete source | submission held | buyer accepts late response or reopens RFQ |
| Material | receipt discrepancy | lot not fully usable | discrepancy review, partial receipt, supplier claim |
| Sample | lost/incomplete | review blocked | replacement shipment or authorized waiver |
| Production | material shortage | start/release blocked | reallocation, substitute approval, new purchase |
| Quality | critical defect | release blocked | corrective action/reinspection/rejection |
| Compliance | expired/missing evidence | readiness blocked | new document, scope correction, approved rule review |
| Marking | code/status mismatch | shipment/legal step blocked | provider reconciliation and corrected operation |
| Catalog | price/access missing | buyer cannot order | activate price/access and republish context |
| Wholesale order | MOQ/pack/address error | submission blocked | correct lines/terms/address or approved override |
| ERP export | validation/mapping error | order not exported | fix mapping/data and retry same idempotent operation |
| EDO | rejection/correction | legal completion pending | correction document/reference and resubmission |
| Shipment | quantity discrepancy | completion held | delivery/claim/reconciliation decision |

Every blocking failure must expose owner, next action, due date and business impact.

---

## 125. End-to-End UAT Evidence and Definition of Done / Сквозная приёмка и критерий готовности

### 125.1 Required evidence pack

For each E2E scenario:

- scenario ID and version;
- preconditions and seeded data;
- roles/users;
- steps RU/EN;
- expected state after every step;
- generated objects/versions;
- audit entries;
- events/outbox messages;
- external mock/real acknowledgements;
- screenshots/log references;
- negative checks;
- final reconciliation;
- tester and approval.

### 125.2 Route A mandatory scenario

Prove:

- plan → StyleVersion → BOM/measurements/tech pack;
- sample revision and approval;
- RFQ/award/ProductionOrder;
- milestone and QC failure/reinspection;
- accepted receipt and actual cost;
- Russian readiness;
- commercial publication;
- retailer order and ERP handoff.

### 125.3 Route B mandatory scenario

Prove:

- material calculation;
- Chinese supplier purchase;
- direct shipment to Turkish factory;
- Russian brand ownership;
- lot receipt/testing/reservation;
- consumption variance and leftover;
- finished production and commercial sale.

### 125.4 Route C mandatory scenario

Prove:

- supplier catalog import;
- candidate mapping;
- ready-goods sample;
- branding/Russian label;
- FinishedGoodsPurchaseOrder;
- import/incoming QC;
- GTIN/marking readiness;
- brand SKU publication and wholesale order.

### 125.5 Wholesale mandatory scenario

Prove:

- retailer connection but no automatic price access;
- explicit access and price assignment;
- RU/EN catalog/linesheet;
- Excel quantity-grid entry;
- internal approval;
- submission snapshot;
- partial brand confirmation and amendment;
- accepted agreed order;
- idempotent 1С export;
- shipment, UPD/EDO and payment statuses.

### 125.6 Definition of Done

A retained capability is complete only when:

- entity model and migrations exist;
- API/OpenAPI commands and reads exist;
- lifecycle and validations are server-enforced;
- permissions and tenant isolation are tested;
- RU/EN UI, values and error text are implemented;
- audit and domain events are emitted;
- integration behavior and recovery are defined;
- analytics dimensions are available;
- positive and negative automated tests pass;
- E2E UAT evidence proves downstream closure;
- operational logs/metrics/alerts identify failures.

---

## 126. Систематизированное применение benchmark-функций / Systematized Benchmark Capability Application

### 126.1 Omnidata-derived retained structure

Applied to Syntha Product & Supply:

- collection and assortment planning;
- style/colorway product master;
- material and color libraries;
- BOM, BOL and measurement charts;
- costing and tech-pack generation;
- development calendars and role tasks;
- supplier library, quotations and allocation;
- samples;
- supplier orders and production status;
- quality inspections and defects;
- enterprise-system integration.

### 126.2 Centric-derived retained principles

Applied where they strengthen the same operating model:

- centralized versioned product data;
- supplier collaboration portal;
- item-level quotation comparison;
- split allocation across suppliers;
- specification and sourcing linkage;
- mobile capture/review for samples and quality;
- visual collaboration connected to controlled product data;
- supplier quality/compliance performance visibility.

### 126.3 JOOR-derived retained wholesale principles

Applied to Wholesale Commerce:

- controlled brand-retailer connection;
- digital showroom and linesheet;
- buyer-specific catalog and commercial visibility;
- order capture and order-management lifecycle;
- buyer/retailer workspace;
- reporting and account activity.

### 126.4 NuORDER-derived retained wholesale principles

Applied to Wholesale Commerce:

- account-specific products, prices and terms;
- catalog and virtual-showroom buying;
- collaborative assortments;
- doors and deliveries;
- visual assortment/board workflow;
- rollups and order intent;
- conversion from selection to controlled order;
- sales and buyer reporting.

### 126.5 Syntha unification rule

Benchmark capability is not copied as a disconnected feature. It must map to:

- Syntha canonical entity;
- owner domain;
- lifecycle;
- permission boundary;
- RU/EN representation;
- Russian/international operating requirement;
- upstream/downstream links;
- measurable E2E outcome.

---

## 127. Финальная карта сквозных результатов / Final End-to-End Outcome Map

| Result / Результат | Start | Finish | Required proof |
|---|---|---|---|
| Approved collection item | planning target | executable CollectionItem | baseline and route |
| Technically approved style | Style draft | immutable approved source set | BOM/measurements/sample/tech pack |
| Awarded supplier | RFQ | approved quotation/allocation | exact versions and decision |
| Controlled supplier commitment | award | confirmed supplier order | buyer/supplier agreed version |
| Material available at factory | requirement | accepted/reserved lot | ownership, receipt, testing, balance |
| Product accepted | supplier order | accepted quantity | inspection/release/receipt chain |
| Russian-ready product | product/specification | readiness snapshot | applicable rules, documents, label, marking state |
| Published commercial product | readiness snapshot | buyer-visible version | content, price, delivery, access |
| Agreed wholesale order | retailer selection | immutable agreed version | submission and accepted amendments |
| ERP-executed order | agreed order | external acknowledgement | mapping and external ID |
| Legally tracked shipment | fulfillment | delivery/UPD status | quantities, documents, marking reconciliation |
| Measured commercial result | connected data | analytics | source versions and coverage |

The platform is operationally complete when every result above can be reached through explicit, testable and recoverable transitions in both Russian and English user journeys.


---

## 128. Дельта-аудит авторизованного кабинета JOOR Retailer / Authenticated JOOR Retailer Cabinet Delta Audit

Дата наблюдения / Observation date: 17–18 августа 2026 года.  
Среда / Environment: авторизованный retailer-аккаунт на плане LITE; идентифицирующие данные, контакты, адреса, история сообщений и коммерческие значения аккаунта намеренно исключены из этой спецификации / authenticated retailer account on the LITE plan; identifying data, contacts, addresses, message history and account-specific commercial values are intentionally excluded from this specification.

### 128.1 Evidence boundary и правило недублирования

Этот раздел содержит только подтверждённые детали живого интерфейса JOOR, отсутствовавшие в предыдущих разделах документа. Общие сущности RetailerProfile, Connection, CommercialAccessGrant, Linesheet, RetailerAssortment и WholesaleOrder здесь не переопределяются.

This section records only live JOOR UI and behavior details that were not already present in the specification. It does not redefine the canonical Syntha entities documented earlier.

Evidence labels:

- **OBSERVED** — экран, поле, состояние или ограничение непосредственно показано в авторизованном интерфейсе;
- **INFERRED** — вывод следует из нескольких наблюдаемых экранов, но серверный контракт не проверялся;
- **NOT VALIDATED** — операция намеренно не завершалась из-за внешнего эффекта: подключение к бренду, создание заказа, сохранение профиля, установка интеграции, оплата или покупка подписки;
- после выбора Reset password первый клик немедленно вызвал browser alert без предварительного экрана подтверждения; точный backend-эффект не проверялся;
- никакие connection requests не принимались и не отклонялись, заказы не создавались, количества не вводились, настройки не сохранялись, интеграции не устанавливались и платежи не выполнялись.

### 128.2 Фактическая информационная архитектура / Observed Information Architecture

В живом retailer-интерфейсе одновременно существуют новая React-навигация и legacy-экраны.

| Область | Наблюдаемые экраны и функции |
|---|---|
| Home | connected brands, быстрый View Orders, Shop, Brands Interested in You, Connection Requests, New to JOOR, профиль как источник discovery-сигналов |
| Shop | Start an Order, Linesheets, Looks, Styleboards |
| Orders & Visual Assortment | Manage Orders, Visual Assortment |
| Explore Brands | current connections, brand outreach, inbound requests, outbound pending requests, Favorites, Find New Brands, Passport |
| Account menu | current account, primary-account state, other accounts, Account Settings, Integration Settings, Premium Features, Manage Profile, Data Activity Center, language, Help Center, Log Out |
| Messages | отдельный unread counter и inbox-подобный центр коммуникаций |

Наблюдаемые маршруты / observed routes:

- /ra/home — retailer home;
- /accounts/settings — user and retailer account settings;
- /ra/profile/{retailerId} — public retailer profile and edit mode;
- /ra/shopify/retailer-product-sync/config — Shopify integration settings;
- /ra/data-activity-center — background data jobs;
- /ra/subscriptions — premium feature entitlements;
- /matches/current — connected brands;
- /matches/requests — inbound brand connection requests;
- /matches/pending — pending outbound connection state;
- /ra/submissions — Brands Interested In You outreach;
- /ra/find_new_brands — discovery directory;
- /r/passport/favorites — saved brands;
- /r/passport — event and marketplace discovery;
- /collections/shop — legacy linesheet registry;
- /ra/products — modern catalog and quantity entry;
- /orders/cart — active order cart;
- /ra/showroom/collections — Looks;
- /ra/showroom/styleboards — Styleboards;
- /ra/visual-assortment — premium Visual Assortment gate.

**Syntha decision:** one canonical retailer navigation must expose the same objects through one design system. Legacy registry pages and modern catalog/order pages must not coexist as separate interaction dialects.

### 128.3 Пользовательские настройки / Personal User Settings

Account Settings separates personal settings from retailer-organization settings.

#### User profile

OBSERVED fields and controls:

- login email displayed separately from organization contact email;
- password reset action;
- full name;
- job title;
- phone;
- profile photo upload;
- opt-in checkbox to display the user on the company profile;
- company-profile deep link.

**Syntha requirement:** User, OrganizationMembership and public RetailerContactProjection remain separate. A user controls whether personal information is published; organization administrators cannot silently expose private user fields.

#### Interface and email languages

JOOR stores two independent language preferences:

- default interface language;
- email language.

Account Settings offered English, Spanish, French, German, Italian, Japanese, Simplified Chinese, Russian and Korean. The live page language switcher exposed English, Arabic, German, Spanish, French, Italian, Japanese, Brazilian Portuguese, Russian and Simplified Chinese.

**Observed inconsistency:** Korean appeared in settings but not in the live switcher; Arabic and Brazilian Portuguese appeared in the switcher but not in the settings form.

**Syntha requirement:** one governed LanguageCapability registry must drive interface availability, email templates, translation status and fallback behavior. A language must not be selectable for a channel that cannot render it.

#### Email preferences

Independent Yes/No preferences were observed for:

- forwarding JOOR inbox messages to email;
- connection-request emails;
- weekly updates from connections;
- industry updates and news;
- orders assigned to the user on the web;
- orders assigned to the user on the iPad.

**Syntha requirement:** notification preferences are channel- and event-specific, organization-policy-aware and auditable. Mandatory security or legal notifications cannot be disabled by ordinary marketing preferences.

#### Connection-request template

Observed controls:

- Use default connect request message checkbox;
- editable default message;
- Save Changes.

**Syntha requirement:** store a versioned user/organization message template with RU/EN variants. Applying the template to a request must create a snapshot; later edits must not rewrite already sent requests.

#### Date format

Observed values:

- mm/dd/yyyy;
- dd/mm/yyyy;
- yyyy/mm/dd.

**Syntha requirement:** date display is a user preference; persisted deadlines remain canonical timestamps or dates and never change semantics when the display format changes.

#### Landing page

Observed choices:

- Home;
- My Connections;
- Orders;
- Profile.

**Syntha requirement:** configurable landing destinations must pass capability checks. A user cannot land on a page that the current account context or plan does not permit.

#### Retail-price rounding

Observed values:

- none;
- nearest 1.00;
- nearest 5.00.

**Syntha requirement:** rounding is an explicit presentation/calculation policy, scoped by currency and price-list context. It cannot silently overwrite source retail price or wholesale price. Preview must show original, rounded and effective values.

#### Password reset safety

OBSERVED: the first Reset password click produced an immediate browser alert instead of an explanatory form or confirmation step.

**Syntha improvement:** password reset must use an explicit, rate-limited flow that states the destination channel, never reveals whether an unrelated account exists, records security audit evidence and requires confirmation before sending when the user is already authenticated.

### 128.4 Retailer account settings и публичный профиль / Retailer Account Settings and Public Profile

#### Retailer account information

Observed editable fields:

- profile name;
- organization primary contact email used for connection requests and messages;
- POS system;
- POS version;
- buyer name shown on purchase orders;
- connection permission: whether any brand or retailer may connect;
- privacy: Show in Search or Hide from Search.

**Syntha requirement:** separate discoverability, inbound-request policy and commercial access. Hiding a profile from search must not delete existing connections or grants. Changing the buyer name must create a new display/contact version and must not rewrite historical order snapshots.

#### Public retailer profile

Observed profile-edit dimensions:

- logo image;
- Tax ID verification with country and Tax ID;
- business description;
- website;
- Instagram, X and Facebook;
- store photos, with up to 30 files selected at once and a 10 MB per-image limit shown by JOOR;
- people section populated from user settings and per-user publication opt-in;
- primary location and additional locations;
- location name and type;
- year established;
- wholesale price minimum and maximum;
- country, address lines, city, territory, postal code and phone;
- category selection;
- brands carried;
- gender and age demographics;
- up to three style descriptors;
- up to three shopping-use cases;
- add another location;
- delete non-primary locations.

Observed retailer descriptors include Sophisticated, Edgy, Casual, Feminine, Downtown, Active, Classic, Vintage and Bohemian. Shopping-use cases include Professional Looks, Day to Night, Cocktail and Events, Casual Sportswear, Resort/Beach/Swimwear and Gifts.

The public view exposes verification state, people, primary location and expandable other locations. JOOR explicitly explains that profile quality affects whether brands show interest.

**Syntha requirements:**

- create a versioned RetailerPublicProfileProjection separate from private legal/account data;
- implement field-level publication state and completeness scoring;
- keep Tax ID evidence protected; expose only verification result and permitted country/legal-entity signals;
- validate images, file size, MIME type, moderation status and publication rights;
- model stores, warehouses, e-commerce destinations and billing addresses as typed locations rather than duplicating free-text blocks;
- use profile categories and price positioning as explainable discovery features, not as opaque permanent labels;
- preserve historical profile snapshots referenced by connection decisions.

### 128.5 Мультиаккаунтность / Multi-Account Context

JOOR supports one user associated with multiple retailer accounts.

OBSERVED behavior:

- current account card shows account identity, connected-brand summary and creation provenance/date;
- current account can be marked as the primary account;
- Other Accounts section can be expanded;
- accounts can be searched by connected brand;
- selecting another account changes the active retailer context;
- account cards may show the creating brand or account creation date;
- some account-brand relationships may be read-only or archived;
- Manage Account Visibility opens a separate visibility settings screen;
- checked accounts are hidden from discovery by new brands;
- unchecked accounts remain visible;
- JOOR warns that visibility changes may take up to 30 minutes;
- All Accounts control can apply visibility at scale.

**Syntha requirements:**

- every request resolves an explicit active OrganizationMembership and tenant context;
- UI must display the active account persistently;
- primary account is a user preference, not a permission grant;
- account switch invalidates tenant-scoped caches, drafts, search results and file handles;
- cross-account search can use safe metadata only and must never leak private orders, prices or contacts;
- visibility changes use a durable command, propagation status and completion timestamp;
- pending visibility propagation must be shown; Syntha must not claim immediate completion;
- archived/read-only relationships are explicit capabilities, not text decorations;
- switching context while an unsaved order/profile form exists requires a clear save/discard decision.

### 128.6 Discovery, outreach, favorites and connection direction

JOOR exposes several distinct relationship surfaces that must not be collapsed into one ambiguous Pending state.

#### Brands Interested In You

Observed:

- tabs New, Viewed and All;
- brands can send personalized visual outreach after discovering the retailer profile;
- outreach empty state links to Find New Brands.

**Syntha requirement:** model BrandOutreach separately from ConnectionRequest. Outreach can be viewed, archived or converted into a connection action without becoming commercial access by itself.

#### Inbound requests

/matches/requests shows:

- brand profile link;
- request date;
- message preview and full-message link;
- Connect;
- Not Now.

#### Outbound pending

/matches/pending represents a separate pending state initiated from the retailer side and exposes cancellation/removal.

#### Connected brands

/matches/current supports:

- search by brand name or ID;
- wholesale price range and category filters;
- connected status;
- brand profile;
- direct message;
- disconnect action.

#### Storefront access states

Three observable storefront states:

| State | Primary action | Access behavior |
|---|---|---|
| Connected | Shop | catalog and order workflow available |
| Inbound brand request | Accept | linesheets, orders and representative information remain hidden until retailer acceptance |
| Not connected | Connect | retailer requests to do business; linesheets, orders and representative information remain hidden until brand acceptance |

Unconnected storefronts may show teaser product names/images while stating that products are available only to selected retailers.

**Syntha requirements:**

- represent request direction explicitly: BRAND_TO_RETAILER and RETAILER_TO_BRAND;
- use separate statuses for outreach, inbound request, outbound request, connection and commercial access;
- Connect, Accept, Not Now, Withdraw and Disconnect require different permissions, reasons and events;
- connection alone does not expose catalog, price, representative or ordering data until CommercialAccessGrant is effective;
- each storefront must explain the current access state and next responsible party;
- all connection mutations require confirmation where destructive or externally visible.

#### Find New Brands

Observed directory functions:

- default sort by Newest Linesheets;
- brand-name search;
- wholesale price range with currency, minimum and maximum;
- JOORPay availability filter;
- category search and category checkboxes;
- prompt to configure retailer-profile categories for more personalized results;
- brand cards with image, name and categories;
- brand quick-view modal with Connect, Favorite, Message, View Full Profile, profile summary and additional images;
- Favorite is a separate non-connection action.

**Syntha requirements:**

- discovery ranking inputs must be explainable and must not override access/privacy rules;
- filters use normalized category, currency and price-range values;
- PaymentCapability is a filterable commercial capability, not a generic marketing badge;
- Favorite must be private to the authorized user/account unless explicitly shared;
- quick view and full profile resolve the same profile version.

#### Favorites

/r/passport/favorites displayed a Favorites title but, when empty, provided no useful empty-state explanation or discovery action.

**Syntha improvement:** show a clear empty state, why favorites matter, and a link back to discovery; distinguish personal favorites from shared buyer-team lists.

#### Passport

JOOR Passport acts as a discovery and event layer:

- featured events;
- curated marketplaces;
- retail-show browsing;
- retailer registration to attend;
- brand registration to exhibit;
- partner presentation.

**Syntha priority:** event marketplace registration is P2 unless it directly strengthens the canonical connection → catalog → order spine. It must not precede core wholesale execution.

### 128.7 Storefront, legacy linesheets and modern catalog

#### Storefront

Observed connected storefront content:

- logo;
- page title/navigation;
- Shop action;
- year established;
- categories;
- wholesale and retail price ranges;
- website and social links;
- brand description;
- editorial sections;
- product, linesheet and document blocks.

OBSERVED quality defect: some published storefronts exposed authoring placeholders such as Untitled Page, Overlay Text, Section Title, Linesheet Title, Document Title and Click to edit to the retailer.

**Syntha requirement:** storefront publication is fail-closed. Placeholder, editor-only or incomplete blocks cannot enter the buyer projection. Preview, validation and publication must use the same resolved component tree.

#### Legacy linesheet registry

Observed functions not previously recorded at UI level:

- brand selector;
- delivery-date filters: all available, immediates or date range;
- category filters;
- search and clear filters;
- linesheet switching within a brand;
- delivery window and cut-off;
- print;
- Start Excel Order;
- pagination and view-count controls;
- grouping by Linesheet, Fabrication, Category, Division, Silhouette or Linesheet Group;
- product cards with image count, style code/name, colors, wholesale and suggested retail price.

#### Modern catalog

The Shop action from a connected storefront opened a different modern catalog at /ra/products.

Observed order context:

- price type/currency;
- order warehouse;
- Styles Selected counter;
- Orders Created counter;
- View Order cart;
- group by None, Linesheet Group, Silhouette or Badge;
- sort by None, Price Low to High or Price High to Low;
- filters for badges, categories, division, fabrication, inventory availability, linesheet, linesheet delivery window, price types, season, silhouette, style tags and wholesale price;
- applied-filter count;
- text search.

Observed product-card data:

- linesheet/group name and number of styles;
- shipping delivery window, including Immediate;
- image;
- style name and code;
- color count and color names/codes;
- wholesale and suggested retail values;
- availability source by warehouse;
- Made to Order signal;
- fabrication;
- Preview;
- View and Quantify.

Preview opens an image drawer with style identity. View and Quantify opens a detailed quantity workspace with:

- delivery window;
- wholesale and suggested retail context;
- color swatches;
- custom size scale;
- warehouse context;
- Bulk and Sized modes;
- color selection checkboxes;
- size-by-color quantity inputs;
- per-color quantity and value;
- grand totals;
- Back to Catalog;
- Add to Order disabled until valid quantities exist.

The empty cart showed a warning that changes must be saved but did not provide a strong empty-state explanation.

**Syntha requirements and improvements:**

- consolidate legacy linesheet browsing and modern catalog quantity entry into one buyer journey;
- retain stable price-type, currency, warehouse and access context in the URL/session model;
- quantity matrix supports keyboard navigation, paste, validation and accessible labels;
- inventory source and Made to Order state remain distinct;
- Add to Order becomes enabled only after server-compatible quantity validation;
- cart drafts autosave durably or provide explicit dirty-state navigation protection;
- empty cart links to the exact catalog context that created it;
- product preview and quantify views resolve the same CommercialProductProjectionVersion.

### 128.8 Order registry, order creation and order truth view

#### Manage Orders registry

Observed UI states and filters:

- Draft;
- Notes;
- Pending;
- Approved;
- Shipped;
- Cancelled;
- quantities With or Without;
- free-text search;
- buyer filter;
- date filter;
- selection and bulk Actions;
- Start an Order;
- Import Orders;
- Download Order Confirmation;
- Export Data;
- pagination and page-size control.

Observed columns:

- Brand;
- PO number;
- Status;
- Units;
- Total;
- Linesheet;
- Complete Ship;
- Buyer;
- Modified.

The live account used a Note Order status in addition to conventional lifecycle states.

**Syntha requirement:** Note/Notes must be defined as a non-binding commercial state or migrated to a typed Draft/OrderIntent model. It must not remain an unexplained string beside legally meaningful order states.

#### Start an Order

Observed staged form:

1. search for a connected brand;
2. after brand selection, Start an Order and More options become enabled;
3. More options expose linesheet selection, price type/currency and door selection;
4. the user may return to fewer options;
5. order creation was not completed during this audit.

**Syntha requirement:** opening or searching the modal must not create a draft. The first durable draft mutation must be explicit, idempotent and return the pinned brand/access/price/door context.

#### Order truth view

Observed functions:

- Overview and Pay;
- last-updated timestamp;
- Share Order;
- Visual Assortment link;
- Comments;
- Download;
- order number, brand, linesheet, delivery window and price type;
- order status and Submit for Approval;
- shipping and billing blocks;
- restriction message when retailer cannot edit address data;
- Add Products and Edit;
- products summarized by image, style, color, size, quantity, wholesale and retail price;
- contacts with role, including buyer and sales representative;
- financial summary with retail value, subtotal wholesale, product discounts, order discount, fees and grand total;
- order details including created date, season, year and delivery window.

The Pay action exists in the order UI, while Find New Brands separately supports a JOORPay filter.

**Syntha requirement:** showing Pay requires active PaymentCapability, payable balance, supported currency/market and user authority. The button must never be a dead or marketing-only action.

#### Shipping and billing control

JOOR may prevent the retailer from editing address information and instruct the retailer to contact the brand.

**Syntha improvement:** show source ownership, reason, effective address version and a structured change-request workflow instead of a dead-end restriction message.

### 128.9 Looks, Styleboards, Visual Assortment and messages

#### Looks

Observed registry:

- filters by collection name, brand name, creator, created date and last modified;
- Current and Archived tabs/counters;
- brand-shared collection name, creator, brand, date shared, created date and modified date.

One Look detail remained in an indefinite loading state during the audit.

**Syntha requirement:** failed detail loading must expose a recoverable error, correlation ID and retry; registry access does not guarantee detail authorization and the error must distinguish authorization from transport failure.

#### Styleboards

Observed registry and creation:

- Current and Archived;
- filters by styleboard name, brand name, creator, created date and last modified;
- Create New;
- a new styleboard must first be associated with a brand;
- empty board shows product count;
- share;
- comments;
- Add to Order disabled until products exist;
- brand search and Assign;
- Cancel.

**Syntha requirements:**

- Styleboard is brand-scoped unless a separately authorized cross-brand assortment mode exists;
- brand assignment pins access and price context;
- comments and share visibility use explicit participants;
- archive is reversible and distinct from delete;
- conversion to order preserves source board/version and selected delivery context.

#### Visual Assortment entitlement

On LITE, Visual Assortment was a paywall page rather than an active workspace. The page states that products ordered outside JOOR can be included.

Observed time-sensitive plans:

| Plan | Monthly | Yearly | Included limits shown |
|---|---:|---:|---|
| Standard | $159 USD | $1,599 USD | 2 users, 1 door, 1,000 products, 2 years of storage |
| Premium | $299 USD | $3,199 USD | 5 users, 5 doors, 3,000 products, 3 years of storage |

These prices are benchmark evidence as of the observation date, not Syntha pricing requirements.

**Syntha requirement:** entitlements are server-authoritative by organization, plan and effective period. Locked pages explain value and limits but must not expose partially functional controls.

#### Messages

Observed inbox functions:

- Inbox;
- Invitation;
- Sent;
- Trash;
- search;
- Compose Mail;
- bulk Delete;
- Mark as Read;
- Mark as Unread;
- sortable From, Message and Date columns;
- pagination.

**Syntha improvement:** preserve a message center where required, but link communication to canonical business objects and required actions. High-volume broadcast messages must be separable from approvals, order changes and deadlines.

### 128.10 Shopify integration, Data Activity Center and background work

#### Shopify Retailer Product Sync

When not connected:

- Install on Shopify is the primary action;
- Automatic Sync is visible but disabled;
- field preferences are visible but disabled;
- Expand All is disabled;
- no sync has run.

Observed automation description: approved orders from connected accounts can sync automatically, with per-account customization after expansion.

Observed JOOR → Shopify field mapping:

| JOOR field | Shopify field |
|---|---|
| Style Name | Title |
| Brand Name + Style Name | Title |
| Description | Description |
| Photos | Media |
| Category | Category |
| Linesheet | Collections |
| Silhouette | Type |
| Brand Name | Vendor |
| Suggested Retail Price | Price |
| SKU Prices | Variant Price |
| SKU Code | Variant SKU |
| UPC Code | Variant Barcode |

**Syntha requirements:**

- integration installation, authorization and mapping activation are separate states;
- mapping conflicts such as two possible Title sources require an explicit precedence rule and preview;
- approved-order auto-sync is account-scoped and must preserve the exact order/product/price versions;
- per-account overrides are versioned;
- sync mutations are idempotent;
- every run records source version, destination ID, status, counts, errors and reconciliation result;
- disabling a field affects future runs only unless a controlled resync is requested;
- sensitive credentials never appear in job output.

#### Data Activity Center

Observed job registry columns:

- Job Ref #;
- Created By;
- Type;
- Status;
- Actions;
- Start Date;
- End Date;
- Additional Info;
- Refresh.

The audited account displayed no rows.

**Syntha requirements:**

- all asynchronous import, export, sync and bulk jobs use one JobRun contract;
- statuses include queued, running, succeeded, partially succeeded, failed and cancelled;
- Actions are capability-based: view details, download result/error file, retry safe failures or cancel eligible jobs;
- retry reuses the logical command/idempotency identity where required;
- Additional Info is structured, localized and safe for the current tenant;
- jobs expose progress and terminal timestamps;
- a no-rows state explains which operations create jobs.

### 128.11 Наблюдаемые UX и reliability gaps / Observed Gaps

The following JOOR behaviors are benchmark lessons, not features to copy:

1. modern and legacy design systems coexist across catalog, linesheets, connections, messages and orders;
2. storefront authoring placeholders can leak into the retailer-visible page;
3. inbound requests, outbound pending, outreach and home Connection Requests use overlapping or inconsistent labels;
4. language choices differ between account settings and the live switcher;
5. Favorites and empty cart have weak empty states;
6. a Look detail remained indefinitely in Loading state;
7. repeated Account Settings reloads produced a transient 500 Internal Server Error;
8. Reset password produced an immediate alert without a clear pre-action confirmation;
9. some restrictions tell the retailer to contact the brand without a structured change request;
10. the platform exposes many raw messages without separating broadcasts from required actions;
11. current screens may show editor-oriented text such as Click to edit to a buyer;
12. premium marketing is prominent inside a plan-gated workflow.

**Syntha improvement standard:**

- one design system and one object vocabulary;
- fail-closed publication;
- explicit directional states;
- resilient error states with retry and correlation;
- no destructive or externally visible action on a first ambiguous click;
- actionable empty states;
- object-linked collaboration and work queues;
- server-authoritative capability and entitlement checks.

### 128.12 Дополнительные приоритеты Syntha / Additional Syntha Priorities

#### P0 — required for the canonical wholesale spine

- user settings separated from retailer organization settings;
- active account/tenant context and safe account switching;
- public-profile projection with discoverability and inbound-request policies;
- directional connection requests and distinct outreach;
- commercial-access gating before prices, representatives, linesheets or orders;
- unified catalog/linesheet/quantity matrix;
- explicit price type, currency, warehouse and door context;
- durable order draft with idempotent creation;
- order registry, truth view, approval and export;
- background JobRun observability;
- safe password-reset and visibility-change flows;
- governed interface/email language capability.

#### P1 — commercial differentiation

- favorites and buyer-team saved lists;
- profile-driven explainable discovery;
- brand outreach New/Viewed/All;
- Looks and Styleboards;
- Shopify mapping with per-account overrides and reconciliation;
- structured address-change request;
- separated broadcast, task and approval inboxes;
- POS identity/version for integration planning.

#### P2 — scale or premium

- cross-brand Visual Assortment;
- external-order ingestion into assortment planning;
- event marketplaces and registration;
- advanced rollups across doors/accounts;
- payment-capability discovery where commercially justified.

### 128.13 Дополнительные UAT-сценарии / Additional Acceptance Scenarios

1. User selects Russian UI and English email language; both channels render correctly and use one governed language registry.
2. User changes date format; historical order deadlines remain semantically unchanged.
3. Retail rounding preview shows source and rounded values without modifying the canonical price.
4. User switches active retailer account; no draft, price, message, file or search result from the previous tenant remains accessible.
5. User hides one account from discovery; UI shows propagation pending and later completion without breaking existing connections.
6. User opts out of public people display; the public profile removes the contact while historical audit remains.
7. Brand sends outreach; retailer views it without creating a connection request.
8. Brand sends inbound request; retailer can Accept or Not Now, and access remains closed before acceptance and grant activation.
9. Retailer sends outbound request; the screen clearly identifies the retailer as initiator and allows withdrawal.
10. Unconnected storefront exposes permitted teaser content but no restricted prices, representatives, linesheets or order actions.
11. Storefront containing placeholder/editor blocks fails publication.
12. Buyer filters discovery by category, currency/price range and payment capability; results explain applied filters.
13. Buyer favorites a brand without sending a connection request.
14. Connected-brand Shop opens a catalog pinned to brand, price type/currency and warehouse.
15. Buyer enters color/size quantities; totals recalculate, invalid values block Add to Order and the valid selection creates one durable draft.
16. Opening Start an Order and searching for a brand creates no server-side draft until explicit confirmation.
17. Buyer associates a new Styleboard with a brand; board access and price context cannot drift silently.
18. Locked Visual Assortment route denies data operations server-side even if a client control is manipulated.
19. Approved order syncs to Shopify once; mapping version, destination identifiers and reconciliation evidence appear in Data Activity Center.
20. Failed background sync displays a localized error, downloadable evidence where permitted and a safe retry action.
21. Password reset requires an explicit, rate-limited confirmation and records a security audit event.
22. Look detail transport failure shows a recoverable error rather than an endless loading indicator.
23. Storefront, catalog preview and quantity workspace resolve the same commercial product version.
24. Read-only or archived account relationships block writes through both UI and API.
25. Connection, profile visibility and Shopify mutations preserve durable command IDs and transactional outbox events.

### 128.14 Source note / Примечание об источнике

This delta is grounded in direct observation of the authenticated JOOR retailer web application. It is a product benchmark, not evidence of JOOR internal APIs or implementation. Time-sensitive prices, limits and UI labels must be revalidated before commercial decisions. Syntha requirements above are product decisions derived from the observed behavior and the canonical rules in this document.
