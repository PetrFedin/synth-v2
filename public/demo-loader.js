(() => {
  'use strict';

  const styles = [
    'styles.css','i18n.css','omnidata.css','industrial-product.css','bom.css','omnidata-v7.css','omnidata-v7-bom.css',
    'measurements.css','measurement-sync.css','sourcing.css','omnidata-v8.css','omnidata-v8-reference.css','omnidata-v9.css',
    'omnidata-v10.css','omnidata-v11.css','omnidata-v12.css','omnidata-v13.css','omnidata-v14.css',
    'omnidata-v14-module-adapters.css','omnidata-v14-extensions.css','omnidata-v14-role-system.css'
  ];

  const modules = [
    'i18n-runtime.js','i18n-v7.js','dom-2.js','dom-1.js','api.js','workspace-pagination.js','notification-pagination.js',
    'ui-capabilities.js','ui-validation.js','app-core.js','overview.js','partners.js','retail-doors.js','catalog.js','showrooms.js',
    'views-2.js','views-3.js','views-4.js','relationship-form.js','campaign-form.js','collection-form.js','catalog-form.js',
    'showroom-form.js','workflow-contexts.js','retail-door-ui-core.js','forms-3.js','open-form.js','planning-core.js','styles-core.js',
    'materials-core.js','bom-core.js','measurement-core.js','sample-core.js','sourcing-core.js','tech-pack-core.js',
    'production-execution-core.js','final-quality-core.js','omnidata-workspace.js','order-lifecycle-actions.js','omnidata-polish.js',
    'omnidata-fidelity.js','omnidata-v5.js','planning.js','styles.js','materials.js','bom.js','omnidata-v7.js',
    'linesheet-matrix-core.js','linesheets.js','buyer-order-handoff.js','omnidata-v7-installed.js','measurements.js',
    'measurement-revision-actions.js','measurement-catalog-sync.js','samples.js','sample-catalog-sync.js','sourcing.js',
    'tech-pack-navigation.js','tech-packs.js','production-orders.js','production-executions.js','final-quality.js',
    'omnidata-v7-language-audit.js','omnidata-v8.js','omnidata-v9.js','omnidata-v10.js','omnidata-v11.js','omnidata-v12.js',
    'omnidata-v13.js','omnidata-v14.js','omnidata-v14-module-adapters.js','omnidata-v14-components.js',
    'omnidata-v14-role-system.js','dom-boolean-props.js','app-start.js'
  ];

  for (const href of styles) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `./${href}`;
    document.head.appendChild(link);
  }

  const fail = (message) => {
    const root = document.getElementById('app');
    if (root) root.textContent = `Не удалось запустить SYNTHA V2: ${message}`;
  };

  const load = (name) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `./modules/${name}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(name));
    document.body.appendChild(script);
  });

  (async () => {
    try {
      for (const name of modules) await load(name);
    } catch (error) {
      fail(error?.message || 'ошибка загрузки модулей');
      console.error(error);
    }
  })();
})();
