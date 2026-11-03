import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCurrency } from './api.js';
import { Icon } from '../components/Icon.jsx';

/* ------------------------------------------------------------- config */
const ConfigCtx = createContext({ store_name: 'PrepPath E-books Store' });
export const useConfig = () => useContext(ConfigCtx);

/* --------------------------------------------------------------- auth */
const AuthCtx = createContext({ user: null, loading: true, signIn: async () => {}, login: async () => {}, register: async () => {}, signOut: async () => {}, setUser: () => {}, reload: async () => {} });
export const useAuth = () => useContext(AuthCtx);

/* -------------------------------------------------------------- toast */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

/* --------------------------------------------------------------- cart */
const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

const KEY = 'preppath_cart_v1';
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};

export function Providers({ children }) {
  const [config, setConfig] = useState({ store_name: 'PrepPath E-books Store' });
  const [toasts, setToasts] = useState([]);
  const [items, setItems] = useState(load);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => { api('/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setAuthLoading(false)); }, []);
  const auth = useMemo(() => ({
    user, loading: authLoading, setUser,
    reload: async () => { const r = await api('/auth/me'); setUser(r.user); return r.user; },
    login: async (email, password) => { const r = await api('/auth/login', { method: 'POST', body: { email, password } }); setUser(r.user); return r.user; },
    register: async (name, email, password) => { const r = await api('/auth/register', { method: 'POST', body: { name, email, password } }); setUser(r.user); return r; },
    signIn: async (credential) => { const r = await api('/auth/google', { method: 'POST', body: { credential } }); setUser(r.user); return r.user; },
    signOut: async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); },
  }), [user, authLoading]);

  useEffect(() => {
    api('/config').then((c) => { setCurrency(c.currency); setConfig(c); document.title = `${c.store_name}`; }).catch(() => {});
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  }, [items]);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const cart = useMemo(() => ({
    items,
    count: items.length,
    has: (id) => items.some((i) => i.id === id),
    add: (b) => setItems((cur) => (cur.some((i) => i.id === b.id) ? cur : [...cur, { id: b.id, slug: b.slug, title: b.title, author: b.author, subtitle: b.subtitle, category: b.category, price_cents: b.price_cents, compare_cents: b.compare_cents, color_a: b.color_a, color_b: b.color_b, has_cover: b.has_cover }])),
    remove: (id) => setItems((cur) => cur.filter((i) => i.id !== id)),
    clear: () => setItems([]),
  }), [items]);

  return (
    <ConfigCtx.Provider value={config}>
      <AuthCtx.Provider value={auth}>
      <ToastCtx.Provider value={toast}>
        <CartCtx.Provider value={cart}>
          {children}
          <div className="toasts" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.type}`}>
                <Icon name={t.type === 'ok' ? 'check-circle' : 'alert'} size={18} />
                {t.msg}
              </div>
            ))}
          </div>
        </CartCtx.Provider>
      </ToastCtx.Provider>
      </AuthCtx.Provider>
    </ConfigCtx.Provider>
  );
}
