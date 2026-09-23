import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/dom-1.js', import.meta.url), 'utf8');

// Найдено живьём в форме выдачи материала: в двух полях из трёх серым текстом стояло слово
// «undefined». Причина — в конструкторе узлов: `title` и `placeholder` ставились раньше общей
// защиты от отсутствующего значения, поэтому `placeholder: undefined` записывался как строка.
// Задеты были все поля всех форм, у которых подсказка не задана, а это большинство.

function dom() {
  const nodes = [];
  const sandbox = {
    Object, String, Number, Array, Boolean, JSON, Math, Date, Intl, Map, Set,
    I18N: { translate: (value) => value, t: (key) => key, getLocale: () => 'ru', formatNumber: (v) => String(v) },
    document: {
      createElement(tag) {
        const node = {
          tag, attributes: {}, children: [], textContent: '',
          setAttribute(name, value) { this.attributes[name] = value; },
          append() {}, addEventListener() {},
        };
        nodes.push(node);
        return node;
      },
      querySelector: () => null,
    },
    state: { workspace: {} },
    window: null,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInContext(source, vm.createContext(sandbox));
  return sandbox;
}

test('a field with no placeholder gets no placeholder attribute', () => {
  const { el } = dom();
  const node = el('input', { type: 'text', placeholder: undefined, title: undefined });
  assert.equal('placeholder' in node.attributes, false, 'an absent placeholder must stay absent');
  assert.equal('title' in node.attributes, false, 'an absent title must stay absent');
  assert.equal(node.attributes.type, 'text');
});

test('a field with a placeholder still gets it, translated', () => {
  const { el } = dom();
  const node = el('input', { placeholder: 'demo-shop-nordhaus', title: 'подсказка' });
  assert.equal(node.attributes.placeholder, 'demo-shop-nordhaus');
  assert.equal(node.attributes.title, 'подсказка');
});

test('an empty placeholder is a choice and is kept', () => {
  // Пустая строка — это сказанное «подсказки нет», и подменять её отсутствием атрибута незачем.
  const { el } = dom();
  const node = el('input', { placeholder: '' });
  assert.equal(node.attributes.placeholder, '');
});

test('null is treated like absence, not like the word null', () => {
  const { el } = dom();
  const node = el('input', { placeholder: null, title: null });
  assert.equal('placeholder' in node.attributes, false);
  assert.equal('title' in node.attributes, false);
});
