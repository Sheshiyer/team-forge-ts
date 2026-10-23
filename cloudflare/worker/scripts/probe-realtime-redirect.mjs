// Local workerd probe only. Supply the installed Miniflare module path; no network requests or credentials.
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Usage: node scripts/probe-realtime-redirect.mjs /absolute/path/to/miniflare/dist/src/index.js');
const {Miniflare, convertV4MiniflareOptions} = await import(pathToFileURL(modulePath).href);
const options = {modules:true, compatibilityDate:'2026-04-09', script:`export default { async fetch(){ const result = {}; for (const redirect of ['error','manual']) { try {const req = new Request('https://example.com',{redirect}); result[redirect]={constructed:true,redirect:req.redirect};}catch(e){result[redirect]={constructed:false,error:e.name};}} return Response.json(result); }}`};
const runtime = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
try {
  const result = await (await runtime.dispatchFetch('http://localhost')).json();
  console.log(JSON.stringify({compatibilityDate:options.compatibilityDate, ...result}));
  if (result.error.constructed || result.error.error !== 'TypeError' || !result.manual.constructed || result.manual.redirect !== 'manual') process.exitCode=1;
} finally {await runtime.dispose();}
