import { Resource } from 'omniboxd/resources/entities/resource.entity';

function escapeHtml(text: string): string {
  if (!text) {
    return '';
  }

  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

function extractPlainText(content: string, maxLength: number = 200): string {
  if (!content) return '';

  // Remove markdown syntax

  let plainText = content
    .replace(/[#*`[\]()]/g, '') // Remove markdown characters
    .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
    .trim();

  // Limit length
  if (plainText.length > maxLength) {
    plainText = plainText.substring(0, maxLength).trim() + '...';
  }

  return plainText;
}

function generateMetaTags({
  title,
  description,
  url,
  imageUrl,
}: {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
}): string {
  const data = [
    `<meta name="description" content="${escapeHtml(description)}" />`,

    // Open Graph (Facebook, LinkedIn, WeChat, Feishu, etc.)
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
  ];

  if (imageUrl) {
    data.push(`<meta property="og:image" content="${imageUrl}" />`);
    data.push(`<meta property="og:image:width" content="1200" />`);
    data.push(`<meta property="og:image:height" content="630" />`);
  }

  // Feishu/Lark
  data.push(`<meta property="lark:card" content="summary_large_image" />`);
  data.push(`<meta property="lark:title" content="${escapeHtml(title)}" />`);
  data.push(
    `<meta property="lark:description" content="${escapeHtml(description)}" />`,
  );
  if (imageUrl) {
    data.push(`<meta property="lark:image" content="${imageUrl}" />`);
  }

  // Twitter Card (optional)
  data.push(`<meta name="twitter:card" content="summary_large_image" />`);
  data.push(`<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  data.push(
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  );

  if (imageUrl) {
    data.push(`<meta name="twitter:image" content="${imageUrl}" />`);
  }

  return data.join('\n');
}

export function loadHtmlTemplate(
  description: string = '',
  title: string = 'Omnibox',
  metaTags: string = '',
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Cache-Control"
      content="no-cache, no-store, must-revalidate"
    />
    <link
      rel="shortcut icon"
      href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAhOAAAITgBRZYxYAAAAuJQTFRFAAAAUJL5T5H5TpD5TZD5TZD5TZD5VJT6UpP5UZP6UZP6UpP6UZP5UZL5UZL6UZP5VJT5Vpb6VpX6VZX6VpX6W5n6W5n6W5j6X5v6X5v6Y577Y577Y576Y576aKH7aaH7bKT7baT7cKb7cKf7cab7dqr8dan7UXGkIigyKzZHYYvLdan6eq38eqz8bpvhICUsFxcXICUtXH62f6/8WXmqISYueqjxfaz4g7L8QVNvQ1Z1grH6g7P8eKLlR11/Jiw3GBgZSF6Ah7X9iLX9KzNAHB4hbZDGhbL4YYCwJSs1IykxfafojLj9i7b6GhsdOERYirb6RldzHyInfKPfkbv9f6PcOUVYPUpfQE5lRldyUmiJYn2ndZfLgqfhjrf4havnO0hcISUqgqjilb79cIy5GBgYISQpLzdESVlzKC02jbPumsH+X3SWNDxJmcD9nsT+nMH6Qk5gSlhunsP+osb+b4apGxwdaH2do8b+mLfmJSgtNzU0OTg3i6fSp8r+b4OhWlhV3NXM/fXr/vbs0szDV1VSHh8iqMj6rMz/PkZSOjk38urh3tfOqaSe5d7V9u7kRURBNzY1l5ONw762sq2mY2BdGhkZJiktsM//GxsclpKMurWuKCcnLCsr5+DXpaCaT01K9/Dm5N3U+vLolI+KorzmstD/raiign56saylvbewGRkZuLKr+PDnf3x3Pz08f3t39OzjKSgnkqnOkIyHt7KrJiYlKiko5t/Wn5uVKyopop2XpJ+ZXFpXiZ/CFxcXMTAv6+Tb2tPKo56Y4drS8OjfOzo54drRqKOdVlRRiJ7AstD/FxcXaWZj4NrR+/Pp/PTq29TMaGVit7Gq9u7lY2FdMjEwYV9b7+jejKPHstD/FxcXKysqRkVDSEZEJyYmOjk4+vLp6+Pa9+/mdHFtmLDXstD/FxcXHx8fb2xom5aRiYWAQD89GRoarMn2stD/FxcXFxcXLjM6stD/stD/P0dTuBP6hAAAAPZ0Uk5TAAEwp+r9/wFI6v//////6gEw6v//p///6v/9///9///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9///////////////96v/////////////////qp/////////////+nMP////////8wAUj/SAGnllsjPQAAAgdJREFUeJx1U11IVGEQnXNVzLIHjRX1oWRhS9GHfhQsiEIiXxSKzIegIBIENUpKxAR9UPpD+gFBFATfRBRJogghRBEkNPR9BUEQV5AyDTdtd79m5l5y79112Hv3zMw5Z+Z+dxcEDUoMo4F06conZsiKWTG9WYaMZUWslL0jyBI1DMyBNC5jB5/0Ka7tZhvkJhsftwjyoSJxYWTIk1k46fUnVwYUiINIbLmt04y7fIPfJePH9GYBco5qP/mWKIGx9Kj+2iPsOUY3kwQX+IpwMQ3RBHUqN1DOV1iyow5DqqQKmRtFBbtvSsHHRvh/FtxeJ8pHGFVMWFXJqbgZqViRLz/2UEMIOtXTcGL3GJa0cg7beEBYcG1WxgzzzcYX2aGRMJv8BDguI4pHwNShhApE8BSYPJRQyYQ2fNbJOdiYTyBU8xF3Tgi6oduPevq18g5eDTO6gz8ZwhhifF+5A0Kol59jfx+jho1c9D4E3hM9/pkNrPh71KKFHc4KaF0OvCRqw3Nqd/4m6JB6145D6F48j2cvgFZ6HcprIeqZu/RE6m9ChKlmBu8wc0WEDdRUjMF5urt7vV4IA8sBLNQJGlTje0TthYo+ntERI99LEbyt64xx9aaAD+O38OMEv2SJT9NXsb5W5374L+JwTeFXbPqwhaCHcRAzoTx+oK3w7187zUnab48X7adl/gOln6A7AMSkIwAAAABJRU5ErkJggg=="
      type="image/x-icon"
    />
    <title>${title}</title>
    ${metaTags}
  </head>
  <body>${description}</body>
</html>`;
}

function getImageUrl(url: string, content: string) {
  let imagePath = '';
  // Try to match markdown image syntax: ![alt](url)
  const markdownImageMatch = content.match(/!\[.*?\]\((.*?)\)/);
  if (markdownImageMatch && markdownImageMatch[1]) {
    imagePath = markdownImageMatch[1].trim();
  }

  if (!imagePath) {
    // Try to match HTML img tag: <img src="url">
    const htmlImageMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (htmlImageMatch && htmlImageMatch[1]) {
      imagePath = htmlImageMatch[1].trim();
    }
  }

  if (imagePath) {
    // If already absolute URL
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    return `${url}/${imagePath}`;
  }
}

export function generateHTML(url: string, resource: Resource): string {
  const title = resource.name || 'Untitled';
  const description = extractPlainText(resource.content, 200);
  const imageUrl = getImageUrl(url, resource.content);

  const metaTags = generateMetaTags({
    title,
    description,
    url,
    imageUrl,
  });

  return loadHtmlTemplate(description, escapeHtml(title), metaTags);
}
