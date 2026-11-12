import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.jsx';

let deferred = null; // the browser's install prompt, captured once
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

const isStandalone = () => typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Makes the admin area an installable app: manifest, icons, theme colour and service worker. Admin pages only. */
export function useAdminApp() {
  useEffect(() => {
    const added = [];
    const add = (tag, attrs) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); added.push(el); };
    add('link', { rel: 'manifest', href: '/admin.webmanifest' });
    add('link', { rel: 'apple-touch-icon', href: '/admin-icons/apple-touch-icon.png' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'PrepPath Admin' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin/' }).catch(() => {});
    document.documentElement.classList.add('admin-app');
    return () => { added.forEach((el) => el.remove()); document.documentElement.classList.remove('admin-app'); };
  }, []);
}

/** "Install app" button. Android/desktop Chrome: one tap. iPhone/iPad: shows the Add to Home Screen steps. Hidden once installed. */
export function InstallApp({ className = 'btn btn-gold btn-sm btn-block', label = 'Install app' }) {
  const [, tick] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  if (isStandalone()) return null;
  const ios = isIOS();
  if (!deferred && !ios) return null; // browser hasn't offered installation (yet)

  const go = async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; listeners.forEach((f) => f()); }
    else setHelp((h) => !h);
  };
  return (
    <div className="install-app">
      <button type="button" className={className} onClick={go}><Icon name="download" size={16} /> <span className="lbl">{label}</span></button>
      {help && (
        <p className="install-help">
          On iPhone: tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
}
