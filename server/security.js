/** Small, dependency-free hardening helpers: security headers + in-memory rate limiting. */

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // Razorpay Checkout + Google Fonts are the only third parties the storefront needs.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://checkout.razorpay.com https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.razorpay.com https://*.googleusercontent.com",
    "connect-src 'self' https://*.razorpay.com https://lumberjack.razorpay.com https://accounts.google.com/gsi/",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com/gsi/",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '));
  next();
}

/** Fixed-window limiter keyed by client IP + route name. */
export function rateLimit({ name, windowMs, max, message = 'Too many requests. Please try again later.' }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now - rec.t > windowMs) { hits.set(key, { n: 1, t: now }); return next(); }
    if (++rec.n > max) {
      res.setHeader('Retry-After', Math.ceil((rec.t + windowMs - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

/** Request logging with latency, skipping static assets. */
export function requestLog(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  const t = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    if (res.statusCode >= 400 || ms > 1000) console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
}
