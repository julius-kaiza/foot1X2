"use strict";
// Foot1X2: Node.js server for Render. No third-party dependencies.
// Supabase Edge Functions continue to handle protected football and payment calls.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const PUBLIC = new Set(['index.html','config.js','favicon.ico','robots.txt','manifest.json']);
function headers(res, mime) {
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
}
const server=http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);res.end();return;}
  if (pathname==='/health') {headers(res,'application/json; charset=utf-8');res.writeHead(200,{'Cache-Control':'no-store'});if(req.method==='HEAD')return res.end();return res.end(JSON.stringify({status:'ok',service:'foot1x2'}));}
  if (pathname==='/' || pathname==='/index.html') pathname='/index.html';
  if (pathname==='/config.js' && process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    // Only the public publishable/anon key is sent to the browser. Never send service-role credentials.
    const payload='window.FOOT1X2_CONFIG = Object.freeze('+JSON.stringify({supabaseUrl:process.env.SUPABASE_URL,supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY})+');\n';
    headers(res,'text/javascript; charset=utf-8');res.writeHead(200,{'Cache-Control':'no-store'});return res.end(req.method==='HEAD'?'':payload);
  }
  const filename=pathname.slice(1);
  // Explicit allowlist: do not publish .ts, SQL, README, server.js or repository files.
  if (!PUBLIC.has(filename) && !/^assets\/[a-zA-Z0-9_./-]+$/.test(filename)) {res.writeHead(404);res.end('Not found');return;}
  const target=path.resolve(ROOT,filename);
  if (!target.startsWith(ROOT+path.sep)) {res.writeHead(404);res.end();return;}
  fs.stat(target,(err,stat)=>{
    if (err || !stat.isFile()) {res.writeHead(404);res.end('Not found');return;}
    headers(res,MIME[path.extname(target)] || 'application/octet-stream');
    res.setHeader('Cache-Control',filename==='index.html'||filename==='config.js'?'no-store':'public, max-age=3600');
    res.writeHead(200);
    if (req.method==='HEAD')return res.end();
    fs.createReadStream(target).pipe(res);
  });
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Foot1X2 listening on ${PORT}`));
