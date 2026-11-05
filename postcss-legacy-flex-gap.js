/**
 * PostCSS 插件：把 flex 容器的 gap 降级成子元素 margin。
 *
 * 背景：精网桌面客户端内嵌的是 Chromium 73，不支持 flex 布局的 gap（Chrome 84+），
 * 直接用 gap 会导致所有 flex 子元素贴在一起（对老年用户尤其不友好）。
 * grid 的 gap 在 Chromium 73 本来就支持，因此只处理 display:flex / inline-flex。
 *
 * 转换后删除原 gap 声明，改用 margin 表现；现代浏览器同样走 margin，视觉一致。
 */
const FLEX_DISPLAYS = new Set(['flex', 'inline-flex']);

export default function legacyFlexGap() {
  return {
    postcssPlugin: 'postcss-legacy-flex-gap',
    OnceExit(root) {
      root.walkRules(rule => {
        const nodes = rule.nodes || [];
        const isFlex = nodes.some(node =>
          node.type === 'decl' && node.prop === 'display' && FLEX_DISPLAYS.has(node.value.trim()));
        if (!isFlex) return;

        const gaps = nodes.filter(node => node.type === 'decl' && ['gap', 'column-gap', 'row-gap'].includes(node.prop));
        if (!gaps.length) return;

        const selector = rule.selector;
        if (!selector || selector.includes('&')) return;

        const margins = [];
        for (const gap of gaps) {
          if (gap.prop === 'gap' || gap.prop === 'column-gap') margins.push(['margin-right', gap.value]);
          if (gap.prop === 'gap' || gap.prop === 'row-gap') margins.push(['margin-bottom', gap.value]);
        }
        gaps.forEach(gap => gap.remove());

        const extra = [];
        for (const [prop, value] of margins) {
          extra.push(`${selector} > *{${prop}:${value}}`);
        }
        // 去掉最后一列的右边距（单行场景最常见）
        extra.push(`${selector} > *:last-child{margin-right:0}`);

        rule.after(extra.join('\n'));
      });
    }
  };
}

legacyFlexGap.postcss = true;
