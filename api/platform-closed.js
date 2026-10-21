'use strict';

const maintenanceHtml = "<!doctype html>\n<html lang=\"it\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow\">\n<title>Starton — Accesso temporaneamente sospeso</title>\n<style>\n*{box-sizing:border-box}body{margin:0;background:#f0ece3;color:#1a1a1a;font-family:\"Avenir Next\",Avenir,\"Helvetica Neue\",Arial,sans-serif}\nmain{max-width:760px;margin:0 auto;padding:80px 28px;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}\n.brand{font-size:13px;letter-spacing:.45em;margin-bottom:64px}\nh1{font-size:clamp(30px,6vw,48px);font-weight:400;line-height:1.15;margin:0 0 24px}\np{max-width:520px;font-size:17px;line-height:1.7;color:#5a564e;margin:0 0 36px}\na{display:inline-block;padding:14px 24px;color:#1a1a1a;background:#c9a84c;text-decoration:none;font-size:13px}\na:focus-visible{outline:2px solid #1a1a1a;outline-offset:4px}\n</style>\n</head>\n<body><main>\n<div class=\"brand\">STARTON</div>\n<h1>Accesso alla piattaforma temporaneamente sospeso.</h1>\n<p>La presentazione di Starton rimane disponibile. L'analisi e le altre funzioni della piattaforma non sono al momento accessibili.</p>\n<a href=\"/\">Torna alla home</a>\n</main></body>\n</html>\n";
const maintenanceJson = JSON.stringify({
  error: 'PLATFORM_TEMPORARILY_CLOSED',
  message: 'Accesso alla piattaforma temporaneamente sospeso.'
});

module.exports = function platformClosed(req, res) {
  res.statusCode = 503;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Retry-After', '3600');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const wantsHtml = String(req.headers && req.headers.accept || '').includes('text/html');
  res.setHeader('Content-Type', wantsHtml ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8');
  res.end(req.method === 'HEAD' ? undefined : wantsHtml ? maintenanceHtml : maintenanceJson);
};
