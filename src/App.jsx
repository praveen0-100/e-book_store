import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import StoreLayout from './components/StoreLayout.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import BookDetail from './pages/BookDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import OrderPage from './pages/OrderPage.jsx';
import InvoicePage from './pages/InvoicePage.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminLogin from './admin/Login.jsx';
import AdminLayout from './admin/AdminLayout.jsx';
import Dashboard from './admin/Dashboard.jsx';
import AdminBooks from './admin/Books.jsx';
import AdminOrders from './admin/Orders.jsx';
import AdminOrderDetail from './admin/OrderDetail.jsx';
import Customers from './admin/Customers.jsx';
import Coupons from './admin/Coupons.jsx';
import Settings from './admin/Settings.jsx';
import Approvals from './admin/Approvals.jsx';
import Feedback from './admin/Feedback.jsx';
import CustomerDetail from './admin/CustomerDetail.jsx';
import System from './admin/System.jsx';
import Contact from './pages/Contact.jsx';
import { Privacy, Terms, Refund } from './pages/Legal.jsx';
import Account from './pages/Account.jsx';
import { Login, Signup, Forgot, Reset, Verify } from './pages/AuthPages.jsx';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<StoreLayout />}>
          <Route index element={<Home />} />
          <Route path="books" element={<Catalog />} />
          <Route path="books/:slug" element={<BookDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order/:token" element={<OrderPage />} />
          <Route path="invoice/:token" element={<InvoicePage />} />
          <Route path="contact" element={<Contact />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="refund-policy" element={<Refund />} />
          <Route path="account" element={<Account />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="forgot" element={<Forgot />} />
          <Route path="reset" element={<Reset />} />
          <Route path="verify" element={<Verify />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="books" element={<AdminBooks />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetail />} />
          <Route path="invoices" element={<AdminOrders invoices />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:email" element={<CustomerDetail />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="system" element={<System />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
