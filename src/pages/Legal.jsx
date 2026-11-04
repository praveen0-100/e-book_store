import { Link } from 'react-router-dom';
import { useConfig } from '../lib/context.jsx';

const UPDATED = '4 November 2026';

function Page({ eyebrow, title, intro, children }) {
  return (
    <div className="container" style={{ maxWidth: 780, paddingBottom: 90 }}>
      <div className="page-head">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="muted">{intro} Last updated: {UPDATED}.</p>
      </div>
      <div className="card card-pad legal">{children}</div>
      <div className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 24, display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms &amp; Conditions</Link><Link to="/refund-policy">Refund Policy</Link><Link to="/contact">Contact</Link>
      </div>
    </div>
  );
}
const H = ({ children }) => <h3 style={{ fontSize: 20, margin: '26px 0 8px' }}>{children}</h3>;
const P = ({ children }) => <p className="muted" style={{ lineHeight: 1.75, marginBottom: 10 }}>{children}</p>;
const L = ({ items }) => <ul className="muted" style={{ lineHeight: 1.75, paddingLeft: 22, marginBottom: 10 }}>{items.map((t) => <li key={t}>{t}</li>)}</ul>;

function useContact() {
  const { store_name, support_email } = useConfig();
  const mail = support_email ? <a href={`mailto:${support_email}`} style={{ textDecoration: 'underline' }}>{support_email}</a> : <Link to="/contact" style={{ textDecoration: 'underline' }}>our contact form</Link>;
  return { name: store_name || 'our store', mail };
}

export function Privacy() {
  const { name, mail } = useContact();
  return (
    <Page eyebrow="Legal" title="Privacy Policy" intro={`How ${name} collects, uses and protects your information.`}>
      <P>This policy explains what personal information {name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you browse or buy e-books on this website, why we collect it, and the choices you have. By using the site you agree to this policy.</P>
      <H>1. Information we collect</H>
      <L items={[
        'Order details: your name, email address, the e-books you buy, the amount paid, and your invoice details.',
        'Account details, if you sign up: name, email and a securely hashed password, or your name, email and profile picture if you sign in with Google.',
        'Payment references: the payment ID, payment method type (for example UPI or card brand) and the last four card digits returned by our payment provider. For manual UPI QR payments, the UPI reference number (UTR) you enter.',
        'Technical data: IP address, browser type, device and pages visited, collected through server logs and the analytics tools described below.',
        'Messages you send us through the contact form.',
      ]} />
      <P>We never see or store your full card number, CVV, UPI PIN or net-banking credentials. Card, UPI and net-banking details are entered directly with Razorpay.</P>
      <H>2. How we use your information</H>
      <L items={[
        'To process your order, deliver your e-books and issue invoices.',
        'To send order confirmations, download links, receipts and replies to your messages.',
        'To prevent fraud, abuse and unauthorised downloads.',
        'To measure and improve our website and our advertising.',
        'To meet legal, tax and accounting obligations.',
      ]} />
      <H>3. Who we share it with</H>
      <P>We do not sell your personal information. We share only what is necessary with:</P>
      <L items={[
        'Razorpay, our payment processor, to take and confirm payments.',
        'Our email provider, to send order emails.',
        'Our hosting and storage providers (Vercel and its database and file-storage partners), who store the data on our behalf.',
        'Meta (Facebook / Instagram), through the Meta Pixel, to measure the effectiveness of our ads (see section 4).',
        'Google, if you choose to sign in with Google.',
        'Authorities, when required by law.',
      ]} />
      <H>4. Cookies, the Meta Pixel and similar technologies</H>
      <P>We use the Meta Pixel on this website. It records events such as page views and completed purchases (including the order value) and sends them to Meta so we can measure ad performance and show our ads to relevant people. Meta may use this data in line with its own privacy policy. We also use browser storage to keep your cart and sign-in session. You can block cookies and trackers in your browser settings or through your Facebook ad preferences; the store will still work, although some features such as the cart may be affected.</P>
      <H>5. How long we keep your data</H>
      <P>We keep order and invoice records for as long as required by Indian tax and accounting law (generally up to 8 years). Account data is kept until you ask us to delete your account. Server logs are kept for a short period for security.</P>
      <H>6. Security</H>
      <P>The site is served over HTTPS, passwords are stored hashed, downloads are protected by a private link tied to your order, and access to admin tools is restricted. No online service can be guaranteed 100% secure, but we take reasonable steps to protect your data.</P>
      <H>7. Your rights</H>
      <P>You may ask us to access, correct or delete your personal data, or to withdraw your consent to our use of it, at any time, subject to records we must keep by law. Write to us at {mail} and we will respond within a reasonable time.</P>
      <H>8. Children</H>
      <P>This website is not directed at children under 18. If you believe a child has given us personal data, contact us and we will delete it.</P>
      <H>9. Changes to this policy</H>
      <P>We may update this policy from time to time. The &ldquo;last updated&rdquo; date above shows the latest version.</P>
      <H>10. Contact and grievances</H>
      <P>For any privacy question or complaint, contact us at {mail}. We aim to acknowledge complaints within 48 hours and resolve them within 30 days.</P>
    </Page>
  );
}

export function Terms() {
  const { name, mail } = useContact();
  return (
    <Page eyebrow="Legal" title="Terms & Conditions" intro={`The rules for using ${name} and buying our e-books.`}>
      <P>These terms form an agreement between you and {name}. By browsing the site, creating an account or placing an order you agree to them. If you do not agree, please do not use the site.</P>
      <H>1. What we sell</H>
      <P>We sell digital e-books for download. Nothing is shipped. After payment is confirmed, you can download your files from your order page and from the email we send you.</P>
      <H>2. Prices and payment</H>
      <L items={[
        'All prices are in Indian Rupees (INR) and include applicable taxes unless stated otherwise.',
        'Payments are processed securely by Razorpay (cards, UPI, net banking, wallets). We may also offer manual UPI QR payment, in which case your order is confirmed only after we verify the payment in our account.',
        'We may change prices at any time; the price you see at checkout is the price you pay.',
        'We may cancel and refund an order we suspect is fraudulent or placed by mistake.',
      ]} />
      <H>3. Delivery</H>
      <P>Delivery is electronic. For online payments, downloads are normally available immediately. For manual UPI payments, downloads are unlocked after we verify the payment, usually within a few hours. Each purchased file can be downloaded a limited number of times; contact us if you need more.</P>
      <H>4. Licence and acceptable use</H>
      <P>When you buy an e-book you receive a personal, non-exclusive, non-transferable licence to read it for your own use. You must not copy, resell, share, upload, publish, or distribute the files, or remove any copyright notices. All content remains the property of {name} or its authors. We may suspend access and refuse future sales if you breach this section.</P>
      <H>5. Your account</H>
      <P>You are responsible for keeping your login details safe and for activity on your account. Give us accurate information, including a working email address, because your order and download links are sent there.</P>
      <H>6. Refunds</H>
      <P>Refunds and cancellations are governed by our <Link to="/refund-policy" style={{ textDecoration: 'underline' }}>Refund Policy</Link>.</P>
      <H>7. Content and no guarantees</H>
      <P>Our e-books are for education and general information. We do not guarantee any particular exam result, job outcome or income. Content is provided &ldquo;as is&rdquo;, and we try to keep it accurate but cannot promise it is free from errors.</P>
      <H>8. Limitation of liability</H>
      <P>To the fullest extent permitted by law, our total liability for any claim connected with an order is limited to the amount you paid for that order. We are not liable for indirect or consequential losses, or for delays or failures caused by events outside our control such as payment-network or internet outages.</P>
      <H>9. Privacy</H>
      <P>How we handle your data is explained in our <Link to="/privacy" style={{ textDecoration: 'underline' }}>Privacy Policy</Link>.</P>
      <H>10. Governing law</H>
      <P>These terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of the courts in India where our business is located.</P>
      <H>11. Changes and contact</H>
      <P>We may update these terms; the version on this page at the time of your order applies to it. Questions? Contact us at {mail}.</P>
    </Page>
  );
}

export function Refund() {
  const { name, mail } = useContact();
  return (
    <Page eyebrow="Legal" title="Refund & Cancellation Policy" intro={`When ${name} refunds a purchase.`}>
      <P>Our products are digital files that are delivered instantly and cannot be returned. Because of this, <b style={{ color: 'var(--text)' }}>all sales are final once the e-book has been delivered or downloaded</b>, except in the cases below.</P>
      <H>1. When you are eligible for a refund</H>
      <L items={[
        'You were charged but did not receive access to your e-book.',
        'You were charged twice for the same order.',
        'The file is corrupted or cannot be opened, and we cannot fix or replace it.',
        'The e-book you received is materially different from its description on our website.',
      ]} />
      <H>2. When a refund is not available</H>
      <L items={[
        'You changed your mind or bought the wrong e-book after downloading it.',
        'You did not find the content useful or it did not meet your personal expectations.',
        'Access was shared or the files were used in breach of our Terms.',
      ]} />
      <H>3. Cancellation</H>
      <P>You can cancel an order only before it is paid. Once payment is completed and the e-book is delivered, it cannot be cancelled. For manual UPI payments that have not yet been approved, you may ask us to cancel and refund in full.</P>
      <H>4. How to request a refund</H>
      <P>Email us at {mail} (or use the <Link to="/contact" style={{ textDecoration: 'underline' }}>contact form</Link>) within 7 days of purchase with your order number (like ORD-1001), the email used at checkout, and a short description of the problem. We will first try to fix the issue, for example by re-sending or replacing the file.</P>
      <H>5. How refunds are paid</H>
      <L items={[
        'Approved refunds are returned to the original payment method.',
        'Online payments (card, UPI, net banking, wallet): the refund is issued through Razorpay and normally reaches your account within 5–7 working days, depending on your bank.',
        'Manual UPI QR payments: we refund to the UPI account that made the payment, usually within 5–7 working days.',
        'Any promo discount you used is not refundable separately; the refund is the amount you actually paid.',
      ]} />
      <H>6. Failed or pending payments</H>
      <P>If money was deducted but your order shows as failed or pending, it is usually reversed automatically by your bank within 5–7 working days. If it is not, contact us with your payment reference and we will help.</P>
      <H>7. Contact</H>
      <P>Questions about a refund? Write to {mail}. We aim to reply within 2 working days.</P>
    </Page>
  );
}
