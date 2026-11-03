import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { useAuth, useCart, useConfig } from '../lib/context.jsx';
import GoogleSignIn from './GoogleSignIn.jsx';

export function Logo({ name }) {
  return (
    <Link to="/" className="logo" aria-label={`${name} home`}>
      <span className="logo-mark"><Icon name="book" size={19} stroke={2.2} /></span>
      {name}
    </Link>
  );
}

export default function StoreLayout() {
  const { store_name, support_email, google_client_id } = useConfig();
  const { user, loading: authLoading } = useAuth();
  const cart = useCart();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const search = (e) => {
    e.preventDefault();
    nav(`/books${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setOpen(false);
  };

  return (
    <>
      <header className={`nav ${open ? 'open' : ''}`}>
        <div className="container nav-inner">
          <Logo name={store_name} />
          <nav className="nav-links" onClick={() => setOpen(false)}>
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/books">Library</NavLink>
            <NavLink to="/books?sort=newest">New releases</NavLink>
            <NavLink to="/books?sort=popular">Bestsellers</NavLink>
          </nav>
          <div className="nav-actions">
            <form className="nav-search" onSubmit={search} role="search">
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, authors…" aria-label="Search books" />
            </form>
            {google_client_id && !authLoading && (user
              ? <Link to="/account" className="icon-btn" aria-label="My account" title={user.name} style={{ padding: 0, overflow: 'hidden' }}>
                  {user.picture ? <img src={user.picture} alt="" width={36} height={36} referrerPolicy="no-referrer" style={{ borderRadius: '50%' }} /> : <span className="avatar">{user.name[0]}</span>}
                </Link>
              : <div className="nav-signin"><GoogleSignIn size="medium" text="signin" /></div>)}
            <Link to="/cart" className="icon-btn" aria-label={`Cart, ${cart.count} items`}>
              <Icon name="bag" size={18} />
              {cart.count > 0 && <span className="cart-count">{cart.count}</span>}
            </Link>
            <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu"><Icon name={open ? 'close' : 'menu'} size={18} /></button>
          </div>
        </div>
      </header>

      <main><Outlet /></main>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <Logo name={store_name} />
              <p className="muted" style={{ marginTop: 16, maxWidth: 340, fontSize: 14 }}>E-books published by PrepPath. Buy once, download instantly, keep forever.</p>
            </div>
            <div><h4>Shop</h4><Link to="/books">All books</Link><Link to="/books?sort=newest">New releases</Link><Link to="/books?sort=popular">Bestsellers</Link></div>
                        <div><h4>Support</h4><Link to="/contact">Contact &amp; feedback</Link>{support_email && <a href={`mailto:${support_email}`}>{support_email}</a>}<Link to="/account">My account</Link><Link to="/cart">Your cart</Link></div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} {store_name}. All rights reserved.</span>
            <span>Secure checkout · Instant delivery · DRM-free</span>
          </div>
        </div>
      </footer>
    </>
  );
}
