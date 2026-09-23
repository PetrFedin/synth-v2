(function initializeUiValidation(global) {
  'use strict';

  // Отказ формы — то, что человек читает чаще всего остального: он ошибается в поле каждый день, а
  // отчёт открывает раз в неделю. Сообщения здесь были только английские, и русский пользователь,
  // перепутав даты кампании, получал в диалоге «Campaign dates: start must be before end».
  // Проверено живьём: именно так это и выглядело.
  //
  // Таблица фраз приложения (`i18n-v7.js`) такие сообщения подхватить не может: она ищет точное
  // совпадение, а эти строки собираются во время выполнения с подстановкой чисел. Поэтому язык
  // выбирается здесь — модуль, который владеет сообщением, его и переводит, ровно как денежный
  // форматтер владеет своим форматом.
  function locale() {
    try { return global.SynthaI18n?.getLocale?.() === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
  }
  function phrase(ru, en) { return locale() === 'en' ? en : ru; }

  // Подпись поля приходит от вызывающего **той же строкой, которой подписано само поле**, и
  // прогоняется через слой фраз: тогда название переводится один раз и одинаково в форме и в
  // отказе, а не живёт двумя копиями, которые расходятся.
  function fieldLabel(label) {
    const value = String(label ?? '').trim();
    if (!value) return '';
    try { return global.SynthaI18n?.translate?.(value) ?? value; } catch { return value; }
  }

  // Подпись необязательна. Там, где сообщение однозначно и без неё — диапазон дат в форме, где он
  // один, — она только мешает: «Начало: начало должно быть раньше окончания» читается хуже, чем
  // «Начало должно быть раньше окончания».
  function prefixed(label, message) {
    const name = fieldLabel(label);
    return name ? `${name}: ${message}` : `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
  }

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function requiredText(value, label, { minLength = 2, maxLength = 160 } = {}) {
    const normalized = String(value ?? '').trim();
    if (normalized.length < minLength) fail('FIELD_TOO_SHORT', prefixed(label, phrase(`минимум ${minLength} символа`, `minimum ${minLength} characters`)));
    if (normalized.length > maxLength) fail('FIELD_TOO_LONG', prefixed(label, phrase(`максимум ${maxLength} символов`, `maximum ${maxLength} characters`)));
    return normalized;
  }

  function dateRange(start, end, label = '') {
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) fail('DATE_REQUIRED', prefixed(label, phrase('нужны обе даты', 'both dates are required')));
    if (startTime >= endTime) fail('DATE_RANGE_INVALID', prefixed(label, phrase('начало должно быть раньше окончания', 'start must be before end')));
    return Object.freeze({ start, end });
  }

  function futureDate(value, now = new Date().toISOString(), label = '') {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= Date.parse(now)) fail('FUTURE_DATE_REQUIRED', prefixed(label, phrase('дата должна быть в будущем', 'date must be in the future')));
    return value;
  }

  function currency(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) fail('CURRENCY_INVALID', phrase('Валюта — трёхбуквенный код ISO, например EUR или RUB', 'Currency must be a three-letter ISO code, for example EUR or RUB'));
    return normalized;
  }

  function sku(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(normalized)) fail('SKU_INVALID', phrase('SKU — от 2 до 64 знаков: заглавные латинские буквы, цифры, точка, подчёркивание или дефис', 'SKU must contain 2-64 uppercase letters, numbers, dots, underscores or dashes'));
    return normalized;
  }

  function number(value, label, { integer = false, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) fail('NUMBER_INVALID', prefixed(label, phrase('введите число', 'enter a valid number')));
    if (integer && !Number.isInteger(normalized)) fail('INTEGER_REQUIRED', prefixed(label, phrase('введите целое число', 'enter a whole number')));
    if (normalized < min || normalized > max) fail('NUMBER_RANGE_INVALID', prefixed(label, phrase(`допустимо от ${min} до ${max}`, `allowed range is ${min} to ${max}`)));
    return normalized;
  }

  function different(value, forbiddenValue, label) {
    if (String(value).trim() === String(forbiddenValue).trim()) fail('VALUES_MUST_DIFFER', prefixed(label, phrase('значения должны различаться', 'values must differ')));
    return value;
  }

  global.SynthaUiValidation = Object.freeze({ requiredText, dateRange, futureDate, currency, sku, number, different });
})(window);
