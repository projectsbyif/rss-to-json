import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RSS_URL = process.env.RSS_URL || 'PASTE_YOUR_RSS_URL_HERE';
const OUTPUT_DIR = path.join(__dirname, 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'feed.json');
const TEMP_FILE = OUTPUT_FILE + '.tmp';

// --- Helpers -----------------------------------------------------------

// Most RSS fields can appear once OR many times. Coerce to array.
const toArray = v => (Array.isArray(v) ? v : v == null ? [] : [v]);

// fast-xml-parser sometimes returns a plain string, sometimes an object
// like { '#text': 'foo', '@_attr': 'bar' }. This pulls out the text.
function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') return node['#text'] || '';
  return '';
}

// Coerce a single-or-array of category nodes into a flat string array.
function categoriesOf(node) {
  return toArray(node).map(textOf).filter(Boolean);
}

// Pull the first <img src="..."> out of an HTML string.
function firstImage(html) {
  if (!html) return '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

// Strip HTML tags and decode common entities for a clean excerpt.
function toExcerpt(html, maxLen = 300) {
  if (!html) return '';
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// --- Main --------------------------------------------------------------

async function updateFeed() {
  if (!RSS_URL || RSS_URL === 'PASTE_YOUR_RSS_URL_HERE') {
    console.error('No RSS_URL provided');
    process.exit(1);
  }

  try {
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'feed-cache/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      // Don't collapse <category> into a single string when there's only one;
      // we want consistent array handling.
      isArray: (name) => ['item', 'entry', 'category'].includes(name),
      // Preserve CDATA contents (Medium wraps everything in CDATA).
      cdataPropName: '#cdata',
      // Treat #cdata as the text content
      textNodeName: '#text'
    });
    const parsed = parser.parse(xml);

    // Helper: get text from a node that may use CDATA
    const getText = (node) => {
      if (node == null) return '';
      if (typeof node === 'string') return node;
      if (typeof node === 'object') return node['#cdata'] || node['#text'] || '';
      return '';
    };

    const channel = parsed?.rss?.channel;
    const atomFeed = parsed?.feed;

    let title = '', description = '', link = '', rawItems = [];

    if (channel) {
      title = getText(channel.title);
      description = getText(channel.description);
      link = getText(channel.link);
      rawItems = toArray(channel.item);
    } else if (atomFeed) {
      title = getText(atomFeed.title);
      description = getText(atomFeed.subtitle);
      link = toArray(atomFeed.link).find(l => l?.['@_rel'] !== 'self')?.['@_href'] || '';
      rawItems = toArray(atomFeed.entry);
    } else {
      throw new Error('Unrecognised feed format (no <rss> or <feed> root)');
    }

    if (rawItems.length === 0) throw new Error('Feed contained no items');

    const items = rawItems.map(it => {
      // Medium puts the article body in <content:encoded>, not <description>.
      // fast-xml-parser exposes namespaced tags with the namespace prefix intact.
      const contentHtml =
        getText(it['content:encoded']) ||
        getText(it.content) ||
        getText(it.description) ||
        getText(it.summary) ||
        '';

      // Atom <link> is an element with href attr; RSS <link> is plain text.
      const linkValue =
        typeof it.link === 'object' && !Array.isArray(it.link)
          ? it.link['@_href'] || getText(it.link)
          : getText(it.link);

      // <guid> can be string OR an object with isPermaLink attribute
      const idValue =
        getText(it.guid) ||
        getText(it.id) ||
        linkValue;

      return {
        id: idValue,
        title: getText(it.title),
        link: linkValue,
        published: getText(it.pubDate) || getText(it.published) || getText(it.updated) || '',
        updated: getText(it['atom:updated']) || getText(it.updated) || '',
        author: getText(it['dc:creator']) || getText(it.author) || '',
        categories: categoriesOf(it.category),
        image: firstImage(contentHtml),
        excerpt: toExcerpt(contentHtml, 300),
        // contentHtml
      };
    });

    const output = {
      updatedAt: new Date().toISOString(),
      title, description, link,
      items
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(TEMP_FILE, JSON.stringify(output, null, 2));
    fs.renameSync(TEMP_FILE, OUTPUT_FILE);

    console.log(`✓ Feed updated: ${items.length} items`);
  } catch (err) {
    console.error('✗ Feed update failed:', err.message);
    console.error('Previous feed.json (if any) left untouched.');
    process.exit(1);
  }
}

updateFeed();