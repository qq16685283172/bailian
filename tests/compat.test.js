import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 精网桌面客户端内嵌 Chromium 73（Chrome 74 之前）。
 * 这组用例守住三件事：
 *   1. 缺失的运行时 API 必须有 polyfill，或干脆不用
 *   2. 构建目标不能被人改回默认值
 *   3. CSS 里的新特性必须带老浏览器能读的回退
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const sourceFiles = () => fs.readdirSync(SRC)
  .filter((name) => /\.(jsx?|css)$/.test(name))
  .filter((name) => name !== 'compat.js')
  .map((name) => ({ name, text: fs.readFileSync(path.join(SRC, name), 'utf8') }));

const sources = sourceFiles();
const codeFiles = sources.filter((file) => /\.jsx?$/.test(file.name));

// compat.js 里已经补过的 API：允许使用
const POLYFILLED = {
  'Object.hasOwn': /if \(typeof Object\.hasOwn !== 'function'\)/,
  'Array.prototype.at': /Array\.prototype\.at/,
  'String.prototype.at': /String\.prototype\.at/,
  'Array.prototype.findLast': /Array\.prototype\.findLast/,
  'Array.prototype.findLastIndex': /Array\.prototype\.findLastIndex/,
  'String.prototype.replaceAll': /String\.prototype\.replaceAll/,
};

// 没有任何 polyfill、在 Chrome 73 上直接报错的 API
const FORBIDDEN = [
  { name: 'structuredClone', pattern: /(?<![\w.])structuredClone\s*\(/ },
  { name: 'crypto.randomUUID', pattern: /crypto\.randomUUID\s*\(/ },
  { name: 'Array.prototype.toSorted', pattern: /\.toSorted\s*\(/ },
  { name: 'Array.prototype.toReversed', pattern: /\.toReversed\s*\(/ },
  { name: 'Element.replaceChildren', pattern: /\.replaceChildren\s*\(/ },
  { name: 'Promise.allSettled', pattern: /Promise\.allSettled\s*\(/ },
  { name: 'Promise.any', pattern: /Promise\.any\s*\(/ },
  { name: 'Object.groupBy', pattern: /Object\.groupBy\s*\(/ },
  { name: 'Array.prototype.findLastIndex 裸用', pattern: /(?<![\w.])[\w$\]\)]+\.findLastIndex\s*\(/ },
];

describe('Chromium 73 运行时 API', () => {
  it('compat.js 仍覆盖所有已声明的 polyfill', () => {
    const compat = fs.readFileSync(path.join(SRC, 'compat.js'), 'utf8');
    for (const [name, pattern] of Object.entries(POLYFILLED)) {
      expect(compat, `${name} 的 polyfill 缺失`).toMatch(pattern);
    }
  });

  it('main.jsx 必须在最前面引入 compat', () => {
    const main = fs.readFileSync(path.join(SRC, 'main.jsx'), 'utf8');
    const imports = main.match(/^import\s+.+$/gm) || [];
    expect(imports[0]).toContain('./compat');
  });

  it('不得使用没有 polyfill 的新 API', () => {
    const offenders = [];
    for (const file of codeFiles) {
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(file.text)) offenders.push(`${file.name}: ${rule.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('构建配置', () => {
  const config = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');

  it('构建目标固定为 chrome73', () => {
    expect(config).toMatch(/target:\s*'chrome73'/);
    expect(config).toMatch(/cssTarget:\s*'chrome73'/);
  });

  it('flex gap 降级插件仍然注册', () => {
    expect(config).toContain('postcss-legacy-flex-gap');
    expect(config).toMatch(/postcss:\s*\{\s*plugins:\s*\[legacyFlexGap\(\)\]/);
  });
});

describe('CSS 老内核回退', () => {
  /** 拆成「选择器块 → 声明列表」，够用即可（不处理嵌套 at-rule 的深层结构） */
  function declarationsOf(css) {
    return css.split('}').map((chunk) => {
      const brace = chunk.lastIndexOf('{');
      const body = brace >= 0 ? chunk.slice(brace + 1) : chunk;
      return body.split(';')
        .map((decl) => decl.trim())
        .filter((decl) => decl.includes(':'))
        .map((decl) => {
          const index = decl.indexOf(':');
          return { prop: decl.slice(0, index).trim().toLowerCase(), value: decl.slice(index + 1).trim() };
        });
    }).filter((list) => list.length);
  }

  /** 同一块里，同一个属性必须有一条更早的、不含 needle 的声明作为回退 */
  function findMissingFallback(list, needle) {
    const missing = [];
    for (const declarations of list) {
      const seen = new Map();
      for (const { prop, value } of declarations) {
        if (value.includes(needle)) {
          const earlier = seen.get(prop) || [];
          if (!earlier.some((previous) => !previous.includes(needle))) missing.push(`${prop}: ${value}`);
        }
        seen.set(prop, [...(seen.get(prop) || []), value]);
      }
    }
    return missing;
  }

  const css = sources.filter((file) => file.name.endsWith('.css'));
  const rules = css.flatMap((file) => declarationsOf(file.text));

  it('dvh 必须带 vh 回退（Chrome 108+ 才支持 dvh）', () => {
    expect(findMissingFallback(rules, 'dvh')).toEqual([]);
  });

  it('clamp() 必须带普通数值回退（Chrome 79+ 才支持）', () => {
    expect(findMissingFallback(rules, 'clamp(')).toEqual([]);
  });

  it('backdrop-filter 必须带 -webkit- 前缀', () => {
    const offenders = [];
    for (const declarations of rules) {
      const props = declarations.map((decl) => decl.prop);
      if (props.includes('backdrop-filter') && !props.includes('-webkit-backdrop-filter')) offenders.push('backdrop-filter');
    }
    expect(offenders).toEqual([]);
  });
});
