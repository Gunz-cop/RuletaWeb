/**
 * Mapa de imágenes de cabecera del blog.
 *
 * El frontmatter de los 52 posts referencia sus imágenes como rutas
 * públicas ('/blog/ruleta.png'), que es como vivían cuando estaban en
 * public/. Ahora viven en src/assets/blog/ para que Astro las optimice
 * (AVIF/WebP + srcset), pero las rutas del frontmatter se conservan
 * intactas y este mapa las traduce a los metadatos que espera <Image>.
 *
 * Así no hubo que reescribir 52 archivos de contenido, y si algún día
 * una imagen se sirve desde una URL externa el lookup simplemente
 * devuelve undefined y quien llama hace fallback a <img>.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/blog/*.{png,jpg,jpeg,webp,avif}',
  { eager: true },
);

const byPublicPath = new Map<string, ImageMetadata>();
for (const [filePath, mod] of Object.entries(modules)) {
  const fileName = filePath.split('/').pop();
  if (fileName) byPublicPath.set(`/blog/${fileName}`, mod.default);
}

/** Devuelve los metadatos de imagen para una ruta de frontmatter, si es local. */
export function getHeroImage(path?: string): ImageMetadata | undefined {
  if (!path) return undefined;
  return byPublicPath.get(path);
}

/**
 * URL absoluta y optimizada de una imagen, para structured data y Open Graph.
 *
 * Los consumidores de JSON-LD (Google, redes sociales) necesitan una URL
 * absoluta y estable, no un srcset. Devuelve un WebP de 1200px, que es el
 * ancho que piden las tarjetas sociales.
 */
export async function getSocialImageUrl(path?: string): Promise<string | undefined> {
  const asset = getHeroImage(path);
  if (!asset) return undefined;
  const { getImage } = await import('astro:assets');
  const generated = await getImage({ src: asset, format: 'webp', width: 1200 });
  return new URL(generated.src, 'https://decidelo.app').href;
}
