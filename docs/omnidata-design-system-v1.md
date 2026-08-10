# Omnidata Design System v1

Omnidata Design System v1 (ODS v1) is the visual and interaction contract for every Syntha workspace. Planning, BOM, Measurements, Samples, Sourcing, Tech Packs, Production Orders, Production Executions, Final Quality and future modules must inherit the same typography, controls, tables, surfaces, spacing and bilingual behaviour.

## Source of truth

- `public/omnidata-v14-role-system.css` — canonical design tokens and role/part styling.
- `public/modules/omnidata-v14-role-system.js` — semantic role mapping, structural parts, bilingual normalisation and runtime audit.
- `public/modules/omnidata-v14-components.js` — semantic component classification.
- `public/modules/omnidata-v14-module-adapters.js` and `public/omnidata-v14-module-adapters.css` — shared migration adapters/primitives for legacy markup.
- `/omnidata-v14-role-system.css?v=visual-20260806-14-role-system-1` remains the final stylesheet; `/ui/omnidata-v14-role-system.js?v=visual-20260806-14-role-system-1` remains the final design-system runtime before DOM normalisation and `app-start.js`.

The legacy `v14` public names are compatibility URLs. Runtime identity is `omnidata-design-system-v1`, version `1.0.0`.

## Canonical roles and tokens

ODS exposes exactly seven visual roles: `table`, `filterbar`, `card`, `status`, `inspector`, `button`, `field`. Structural meaning is expressed with `data-ods-part` for page headers, table wrappers, toolbars, tabs, pagination, cards, surfaces, forms, metrics, master-detail layouts, lists, definition grids, timelines, progress, alerts and toasts.

All shared visual values come from `--ods-*` custom properties: typography, colour, spacing, control/row heights, radii, layout widths and elevation. `--odr-*` variables are compatibility aliases and must not become a second token system.

## Module integration rule

A workspace owns business logic, data fetching and semantic structure. It does not own a visual dialect. New or migrated modules should emit explicit `data-ods-role` / `data-ods-part` where possible; legacy classes may be adapted temporarily by the shared ODS runtime.

No new workspace stylesheet may be added to the shell. Loaded UI runtimes must not use `element.style`, `setAttribute('style', ...)`, dynamically created `<style>` nodes, `CSSStyleSheet`, `adoptedStyleSheets` or `insertRule()`.

`validate:ods-boundaries` now enforces a 21-entry legacy visual-debt baseline, reduced from the previous 22-entry baseline after retiring `samples.css`. With Samples, Final Quality, Production Orders, Production Executions and Tech Packs ODS-native, only **18 of the current 21** legacy-debt entries remain loaded. The debt count must only move down.

The HTML shell still carries frozen compatibility layers such as `omnidata-v12.css?v=visual-20260804-12`; their presence is therefore detectable by a source grep. They are not the final visual contract: ODS v1 loads after the legacy layers and remains authoritative. Compatibility layers are removed only when their semantic coverage has been migrated and guarded, so that visual cleanup does not silently break operational workspaces.

## Shared shell and list-item geometry

The application shell now follows the same restrained Omnidata direction as the workspace primitives: charcoal navigation, light content surfaces, compact typography and orange active-state emphasis. The expanded desktop sidebar is **232 px**, narrows to **208 px** on compact desktop/tablet widths, and only becomes the **68 px** icon rail when the user explicitly collapses it or the viewport is at most 720 px. This fixes the previous 920 px breakpoint where the shell became icon-width while labels remained visible and were therefore clipped.

A one-time shell migration removes the obsolete persisted `syntha-v2-sidebar-collapsed` value and starts the redesigned shell expanded. After that migration, explicit user collapse/expand choices continue to work normally. The runtime exposes `data-ods-shell-layout="readable-v2"` for diagnostics.

Generic business list items now isolate the title block from the status chip with an internal `minmax(0,1fr) max-content` grid. Metadata wraps independently and actions occupy bounded columns/rows. Collections use this shared `entity()` path, so long collection names can no longer physically occupy the status chip's column. The same geometry hardens Campaigns, SKU and other entity-based workspaces instead of introducing a Collections-only patch.

## Shared progress primitive

Readiness/completion is now a reusable ODS primitive rather than a module-level CSS exception. `public/omnidata-v14-module-adapters.css` provides a token-driven native `<progress>` treatment using `--ods-color-border` and `--ods-color-accent`, plus semantic `progress / progress-track / progress-fill` support. A generic six-step compatibility bridge handles legacy step-based progress without naming a Production module.

Planning, Styles, Materials, BOM and Measurements already store readiness as native `progress.max/value`. Production Executions keeps its business runtime intact while its semantic progress fill is interpreted by the same shared primitive.

## Shared dialog/form primitive

Native dialogs and editor forms use one shared geometry instead of workspace-specific modal CSS. `public/omnidata-v14-module-adapters.css` provides the responsive dialog width, two-column form grid, full-width header/action rows and ODS field-group/control sizing. `public/modules/omnidata-v14-components.js` classifies native `form`, `label`, `input`, `select`, `textarea` and buttons into the same form/field/button semantics, so business runtimes do not need to invent another control system.

This primitive is deliberately module-neutral. Tech Packs and Samples both consume it without restoring local modal CSS. Sourcing should reuse the same dialog/form contract during its migration.

## ODS-native workspaces

Samples is ODS-native. The shared module adapter owns its page-header projection, KPI metrics, filters, master-detail geometry, registry/table, inspector, definition grid, cards, empty/error states, dialog/forms and status semantics. Responsive rules keep the registry and inspector from overlapping, the table wrapper owns horizontal overflow, and the inspector stacks below the registry at narrower widths. `samples.css` is neither loaded by `public/index.html` nor served by the standalone static handler.

Samples remains strictly bilingual through the existing business runtime: the active locale controls labels, filters, actions, sync states and dialogs. The adapter itself also supplies RU/EN page-header text. Status colour meaning is locale-independent: existing business state classes are converted by the adapter into generic ODS success/warning/danger semantic hooks before the role system applies visual tones.

Final Quality is ODS-native: header, KPI, master-detail layout, filters, toolbar, table, inspector, status tones and alerts inherit shared ODS parts; `final-quality.css` is not loaded or served.

Production Orders is ODS-native: page header/actions, KPI metrics, filters, create/confirm controls, master-detail layout, table/registry, inspector, facts, cards, statuses, empty states and alerts are mapped by the shared adapter; `production-orders.css` is not loaded or served.

Production Executions is ODS-native. KPI metrics, filters, create/actions, master-detail layout, table/registry, inspector, facts, cards, statuses, timeline/milestones, alerts and progress inherit shared ODS semantics; `production-executions.css` is not loaded or served.

Tech Packs is ODS-native. Page actions, KPI metrics, filters, master-detail layout, registry/table, inspector, immutable dependency facts, readiness surfaces, cards, statuses, empty/error states and native dialog/forms inherit shared ODS semantics; `tech-packs.css` is not loaded or served.

The migration pattern for remaining modules is: establish reusable semantic coverage first, verify behavior, then remove the module stylesheet. Never copy old module selectors into the canonical ODS stylesheet; add/improve a reusable role, part or shared primitive instead. Temporary module selectors belong only in the shared migration adapter and must be removed as business markup becomes natively semantic.

## Bilingual behaviour

Visible UI is strictly Russian or English according to selected locale. New user-facing strings continue through the shared i18n runtime; ODS additionally normalises legacy aliases and audits mixed-language UI. Established domain abbreviations such as PLM, BOM, SKU, POM, MOQ, ATS, RFQ, PO, ERP, WMS, PIM, OMS, QC, QMS and API may remain unchanged. Business data must not be translated by the visual normaliser.

The grouped navigation remains locale-driven through `localText(item.ru, item.en)`. The shell migration changes geometry and styling only; it does not introduce mixed-language labels or a parallel translation layer.

## Runtime diagnostics

Useful audit targets include `document.documentElement.dataset.odsName`, `odsVersion`, `odsLanguageAudit`, `document.querySelector('.shell')?.dataset.odsShellLayout` and `window.SynthaOmnidataDesignSystemV1`. `SynthaOmnidataV14RoleSystem` remains a compatibility alias.

## Validation

Run `npm run verify`. It includes `validate:design-system` and `validate:ods-boundaries`, checking metadata/load order, tokens, seven roles, semantic parts, bilingual hooks, CSP-safe markup, the decreasing stylesheet boundary, absence of dynamic UI styling, readable shell breakpoints, no-overlap list-item geometry, shared progress/dialog primitives and ODS-native delivery of Samples, Tech Packs, Production Executions, Production Orders and Final Quality.

`tests/samples-ods-native.test.mjs` guards Samples stylesheet retirement, semantic adapter coverage, responsive master-detail geometry and RU/EN content hooks. `tests/ods-shell-collections-layout.test.mjs` guards the one-time sidebar preference migration, expanded/collapsed breakpoints, Omnidata orange navigation state, shared entity/status isolation and the RU/EN Collections navigation path.

Node.js 22 or newer is required.

## Rule for future workspaces

A new workspace is acceptable when its business markup can be added without inventing another font scale, button system, table system, status system, inspector treatment, stylesheet or translation layer. If a new interaction pattern is genuinely reusable, add it to ODS as a shared role/part/component rather than styling one module locally.
