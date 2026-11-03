import { useEffect, useRef, useState } from 'react';
import { useAuth, useConfig, useToast } from '../lib/context.jsx';

let gsiPromise;
const loadGsi = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiPromise ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.async = true;
    el.onload = resolve;
    el.onerror = () => { gsiPromise = null; reject(new Error('Could not load Google sign-in.')); };
    document.head.appendChild(el);
  });
  return gsiPromise;
};

/** Official Google button (Google Identity Services). Renders nothing until GOOGLE_CLIENT_ID is configured on the server. */
export default function GoogleSignIn({ size = 'large', text = 'signin_with', onDone }) {
  const { google_client_id } = useConfig();
  const { signIn } = useAuth();
  const toast = useToast();
  const box = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!google_client_id) return undefined;
    let dead = false;
    loadGsi().then(() => {
      if (dead || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: google_client_id,
        callback: async (r) => {
          try { await signIn(r.credential); toast('Signed in'); onDone?.(); } catch (e) { toast(e.message, 'err'); }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(box.current, { type: 'standard', theme: 'filled_black', shape: 'pill', size, text, logo_alignment: 'left' });
    }).catch(() => setFailed(true));
    return () => { dead = true; };
  }, [google_client_id]); // eslint-disable-line

  if (!google_client_id) return null;
  if (failed) return <span className="muted" style={{ fontSize: 13 }}>Google sign-in is unavailable right now.</span>;
  return <div ref={box} style={{ minHeight: size === 'large' ? 44 : 32 }} />;
}
