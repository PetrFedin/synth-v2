// Build the demonstration environment.
//
// A demonstration is a claim about the product, so it is built the way a customer builds: through the
// same services, under the same invariants, with the same separations of duty. Nothing here writes a
// row the application could not have written itself. If a step in this script breaks, it breaks for a
// customer too, which is the point of seeding this way rather than with INSERT statements.
//
// Three properties it holds to:
//
//   * idempotent. Every step looks for its own fixture before creating it, so running the script
//     twice changes nothing. Repeated acceptance runs are what left the database with seven
//     near-identical campaigns named R1 to R5; a demonstration cannot accumulate like that.
//   * every role is a real account. The platform enforces that an inspector cannot approve their own
//     disposition, that a supplier is not the brand, and that a buyer is not the seller — and none of
//     that can be shown from a single login. Four people sign in here because four people have to.
//   * one coherent season, end to end. A screen with nothing in it demonstrates nothing, so the
//     script carries one collection from a planned slot through to a released shipment and a
//     confirmed wholesale order.
//
//   SYNTHA_V2_DATABASE_URL=postgresql://... node scripts/seed-demo.mjs
//
// Passwords come from the environment, with local defaults, because a demonstration environment is
// still an environment somebody can reach.
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

// В базе лежало 102 определения атрибутов и **одна** строка значений, причём готовность продукта
// по измерению «атрибуты» приходила подтверждением из тела запроса и поэтому проходила при нулях.
// Подтверждение больше не обгоняет реестр, а значит демо обязано нести настоящие значения —
// иначе экран честно показывал бы заблокированное измерение там, где показывать нечего.
//
// Атрибуты берутся из управляемого набора семейства «одежда» (`product.apparel.core`) и пишутся
// через службу, то есть проходят те же правила базы, что и любая живая запись: атрибут обязан
// быть в каталоге и применяться к семейству товара (миграция 082).
const DEMO_STYLE_ATTRIBUTES = Object.freeze({
  'SYN.JKT': Object.freeze([
    ['common.marketing_name', 'Aurora Quilted Jacket'],
    ['common.capsule', 'SS27 Outerwear'],
    ['apparel.fabric_segment', 'Техничный верх'],
    ['apparel.fabric_type', 'Стёганый нейлон 40D'],
    ['apparel.insulation', { present: true, type: 'synthetic', grams_per_square_metre: 120 }],
    ['apparel.lining', { present: true, material: 'taffeta', full: true }],
    ['apparel.pocket', { count: 3, kinds: ['welt', 'welt', 'inner'] }],
  ]),
  'SYN.TEE': Object.freeze([
    ['common.marketing_name', 'Meridian Heavy Cotton Tee'],
    ['common.capsule', 'SS27 Essentials'],
    ['apparel.fabric_segment', 'Джерси'],
    ['apparel.fabric_type', 'Кулирка 240 г/м²'],
    ['apparel.pocket', { count: 0, kinds: [] }],
    ['common.set_member', false],
  ]),
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');

const PEOPLE = Object.freeze({
  owner: { email: 'owner@syntha.local', password: process.env.SYNTHA_DEMO_OWNER_PASSWORD ?? 'local-owner-password-2026', name: 'Syntha Owner' },
  quality: { email: 'quality@syntha.local', password: process.env.SYNTHA_DEMO_QUALITY_PASSWORD ?? 'local-quality-password-2026', name: 'Ирина Соколова' },
  // Приёмку подписывает третий человек — и это не избыточность.
  //
  // A run may not be approved by the person who started it, nor by the person who completed it. With
  // only two people in the brand, one starting a run and the other completing it leaves an
  // inspection that nobody in the brand can decide — a dead end reachable from ordinary use, not
  // from misuse. A third member is what makes the rule satisfiable in every division of the work.
  inspector: { email: 'inspector@syntha.local', password: process.env.SYNTHA_DEMO_INSPECTOR_PASSWORD ?? 'local-inspector-password-2026', name: 'Павел Дорохов' },
  // Деньги ведёт отдельный человек. Себестоимость записывает не тот, кто обязался поставить: право
  // `cost.manage` есть у финансов и у владельца, право `supply.manage` — у владельца и у продаж, и
  // демонстрация должна показывать это разделение, а не обходить его одним аккаунтом на всё.
  finance: { email: 'finance@syntha.local', password: process.env.SYNTHA_DEMO_FINANCE_PASSWORD ?? 'local-finance-password-2026', name: 'Анна Ковалевская' },
  buyer: { email: 'buyer@nordhaus.example', password: process.env.SYNTHA_DEMO_BUYER_PASSWORD ?? 'local-buyer-password-2026', name: 'Jonas Herrmann' },
  supplier: { email: 'rep@atmosphere.example', password: process.env.SYNTHA_DEMO_SUPPLIER_PASSWORD ?? 'local-supplier-password-2026', name: 'Mei Lin' },
});

const SHOP_ID = 'demo-shop-nordhaus';
const SHOP_NAME = 'Nordhaus Retail';

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const log = [];
const DEMO_DEFECT_TYPES = [
  { code: 'SEAM-OPEN', severity: 'major', originStage: 'assembly-complete', nameRu: 'Разошёлся шов', nameEn: 'Open seam' },
  { code: 'PRINT-OFF', severity: 'major', originStage: 'finishing-complete', nameRu: 'Смещение принта', nameEn: 'Print misaligned' },
  { code: 'STITCH-LOOSE', severity: 'minor', originStage: 'assembly-complete', nameRu: 'Слабая строчка', nameEn: 'Loose stitching' },
  { code: 'FABRIC-HOLE', severity: 'critical', originStage: 'materials-ready', nameRu: 'Дыра в полотне', nameEn: 'Hole in fabric' },
  { code: 'CUT-OFF-GRAIN', severity: 'major', originStage: 'cutting-complete', nameRu: 'Раскрой не по долевой', nameEn: 'Cut off grain' },
  { code: 'SHADE-MISMATCH', severity: 'major', originStage: 'materials-ready', nameRu: 'Разнооттеночность', nameEn: 'Shade mismatch' },
  { code: 'LABEL-MISSING', severity: 'minor', originStage: 'packing-complete', nameRu: 'Нет ярлыка', nameEn: 'Label missing' },
  { code: 'BUTTON-LOOSE', severity: 'minor', originStage: 'finishing-complete', nameRu: 'Слабо пришита пуговица', nameEn: 'Loose button' },
];

// Аванс и остаток — обычное для этой торговли деление, и оно здесь данные, а не соглашение,
// зашитое в код: бывает и сто процентов по выпуску, и платёж третями. Сумма долей обязана быть
// целым, и это правило стоит и в домене, и в базе.
// Рулоны для партии, которая сейчас в производстве.
//
// Two rolls of the same cloth from two dye batches, and a third still in quarantine. That is not a
// contrived example: fabric is dyed in batches, a lot of garments regularly needs more than one, and
// the platform is supposed to notice — each roll passed its own incoming inspection, so the fault is
// in the pairing and nothing but a record of what went where can see a pairing.
// Технологическая последовательность верхней одежды.
//
// Операции расписаны по тем же вехам, что и производство, а узлы взяты из справочника — иначе по ним
// нечего было бы складывать. Нормы времени условны, но правдоподобны: важна не точность цифры, а то,
// что трудоёмкость изделия складывается из операций, а не набирается отдельным числом.
const DEMO_OPERATIONS = [
  { operationCode: 'CUT-PARTS', nameRu: 'Раскрой деталей верха', nameEn: 'Cut shell parts', stage: 'cutting-complete', standardMinutes: 6.5, equipment: 'Раскройный нож' },
  { operationCode: 'CUT-LINING', nameRu: 'Раскрой подкладки', nameEn: 'Cut lining', stage: 'cutting-complete', standardMinutes: 4, equipment: 'Раскройный нож' },
  { operationCode: 'JOIN-SHOULDER', nameRu: 'Стачать плечевые швы', nameEn: 'Join shoulder seams', stage: 'assembly-complete', standardMinutes: 3.2, equipment: 'Оверлок' },
  { operationCode: 'SET-SLEEVE', nameRu: 'Втачать рукава', nameEn: 'Set sleeves', stage: 'assembly-complete', standardMinutes: 8.4, equipment: 'Универсальная' },
  { operationCode: 'SET-COLLAR', nameRu: 'Втачать воротник', nameEn: 'Set collar', stage: 'assembly-complete', standardMinutes: 7.1, constructionNode: 'COLLAR_SET_IN', equipment: 'Универсальная' },
  { operationCode: 'BAG-LINING', nameRu: 'Собрать подкладку мешком', nameEn: 'Bag the lining', stage: 'assembly-complete', standardMinutes: 5.6, constructionNode: 'LINING_BAGGED' },
  { operationCode: 'HEM-BOTTOM', nameRu: 'Подшить низ потайным швом', nameEn: 'Blind-hem the bottom', stage: 'finishing-complete', standardMinutes: 4.8, constructionNode: 'HEM_BLIND' },
  { operationCode: 'PRESS-FINAL', nameRu: 'Окончательная влажно-тепловая обработка', nameEn: 'Final pressing', stage: 'finishing-complete', standardMinutes: 5.5, equipment: 'Пресс' },
  { operationCode: 'ATTACH-LABELS', nameRu: 'Пришить ярлыки', nameEn: 'Attach labels', stage: 'finishing-complete', standardMinutes: 2.3 },
  { operationCode: 'PACK-UNIT', nameRu: 'Упаковать изделие', nameEn: 'Pack the garment', stage: 'packing-complete', standardMinutes: 1.9 },
];
// Физические свойства полотна и состав строками. Ключ — фрагмент кода материала: демонстрация
// обогащает те материалы, которые в базе уже есть, кто бы их ни завёл.
const DEMO_MATERIAL_SPECS = [
  {
    match: 'SHELL',
    specification: {
      weightGsm: 60, cuttableWidth: 148, cuttableWidthUnit: 'cm', countryOfOrigin: 'TR',
      // Рипстоп покупают в килограммах, а расходуют в метрах: из килограмма выходит 6,4 метра.
      purchaseUnit: 'kg', conversionFactor: 6.4, materialSubtype: 'Рипстоп',
    },
    composition: [{ fibreCode: 'POLYESTER', percentage: 100 }],
  },
  {
    match: 'JERSEY',
    specification: {
      weightGsm: 220, cuttableWidth: 180, cuttableWidthUnit: 'cm', countryOfOrigin: 'TR',
      purchaseUnit: 'kg', conversionFactor: 3.2, materialSubtype: 'Кулирная гладь',
    },
    // Состав, который сходится ровно в сто: на этикетке он будет напечатан именно так.
    composition: [{ fibreCode: 'COTTON', percentage: 95 }, { fibreCode: 'ELASTANE', percentage: 5 }],
  },
];
// Палитра полотна и судьба каждого лабораторного образца. Демонстрация показывает три разных
// состояния, потому что в сезоне они и встречаются все три одновременно.
const DEMO_MATERIAL_COLOURS = [
  {
    match: 'SHELL',
    colours: [
      // Цвет тиража: принят с первого раза — по нему партия и выпускается из карантина.
      { colourCode: 'MIDNIGHT_NAVY', supplierReference: 'ATM-NAVY-19-4025', dip: 'approve-first' },
      // Фабрика дважды не попала в оттенок. Раунды записаны — это тот же факт о поставщике, что и
      // срыв срока.
      { colourCode: 'CHARCOAL', supplierReference: 'ATM-CHAR-18-0201', dip: 'approve-second' },
    ],
  },
  {
    match: 'JERSEY',
    colours: [
      { colourCode: 'OFF_WHITE', supplierReference: 'ATM-OFFW-11-0601', dip: 'approve-first' },
      // Прислан и ждёт решения: так выглядит сезон в середине работы.
      { colourCode: 'BURGUNDY', supplierReference: 'ATM-BURG-19-1526', dip: 'submitted' },
    ],
  },
];
const DEMO_MATERIAL_LOTS = [
  { lotReference: 'ROLL-R3-A-001', dyeLot: 'DYE-2609-A', colourCode: 'MIDNIGHT_NAVY', receivedQuantity: 600, certificateReference: 'CERT-ATM-2609-A', release: true, issue: 600, notes: 'Первый рулон поставки' },
  { lotReference: 'ROLL-R3-B-002', dyeLot: 'DYE-2609-B', colourCode: 'MIDNIGHT_NAVY', receivedQuantity: 500, certificateReference: 'CERT-ATM-2609-B', release: true, issue: 300, notes: 'Догруз другой крашеной партии' },
  { lotReference: 'ROLL-R3-C-003', dyeLot: 'DYE-2610-A', colourCode: 'MIDNIGHT_NAVY', receivedQuantity: 450, release: false, issue: 0, notes: 'Приехал, входной контроль не пройден' },
];
const DEMO_PAYMENT_SPLIT = [
  { triggerEvent: 'order-confirmed', shareBasisPoints: 3000, labelRu: 'Аванс при подтверждении заказа', labelEn: 'Deposit on order confirmation' },
  { triggerEvent: 'shipment-released', shareBasisPoints: 7000, labelRu: 'Остаток после допуска к отгрузке', labelEn: 'Balance after shipment release' },
];
// Настоящий график пошива — четыре вехи на четырёх разных событиях, а не две на двух. Пока
// платформа знала только подтверждение и выпуск отгрузки, «до двенадцати вех» оставалось словами:
// все девять демонстрационных графиков вышли одинаковыми 30/70, потому что третью веху было не на
// что повесить. Этот график ставится на заказ, выросший из потребности, и не переписывает прежние:
// договорённость, по которой уже платили, задним числом не меняют.
const DEMO_STAGED_PAYMENT_SPLIT = [
  { triggerEvent: 'order-confirmed', shareBasisPoints: 2000, labelRu: 'Задаток при подтверждении заказа', labelEn: 'Deposit on order confirmation' },
  { triggerEvent: 'production-started', shareBasisPoints: 3000, labelRu: 'Платёж при запуске в работу', labelEn: 'Payment on production start' },
  { triggerEvent: 'ready-for-quality-control', shareBasisPoints: 3000, labelRu: 'Платёж по готовности к контролю', labelEn: 'Payment on readiness for inspection' },
  { triggerEvent: 'shipment-released', shareBasisPoints: 2000, labelRu: 'Остаток после допуска к отгрузке', labelEn: 'Balance after shipment release' },
];
const DEMO_STAGED_PAYMENT_PO = 'PO-DEMAND-001';
const DEMO_LOT_RFQ = 'RFQ-SYN_JKT_R3_MID_M';
const DEMO_LOT_PO = 'PO-SYN_JKT_R3_MID_M';
// Линейный план сезона. Цены — в рублях, той же валюте, в которой назначена целевая цена: план и
// цель, назначенные в разных валютах, планировали бы разный бизнес.
//
// Плановая себестоимость намеренно не равна целевой: планировщик считает от наценки, которую
// заложил в линейный план ещё до того, как известны страна пошива и логистика, а целевая цена
// добавляет коэффициенты поверх. Небольшое расхождение между ними — обычное состояние сезона, и
// демонстрация показывает его, а не подогнанное совпадение.
const DEMO_PLACEHOLDERS = [
  {
    code: 'SS27-OUT-001', nameRu: 'Куртка-ветровка', nameEn: 'Windbreaker jacket',
    // 24 900 ₽ при плановой наценке 2,7 — 9 222,22 ₽ себестоимости.
    retailMinor: 2_490_000, costMinor: 922_222, quantity: 1200, colourways: 3,
    drop: 'Drop 1', capsule: 'Городская верхняя одежда', sku: 'SYN_JKT_R3_MID_M',
  },
  {
    code: 'SS27-TOP-002', nameRu: 'Футболка базовая', nameEn: 'Basic tee',
    // 3 900 ₽ при плановой наценке 2,9 — 1 344,83 ₽ себестоимости.
    retailMinor: 390_000, costMinor: 134_483, quantity: 5000, colourways: 4,
    drop: 'Drop 1', capsule: 'База', sku: 'SYN_TEE_R3_OFW_M',
  },
  {
    // Слот, под который ещё ничего не разработано: так выглядит сезон в работе, и свод честно
    // показывает, какую долю выручки он пока не покрывает.
    code: 'SS27-DRS-003', nameRu: 'Платье миди', nameEn: 'Midi dress',
    retailMinor: 1_290_000, costMinor: 478_000, quantity: 800, colourways: 2,
    drop: 'Drop 2', capsule: 'Городская верхняя одежда', sku: null,
  },
];

// Денежный контур заказа: чем обязались поставить, во что это обошлось и что осталось.
//
// До этого одиннадцать таблиц фактических денег стояли пустыми — при трёх десятках файлов тестов.
// Код был написан и ни разу не прошёл по живому заказу, то есть никто не видел ни одной цифры,
// ради которых половина платформы и существует, а показать их инвестору было нечем.
//
// Цепочка идёт **через те же службы, что и прод**, а не вставками в таблицы: обязательство поставки,
// курс, строки затрат, свод landed cost, актуализация маржи. Каждый шаг проверяется теми же
// правилами и теми же триггерами целостности.
//
// **Два заказа намеренно кончаются по-разному.** Большой выходит в прибыль, малый — в убыток:
// партия в 60 штук несёт ту же оснастку и ту же перевозку, что и партия в 180, и на малой они
// съедают маржу. Система, которая умеет показывать только прибыль, — это брошюра; экран маржи
// затем и нужен, чтобы убыток было видно. Заодно это единственный способ увидеть на живых данных
// отрицательную маржу, на которой округление JS и PostgreSQL расходилось.
const DEMO_MONEY_CHAIN = Object.freeze([
  {
    // 180 штук по 24 € — 4320 €. Фабрика выставляет в долларах, поэтому нужен курс.
    quantity: 180,
    source: { sourceType: 'production', sourceRef: 'PO-SYN_TEE_DEMO_OFW_M' },
    fx: { sourceCurrency: 'USD', rate: 0.92, rateType: 'invoice', sourceRef: 'INV-ATM-2026-114' },
    costs: [
      { costType: 'factory', amount: 1950, currency: 'USD', sourceRef: 'INV-ATM-2026-114', crossCurrency: true },
      { costType: 'freight', amount: 210, currency: 'EUR', sourceRef: 'FRT-DHL-884213' },
      { costType: 'duty', amount: 160, currency: 'EUR', sourceRef: 'CUS-DE-2026-5510' },
    ],
  },
  {
    // 60 штук по 24 € — 1440 €. Та же оснастка и та же перевозка на втрое меньшей партии.
    quantity: 60,
    source: { sourceType: 'production', sourceRef: 'PO-SYN_TEE_DEMO_OFW_M-R2' },
    fx: { sourceCurrency: 'USD', rate: 0.92, rateType: 'invoice', sourceRef: 'INV-ATM-2026-118' },
    costs: [
      { costType: 'factory', amount: 1500, currency: 'USD', sourceRef: 'INV-ATM-2026-118', crossCurrency: true },
      { costType: 'freight', amount: 190, currency: 'EUR', sourceRef: 'FRT-DHL-884219' },
      { costType: 'duty', amount: 140, currency: 'EUR', sourceRef: 'CUS-DE-2026-5514' },
    ],
  },
]);

// Отгрузочный хвост: план отгрузки → уведомление → приёмка → расхождение.
//
// Семь таблиц за обязательством поставки стояли пустыми, и на вопрос «а где товар сейчас» —
// первый, который задают сразу после маржи, — показать было нечего.
//
// Разделение сторон настоящее: план и уведомление заводит бренд (`fulfillment.manage`), приёмку
// записывает магазин (`receipt.manage`), и служба прямо отказывает любому, кто не состоит в
// принимающей организации. Один аккаунт на обе стороны прошёл бы, но показывал бы не ту систему.
//
// **Одна поставка приходит целой, вторая — с недостачей.** Приёмка «всё сошлось» доказывает только
// счастливый путь; расхождение — то, ради чего приёмку и ведут. Три повреждённые штуки из
// шестидесяти дают снимок расхождения, с которого начинается претензия.
const DEMO_SHIPMENTS = Object.freeze([
  {
    quantity: 180,
    shipment: { shipmentNumber: 'SHP-2026-0114', carrier: 'DHL Global Forwarding', serviceLevel: 'air-economy', trackingNumber: 'DHL884213' },
    receipt: { receiptReference: 'GRN-NORD-2026-311', receivedBy: 'Jonas Herrmann', received: 180, damaged: 0, rejected: 0 },
  },
  {
    quantity: 60,
    shipment: { shipmentNumber: 'SHP-2026-0118', carrier: 'DHL Global Forwarding', serviceLevel: 'air-economy', trackingNumber: 'DHL884219' },
    receipt: { receiptReference: 'GRN-NORD-2026-317', receivedBy: 'Jonas Herrmann', received: 57, damaged: 3, rejected: 0 },
  },
]);

const DEMO_SAMPLING_STANDARD = 'DEMO-AQL-2026';
const DEMO_SAMPLING_ROWS = [
  // lotFrom, lotTo, sampleSize, acceptAt at AQL 2.5, acceptAt at AQL 4.0
  [91, 150, 20, 1, 2],
  [151, 280, 32, 2, 3],
  [281, 500, 50, 3, 5],
  [501, 1200, 80, 5, 7],
  [1201, 3200, 125, 7, 10],
];

const note = (step, detail) => { log.push({ step, detail }); process.stdout.write(`  ${step}: ${detail}\n`); };

let sequence = 0;
const command = (label) => `demo-${label}-${Date.now().toString(36)}-${++sequence}`;

try {
  await waitForPostgres(/** @type {any} */ ({ pool, attempts: 30, delayMs: 1_000 }));
  await migratePostgres(/** @type {any} */ ({ pool, migrationsDir }));
  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });

  process.stdout.write('Syntha demonstration environment\n');

  // --- People -------------------------------------------------------------------------------
  const accounts = {};
  for (const [key, person] of Object.entries(PEOPLE)) {
    const existing = await pool.query('SELECT id FROM auth_users WHERE email_normalized = lower($1)', [person.email]);
    if (existing.rowCount) { accounts[key] = existing.rows[0].id; note('account', `${person.email} already exists`); continue; }
    const created = await runtime.auth.bootstrapUser({ id: `demo-user-${key}`, email: person.email, password: person.password, displayName: person.name });
    accounts[key] = created.id;
    note('account', `${person.email} created`);
  }

  const brandRow = await pool.query("SELECT id FROM organisations WHERE type = 'brand' AND id IN (SELECT organisation_id FROM memberships WHERE user_id = $1 AND status = 'active') LIMIT 1", [accounts.owner]);
  if (!brandRow.rowCount) throw new Error('The demonstration brand does not exist; run bootstrap-owner first');
  const brandId = brandRow.rows[0].id;
  note('brand', brandId);

  // The quality approver. A run's inspector may not sign off their own disposition, so a second
  // person in the brand is not a nicety here — without one the quality chain cannot be finished.
  // Качество сидит на роли качества, а не на администраторе. Пока роли не существовало, обе
  // персоны получали все 53 способности, и инспектор по качеству мог завести каталожный SKU,
  // кампанию и коллекцию — то есть демонстрация показывала разделение обязанностей, которого в
  // системе не было.
  await ensureMembership(runtime, brandId, accounts.quality, 'quality', accounts.owner, 'brand');
  await ensureMembership(runtime, brandId, accounts.inspector, 'quality', accounts.owner, 'brand');
  await ensureMembership(runtime, brandId, accounts.finance, 'finance', accounts.owner, 'brand');

  // --- The retailer -------------------------------------------------------------------------
  const shopExists = await pool.query('SELECT id FROM organisations WHERE id = $1', [SHOP_ID]);
  if (!shopExists.rowCount) {
    await runtime.platform.registerOrganisation(command('shop'), 'system', { id: SHOP_ID, type: 'shop', name: SHOP_NAME });
    note('retailer', `${SHOP_NAME} registered`);
  } else note('retailer', `${SHOP_NAME} already exists`);
  await ensureMembership(runtime, SHOP_ID, accounts.buyer, 'owner', accounts.buyer, 'shop');

  // --- The commercial season ----------------------------------------------------------------
  // The wholesale half of the product was the half an investor could not see: no relationship, no
  // invitation, no selection, no order, so five sections rendered their empty state. This carries one
  // published collection all the way to a confirmed order with a deal space open on it.
  const collection = await pickDemoCollection(pool, brandId);
  note('collection', `${collection.id} (${collection.campaignName})`);

  const relationshipId = await ensureRelationship(runtime, pool, brandId, accounts.owner, accounts.buyer);
  const showroom = await ensureShowroom(runtime, pool, collection, brandId, accounts.owner);
  await ensureInvitation(runtime, pool, showroom.id, accounts.owner, accounts.buyer);
  // A buyer does not browse the brand's own catalogue: they browse the catalogue the brand published
  // for them, at the prices published for them, shipping to one of their own doors. All three are
  // real objects here, because that is the difference between a demonstration and a mock-up.
  const door = await ensureRetailDoor(runtime, pool, accounts.buyer);
  await ensureBuyerCatalog(runtime, pool, collection.id, showroom.id, accounts.owner);

  const cycle = await ensureCycle(runtime, pool, { brandId, shopId: SHOP_ID, campaignId: collection.campaignId, collectionId: collection.id }, accounts.buyer);
  const selection = await ensureSelection(runtime, pool, cycle, showroom.id, collection.id, accounts.buyer, door.id);
  await ensureOrder(runtime, pool, cycle, selection, accounts.buyer, accounts.owner);

  // --- A season still being written -----------------------------------------------------------
  // One finished order is a story with an ending, and an investor asks what the buyer actually
  // does. The order grid — paste from a spreadsheet, totals, minimum-order feedback, undo — only
  // exists on a selection that is still a draft, and the demonstration had none: every selection
  // was submitted, so every grid was read-only and none of that could be touched. This carries a
  // second published collection to an open showroom with a draft selection waiting on it.
  const second = await pickDraftCollection(pool, brandId, collection.id);
  if (second) {
    note('second season', `${second.id} (${second.campaignName})`);
    const draftShowroom = await ensureShowroom(runtime, pool, second, brandId, accounts.owner);
    await ensureInvitation(runtime, pool, draftShowroom.id, accounts.owner, accounts.buyer);
    await ensureBuyerCatalog(runtime, pool, second.id, draftShowroom.id, accounts.owner);
    const draftCycle = await ensureCycle(runtime, pool, { brandId, shopId: SHOP_ID, campaignId: second.campaignId, collectionId: second.id }, accounts.buyer);
    await ensureDraftSelection(runtime, pool, draftCycle, draftShowroom.id, accounts.buyer, door.id);
  } else note('second season', 'no second published collection to open');

  // --- Quality ------------------------------------------------------------------------------
  // The criterion before the inspection. Without a plan set loaded, the only way to start a run is
  // to type the sample size and the two limits by hand, which is the thing the AQL work replaced.
  await ensureSamplingPlans(pool, brandId, accounts.owner);
  await ensureDefectCatalogue(runtime, pool, brandId, accounts.owner);
  await ensureLotInProduction(runtime, pool, brandId, accounts.owner);
  // Свойства полотна и утверждение цвета идут раньше приёмки: партию в неутверждённом цвете
  // выпустить нельзя, и порядок здесь — не косметика, а та же цепочка.
  await ensureMaterialSpecifications(runtime, pool, brandId, accounts.owner);
  await ensureMaterialColours(runtime, pool, brandId, accounts.owner, accounts.quality);
  await ensureMaterialLots(runtime, pool, brandId, accounts.owner, accounts.quality);
  await ensureOperationSequence(runtime, pool, brandId, accounts.owner);
  await ensureCuttingSpread(runtime, pool, brandId, accounts.owner);
  await ensureTargetPricing(runtime, pool, brandId, accounts.owner);
  await ensureAssortmentPlan(runtime, pool, brandId, accounts.owner);
  await ensureStagedPaymentSchedule(runtime, pool, brandId, accounts.owner);
  await ensurePaymentSchedules(runtime, pool, brandId, accounts.owner);

  // Inspections sat at review-pending because the only account in the brand was the one that ran
  // them, and a run's inspector may not sign off its own disposition. That rule is a feature, and a
  // demonstration should show it being satisfied rather than tripped over.
  await releaseQuality(runtime, pool, brandId, [accounts.quality, accounts.inspector, accounts.owner]);

  // --- What the season actually cost and actually earned ---------------------------------------
  await ensureMoneyChain(runtime, pool, accounts);

  // --- Чем сезону разрешено рисовать ------------------------------------------------------------
  await ensureSeasonPalette(runtime, pool, accounts);
  await ensureProductAttributes(runtime, pool, accounts);

  // --- Потребность, из которой вырос производственный заказ --------------------------------------
  await ensureApprovedDemandChain(runtime, pool, accounts);

  // --- Где товар сейчас -------------------------------------------------------------------------
  await ensureShipmentChain(runtime, pool, accounts);

  // --- The supplier's side of the table -------------------------------------------------------
  await ensurePortalAccess(runtime, pool, brandId, accounts.owner);

  process.stdout.write('\nSigning in as:\n');
  for (const [key, person] of Object.entries(PEOPLE)) {
    process.stdout.write(`  ${person.email.padEnd(26)} ${person.password.padEnd(32)} ${describeRole(key)}\n`);
  }
  process.stdout.write('\n');
  process.stdout.write(`${log.length} step(s) recorded.\n`);
} finally {
  await pool.end();
}

function describeRole(key) {
  return {
    owner: 'бренд — владелец',
    quality: 'бренд — приёмка качества',
    inspector: 'бренд — инспектор партий',
    finance: 'бренд — финансы',
    buyer: `${SHOP_NAME} — байер`,
    supplier: 'портал поставщика',
  }[key] ?? key;
}

async function ensureMembership(runtime, organisationId, userId, role, actorId, organisationType) {
  const existing = await runtime.store.transaction(async (tx) => tx.getMembership(organisationId, userId));
  if (existing) {
    // Расхождение называется вслух. Раньше сид отвечал «уже admin» одинаково и когда роль верна, и
    // когда она разошлась с объявленной, — а именно на этой тишине демонстрация полгода показывала
    // инспектора по качеству с правами администратора. Операции смены роли в системе пока нет,
    // поэтому исправить это сид не может; сказать — обязан.
    if (existing.role !== role) {
      note('membership', `РАСХОЖДЕНИЕ: ${userId} имеет роль ${existing.role}, а объявлена ${role}. Смена роли через API не реализована — требуется вмешательство.`);
    } else {
      note('membership', `${userId} already ${existing.role} of ${organisationId}`);
    }
    return;
  }
  const membership = createMembership({
    id: `demo-membership-${organisationId}-${userId}`.replace(/[^\w-]/g, '-'),
    organisationId, organisationType, userId, role, createdAt: new Date().toISOString(),
  });
  // The very first membership of an organisation can only be granted by the system actor: nobody is
  // inside it yet to do the granting. Every later one is granted by a member who may.
  const members = await runtime.store.transaction(async (tx) => tx.listMembershipsByOrganisation(organisationId));
  const granter = members.length === 0 ? 'system' : actorId;
  await runtime.platform.grantMembership(command('membership'), granter, membership);
  note('membership', `${userId} granted ${role} of ${organisationId}`);
}

async function pickDemoCollection(pool, brandId) {
  // The collection with the most published SKUs and a showroom already over it: the demonstration
  // should walk the richest season present rather than create a parallel one beside it.
  const result = await pool.query(
    `SELECT c.id, c.campaign_id, campaign.payload ->> 'name' AS campaign_name,
            (SELECT count(*) FROM catalog_skus s WHERE s.collection_id = c.id AND s.status = 'published') AS published
       FROM collections c
       JOIN campaigns campaign ON campaign.id = c.campaign_id
      WHERE c.brand_id = $1 AND c.status = 'published'
      ORDER BY (campaign.payload ->> 'name') LIKE '%DEMO%' DESC, published DESC, c.id
      LIMIT 1`,
    [brandId],
  );
  if (!result.rowCount) throw new Error('No published collection to demonstrate');
  const row = result.rows[0];
  if (Number(row.published) === 0) throw new Error(`Collection ${row.id} has no published SKU`);
  return { id: row.id, campaignId: row.campaign_id, campaignName: row.campaign_name };
}

async function ensureRelationship(runtime, pool, brandId, ownerId, buyerId) {
  const existing = await pool.query('SELECT id, status FROM counterparty_relationships WHERE brand_id = $1 AND shop_id = $2', [brandId, SHOP_ID]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await runtime.partners.requestRelationship(command('relationship'), ownerId, { brandId, shopId: SHOP_ID });
    id = created.id;
    note('relationship', 'requested by the brand');
  } else note('relationship', `already ${existing.rows[0].status}`);
  let status = (await pool.query('SELECT status FROM counterparty_relationships WHERE id = $1', [id])).rows[0]?.status;
  // Отозванную или отклонённую связь принять нельзя — её сначала запрашивают заново. Без этого
  // демонстрация переставала засеваться навсегда после одного отзыва: сид пытался принять то, что
  // принимать не разрешено, и падал на середине.
  if (status === 'revoked' || status === 'rejected') {
    await runtime.partners.requestRelationship(command('relationship-renew'), ownerId, { brandId, shopId: SHOP_ID });
    note('relationship', `renewed after ${status}`);
    status = 'pending';
  }
  // Only the shop can accept a request addressed to it, which is exactly why the buyer is a real
  // account rather than a row.
  if (status !== 'active') {
    await runtime.partners.acceptRelationship(command('relationship-accept'), buyerId, id);
    note('relationship', 'accepted by the retailer');
  }
  return id;
}

async function ensureShowroom(runtime, pool, collection, brandId, ownerId) {
  const existing = await pool.query("SELECT id, status FROM showrooms WHERE collection_id = $1 ORDER BY status = 'open' DESC LIMIT 1", [collection.id]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.status !== 'open') { await runtime.collaboration.openShowroom(command('showroom-open'), ownerId, row.id); note('showroom', 'opened'); }
    else note('showroom', `${row.id} already open`);
    return { id: row.id };
  }
  const now = Date.now();
  const created = await runtime.collaboration.createShowroom(command('showroom'), ownerId, {
    collectionId: collection.id, brandId, name: 'SS27 Paris Showroom',
    opensAt: new Date(now - 7 * 86400000).toISOString(), closesAt: new Date(now + 120 * 86400000).toISOString(),
  });
  await runtime.collaboration.openShowroom(command('showroom-open'), ownerId, created.id);
  note('showroom', `${created.id} created and opened`);
  return created;
}

async function ensureInvitation(runtime, pool, showroomId, ownerId, buyerId) {
  const existing = await pool.query('SELECT id, status FROM showroom_invitations WHERE showroom_id = $1 AND shop_id = $2', [showroomId, SHOP_ID]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await runtime.partners.inviteShopToShowroom(command('invitation'), ownerId, {
      showroomId, shopId: SHOP_ID, expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    });
    id = created.id;
    note('invitation', 'sent to the retailer');
  } else note('invitation', `already ${existing.rows[0].status}`);
  const status = (await pool.query('SELECT status FROM showroom_invitations WHERE id = $1', [id])).rows[0]?.status;
  if (status !== 'accepted') {
    await runtime.partners.acceptShowroomInvitation(command('invitation-accept'), buyerId, id);
    note('invitation', 'accepted by the retailer');
  }
  return id;
}

async function ensureRetailDoor(runtime, pool, buyerId) {
  const existing = await pool.query('SELECT id FROM retail_doors WHERE shop_id = $1 ORDER BY id LIMIT 1', [SHOP_ID]);
  if (existing.rowCount) { note('retail door', `${existing.rows[0].id} already exists`); return existing.rows[0]; }
  const created = await runtime.retailDoors.createRetailDoor(command('door'), buyerId, {
    shopId: SHOP_ID, code: 'BER-MITTE', name: 'Nordhaus Berlin Mitte',
    shipToAddress: { countryCode: 'DE', postalCode: '10117', city: 'Berlin', line1: 'Friedrichstraße 68' },
  });
  note('retail door', `${created.code} created`);
  return created;
}

async function ensureBuyerCatalog(runtime, pool, collectionId, showroomId, ownerId) {
  const existing = await pool.query('SELECT id FROM buyer_catalog_versions WHERE showroom_id = $1 AND shop_id = $2 LIMIT 1', [showroomId, SHOP_ID]);
  if (existing.rowCount) { note('buyer catalogue', `${existing.rows[0].id} already published`); return existing.rows[0]; }
  const publication = await pool.query('SELECT id FROM commercial_publications WHERE collection_id = $1 ORDER BY published_at DESC LIMIT 1', [collectionId]);
  if (!publication.rowCount) throw new Error(`Collection ${collectionId} has no commercial publication to publish a buyer catalogue from`);
  const result = await runtime.commercialPublication.publishBuyerCatalog(command('buyer-catalog'), ownerId, publication.rows[0].id, { showroomId, shopId: SHOP_ID });
  note('buyer catalogue', `${result.buyerCatalogVersion.id} published for ${SHOP_NAME}`);
  return result.buyerCatalogVersion;
}

async function ensureCycle(runtime, pool, input, buyerId) {
  const existing = await pool.query('SELECT id, stage FROM commercial_cycles WHERE brand_id = $1 AND shop_id = $2 AND collection_id = $3 LIMIT 1', [input.brandId, input.shopId, input.collectionId]);
  if (existing.rowCount) { note('cycle', `${existing.rows[0].id} at ${existing.rows[0].stage}`); return existing.rows[0]; }
  const created = await runtime.platform.startCycle(command('cycle'), buyerId, input);
  note('cycle', `${created.id} started at ${created.stage}`);
  return created;
}

// The cycle advances one stage at a time on purpose — it is the season's own state machine — so the
// seed walks it rather than jumping, exactly as the screens do.
async function advanceCycleTo(runtime, pool, cycleId, targetStage, actorId) {
  const stages = ['campaign', 'collection', 'showroom', 'selection', 'order-builder', 'deal'];
  for (;;) {
    const stage = (await pool.query('SELECT stage FROM commercial_cycles WHERE id = $1', [cycleId])).rows[0]?.stage;
    const at = stages.indexOf(stage);
    const want = stages.indexOf(targetStage);
    if (at < 0 || want < 0 || at >= want) return stage;
    await runtime.platform.advanceCycle(command('cycle-advance'), actorId, cycleId, stages[at + 1]);
    note('cycle', `advanced to ${stages[at + 1]}`);
  }
}

async function ensureSelection(runtime, pool, cycle, showroomId, collectionId, buyerId, retailDoorId) {
  await advanceCycleTo(runtime, pool, cycle.id, 'showroom', buyerId);
  const existing = await pool.query('SELECT id, status FROM selections WHERE cycle_id = $1 LIMIT 1', [cycle.id]);
  if (existing.rowCount && existing.rows[0].status === 'submitted') { note('selection', `${existing.rows[0].id} already submitted`); return existing.rows[0]; }
  let selection = existing.rows[0];
  if (!selection) {
    // createSelection also advances the cycle, so it answers with both; the selection is the half
    // this step is about.
    const result = await runtime.collaboration.createSelection(command('selection'), buyerId, { cycleId: cycle.id, showroomId, retailDoorId });
    selection = result.selection ?? result;
    note('selection', `${selection.id} created`);
  }
  // The buyer picks from the catalogue the brand published to them, not from the brand's own
  // register: those are different lists, and which one a selection is built from is the whole point
  // of publishing. Quantities differ by product the way a real buying sheet does.
  const catalogue = await pool.query(
    `SELECT line ->> 'sku' AS sku,
            COALESCE((line ->> 'minimumOrderQuantity')::integer, 1) AS moq,
            COALESCE((line -> 'availability' ->> 'quantity')::integer, 0) AS available
       FROM buyer_catalog_versions AS catalogue,
            LATERAL jsonb_array_elements(catalogue.payload -> 'lines') AS line
      WHERE catalogue.showroom_id = $1 AND catalogue.shop_id = $2
      ORDER BY catalogue.published_at DESC, line ->> 'sku'`,
    [showroomId, SHOP_ID],
  );
  if (!catalogue.rowCount) throw new Error('The published buyer catalogue holds no line to select');
  const quantities = [180, 640, 240, 420];
  for (const [index, row] of catalogue.rows.entries()) {
    const wanted = quantities[index % quantities.length];
    const quantity = Math.max(Number(row.moq), Math.min(wanted, Number(row.available) || wanted));
    await runtime.collaboration.upsertSelectionLine(command('selection-line'), buyerId, selection.id, { sku: row.sku, quantity });
    note('selection line', `${row.sku} × ${quantity}`);
  }
  await runtime.collaboration.submitSelection(command('selection-submit'), buyerId, selection.id);
  note('selection', 'submitted to the brand');
  return selection;
}

// A second published collection, not the one the finished season already used.
async function pickDraftCollection(pool, brandId, exceptId) {
  const result = await pool.query(
    `SELECT c.id, c.campaign_id, campaign.payload ->> 'name' AS campaign_name,
            (SELECT count(*) FROM catalog_skus s WHERE s.collection_id = c.id AND s.status = 'published') AS published
       FROM collections c
       JOIN campaigns campaign ON campaign.id = c.campaign_id
      WHERE c.brand_id = $1 AND c.status = 'published' AND c.id <> $2
      ORDER BY published DESC, c.id
      LIMIT 1`,
    [brandId, exceptId],
  );
  const row = result.rows[0];
  if (!row || Number(row.published) === 0) return null;
  return { id: row.id, campaignId: row.campaign_id, campaignName: row.campaign_name };
}

// A selection that stays a draft on purpose. One line is left deliberately empty so the grid has
// something to be typed into, and the cycle is held at the showroom stage where a buyer writes.
async function ensureDraftSelection(runtime, pool, cycle, showroomId, buyerId, retailDoorId) {
  await advanceCycleTo(runtime, pool, cycle.id, 'showroom', buyerId);
  const existing = await pool.query('SELECT id, status FROM selections WHERE cycle_id = $1 LIMIT 1', [cycle.id]);
  if (existing.rowCount) { note('draft selection', `${existing.rows[0].id} already ${existing.rows[0].status}`); return existing.rows[0]; }
  const result = await runtime.collaboration.createSelection(command('draft-selection'), buyerId, { cycleId: cycle.id, showroomId, retailDoorId });
  const selection = result.selection ?? result;
  note('draft selection', `${selection.id} created and left open`);
  const catalogue = await pool.query(
    `SELECT line ->> 'sku' AS sku,
            COALESCE((line ->> 'minimumOrderQuantity')::integer, 1) AS moq,
            COALESCE((line -> 'availability' ->> 'quantity')::integer, 0) AS available
       FROM buyer_catalog_versions AS catalogue,
            LATERAL jsonb_array_elements(catalogue.payload -> 'lines') AS line
      WHERE catalogue.showroom_id = $1 AND catalogue.shop_id = $2
      ORDER BY catalogue.published_at DESC, line ->> 'sku'`,
    [showroomId, SHOP_ID],
  );
  // The first line is filled so the grid has a number in it; the rest stay empty so there is
  // somewhere to type, paste and undo.
  const first = catalogue.rows[0];
  if (first) {
    const quantity = Math.max(Number(first.moq), Math.min(96, Number(first.available) || 96));
    await runtime.collaboration.upsertSelectionLine(command('draft-selection-line'), buyerId, selection.id, { sku: first.sku, quantity });
    note('draft selection line', `${first.sku} \u00d7 ${quantity}`);
  }
  return selection;
}

async function ensureOrder(runtime, pool, cycle, selection, buyerId, ownerId) {
  const brandId = (await pool.query('SELECT brand_id FROM commercial_cycles WHERE id = $1', [cycle.id])).rows[0].brand_id;
  const readOrder = async () => (await pool.query('SELECT id, status, version, payload FROM orders WHERE cycle_id = $1 LIMIT 1', [cycle.id])).rows[0];

  let order = await readOrder();
  if (!order) {
    await advanceCycleTo(runtime, pool, cycle.id, 'order-builder', ownerId);
    const now = Date.now();
    const created = await runtime.orders.createOrderDraft(command('order'), buyerId, {
      selectionId: selection.id,
      retailDoorId: (await pool.query('SELECT retail_door_id FROM selections WHERE id = $1', [selection.id])).rows[0]?.retail_door_id ?? null,
      terms: {
        incoterm: 'DDP', paymentDays: 45, prepaymentPercent: 30,
        deliveryStart: new Date(now + 150 * 86400000).toISOString(),
        deliveryEnd: new Date(now + 180 * 86400000).toISOString(),
      },
    });
    note('order', `${created.id} drafted by the retailer`);
    order = await readOrder();
  } else note('order', `${order.id} already ${order.status}`);

  // Both sides accept, separately. An order one party signed is a quotation; it becomes an order when
  // the other one answers, and the two answers come from two accounts because they are two decisions.
  for (const [organisationId, actorId, who] of [[SHOP_ID, buyerId, 'retailer'], [brandId, ownerId, 'brand']]) {
    order = await readOrder();
    const accepted = new Set(order.payload.acceptedOrganisationIds ?? []);
    if (accepted.has(organisationId)) { note('order', `already accepted by the ${who}`); continue; }
    await runtime.orders.acceptTerms(command('order-accept'), actorId, { orderId: order.id, organisationId, expectedVersion: order.version });
    note('order', `accepted by the ${who}`);
  }

  order = await readOrder();
  if (order.status === 'ready') {
    await runtime.orders.attachOrderToCycle(command('order-attach'), ownerId, { orderId: order.id, expectedVersion: order.version });
    note('order', 'committed and attached');
    order = await readOrder();
  }

  const stage = (await pool.query('SELECT stage FROM commercial_cycles WHERE id = $1', [cycle.id])).rows[0].stage;
  if (stage === 'order-builder') {
    await advanceCycleTo(runtime, pool, cycle.id, 'order', ownerId);
    await runtime.platform.attachOrder(command('cycle-order'), ownerId, cycle.id, order.payload);
    note('cycle', 'order attached to the season');
  }

  const deal = await pool.query('SELECT id FROM deals WHERE order_id = $1', [order.id]);
  if (!deal.rowCount) {
    await runtime.platform.confirmAndOpenDeal(command('deal'), ownerId, cycle.id);
    note('deal space', 'opened on the confirmed order');
  } else note('deal space', `${deal.rows[0].id} already open`);
  return order;
}

// Демонстрационный план приёмочного контроля.
//
// This is NOT ГОСТ Р ИСО 2859-1 and does not claim to be. The coefficients of a published standard
// are not something to recite from memory into the table that decides whether goods ship, so the
// demonstration carries a set of its own, named and annotated as a demonstration one, and a brand
// loads the table it actually works to. Every rule the real thing obeys is obeyed here — the sample
// fits the smallest lot in its range, rejection is acceptance plus one, ranges do not overlap, and
// the looser limit tolerates more than the tighter one from the same sample — so the demonstration
// exercises the real resolver rather than a relaxed version of it.

async function ensureSamplingPlans(pool, brandId, createdBy) {
  const existing = await pool.query('SELECT count(*)::integer AS count FROM aql_sampling_plans WHERE brand_id = $1 AND standard_code = $2', [brandId, DEMO_SAMPLING_STANDARD]);
  if (existing.rows[0].count > 0) { note('sampling plans', `${DEMO_SAMPLING_STANDARD} already loaded (${existing.rows[0].count} rows)`); return; }
  const note_ = 'Демонстрационный набор. Не является ГОСТ Р ИСО 2859-1 — бренд загружает таблицу, к которой он присоединился.';
  let inserted = 0;
  for (const [lotFrom, lotTo, sampleSize, acceptMajor, acceptMinor] of DEMO_SAMPLING_ROWS) {
    for (const [aql, acceptAt] of [[2.5, acceptMajor], [4, acceptMinor]]) {
      const payload = { standardCode: DEMO_SAMPLING_STANDARD, inspectionLevel: 'II', aql, lotFrom, lotTo, sampleSize, acceptAt, rejectAt: acceptAt + 1, sourceNote: note_ };
      await pool.query(
        `INSERT INTO aql_sampling_plans (id,brand_id,standard_code,inspection_level,aql,lot_from,lot_to,sample_size,accept_at,reject_at,source_note,created_at,created_by,payload)
         VALUES ($1,$2,$3,'II',$4,$5,$6,$7,$8,$9,$10,now(),$11,$12::jsonb)`,
        [`aql-plan_${DEMO_SAMPLING_STANDARD}_II_${String(aql).replace('.', '-')}_${lotFrom}`.toLowerCase(), brandId, DEMO_SAMPLING_STANDARD, aql, lotFrom, lotTo, sampleSize, acceptAt, acceptAt + 1, note_, createdBy, JSON.stringify(payload)],
      );
      inserted += 1;
    }
  }
  note('sampling plans', `${DEMO_SAMPLING_STANDARD}, уровень II, AQL 2.5 и 4.0 — ${inserted} строк`);
}

// Каталог дефектов бренда.
//
// The codes below are not invented for the demonstration: the three that already appear in recorded
// inspections — SEAM-OPEN, PRINT-OFF, STITCH-LOOSE — are adopted with the severities those
// inspections used, so registering the catalogue explains the existing records rather than
// contradicting them. The rest name faults at the other stages, because a catalogue whose every
// entry originates at one operation cannot say where the work goes wrong.

async function ensureDefectCatalogue(runtime, pool, brandId, actorId) {
  const existing = await pool.query('SELECT code FROM defect_types WHERE brand_id = $1', [brandId]);
  const known = new Set(existing.rows.map((row) => row.code));
  let added = 0;
  for (const type of DEMO_DEFECT_TYPES) {
    if (known.has(type.code)) continue;
    try {
      await runtime.inlineQuality.registerDefectType(command('defect-type'), actorId, { brandId, ...type });
      added += 1;
    } catch (error) {
      note('defect catalogue', `${type.code} skipped (${error.code ?? error.message})`);
    }
  }
  note('defect catalogue', added > 0 ? `${added} типов дефектов зарегистрировано` : `${known.size} типов уже в каталоге`);
}

// Партия в середине производства.
//
// Every lot in the demonstration had been walked to the end, which meant the middle of production —
// the part the platform actually spends months in — was never on screen, and inline quality control
// had nothing to attach to. This takes one awarded RFQ the whole way: allocation, order,
// confirmation, execution, and then stops it in the middle, on purpose.
//
// It runs through the same services a person uses, not through INSERTs. A seed that writes rows
// directly demonstrates the database; a seed that calls the services demonstrates the product, and
// it also fails loudly when a rule it forgot about says no.
//
// Where it stops is the point. The lot sits at assembly with a check whose defects nobody has
// decided about, so the stage is visibly held shut by the rule rather than by a missing button, and
// the disposition controls have something real to act on.

// Техпак, подтверждённый фабрикой.
//
// Issue needs an approved pre-production sample from that same supplier, and allocation needs the
// factory to have acknowledged the issued pack. Both are gates worth having: they are what stops a
// lot going into production against a document nobody on the other side has seen.
async function ensureAcknowledgedTechPack(runtime, pool, sku, supplierCode, actorId) {
  const row = await pool.query('SELECT payload FROM tech_packs WHERE sku = $1 ORDER BY version DESC LIMIT 1', [sku]);
  if (!row.rowCount) { note('tech pack', `${sku}: техпака нет`); return; }
  let techPack = row.rows[0].payload;
  // Техпак нельзя выпустить на неопубликованной таблице мер: фабрика получила бы документ, который
  // ещё правят. Публикуем её тем же сервисом, а не переписываем статус.
  const chart = (await pool.query('SELECT payload FROM measurement_charts WHERE sku = $1', [sku])).rows[0]?.payload;
  if (chart && chart.status === 'draft') {
    await runtime.measurements.publishMeasurementChart(command('chart-publish'), actorId, sku, { expectedVersion: chart.version });
    note('tech pack', `таблица мер ${sku} опубликована`);
  }
  if (techPack.status === 'draft') {
    techPack = await runtime.techPacks.issueTechPack(command('tp-issue'), actorId, techPack.techPackCode, { expectedVersion: techPack.version });
    note('tech pack', `${techPack.techPackCode} выпущен фабрике ${supplierCode}`);
  }
  if (techPack.status === 'issued') {
    techPack = await runtime.techPacks.acknowledgeTechPack(command('tp-ack'), actorId, techPack.techPackCode, {
      expectedVersion: techPack.version,
      supplierCode,
      acknowledgementReference: `ACK-${techPack.techPackCode}`,
      acknowledgedBy: 'Mei Lin',
      notes: 'Фабрика подтвердила комплект документации.',
    });
    note('tech pack', `${techPack.techPackCode} подтверждён фабрикой`);
  }
}

async function ensureLotInProduction(runtime, pool, brandId, actorId) {
  const rfqRow = await pool.query('SELECT payload FROM sourcing_rfqs WHERE rfq_code = $1 AND brand_id = $2', [DEMO_LOT_RFQ, brandId]);
  if (!rfqRow.rowCount) { note('lot in production', `${DEMO_LOT_RFQ} not in this database`); return; }
  let rfq = rfqRow.rows[0].payload;

  // Техпак должен быть выпущен и подтверждён фабрикой — без этого размещать в производство нечего.
  // Правило поймало сид на первом же прогоне, и это ровно то, ради чего сид ходит через сервисы.
  if (rfq.status === 'awarded') {
    await ensureAcknowledgedTechPack(runtime, pool, rfq.sku, rfq.selectedSupplierCode, actorId);
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    rfq = await runtime.sourcing.allocateRfq(command('rfq-allocate'), actorId, DEMO_LOT_RFQ, {
      expectedVersion: rfq.version,
      purchaseOrderNumber: DEMO_LOT_PO,
      quantity: rfq.targetQuantity,
      productionStartAt: startAt,
      deliveryDueAt: rfq.deliveryDueAt,
      notes: 'Размещение в производство по итогам конкурса.',
    });
    note('lot in production', `${DEMO_LOT_RFQ} размещён на ${rfq.allocation.supplierCode}`);
  }
  if (rfq.status !== 'allocated') { note('lot in production', `${DEMO_LOT_RFQ} is ${rfq.status}`); return; }

  let order = (await pool.query('SELECT payload FROM production_orders WHERE production_order_number = $1', [DEMO_LOT_PO])).rows[0]?.payload;
  if (!order) {
    order = await runtime.productionOrders.createFromAllocation(command('po-create'), actorId, DEMO_LOT_RFQ);
    note('lot in production', `заказ ${order.productionOrderNumber} создан`);
  }
  if (order.status === 'draft') {
    order = await runtime.productionOrders.issue(command('po-issue'), actorId, DEMO_LOT_PO, { expectedVersion: order.version });
  }
  if (order.status === 'issued') {
    order = await runtime.productionOrders.confirm(command('po-confirm'), actorId, DEMO_LOT_PO, {
      expectedVersion: order.version,
      supplierCode: order.supplierCode,
      confirmationReference: `CONF-${DEMO_LOT_PO}`,
      confirmedBy: 'Mei Lin',
      notes: 'Фабрика подтвердила объём и сроки.',
    });
    note('lot in production', `заказ подтверждён фабрикой ${order.supplierCode}`);
  }
  if (order.status !== 'confirmed') { note('lot in production', `order is ${order.status}`); return; }

  let execution = (await pool.query('SELECT payload FROM production_executions WHERE production_order_number = $1', [DEMO_LOT_PO])).rows[0]?.payload;
  if (!execution) {
    execution = await runtime.productionExecutions.createFromProductionOrder(command('exec-create'), actorId, DEMO_LOT_PO);
    note('lot in production', `исполнение ${execution.executionCode} создано`);
  }
  if (execution.status === 'planned') {
    execution = await runtime.productionExecutions.start(command('exec-start'), actorId, execution.executionCode, { expectedVersion: execution.version });
  }
  if (execution.status !== 'active') { note('lot in production', `execution is ${execution.status}`); return; }

  const done = (code) => execution.milestones.find((milestone) => milestone.code === code)?.status === 'completed';
  const checked = async (milestoneCode) => (await pool.query(
    'SELECT count(*)::integer AS count FROM inline_quality_checks WHERE execution_id = $1 AND milestone_code = $2',
    [execution.id, milestoneCode],
  )).rows[0].count > 0;

  // Материалы: посмотрели и ничего не нашли. Чистая проверка тоже запись — она говорит, что
  // смотрели, а это не то же самое, что «дефектов нет».
  if (!done('materials-ready') && !(await checked('materials-ready'))) {
    await runtime.inlineQuality.recordCheck(command('iqc-materials'), actorId, execution.executionCode, {
      milestoneCode: 'materials-ready', checkedQuantity: 40, inspectorName: 'Павел Дорохов',
      defects: [], notes: 'Входной контроль полотна: отклонений не найдено.',
    });
    note('lot in production', 'входной контроль — без замечаний');
  }
  if (!done('materials-ready')) {
    execution = await runtime.productionExecutions.completeMilestone(command('exec-materials'), actorId, execution.executionCode, {
      expectedVersion: execution.version, milestoneCode: 'materials-ready', notes: 'Полотно принято и передано в раскрой.',
    });
  }

  // Раскрой: нашли, разобрали, закрыли. Так этап и закрывается — не потому что о находке забыли.
  if (!done('cutting-complete') && !(await checked('cutting-complete'))) {
    const cutting = await runtime.inlineQuality.recordCheck(command('iqc-cutting'), actorId, execution.executionCode, {
      milestoneCode: 'cutting-complete', checkedQuantity: 60, inspectorName: 'Павел Дорохов',
      defects: [{ defectCode: 'CUT-OFF-GRAIN', quantity: 2, notes: 'Две детали из одной настилки' }],
      notes: 'Контроль после раскроя.',
    });
    await runtime.inlineQuality.disposition(command('iqc-cutting-decide'), actorId, cutting.id, {
      expectedVersion: cutting.version, disposition: 'rework', notes: 'Детали перекроены из того же рулона.',
    });
    note('lot in production', 'раскрой: 2 детали не по долевой — перекроены');
  }
  if (!done('cutting-complete')) {
    execution = await runtime.productionExecutions.completeMilestone(command('exec-cutting'), actorId, execution.executionCode, {
      expectedVersion: execution.version, milestoneCode: 'cutting-complete', notes: 'Раскрой завершён, детали переданы на пошив.',
    });
  }

  // Пошив: нашли и ещё не решили. Здесь партия и остаётся — этап держится правилом, а не тем, что
  // до него не дошли руки.
  if (!(await checked('assembly-complete'))) {
    await runtime.inlineQuality.recordCheck(command('iqc-assembly'), actorId, execution.executionCode, {
      milestoneCode: 'assembly-complete', checkedQuantity: 80, inspectorName: 'Ирина Соколова',
      defects: [
        { defectCode: 'SEAM-OPEN', quantity: 3, notes: 'Боковой шов, одна бригада' },
        { defectCode: 'STITCH-LOOSE', quantity: 5 },
      ],
      notes: 'Контроль на пошиве: требуется решение по найденному.',
    });
    note('lot in production', 'пошив: 8 изделий с замечаниями — решение не принято, этап закрыт не будет');
  }
  note('lot in production', `${execution.executionCode} остаётся в производстве на этапе пошива`);
}

// Графики платежей по подтверждённым заказам.
//
// Nothing is typed: the amount is the order's own frozen commercial snapshot, the currency comes
// with it, and the term in days is the supplier's. The demonstration then pays what has genuinely
// fallen due — the deposit, whose trigger is the confirmation that already happened — and leaves the
// balance alone, because on a lot still in production it has not fallen due and paying it would be
// money out for goods that never shipped.
// Приёмка рулонов и выдача их в раскрой.
//
// The order is the point: a roll arrives in quarantine, incoming inspection releases it, and only
// then does it go to cutting. The seed follows that order through the services, so a rule it forgot
// about would stop it rather than be quietly skipped.
async function ensureMaterialLots(runtime, pool, brandId, warehouseActorId, qualityActorId) {
  const execution = (await pool.query(
    "SELECT payload FROM production_executions WHERE production_order_number = $1 AND status = 'active'",
    [DEMO_LOT_PO],
  )).rows[0]?.payload;
  if (!execution) { note('material lots', 'нет партии в производстве — выдавать не во что'); return; }
  const materialCode = (await pool.query(
    `SELECT line.material_code FROM bom_lines AS line
       JOIN boms AS bom ON bom.id = line.bom_id
      WHERE bom.sku = $1 AND bom.status = 'published'
      ORDER BY line.position LIMIT 1`,
    [execution.sku],
  )).rows[0]?.material_code;
  if (!materialCode) { note('material lots', `у ${execution.sku} нет опубликованной ведомости`); return; }

  let received = 0;
  let issued = 0;
  for (const definition of DEMO_MATERIAL_LOTS) {
    const existing = (await pool.query('SELECT payload FROM material_lots WHERE brand_id = $1 AND material_code = $2 AND lot_reference = $3', [brandId, materialCode, definition.lotReference])).rows[0]?.payload;
    if (existing) continue;
    try {
      let lot = await runtime.materialLots.receiveLot(command('material-lot'), warehouseActorId, {
        materialCode, lotReference: definition.lotReference, dyeLot: definition.dyeLot,
        receivedQuantity: definition.receivedQuantity, notes: definition.notes,
        ...(definition.colourCode ? { colourCode: definition.colourCode } : {}),
        ...(definition.certificateReference ? { certificateReference: definition.certificateReference } : {}),
      });
      received += 1;
      if (!definition.release) continue;
      // Выпускает из карантина контроль качества, а не склад: решение «годится» принимает не тот,
      // кто принял груз.
      lot = await runtime.materialLots.releaseLot(command('material-lot-release'), qualityActorId, lot.id, {
        expectedVersion: lot.version, notes: 'Входной контроль пройден.',
      });
      if (definition.issue > 0) {
        await runtime.materialLots.issueLot(command('material-lot-issue'), warehouseActorId, lot.id, {
          expectedVersion: lot.version, executionCode: execution.executionCode, quantity: definition.issue,
        });
        issued += 1;
      }
    } catch (error) {
      note('material lots', `${definition.lotReference} skipped (${error.code ?? error.message})`);
    }
  }
  note('material lots', received > 0 ? `${received} рулонов принято, ${issued} выдано в раскрой` : 'рулоны уже приняты');
}

// Настил на партии, которая сейчас в производстве.
//
// Ткань уже выдана в раскрой двумя рулонами. Настил берёт её и кладёт раскладку: 2,2 м в 200 слоёв
// по одному изделию в слое — 200 изделий из 440 метров. Расход на изделие выходит 2,2 м против
// 2,247 по ведомости, то есть фабрика уложилась в норму, и экран показывает это знаком, а не
// объяснением.
// Шаблон последовательности и последовательность изделия, которое сейчас шьют.
//
// Сначала шаблон категории, потом копия под изделие — именно так это и делают: рубашку шьют
// примерно одинаково, а различия дописывают после. Копия нужна копией: правка шаблона в следующем
// сезоне не должна менять то, по чему уже шьют.
async function ensureOperationSequence(runtime, pool, brandId, actorId) {
  const execution = (await pool.query(
    "SELECT payload FROM production_executions WHERE production_order_number = $1 AND status = 'active'",
    [DEMO_LOT_PO],
  )).rows[0]?.payload;
  if (!execution) { note('operations', 'нет партии в производстве'); return; }

  const existing = await pool.query("SELECT count(*)::integer AS count FROM bol_sequences WHERE brand_id = $1 AND kind = 'product' AND sku = $2 AND status <> 'retired'", [brandId, execution.sku]);
  if (existing.rows[0].count > 0) { note('operations', 'последовательность изделия уже есть'); return; }

  try {
    let template = (await pool.query("SELECT payload FROM bol_sequences WHERE brand_id = $1 AND template_code = 'TPL-OUTERWEAR'", [brandId])).rows[0]?.payload;
    if (!template) {
      template = await runtime.operationSequences.createTemplate(command('bol-template'), actorId, {
        brandId, templateCode: 'TPL-OUTERWEAR', category: 'Верхняя одежда',
        nameRu: 'Верхняя одежда, базовая последовательность', nameEn: 'Outerwear, base sequence',
        notes: 'Базовый набор операций для верхней одежды.',
      });
      template = await runtime.operationSequences.replaceOperations(command('bol-ops'), actorId, template.id, {
        expectedVersion: template.version, operations: DEMO_OPERATIONS,
      });
      template = await runtime.operationSequences.publish(command('bol-publish'), actorId, template.id, { expectedVersion: template.version });
      note('operations', `шаблон ${template.templateCode}: ${template.operations.length} операций`);
    }

    let sequence = await runtime.operationSequences.createForProduct(command('bol-product'), actorId, {
      brandId, sku: execution.sku, templateCode: 'TPL-OUTERWEAR',
    });
    sequence = await runtime.operationSequences.publish(command('bol-product-publish'), actorId, sequence.id, { expectedVersion: sequence.version });
    const minutes = sequence.operations.reduce((total, operation) => total + Number(operation.standardMinutes), 0);
    note('operations', `${execution.sku}: ${sequence.operations.length} операций, трудоёмкость ${Math.round(minutes * 100) / 100} мин.`);
  } catch (error) {
    note('operations', `последовательность не записана (${error.code ?? error.message})`);
  }
}

async function ensureCuttingSpread(runtime, pool, brandId, actorId) {
  const execution = (await pool.query(
    "SELECT payload FROM production_executions WHERE production_order_number = $1 AND status = 'active'",
    [DEMO_LOT_PO],
  )).rows[0]?.payload;
  if (!execution) { note('cutting', 'нет партии в производстве — настилать не на что'); return; }
  const existing = await pool.query('SELECT count(*)::integer AS count FROM cutting_spreads WHERE brand_id = $1', [brandId]);
  if (existing.rows[0].count > 0) { note('cutting', 'настилы уже записаны'); return; }

  const issues = (await pool.query(
    `SELECT issue.payload FROM material_lot_issues AS issue
      WHERE issue.execution_id = $1 ORDER BY issue.issued_at`,
    [execution.id],
  )).rows.map((row) => row.payload);
  if (!issues.length) { note('cutting', 'в партию не выдано ни одного рулона'); return; }

  // Берём столько, сколько настелено, и не больше, чем выдано с каждого рулона.
  const plies = 200;
  const markerLength = 2.2;
  const needed = markerLength * plies;
  const lots = [];
  let remaining = needed;
  for (const issue of issues) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(issue.quantity));
    if (take <= 0) continue;
    lots.push({ lotReference: issue.lotReference, quantity: Math.round(take * 10_000) / 10_000 });
    remaining = Math.round((remaining - take) * 10_000) / 10_000;
  }
  if (remaining > 0) { note('cutting', `выданной ткани не хватает на настил (${remaining} не покрыто)`); return; }

  try {
    const spread = await runtime.cutting.laySpread(command('cutting-lay'), actorId, {
      materialCode: issues[0].materialCode,
      spreadReference: `LAY-${execution.sku}-001`,
      markerLength, plies, fabricWidth: 146, fabricWidthUnit: 'cm',
      marker: [{ executionCode: execution.executionCode, garmentsPerPly: 1 }],
      lots,
      notes: 'Первый настил партии.',
    });
    await runtime.cutting.markCut(command('cutting-cut'), actorId, spread.id, { expectedVersion: spread.version });
    note('cutting', `${spread.spreadReference}: ${spread.clothLaid} м в ${plies} слоёв — ${plies} изделий, расход ${spread.consumptionPerGarment} м/изд.`);
  } catch (error) {
    note('cutting', `настил не записан (${error.code ?? error.message})`);
  }
}

// Курсы сезона и целевая цена.
//
// Вопрос «во что обошлось» проект умел задавать всегда. Этот — обратный: какая цена у фабрики ещё
// сходится с розничной ценой и плановой наценкой. Цель считается от розницы вниз, а сравнивается с
// тем, что фабрика уже запросила в подтверждённом заказе, — то есть с фактом, а не с ожиданием.
async function ensureTargetPricing(runtime, pool, brandId, actorId) {
  const row = (await pool.query(
    `SELECT catalog_sku.sku, collection.campaign_id AS campaign
       FROM production_orders AS production_order
       JOIN catalog_skus AS catalog_sku ON catalog_sku.sku = production_order.sku
       JOIN collections AS collection ON collection.id = catalog_sku.collection_id
      WHERE production_order.production_order_number = $1`,
    [DEMO_LOT_PO],
  )).rows[0];
  if (!row) { note('target price', 'нет заказа, от которого считать'); return; }

  const rates = [
    { fromCurrency: 'EUR', toCurrency: 'RUB', rate: 88.4, effectiveOn: '2026-01-15', sourceNote: 'Курс на начало сезона' },
    { fromCurrency: 'EUR', toCurrency: 'RUB', rate: 92.1, effectiveOn: '2026-08-01', sourceNote: 'Курс на размещение производства' },
  ];
  for (const rate of rates) {
    const exists = await pool.query(
      'SELECT 1 FROM season_fx_rates WHERE brand_id = $1 AND campaign_id = $2 AND from_currency = $3 AND to_currency = $4 AND effective_on = $5::date',
      [brandId, row.campaign, rate.fromCurrency, rate.toCurrency, rate.effectiveOn],
    );
    if (exists.rowCount) continue;
    try {
      await runtime.targetPricing.recordSeasonRate(command('season-rate'), actorId, { brandId, campaignId: row.campaign, ...rate });
    } catch (error) {
      note('target price', `курс ${rate.effectiveOn} не записан (${error.code ?? error.message})`);
    }
  }

  // Цель ставится и на футболку: под неё ещё нет размещённого заказа, и слот линейного плана
  // остаётся «нацелен, но не закуплен». Это обычное состояние сезона в середине работы, и свод
  // должен уметь его показывать, а не только законченные слоты.
  await ensureTeeTargetPrice(runtime, pool, brandId, actorId, row.campaign);

  const planned = await pool.query("SELECT 1 FROM target_price_plans WHERE brand_id = $1 AND sku = $2 AND status <> 'superseded'", [brandId, row.sku]);
  if (planned.rowCount) { note('target price', 'цель по цене уже составлена'); return; }
  try {
    let plan = await runtime.targetPricing.createPlan(command('target-price'), actorId, {
      brandId, sku: row.sku,
      // 24 900 ₽ в рознице при наценке 2,6 — обычная для этой категории экономика.
      targetRrpMinor: 2_490_000, rrpCurrency: 'RUB', retailMarkup: 2.6,
      sourcingCountryCode: 'TR',
      // Фрахт и растаможка из Турции и обработка по категории: оба множителя больше единицы, потому
      // что дорога только добавляет к цене у ворот фабрики.
      countryCoefficient: 1.18, categoryCoefficient: 1.04,
      fobCurrency: 'EUR', asOf: '2026-09-01',
      notes: 'Цель на сезон: считаем от розницы вниз.',
    });
    plan = await runtime.targetPricing.publish(command('target-price-publish'), actorId, plan.id, { expectedVersion: plan.version });
    const view = await runtime.targetPricing.targetPricePlanForSku(actorId, row.sku);
    const money = (minor) => (minor / 100).toFixed(2);
    note('target price', `${row.sku}: цель ${money(view.targetFobMinor)} ${view.fobCurrency} FOB, фабрика запросила ${view.quotedFobMinor === null ? '—' : money(view.quotedFobMinor)} ${view.quotedCurrency ?? ''} — ${view.withinTarget === null ? 'сравнить не с чем' : view.withinTarget ? 'укладываемся' : 'выходим за цель'}`);
  } catch (error) {
    note('target price', `цель не составлена (${error.code ?? error.message})`);
  }
}

async function ensureTeeTargetPrice(runtime, pool, brandId, actorId, campaignId) {
  const sku = (await pool.query(
    `SELECT catalog_sku.sku
       FROM catalog_skus AS catalog_sku
       JOIN collections AS collection ON collection.id = catalog_sku.collection_id
      WHERE collection.campaign_id = $1 AND catalog_sku.sku LIKE 'SYN_TEE%'
      LIMIT 1`,
    [campaignId],
  )).rows[0];
  if (!sku) return;
  const planned = await pool.query("SELECT 1 FROM target_price_plans WHERE brand_id = $1 AND sku = $2 AND status <> 'superseded'", [brandId, sku.sku]);
  if (planned.rowCount) return;
  try {
    let plan = await runtime.targetPricing.createPlan(command('target-price-tee'), actorId, {
      brandId, sku: sku.sku,
      // 3 900 ₽ в рознице при наценке 2,8 — обычная экономика базовой футболки.
      targetRrpMinor: 390_000, rrpCurrency: 'RUB', retailMarkup: 2.8,
      sourcingCountryCode: 'TR',
      // Та же дорога, но более лёгкий товар: категорийный коэффициент ниже, чем у верхней одежды.
      countryCoefficient: 1.18, categoryCoefficient: 1.02,
      fobCurrency: 'EUR', asOf: '2026-09-01',
      notes: 'Цель на сезон по базе.',
    });
    await runtime.targetPricing.publish(command('target-price-tee-publish'), actorId, plan.id, { expectedVersion: plan.version });
  } catch (error) {
    note('target price', `цель по футболке не составлена (${error.code ?? error.message})`);
  }
}

async function ensureMaterialColours(runtime, pool, brandId, paletteActorId, qualityActorId) {
  for (const definition of DEMO_MATERIAL_COLOURS) {
    const materials = (await pool.query(
      `SELECT code FROM materials WHERE brand_id = $1 AND material_type = 'fabric' AND code LIKE $2 ORDER BY code`,
      [brandId, `%${definition.match}%`],
    )).rows;
    if (materials.length === 0) continue;

    for (const material of materials) {
      for (const colour of definition.colours) {
        const listed = await pool.query('SELECT id FROM material_colours WHERE material_code = $1 AND colour_code = $2', [material.code, colour.colourCode]);
        let materialColourId = listed.rows[0]?.id ?? null;
        if (!materialColourId) {
          try {
            const added = await runtime.materialColours.addMaterialColour(command('material-colour'), paletteActorId, {
              materialCode: material.code, colourCode: colour.colourCode, supplierColourReference: colour.supplierReference,
            });
            materialColourId = added.id;
          } catch (error) {
            note('lab dip', `${material.code}/${colour.colourCode}: цвет не заведён (${error.code ?? error.message})`);
            continue;
          }
        }

        const existing = await pool.query('SELECT 1 FROM lab_dips WHERE material_colour_id = $1', [materialColourId]);
        if (existing.rowCount) continue;
        try {
          await runLabDip(runtime, materialColourId, material.code, colour, paletteActorId, qualityActorId);
        } catch (error) {
          note('lab dip', `${material.code}/${colour.colourCode}: образец не проведён (${error.code ?? error.message})`);
        }
      }
    }
  }

  const palette = await pool.query('SELECT count(*)::integer AS total FROM material_colours WHERE brand_id = $1', [brandId]);
  const dips = await pool.query(
    `SELECT status, count(*)::integer AS total FROM lab_dips WHERE brand_id = $1 GROUP BY status ORDER BY status`,
    [brandId],
  );
  note('lab dip', `палитра: ${palette.rows[0].total} цветов; образцы: ${dips.rows.map((row) => `${row.status} — ${row.total}`).join(', ') || 'нет'}`);
}

// Один образец проживает свою историю целиком: запрошен → прислан → решение. «Принят со второго
// раза» проводится именно как два раунда, а не записывается сразу принятым: иначе раунд, по
// которому считают поставщика, был бы выдуман.
async function runLabDip(runtime, materialColourId, materialCode, colour, paletteActorId, qualityActorId) {
  const reference = `LD-${materialCode.replace(/[^A-Z0-9]/g, '')}-${colour.colourCode.replace(/[^A-Z0-9]/g, '')}`.slice(0, 60);
  let dip = await runtime.materialColours.requestLabDip(command('lab-dip'), paletteActorId, {
    materialColourId, dipReference: reference, supplierCode: 'ATM',
    notes: `Эталон на цвет ${colour.colourCode}`,
  });
  dip = await runtime.materialColours.submitLabDip(command('lab-dip-submit'), paletteActorId, dip.id, { expectedVersion: dip.version });
  if (colour.dip === 'submitted') return;

  if (colour.dip === 'approve-second') {
    dip = await runtime.materialColours.decideLabDip(command('lab-dip-reject'), qualityActorId, dip.id, {
      expectedVersion: dip.version, verdict: 'rejected_resubmit', note: 'Уходит в синеву относительно эталона',
    });
    dip = await runtime.materialColours.submitLabDip(command('lab-dip-resubmit'), paletteActorId, dip.id, { expectedVersion: dip.version });
  }

  await runtime.materialColours.decideLabDip(command('lab-dip-approve'), qualityActorId, dip.id, {
    expectedVersion: dip.version, verdict: 'approved',
  });
}

async function ensureMaterialSpecifications(runtime, pool, brandId, actorId) {
  for (const definition of DEMO_MATERIAL_SPECS) {
    // Обогащаются все полотна этого типа, а не первое попавшееся: демонстрация режет не тот рулон,
    // который стоит первым по алфавиту, и проверка ширины осталась бы непоказанной.
    const materials = (await pool.query(
      `SELECT code, version, cuttable_width FROM materials
        WHERE brand_id = $1 AND material_type = 'fabric' AND code LIKE $2
        ORDER BY code`,
      [brandId, `%${definition.match}%`],
    )).rows;
    if (materials.length === 0) { note('material spec', `нет полотна по образцу ${definition.match}`); continue; }

    for (const material of materials) {
      if (material.cuttable_width === null) {
        try {
          await runtime.materials.amendMaterialSpecification(command('material-spec'), actorId, material.code, {
            expectedVersion: Number(material.version), ...definition.specification,
          });
          note('material spec', `${material.code}: ${definition.specification.weightGsm} г/м², ширина раскроя ${definition.specification.cuttableWidth} ${definition.specification.cuttableWidthUnit}`);
        } catch (error) {
          note('material spec', `${material.code}: свойства не записаны (${error.code ?? error.message})`);
          continue;
        }
      }

      const composed = await pool.query('SELECT 1 FROM material_compositions WHERE material_code = $1', [material.code]);
      if (composed.rowCount) continue;
      // Версия перечитывается: уточнение свойств только что её подняло, и старое значение
      // столкнулось бы с проверкой одновременного изменения.
      const current = (await pool.query('SELECT version FROM materials WHERE code = $1', [material.code])).rows[0];
      try {
        await runtime.materials.setMaterialComposition(command('material-composition'), actorId, material.code, {
          expectedVersion: Number(current.version), lines: definition.composition,
        });
        note('material spec', `${material.code}: состав — ${definition.composition.map((line) => `${line.percentage}% ${line.fibreCode}`).join(', ')}`);
      } catch (error) {
        note('material spec', `${material.code}: состав не записан (${error.code ?? error.message})`);
      }
    }
  }
}

async function ensureAssortmentPlan(runtime, pool, brandId, actorId) {
  const season = (await pool.query(
    `SELECT collection.campaign_id AS campaign
       FROM production_orders AS production_order
       JOIN catalog_skus AS catalog_sku ON catalog_sku.sku = production_order.sku
       JOIN collections AS collection ON collection.id = catalog_sku.collection_id
      WHERE production_order.production_order_number = $1`,
    [DEMO_LOT_PO],
  )).rows[0];
  if (!season) { note('assortment plan', 'нет сезона, под который планировать'); return; }

  for (const slot of DEMO_PLACEHOLDERS) {
    const existing = await pool.query(
      'SELECT id FROM product_placeholders WHERE campaign_id = $1 AND placeholder_code = $2',
      [season.campaign, slot.code],
    );
    let placeholderId = existing.rows[0]?.id ?? null;
    if (!placeholderId) {
      try {
        const created = await runtime.platform.createProductPlaceholder(command('placeholder'), actorId, {
          campaignId: season.campaign,
          placeholderCode: slot.code,
          nameRu: slot.nameRu,
          nameEn: slot.nameEn,
          capsule: slot.capsule,
          drop: slot.drop,
          colourwayCount: slot.colourways,
          plannedQuantity: slot.quantity,
          currency: 'RUB',
          recommendedRetailPriceMinor: slot.retailMinor,
          plannedUnitCostMinor: slot.costMinor,
        });
        placeholderId = created.id;
      } catch (error) {
        note('assortment plan', `слот ${slot.code} не заведён (${error.code ?? error.message})`);
        continue;
      }
    }

    if (!slot.sku) continue;
    // Стиль связывается со слотом через свой каталожный SKU: связь по одному концу цепочки
    // оставила бы план без факта, а факт — без плана.
    const style = (await pool.query(
      `SELECT style_version.style_id AS id
         FROM product_catalog_sku_links AS catalog_link
         JOIN product_skus AS product_sku ON product_sku.id = catalog_link.product_sku_id
         JOIN product_style_versions AS style_version ON style_version.id = product_sku.style_version_id
        WHERE catalog_link.catalog_sku = $1 AND catalog_link.brand_id = $2
        LIMIT 1`,
      [slot.sku, brandId],
    )).rows[0];
    if (!style) { note('assortment plan', `под ${slot.code} нет стиля с SKU ${slot.sku}`); continue; }

    const linked = await pool.query('SELECT 1 FROM product_placeholder_style_links WHERE style_id = $1', [style.id]);
    if (linked.rowCount) continue;
    try {
      await runtime.platform.linkStyleToPlaceholder(command('placeholder-link'), actorId, placeholderId, { styleId: style.id });
    } catch (error) {
      note('assortment plan', `${slot.code} ↔ ${slot.sku} не связаны (${error.code ?? error.message})`);
    }
  }

  try {
    const view = await runtime.seasonEconomics.seasonEconomicsForCampaign(actorId, season.campaign);
    const roubles = (minor) => (minor === null ? '—' : (minor / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 }));
    const percent = (bp) => (bp === null ? '—' : `${(bp / 100).toFixed(1)} %`);
    note('assortment plan', `сезон: выручка ${roubles(view.season.plannedRevenueMinor)} ₽, плановая маржа ${percent(view.season.plannedMarginBasisPoints)}`);
    note('assortment plan', `подтверждено ${view.season.confirmedSlotCount} из ${view.season.quantifiedSlotCount} слотов (${percent(view.season.confirmedRevenueShareBasisPoints)} выручки), маржа по ним ${percent(view.season.actualMarginBasisPoints)} против плановых ${percent(view.season.plannedMarginOfConfirmedBasisPoints)}`);
  } catch (error) {
    note('assortment plan', `свод не посчитан (${error.code ?? error.message})`);
  }
}

// Заказ, выросший из подтверждённой потребности, проводится до запуска в работу и получает график
// из четырёх вех. Смысл именно в разных состояниях: подтверждение и запуск уже наступили, а
// готовность к контролю и выпуск отгрузки — ещё нет, поэтому финансист видит на одном экране и
// «причитается», и «запланировано». График из двух вех такого показать не может.
async function ensureStagedPaymentSchedule(runtime, pool, brandId, actorId) {
  const row = (await pool.query(
    'SELECT payload FROM production_orders WHERE production_order_number = $1 AND brand_id = $2',
    [DEMO_STAGED_PAYMENT_PO, brandId],
  )).rows[0];
  if (!row) { note('staged payments', `${DEMO_STAGED_PAYMENT_PO} не найден — этапный график ставить не на что`); return; }

  let order = row.payload;
  try {
    if (order.status === 'draft') {
      order = await runtime.productionOrders.issue(command('staged-po-issue'), actorId, DEMO_STAGED_PAYMENT_PO, { expectedVersion: order.version });
    }
    if (order.status === 'issued') {
      order = await runtime.productionOrders.confirm(command('staged-po-confirm'), actorId, DEMO_STAGED_PAYMENT_PO, {
        expectedVersion: order.version,
        supplierCode: order.supplierCode,
        confirmationReference: `CONF-${DEMO_STAGED_PAYMENT_PO}`,
        confirmedBy: 'Mei Lin',
        notes: 'Фабрика подтвердила объём и сроки по потребности сезона.',
      });
      note('staged payments', `${DEMO_STAGED_PAYMENT_PO} подтверждён фабрикой ${order.supplierCode}`);
    }
  } catch (error) {
    note('staged payments', `${DEMO_STAGED_PAYMENT_PO} не проведён (${error.code ?? error.message})`);
    return;
  }
  if (order.status !== 'confirmed') { note('staged payments', `${DEMO_STAGED_PAYMENT_PO} в состоянии ${order.status}`); return; }

  let execution = (await pool.query('SELECT payload FROM production_executions WHERE production_order_number = $1', [DEMO_STAGED_PAYMENT_PO])).rows[0]?.payload;
  try {
    if (!execution) {
      execution = await runtime.productionExecutions.createFromProductionOrder(command('staged-exec-create'), actorId, DEMO_STAGED_PAYMENT_PO);
    }
    if (execution.status === 'planned') {
      execution = await runtime.productionExecutions.start(command('staged-exec-start'), actorId, execution.executionCode, { expectedVersion: execution.version });
      note('staged payments', `исполнение ${execution.executionCode} запущено`);
    }
  } catch (error) {
    note('staged payments', `исполнение не запущено (${error.code ?? error.message})`);
  }

  const existing = await pool.query('SELECT 1 FROM payment_schedules WHERE production_order_number = $1', [DEMO_STAGED_PAYMENT_PO]);
  if (existing.rowCount) { note('staged payments', 'этапный график уже составлен'); return; }
  try {
    await runtime.supplierPayments.createSchedule(command('staged-payment-schedule'), actorId, DEMO_STAGED_PAYMENT_PO, { split: DEMO_STAGED_PAYMENT_SPLIT });
    note('staged payments', `${DEMO_STAGED_PAYMENT_PO}: график из ${DEMO_STAGED_PAYMENT_SPLIT.length} вех составлен`);
  } catch (error) {
    note('staged payments', `график не составлен (${error.code ?? error.message})`);
  }
}

async function ensurePaymentSchedules(runtime, pool, brandId, actorId) {
  const orders = await pool.query(
    `SELECT production_order.production_order_number AS number
       FROM production_orders AS production_order
       LEFT JOIN payment_schedules AS schedule
         ON schedule.production_order_number = production_order.production_order_number
      WHERE production_order.brand_id = $1
        AND production_order.status = 'confirmed'
        AND schedule.id IS NULL
        -- У заказа из потребности свой, этапный график: общий 30/70 его бы перехватил.
        AND production_order.production_order_number <> $2
      ORDER BY production_order.production_order_number`,
    [brandId, DEMO_STAGED_PAYMENT_PO],
  );
  let drawn = 0;
  for (const row of orders.rows) {
    try {
      await runtime.supplierPayments.createSchedule(command('payment-schedule'), actorId, row.number, { split: DEMO_PAYMENT_SPLIT });
      drawn += 1;
    } catch (error) {
      note('payments', `${row.number} skipped (${error.code ?? error.message})`);
    }
  }
  note('payments', drawn > 0 ? `${drawn} графиков платежей составлено` : 'графики платежей уже составлены');

  // Платим то, что действительно наступило, и ничего сверх.
  const schedules = await runtime.supplierPayments.paymentSchedulesForActor(actorId);
  let paid = 0;
  for (const listed of schedules) {
    // График перечитывается перед каждой оплатой: каждая поднимает его версию, и вторая оплата по
    // снимку падала бы конфликтом версий. На графике из двух вех это не проявлялось — наступившая
    // веха там бывала одна, — и всплыло ровно тогда, когда вех стало четыре.
    for (const listedMilestone of listed.milestones) {
      if (listedMilestone.triggerEvent === 'shipment-released') continue;
      const schedule = await runtime.supplierPayments.paymentScheduleForActor(actorId, listed.productionOrderNumber);
      const milestone = schedule.milestones.find((candidate) => candidate.sequence === listedMilestone.sequence);
      if (!milestone || (milestone.status !== 'due' && milestone.status !== 'overdue')) continue;
      // Остаток оставляем неоплаченным там, где он только что наступил: демонстрация должна
      // показывать и «оплачено», и «причитается», иначе экран рассказывает только одну половину.
      try {
        await runtime.supplierPayments.recordPayment(command('payment-pay'), actorId, schedule.productionOrderNumber, {
          expectedVersion: schedule.version, sequence: milestone.sequence,
          reference: `PP-${schedule.productionOrderNumber}-${milestone.sequence}`,
        });
        paid += 1;
      } catch (error) {
        note('payments', `${schedule.productionOrderNumber}/${milestone.sequence} not paid (${error.code ?? error.message})`);
      }
    }
  }
  if (paid > 0) note('payments', `${paid} авансов оплачено`);
}

async function releaseQuality(runtime, pool, brandId, approvers) {
  const pending = await pool.query(
    `SELECT payload ->> 'inspectionCode' AS code, version, payload
       FROM quality_inspections
      WHERE brand_id = $1 AND status = 'review-pending'
      ORDER BY payload ->> 'inspectionCode'`,
    [brandId],
  );
  if (!pending.rowCount) { note('quality', 'nothing awaiting a decision'); return; }
  for (const row of pending.rows) {
    const run = (row.payload.runs ?? []).at(-1);
    // The disposition cannot be more lenient than the run recommended, so the seed follows the run
    // rather than releasing everything: a demonstration where every batch passes shows nothing.
    // The run computes a recommendation — pass, rework or reject — and the decision may be stricter
    // than it but never more lenient. The seed follows the run rather than releasing on principle.
    const decision = { pass: 'release', rework: 'rework', reject: 'reject' }[run?.recommendation] ?? 'reject';
    // Who may sign this one. The person who ran the inspection and the person who completed it are
    // both excluded, so the approver is chosen per inspection rather than fixed in advance — with a
    // fixed approver, an ordinary division of the work leaves the lot undecidable.
    const approverId = approvers.find((candidate) => candidate !== run?.inspectorId && candidate !== run?.completedBy);
    if (!approverId) { note('quality', `${row.code} has no eligible approver in the brand`); continue; }
    try {
      await runtime.finalQuality.review(command('quality-review'), approverId, row.code, {
        expectedVersion: row.version,
        decision,
        ...(decision === 'release' ? { releaseCode: `REL-${row.code}`.slice(0, 64) } : {}),
        notes: decision === 'release'
          ? 'Партия принята: отклонений от согласованных допусков нет.'
          : 'Партия отправлена на доработку по результатам инспекции.',
      });
      note('quality', `${row.code} → ${decision}`);
    } catch (error) {
      note('quality', `${row.code} left as is (${error.code ?? error.message})`);
    }
  }
}

// Неизменяемая запись заводится один раз. Если она уже есть — берётся та, что есть.
// Политика разнесения затрат бренда. Прямые затраты ложатся на строку, к которой относятся;
// перевозка и пошлина — по стоимости строки, потому что дорогая строка занимает больше денег в
// партии, а не больше места в коробке.
// Потребность → запрос цен → размещение → производственный заказ.
//
// Снимки потребности стояли пустыми, и из-за этого **проверка происхождения производственного
// заказа не выполнялась ни разу**. Она написана как «либо унаследованный заказ первой версии, у
// которого происхождения нет, либо заказ второй версии — и тогда обязаны быть снимок потребности,
// номер строки, хеш содержимого и ProductSku». Пока все девять заказов оставались первой версии,
// вторая ветвь не проверялась никогда: проверка была и была выключена.
//
// Теперь по демонстрации проходит заказ второй версии, и ветвь исполняется по-настоящему. **Первая
// версия при этом остаётся законной**: бренд шьёт и без подтверждённого оптового заказа — на склад,
// на образцы, на допоставку, — и запрещать это значило бы запретить половину работы отрасли.
// Разница в том, что теперь видно, какой заказ вырос из чужого обязательства, а какой — из решения
// бренда.
// Палитра сезона: цвета, которыми сезону разрешено рисовать.
//
// Таблица была заведена и осталась пустой — ни одной строки кода во всём репозитории, — то есть
// вопрос «что вообще в этом сезоне» задать было некому. Палитра собирается из тех же
// governed-записей справочника цветов, которыми уже покрашено полотно: сезон и склад говорят об
// одном цвете одним идентификатором, а не двумя похожими строками.
async function ensureProductAttributes(runtime, pool, accounts) {
  const existing = await pool.query("SELECT count(*)::int AS total FROM product_attribute_values WHERE owner_type = 'style_version'");
  const versions = (await pool.query(
    `SELECT version.id, style.style_code
       FROM product_style_versions version
       JOIN product_styles style ON style.id = version.style_id
      ORDER BY style.style_code`,
  )).rows;
  if (!versions.length) { note('attributes', 'нет версий моделей — атрибуты не к чему привязать'); return; }

  let written = 0;
  let skipped = 0;
  for (const version of versions) {
    const family = Object.keys(DEMO_STYLE_ATTRIBUTES).find((prefix) => String(version.style_code).startsWith(prefix));
    if (!family) continue;
    for (const [attributeCode, value] of DEMO_STYLE_ATTRIBUTES[family]) {
      const already = await pool.query(
        `SELECT 1 FROM product_attribute_values WHERE owner_type = 'style_version' AND owner_id = $1 AND attribute_code = $2`,
        [version.id, attributeCode],
      );
      if (already.rowCount) { skipped += 1; continue; }
      try {
        await runtime.productIdentity.createAttributeValue(
          command(`attribute-${version.id}-${attributeCode}`),
          accounts.owner,
          { ownerType: 'style_version', ownerId: version.id, attributeCode, attributeCatalogVersion: '1.0.0', value },
        );
        written += 1;
      } catch (error) {
        note('attributes', `${version.style_code} / ${attributeCode} пропущен (${error.code ?? error.message})`);
      }
    }
  }
  if (!written) { note('attributes', `значения уже заведены (${existing.rows[0].total} строк)`); return; }
  note('attributes', `заведено ${written} значений атрибутов, ${skipped} уже были`);
}

async function ensureSeasonPalette(runtime, pool, accounts) {
  const campaign = (await pool.query(
    "SELECT id FROM campaigns WHERE payload ->> 'name' LIKE '%DEMO%' ORDER BY id LIMIT 1",
  )).rows[0];
  if (!campaign) { note('season palette', 'нет кампании — палитру не к чему привязать'); return; }

  const existing = await pool.query('SELECT count(*)::int AS total FROM season_colour_palettes WHERE campaign_id = $1', [campaign.id]);
  if (existing.rows[0].total > 0) { note('season palette', `в палитре уже ${existing.rows[0].total} цвет(а)`); return; }

  // Берутся ровно те цвета, которыми покрашено полотно бренда: палитра сезона, не совпадающая с
  // тем, что есть на складе, — это пожелание, а не решение.
  const colours = (await pool.query(
    `SELECT DISTINCT colour_code FROM material_colours WHERE status = 'active' ORDER BY colour_code`,
  )).rows.map((row) => row.colour_code);
  if (!colours.length) { note('season palette', 'у полотна нет цветов — палитру не из чего собрать'); return; }

  let position = 0;
  for (const colourCode of colours) {
    position += 1;
    try {
      await runtime.seasonPalette.addColourToSeason(command(`season-palette-${position}`), accounts.owner, campaign.id, { colourCode, position });
    } catch (error) {
      note('season palette', `${colourCode} пропущен (${error.code ?? error.message})`);
    }
  }
  note('season palette', `палитра сезона: ${colours.join(', ')}`);
}

async function ensureApprovedDemandChain(runtime, pool, accounts) {
  const existing = await pool.query('SELECT production_order_number FROM production_orders WHERE lineage_version = 2 LIMIT 1');
  if (existing.rowCount) { note('approved demand', `${existing.rows[0].production_order_number} уже вырос из потребности`); return; }

  const commitment = (await pool.query(
    `SELECT supply.id, supply.order_id
       FROM supply_commitment_snapshots AS supply
       JOIN order_commit_snapshots AS commit ON commit.id = supply.order_commit_snapshot_id
      ORDER BY (commit.payload ->> 'totalAmount')::numeric DESC LIMIT 1`,
  )).rows[0];
  if (!commitment) { note('approved demand', 'нет обязательств поставки — потребности не из чего вывести'); return; }

  const supplier = (await pool.query("SELECT supplier_code FROM suppliers WHERE status = 'qualified' ORDER BY supplier_code LIMIT 1")).rows[0];
  if (!supplier) { note('approved demand', 'нет квалифицированного поставщика — запрос цен некому послать'); return; }

  const requirement = await runtime.productionRequirements.createFromSupplyCommitment(
    command('production-requirement'), accounts.owner, commitment.order_id, commitment.id,
  );
  note('approved demand', `потребность выведена из обязательства поставки: ${requirement.lines.length} строк(и)`);

  const rfqCode = 'RFQ-DEMAND-001';
  let rfq = await runtime.sourcing.createRfqFromProductionRequirement(command('demand-rfq'), accounts.owner, {
    productionRequirementSnapshotId: requirement.id,
    orderLineNo: requirement.lines[0].orderLineNo,
    rfqCode,
    responseDueAt: '2026-10-10',
    deliveryDueAt: '2026-11-30',
    incoterm: 'FOB',
    supplierCodes: [supplier.supplier_code],
    notes: 'Потребность из подтверждённого оптового заказа',
  });
  rfq = await runtime.sourcing.issueRfq(command('demand-issue'), accounts.owner, rfqCode, { expectedVersion: rfq.version });
  rfq = await runtime.sourcing.upsertQuote(command('demand-quote'), accounts.owner, rfqCode, {
    expectedVersion: rfq.version, supplierCode: supplier.supplier_code,
    unitPriceMinor: 980, fixedCostMinor: 25_000, leadTimeDays: 45, minimumOrderQuantity: 100, validUntil: '2026-11-01',
  });
  rfq = await runtime.sourcing.awardRfq(command('demand-award'), accounts.owner, rfqCode, {
    expectedVersion: rfq.version, supplierCode: supplier.supplier_code,
  });
  rfq = await runtime.sourcing.allocateRfq(command('demand-allocate'), accounts.owner, rfqCode, {
    expectedVersion: rfq.version, purchaseOrderNumber: 'PO-DEMAND-001', quantity: requirement.lines[0].quantity,
    productionStartAt: '2026-10-15', deliveryDueAt: '2026-11-30',
  });
  const order = await runtime.productionOrders.createFromAllocation(command('demand-production-order'), accounts.owner, rfqCode);
  note('approved demand', `${order.productionOrderNumber}: заказ второй версии — происхождение из потребности записано и проверено`);
}

async function ensureShipmentChain(runtime, pool, accounts) {
  const commitments = await pool.query(
    `SELECT supply.id AS supply_id, supply.order_id, commit.id AS commit_id,
            (commit.payload -> 'lines' -> 0 ->> 'quantity')::integer AS quantity
       FROM supply_commitment_snapshots AS supply
       JOIN order_commit_snapshots AS commit ON commit.id = supply.order_commit_snapshot_id
      ORDER BY (commit.payload ->> 'totalAmount')::numeric DESC`,
  );
  if (!commitments.rowCount) { note('shipment', 'нет обязательств поставки — отгрузка пропущена'); return; }

  for (const [index, row] of commitments.rows.entries()) {
    const plan = DEMO_SHIPMENTS[index];
    if (!plan) { note('shipment', `${row.order_id}: сценарий отгрузки не описан, пропущено`); continue; }
    if (plan.quantity !== row.quantity) {
      note('shipment', `${row.order_id}: в заказе ${row.quantity} шт., в сценарии ${plan.quantity} — пропущено`);
      continue;
    }

    const shipAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const deliverAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // План и уведомление — бренд.
    const fulfillment = await reuseOrCreate(
      pool, 'SELECT id FROM fulfillment_plan_snapshots WHERE order_commit_snapshot_id = $1 LIMIT 1', [row.commit_id],
      () => runtime.fulfillment.createFulfillmentPlan(command(`fulfillment-${index}`), accounts.owner, row.order_id, {
        supplyCommitmentSnapshotId: row.supply_id,
        shipFrom: { locationId: 'atmosphere-factory', name: 'Atmosphere Textiles', countryCode: 'PT', city: 'Porto', addressLine1: 'Rua da Fábrica 12', addressLine2: null, postalCode: '4000-123' },
        shipTo: { locationId: 'nordhaus-dc', name: 'Nordhaus Retail DC', countryCode: 'DE', city: 'Hamburg', addressLine1: 'Speicherstadt 8', addressLine2: null, postalCode: '20457' },
        plannedShipAt: shipAt,
        expectedDeliveryAt: deliverAt,
      }),
      () => note('shipment', `${row.order_id}: план отгрузки Porto → Hamburg`),
    );

    const planLines = (await pool.query('SELECT payload FROM fulfillment_plan_snapshots WHERE id = $1', [fulfillment.id])).rows[0]?.payload?.lines ?? [];
    if (!planLines.length) { note('shipment', `${row.order_id}: у плана нет строк — уведомление пропущено`); continue; }

    const notice = await reuseOrCreate(
      pool, 'SELECT id FROM shipment_notice_snapshots WHERE fulfillment_plan_snapshot_id = $1 LIMIT 1', [fulfillment.id],
      () => runtime.fulfillment.createShipmentNotice(command(`shipment-${index}`), accounts.owner, fulfillment.id, {
        ...plan.shipment,
        lines: planLines.map((line) => ({ lineId: line.lineId, quantity: line.quantity })),
        shippedAt: shipAt,
        expectedDeliveryAt: deliverAt,
      }),
      () => note('shipment', `${row.order_id}: отгружено ${plan.shipment.shipmentNumber} (${plan.shipment.carrier})`),
    );

    // Приёмку записывает магазин: служба прямо отказывает тому, кто не состоит в принимающей
    // организации, и это правило демонстрация обязана показывать, а не обходить.
    const received = await pool.query('SELECT id FROM receipt_snapshots WHERE shipment_notice_snapshot_id = $1 LIMIT 1', [notice.id]);
    if (received.rowCount) note('shipment', `${row.order_id}: приёмка уже записана`);
    else await runtime.fulfillment.recordReceipt(command(`receipt-${index}`), accounts.buyer, notice.id, {
      receiptReference: plan.receipt.receiptReference,
      receivedBy: plan.receipt.receivedBy,
      receiptComplete: true,
      lines: planLines.map((line) => ({
        lineId: line.lineId,
        receivedQuantity: plan.receipt.received,
        damagedQuantity: plan.receipt.damaged,
        rejectedQuantity: plan.receipt.rejected,
      })),
      receivedAt: deliverAt,
    });
    const shortfall = plan.quantity - plan.receipt.received;
    if (!received.rowCount) note('shipment', shortfall === 0
      ? `${row.order_id}: принято ${plan.receipt.received} из ${plan.quantity} — сошлось`
      : `${row.order_id}: принято ${plan.receipt.received} из ${plan.quantity}, повреждено ${plan.receipt.damaged} — расхождение ${shortfall}`);

    const receipt = (await pool.query('SELECT id FROM receipt_snapshots WHERE shipment_notice_snapshot_id = $1 LIMIT 1', [notice.id])).rows[0];
    if (!receipt) continue;

    // Принятое ложится на склад магазина. Приходует тот же, кто принимал: `inventory.manage`.
    // Повреждённое на склад не попадает — на него пишут претензию, а не ставят в продажу.
    const posted = await pool.query('SELECT id FROM inventory_movement_ledger_entries WHERE receipt_snapshot_id = $1 LIMIT 1', [receipt.id]);
    if (!posted.rowCount) {
      await runtime.inventory.postReceipt(command(`inventory-${index}`), accounts.buyer, receipt.id);
      note('shipment', `${row.order_id}: принятое оприходовано на склад`);
    }

    if (plan.receipt.damaged === 0 && plan.receipt.rejected === 0) continue;

    // Претензию подаёт магазин, решает бренд. Это две стороны одного разговора, и служба не
    // позволит одной из них сыграть за обе: подать может только принимающая организация,
    // решить — только та, что отгрузила.
    const discrepancy = (await pool.query('SELECT id FROM receipt_discrepancy_snapshots WHERE shipment_notice_snapshot_id = $1 ORDER BY created_at DESC LIMIT 1', [notice.id])).rows[0];
    if (!discrepancy) continue;
    const claimed = await pool.query('SELECT id, payload FROM receipt_discrepancy_claim_snapshots WHERE receipt_discrepancy_snapshot_id = $1 LIMIT 1', [discrepancy.id]);
    if (claimed.rowCount) { note('shipment', `${row.order_id}: претензия уже подана`); continue; }
    const claim = await runtime.receiptClaims.submitClaim(command(`claim-${index}`), accounts.buyer, discrepancy.id, {
      claimReference: `CLM-NORD-2026-${String(index + 1).padStart(3, '0')}`,
      reason: `Повреждено при перевозке: ${plan.receipt.damaged} шт. из ${plan.quantity}`,
      requestedRemedy: 'credit',
    });
    note('shipment', `${row.order_id}: магазин подал претензию ${claim.claimReference} (возмещение)`);

    await runtime.receiptClaims.resolveClaim(command(`claim-resolve-${index}`), accounts.owner, claim.id, {
      resolutionType: 'accepted-for-credit',
      resolutionReason: 'Повреждение подтверждено фотографиями приёмки; кредит-нота на повреждённые единицы',
    });
    note('shipment', `${row.order_id}: бренд принял претензию к возмещению`);
  }
}

async function ensureAllocationPolicy(runtime, pool, brandId, actorId) {
  const existing = await pool.query('SELECT id FROM cost_allocation_policy_versions WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1', [brandId]);
  if (existing.rowCount) return { id: existing.rows[0].id };
  const policy = await runtime.costAllocation.createPolicyVersion(command('allocation-policy'), actorId, brandId, {
    name: 'Демонстрационная политика разнесения',
    version: 1,
    defaultBasis: 'net_value',
    rules: [
      { costType: 'factory', basis: 'unit' },
      { costType: 'freight', basis: 'net_value' },
      { costType: 'duty', basis: 'net_value' },
    ],
  });
  note('money', `политика разнесения затрат заведена (${policy.defaultBasis} по умолчанию)`);
  return policy;
}

async function reuseOrCreate(pool, sql, parameters, create, announce) {
  const existing = await pool.query(sql, parameters);
  if (existing.rowCount) return { id: existing.rows[0].id };
  const created = await create();
  announce?.(created);
  return created;
}

async function ensureMoneyChain(runtime, pool, accounts) {
  const commits = await pool.query(
    `SELECT id, order_id, brand_id, (payload ->> 'totalAmount')::numeric AS total, payload ->> 'currency' AS currency,
            payload -> 'lines' -> 0 ->> 'sku' AS sku,
            (payload -> 'lines' -> 0 ->> 'quantity')::integer AS quantity
       FROM order_commit_snapshots
      ORDER BY (payload ->> 'totalAmount')::numeric DESC`,
  );
  if (!commits.rowCount) { note('money', 'ни одного подтверждённого заказа — цепочка затрат пропущена'); return; }

  for (const [index, commit] of commits.rows.entries()) {
    const plan = DEMO_MONEY_CHAIN[index];
    if (!plan) { note('money', `${commit.order_id}: сценарий затрат не описан, пропущено`); continue; }
    if (plan.quantity !== commit.quantity) {
      // Числа сценария сочинены под конкретную партию. Если заказ изменился, молча посчитать по
      // старым — значит показать инвестору цифру, которая ни из чего не следует.
      note('money', `${commit.order_id}: в заказе ${commit.quantity} шт., в сценарии ${plan.quantity} — пропущено`);
      continue;
    }

    const existing = await pool.query('SELECT id FROM margin_actualization_snapshots WHERE order_commit_snapshot_id = $1 LIMIT 1', [commit.id]);
    if (existing.rowCount) { note('money', `${commit.order_id}: маржа уже актуализирована`); continue; }

    // Каждый шаг проверяется отдельно. Записи этого контура неизменяемы: повторная попытка завести
    // второе обязательство поставки на тот же подтверждённый заказ — не повтор, а отказ. Сид,
    // прерванный на середине, обязан дойти оттуда, где остановился, а не начинать заново.

    // Обязуется поставить — владелец: `supply.manage` есть у него и у продаж, но не у финансов.
    const supply = await reuseOrCreate(
      pool, 'SELECT id FROM supply_commitment_snapshots WHERE order_commit_snapshot_id = $1 LIMIT 1', [commit.id],
      () => runtime.orderEconomics.createSupplyCommitment(
        command(`supply-${index}`), accounts.owner, commit.order_id,
        { allocations: [{ sku: commit.sku, quantity: commit.quantity, ...plan.source, expectedAvailabilityAt: null }] },
      ),
      (created) => note('money', `${commit.order_id}: обязательство поставки ${commit.quantity} шт. из «${plan.source.sourceType}»`),
    );

    // Курс и затраты ведут финансы: `cost.manage` есть у них и у владельца, но не у продаж.
    const fx = await reuseOrCreate(
      pool, 'SELECT id FROM order_fx_rate_snapshots WHERE order_commit_snapshot_id = $1 LIMIT 1', [commit.id],
      () => runtime.orderEconomics.createFxRateSnapshot(
        command(`fx-${index}`), accounts.finance, commit.order_id,
        { ...plan.fx, effectiveAt: new Date().toISOString() },
      ),
      () => note('money', `${commit.order_id}: курс ${plan.fx.sourceCurrency}/${commit.currency} = ${plan.fx.rate} (${plan.fx.rateType})`),
    );

    let recorded = 0;
    for (const [position, cost] of plan.costs.entries()) {
      const already = await pool.query(
        'SELECT id FROM actual_cost_ledger_entries WHERE order_commit_snapshot_id = $1 AND source_ref = $2 AND cost_type = $3 LIMIT 1',
        [commit.id, cost.sourceRef, cost.costType],
      );
      if (already.rowCount) continue;
      await runtime.orderEconomics.recordActualCost(
        command(`cost-${index}-${position}`), accounts.finance, commit.order_id,
        {
          supplyCommitmentSnapshotId: supply.id,
          costType: cost.costType,
          amount: cost.amount,
          currency: cost.currency,
          // Курс прикладывается только к затрате в чужой валюте: у затраты в валюте заказа его
          // быть не должно, и правило это прямо запрещает.
          fxRateSnapshotId: cost.crossCurrency ? fx.id : null,
          sourceRef: cost.sourceRef,
          occurredAt: new Date().toISOString(),
        },
      );
      recorded += 1;
    }
    note('money', `${commit.order_id}: ${recorded} новых строк(и) фактических затрат из ${plan.costs.length}`);

    const landed = await reuseOrCreate(
      pool, 'SELECT id FROM landed_cost_snapshots WHERE order_commit_snapshot_id = $1 LIMIT 1', [commit.id],
      () => runtime.orderEconomics.actualizeLandedCost(command(`landed-${index}`), accounts.finance, commit.order_id),
      () => note('money', `${commit.order_id}: landed cost сведён`),
    );
    // Канонический заказ обязан нести распределение затрат по строкам: иначе маржа знает итог и не
    // знает, какая строка его принесла, — а вопрос «что именно убыточно» и есть смысл этого экрана.
    const policy = await ensureAllocationPolicy(runtime, pool, commit.brand_id, accounts.finance);
    const run = await reuseOrCreate(
      pool, 'SELECT id FROM cost_allocation_run_snapshots WHERE order_commit_snapshot_id = $1 LIMIT 1', [commit.id],
      () => runtime.costAllocation.allocateLandedCost(command(`allocation-${index}`), accounts.finance, commit.order_id, {
        landedCostSnapshotId: landed.id,
        policyVersionId: policy.id,
        customWeightsByCostEntryId: null,
        customLineWeightsByCostEntryId: null,
      }),
      () => note('money', `${commit.order_id}: затраты разнесены по строкам заказа`),
    );

    const margin = await runtime.orderEconomics.actualizeMargin(command(`margin-${index}`), accounts.finance, commit.order_id, landed.id, run.id);
    const verdict = margin.contributionMarginAmount >= 0 ? 'прибыль' : 'убыток';
    note('money', `${commit.order_id}: выручка ${margin.netRevenue} ${commit.currency}, landed ${margin.landedCost}, маржа ${margin.contributionMarginAmount} (${margin.contributionMarginPercent} %) — ${verdict}`);
  }
}

async function ensurePortalAccess(runtime, pool, brandId, ownerId) {
  const supplier = await pool.query("SELECT supplier_code FROM suppliers WHERE brand_id = $1 AND status = 'qualified' ORDER BY supplier_code LIMIT 1", [brandId]);
  if (!supplier.rowCount) { note('portal access', 'no qualified supplier to invite'); return; }
  const code = supplier.rows[0].supplier_code;
  const existing = await pool.query("SELECT status FROM supplier_portal_grants WHERE supplier_code = $1 AND invited_email = $2", [code, PEOPLE.supplier.email]);
  if (existing.rowCount && existing.rows[0].status === 'active') { note('portal access', `${PEOPLE.supplier.email} already reads ${code}`); return; }
  await runtime.sourcing.grantPortalAccess(command('portal'), ownerId, code, { email: PEOPLE.supplier.email, contactName: PEOPLE.supplier.name });
  note('portal access', `${PEOPLE.supplier.email} invited to ${code}`);
}
