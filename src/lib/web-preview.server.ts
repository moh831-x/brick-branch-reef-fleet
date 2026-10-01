import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request, type RequestOptions } from 'node:https';
import { request as httpRequest } from 'node:http';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0|10|20):/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19));
}

/** Pin the connection to a checked public address, including every redirect. */
export async function fetchWebPage(value: string, redirects = 0): Promise<string> {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Unsupported page');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('Private page');
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const options: RequestOptions & { autoSelectFamily: boolean } = {
      autoSelectFamily: false,
      headers: { Accept: 'text/html', 'User-Agent': 'Folio/1.0 (web result preview)', 'Accept-Encoding': 'identity' },
      lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
    };
    const req = (url.protocol === 'https:' ? request : httpRequest)(url, options, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 3) return reject(new Error('Too many redirects'));
        fetchWebPage(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200 || !response.headers['content-type']?.includes('text/html')) {
        response.resume(); reject(new Error('Page unavailable')); return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) { response.destroy(); reject(new Error('Page too large')); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error('Page timeout')), 8000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

function text(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[entity.toLowerCase()] ?? '';
  }).replace(/\s+/g, ' ').trim();
}

export function webArticleParts(html: string) {
  const cleaned = html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|noscript|svg|nav|header|footer|aside)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  const body = cleaned.match(/<article\b[^>]*>([^]*?)<\/article>/i)?.[1] ?? cleaned.match(/<main\b[^>]*>([^]*?)<\/main>/i)?.[1] ?? cleaned.match(/<body\b[^>]*>([^]*?)<\/body>/i)?.[1] ?? cleaned;
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([^]*?)<\/h\1\s*>/gi)];
  const first = headings[0];
  const leadStart = first?.[1] === '1' ? (first.index ?? 0) + first[0].length : 0;
  const entries = first?.[1] === '1' ? headings.slice(1) : headings;
  const base = Math.min(...entries.map((entry) => Number(entry[1])), 2);
  return {
    lead: text(body.slice(leadStart, entries[0]?.index ?? body.length)).slice(0, 1600),
    sections: entries.slice(0, 40).map((entry, index) => ({
      id: `s-${index}`, title: text(entry[2]).slice(0, 180), level: Number(entry[1]) - base + 1,
      text: text(body.slice((entry.index ?? 0) + entry[0].length, entries[index + 1]?.index ?? body.length)).slice(0, 2400),
    })).filter((section) => section.title),
  };
}
