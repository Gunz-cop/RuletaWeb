/**
 * JSON-LD de un post del blog.
 *
 * Vivía dentro del frontmatter de BlogPost.astro y ocupaba 70 de sus 113
 * líneas de cabecera: para tocar cualquier otra cosa del layout había que
 * pasar por encima de todo el grafo de schema.org. Aquí está aparte porque
 * es lógica pura, sin marcado ni estilos.
 *
 * Lo que emite es sensible para SEO: el sitio vive del blog. Cualquier
 * cambio aquí se compara antes y después contra el HTML construido.
 */

interface DatosPost {
  title: string;
  description: string;
  pubDate: Date | string;
  updatedDate?: Date | string;
  author: string;
  /** URL absoluta del post, ya resuelta. */
  postUrl: string;
  /** Imagen social ya procesada por Astro, si existe. */
  heroSocial?: { src: string } | null;
  /** Ruta cruda del frontmatter, como respaldo. */
  heroImage?: string;
  /** Kit editorial del post, si lo tiene: aporta el bloque FAQPage. */
  editorialKit?: { faqs: Array<{ question: string; answer: string }> } | null;
}

const SITIO = 'https://decidelo.app';

const aISO = (f: Date | string) => (f instanceof Date ? f : new Date(f)).toISOString();

/** Elige la imagen social: la procesada, una absoluta del frontmatter, o la de respaldo. */
function imagenSocial({ heroSocial, heroImage }: DatosPost): string {
  if (heroSocial) return new URL(heroSocial.src, SITIO).href;
  if (heroImage?.startsWith('http')) return heroImage;
  return `${SITIO}/social-share.png`;
}

export function buildBlogSchema(post: DatosPost) {
  const { title, description, pubDate, updatedDate, author, postUrl, editorialKit } = post;

  const blogPosting = {
    '@type': 'BlogPosting',
    '@id': `${postUrl}#blogposting`,
    mainEntityOfPage: postUrl,
    headline: title,
    description,
    datePublished: aISO(pubDate),
    ...(updatedDate && { dateModified: aISO(updatedDate) }),
    inLanguage: 'es-ES',
    author: { '@type': 'Person', name: author, url: `${SITIO}/` },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITIO}/#organization`,
      name: 'Decídelo.app',
      url: `${SITIO}/`,
      logo: { '@type': 'ImageObject', url: `${SITIO}/favicon.svg` },
    },
    image: imagenSocial(post),
  };

  // Solo los posts con kit editorial tienen preguntas frecuentes.
  const faq = editorialKit
    ? [{
        '@type': 'FAQPage',
        '@id': `${postUrl}#faq`,
        mainEntity: editorialKit.faqs.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      }]
    : [];

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${postUrl}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITIO}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITIO}/blog` },
      { '@type': 'ListItem', position: 3, name: title, item: postUrl },
    ],
  };

  return { '@context': 'https://schema.org', '@graph': [blogPosting, ...faq, breadcrumb] };
}
