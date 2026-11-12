import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fades elements with the `reveal` class in as they scroll into view (and any added later). */
export function useReveal() {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = document.documentElement;
    if (!('IntersectionObserver' in window) || reduced()) { root.classList.add('no-reveal'); return undefined; }
    root.classList.remove('no-reveal');
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    let raf = 0;
    const scan = () => { raf = 0; document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el)); };
    scan();
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [pathname]);
}

/** Scroll position helpers for the header, progress bar and back-to-top button. */
export function useScrollState() {
  const [s, setS] = useState({ y: 0, progress: 0 });
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - innerHeight;
        setS({ y: scrollY, progress: max > 0 ? Math.min(1, scrollY / max) : 0 });
      });
    };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return s;
}

/** Number that counts up once when it scrolls into view. */
export function CountUp({ to, prefix = '', suffix = '', duration = 1100 }) {
  const ref = useRef(null);
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !('IntersectionObserver' in window)) { setV(to); return undefined; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [to, duration]);
  return <span ref={ref}>{prefix}{v.toLocaleString('en-IN')}{suffix}</span>;
}
