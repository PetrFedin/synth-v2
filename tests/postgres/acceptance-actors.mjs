// Учётные данные приёмочных актёров, которые входят в систему.
//
// Держатся в одном месте, потому что приёмочные наборы идут по **одной** базе, а идентификаторы
// актёров фиксированы: если два набора заведут `syntha-acceptance-shop-owner` с разной почтой,
// второй получит отказ «identity does not match the production reference actor». Раньше это не
// всплывало лишь потому, что владельца магазина заводил ровно один набор, а членство ему выдавалось
// и без учётной записи. Теперь членство обязано называть существующую личность, и заводить её
// должен каждый набор, который её членство создаёт.
export const ACCEPTANCE_BRAND_OWNER = Object.freeze({
  email: 'collection-acceptance@syntha.test',
  password: 'CollectionAcceptanceTest!',
  displayName: 'Syntha Acceptance Brand Owner',
});

export const ACCEPTANCE_SHOP_OWNER = Object.freeze({
  email: 'commercialization-shop@syntha.test',
  password: 'CommercializationShopAcceptanceTest!',
  displayName: 'Syntha Acceptance Shop Owner',
});
