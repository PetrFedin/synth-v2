# Платформа Syntha / Syntha Fashion Platform — Product & Supply + Wholesale Commerce

Статус / Status: единственная актуальная двуязычная продуктовая спецификация / the only current bilingual product source of truth for Syntha.  
Версия / Version: 4.2, 6 августа 2026 года.  
Основной рынок: российские fashion-бренды, работающие с российскими и зарубежными фабриками, поставщиками материалов и поставщиками готовых изделий.  
Назначение: разделить управление разработкой, закупками и производством от B2B-коммерции бренда с магазинами, сохранив единое ядро товарных данных.

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

Omnidata и Centric подтверждают необходимость единого продуктового контура, версионных карточек, BOM/BOL, measurement charts, tech packs, materials, sourcing, quotations, supplier collaboration, samples, orders, quality и интеграций. fileciteturn143file0

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

BOL does not become MES machine scheduling; it remains a product/production specification.

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
- quality inspections and defects. fileciteturn143file0

Centric materials are used only as a benchmark for retained Product & Supply principles such as centralized product data, supplier quotation comparison, supplier portal collaboration, product specifications, mobile capture/review and visual collaboration. Commercial offer prices and confidential project terms are not part of this specification. fileciteturn148file0

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

Only retained capabilities belonging to this operating model are developed in this document.
