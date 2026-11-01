import React, { useEffect, useRef } from 'react';

// three.js 按需加载，只有学员首页会拉取场景代码；WebGL 不可用时退回 CSS 渐变
export default function HeroCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    let scene = null;
    let cancelled = false;
    import('./hero-scene').then(({ createHeroScene }) => {
      if (!cancelled && ref.current) scene = createHeroScene(ref.current);
    }).catch(() => {});
    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, []);

  return <div className="hero-canvas" ref={ref} aria-hidden="true" />;
}
