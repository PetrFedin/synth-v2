import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { PRODUCT_MEDIA_ROLES } from '../src/modules/product-identity/public.mjs';
import { MATERIAL_UNITS } from '../src/modules/materials/public.mjs';

const root = process.cwd();

// Форма, предлагающая значение, которое сервер отвергает, — это не опечатка, а обещание, которого
// система не держит: человек выбирает вариант из списка и получает отказ. Найдено живьём на роли
// изображения: из четырёх предложенных вариантов два (`sketch`, `flat`) в домене не существовали
// вовсе и всегда отвечали PRODUCT_MEDIA_ROLE_INVALID.

function optionsOf(source, fieldName) {
  const call = source.match(new RegExp(`select\\('${fieldName}',\\s*\\[([\\s\\S]*?)\\]\\)\\)`));
  assert.ok(call, `select('${fieldName}', …) not found`);
  return [...call[1].matchAll(/\['([a-z_]+)',/g)].map(([, value]) => value);
}

test('the image role select offers only roles the domain accepts', async () => {
  const styles = await readFile(path.join(root, 'public/modules/styles.js'), 'utf8');
  const offered = optionsOf(styles, 'mediaRole');
  assert.ok(offered.length >= 3, 'the form must still offer a choice');
  for (const role of offered) {
    assert.ok(PRODUCT_MEDIA_ROLES.includes(role), `the form offers ${role}, which the domain rejects`);
  }
  // Форма добавляет изображение и сама посылает mediaType: 'image', поэтому роли неизображений
  // предлагать нельзя — иначе выбор снова будет обещанием, которого система не держит.
  for (const role of ['video', 'document']) {
    assert.ok(!offered.includes(role), `${role} is not an image role and must not be offered here`);
  }
  assert.match(styles, /mediaType: 'image'/);
});

test('the material unit select offers exactly the units the domain accepts', async () => {
  // Здесь список записан иначе — функцией, отдающей {id, name}, — поэтому и читается иначе.
  // Проверка та же: предложенное обязано совпадать с тем, что домен принимает.
  const materials = await readFile(path.join(root, 'public/modules/materials.js'), 'utf8');
  const body = materials.match(/function unitOptions\(\) \{([\s\S]*?)\n  \}/)[1];
  const offered = [...body.matchAll(/\{ id: '([a-z]+)'/g)].map(([, value]) => value);
  assert.deepEqual([...offered].sort(), [...MATERIAL_UNITS].sort());
});
