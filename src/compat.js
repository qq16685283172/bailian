/**
 * 老内核兼容补丁（必须在 main.jsx 最先引入）。
 *
 * 精网桌面客户端内嵌的是 Chromium 73（Chrome 74 之前），缺失一批 ES2021+ 运行时 API。
 * 只做「存在性检测 + 最小实现」，绝不覆盖浏览器原生实现；全部使用 ES5 写法，
 * 避免本文件自身在老内核里因语法报错而整体失效。
 */
(function () {
  'use strict';

  // Object.hasOwn —— Chrome 93+
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: function hasOwn (object, key) {
        if (object == null) throw new TypeError('Cannot convert undefined or null to object');
        return Object.prototype.hasOwnProperty.call(Object(object), key);
      },
      configurable: true,
      writable: true
    });
  }

  // Array.prototype.at / String.prototype.at —— Chrome 92+
  if (typeof Array.prototype.at !== 'function') {
    Array.prototype.at = function at (index) {
      var list = Object(this);
      var len = list.length >>> 0;
      var pos = index | 0;
      if (pos < 0) pos += len;
      if (pos < 0 || pos >= len) return undefined;
      return list[pos];
    };
  }
  if (typeof String.prototype.at !== 'function') {
    String.prototype.at = function at (index) {
      var text = String(this);
      var len = text.length;
      var pos = index | 0;
      if (pos < 0) pos += len;
      if (pos < 0 || pos >= len) return undefined;
      return text.charAt(pos);
    };
  }
  // Array.prototype.findLast / findLastIndex —— Chrome 97+
  if (typeof Array.prototype.findLast !== 'function') {
    Array.prototype.findLast = function findLast (predicate) {
      var list = Object(this);
      for (var i = list.length - 1; i >= 0; i -= 1) {
        if (predicate(list[i], i, list)) return list[i];
      }
      return undefined;
    };
  }
  if (typeof Array.prototype.findLastIndex !== 'function') {
    Array.prototype.findLastIndex = function findLastIndex (predicate) {
      var list = Object(this);
      for (var i = list.length - 1; i >= 0; i -= 1) {
        if (predicate(list[i], i, list)) return i;
      }
      return -1;
    };
  }

  // String.prototype.replaceAll —— Chrome 85+
  if (typeof String.prototype.replaceAll !== 'function') {
    String.prototype.replaceAll = function replaceAll (search, replacement) {
      var text = String(this);
      if (search instanceof RegExp) {
        var flags = search.flags || '';
        if (flags.indexOf('g') === -1) flags += 'g';
        return text.replace(search, replacement);
      }
      var needle = String(search);
      if (needle === '') return text;
      var out = '';
      var index = 0;
      var found = text.indexOf(needle);
      while (found !== -1) {
        out += text.slice(index, found) + String(replacement);
        index = found + needle.length;
        found = text.indexOf(needle, index);
      }
      return out + text.slice(index);
    };
  }

  // Promise.any —— Chrome 85+
  if (typeof Promise !== 'undefined' && typeof Promise.any !== 'function') {
    Promise.any = function any (iterable) {
      return new Promise(function (resolve, reject) {
        var items = Array.from(iterable);
        var results = [];
        var pending = items.length;
        var errors = [];
        if (!pending) {
          reject(new Error('All promises were rejected'));
          return;
        }
        items.forEach(function (item, index) {
          Promise.resolve(item).then(function (value) {
            results[index] = { status: 'fulfilled', value: value };
            pending -= 1;
            if (!pending) resolve(results);
          }, function (error) {
            errors.push(error);
            pending -= 1;
            if (!pending) reject(new Error('All promises were rejected'));
          });
        });
      });
    };
  }

  // structuredClone —— Chrome 98+（浅拷贝兜底）
  if (typeof globalThis === 'object' && typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = function structuredClone (value) {
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.slice();
      var copy = {};
      for (var key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) copy[key] = value[key];
      }
      return copy;
    };
  }
}());
