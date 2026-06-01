import { logger } from '../logger';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

export async function extractLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) return null;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RelayChatBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('Failed to fetch URL for preview', { url, status: response.status });
      return null;
    }

    const html = await response.text();
    const preview: LinkPreview = {
      url,
      title:
        extractMetaTag(html, 'og:title') ||
        extractMetaTag(html, 'twitter:title') ||
        extractTitle(html),
      description:
        extractMetaTag(html, 'og:description') ||
        extractMetaTag(html, 'twitter:description') ||
        extractMetaTag(html, 'description'),
      image: extractMetaTag(html, 'og:image') || extractMetaTag(html, 'twitter:image'),
      siteName: extractMetaTag(html, 'og:site_name'),
      favicon: extractFavicon(html, urlObj.origin),
    };

    if (preview.image && !preview.image.startsWith('http')) {
      preview.image = new URL(preview.image, urlObj.origin).href;
    }

    logger.info('Link preview extracted', { url, hasImage: !!preview.image });
    return preview;
  } catch (error) {
    logger.error('Link preview extraction failed', { url, error: (error as Error).message });
    return null;
  }
}

function extractMetaTag(html: string, property: string): string | undefined {
  const ogRegex = new RegExp(
    `<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`,
    'i'
  );
  const ogMatch = html.match(ogRegex);
  if (ogMatch?.[1]) return ogMatch[1];

  const nameRegex = new RegExp(
    `<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`,
    'i'
  );
  const nameMatch = html.match(nameRegex);
  if (nameMatch?.[1]) return nameMatch[1];

  const revRegex = new RegExp(
    `<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${property}["']`,
    'i'
  );
  const revMatch = html.match(revRegex);
  return revMatch?.[1];
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : undefined;
}

function extractFavicon(html: string, origin: string): string | undefined {
  const m = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i);
  if (m?.[1]) {
    const href = m[1];
    return href.startsWith('http') ? href : new URL(href, origin).href;
  }
  return `${origin}/favicon.ico`;
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"]+/gi;
  return text.match(urlRegex) ?? [];
}

export async function processMessageForPreviews(content: string): Promise<LinkPreview[]> {
  const urls = extractUrls(content).slice(0, 3);
  if (!urls.length) return [];
  const previews = await Promise.all(urls.map((u) => extractLinkPreview(u)));
  return previews.filter((p): p is LinkPreview => p !== null);
}
