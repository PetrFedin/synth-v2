(function installBooleanDomProperties(global) {
  'use strict';

  const baseEl = global.el;
  if (typeof baseEl !== 'function') throw new Error('DOM helper must load before boolean property normalization');

  const BOOLEAN_PROPERTIES = new Set([
    'allowFullscreen',
    'async',
    'autofocus',
    'autoplay',
    'checked',
    'controls',
    'default',
    'defer',
    'disabled',
    'formNoValidate',
    'hidden',
    'inert',
    'loop',
    'multiple',
    'muted',
    'noModule',
    'noValidate',
    'open',
    'playsInline',
    'readOnly',
    'required',
    'reversed',
    'selected',
  ]);

  function createElement(tag, props = {}) {
    const attributes = {};
    const booleanValues = [];

    for (const [key, value] of Object.entries(props)) {
      if (BOOLEAN_PROPERTIES.has(key) && typeof value === 'boolean') booleanValues.push([key, value]);
      else attributes[key] = value;
    }

    const node = baseEl(tag, attributes);
    for (const [key, value] of booleanValues) node[key] = value;
    return node;
  }

  global.el = createElement;
  global.SynthaBooleanDomProperties = Object.freeze({ supported: [...BOOLEAN_PROPERTIES] });
})(window);
