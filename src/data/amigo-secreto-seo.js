// Texto SEO de /amigo-secreto (fase 6 de docs/sdd-amigo-secreto.md).
// Una sola fuente para la FAQ visible (AmigoSecretoArticulo.astro) y para el
// FAQPage del JSON-LD: si se escribieran por separado acabarían diciendo
// cosas distintas. Texto plano, sin HTML.

export const title = 'Amigo Secreto Online: Sorteo Gratis por WhatsApp';

export const description = '¿Toca organizar el amigo secreto? Sortea gratis y sin registro, excluye parejas y envía a cada uno su enlace por WhatsApp. Nadie se toca a sí mismo.';

export const keywords = 'amigo secreto online, sorteo amigo secreto, amigo secreto whatsapp, amigo secreto gratis, amigo secreto diciembre, intercambio de regalos, amigo secreto oficina, amigo secreto novena, amigo invisible virtual, sorteo sin registro';

export const faqs = [
  {
    q: '¿Es gratis? ¿Hay que registrarse?',
    a: 'Es gratis y no pide registro, correo ni instalar nada. El sorteo se hace en tu navegador y la lista de nombres no se envía a ningún servidor.'
  },
  {
    q: '¿Alguien puede tocarse a sí mismo?',
    a: 'No. El sorteo forma una sola cadena cerrada: cada persona le regala a otra distinta, todos reciben exactamente un regalo y no quedan grupitos sueltos.'
  },
  {
    q: '¿El sorteo es realmente al azar?',
    a: 'Sí. Usa el generador aleatorio criptográfico del navegador y todas las cadenas válidas tienen la misma probabilidad de salir, también cuando hay exclusiones. La única excepción son los grupos muy grandes con exclusiones muy apretadas: ahí la página lo avisa en la verificación. Cada cambio del código pasa una prueba estadística que lo comprueba.'
  },
  {
    q: '¿Cómo excluyo a mi pareja?',
    a: 'En las exclusiones, escribe cada pareja o grupo en una línea con los nombres separados por coma, por ejemplo «Ana, Luis»: nadie de esa línea le regalará a otro de la misma línea. Si solo quieres evitar un sentido, escribe «Ana > Luis» y Ana no le regalará a Luis, aunque Luis sí pueda regalarle a Ana. Si las exclusiones no dejan ningún sorteo posible, la herramienta te lo dice.'
  },
  {
    q: '¿Qué pasa si hay dos personas con el mismo nombre?',
    a: 'La herramienta avisa de los nombres repetidos aunque cambien mayúsculas o tildes, como «María» y «maria». Distínguelos con una inicial o un apellido para que nadie crea que se tocó a sí mismo.'
  },
  {
    q: '¿Quien organiza puede ver a quién le tocó cada uno?',
    a: 'Quien organiza no ve los resultados en pantalla, pero tiene todos los enlaces porque es quien los reparte, y podría abrirlos. Si también participa y quiere quedar por fuera, usa «Pasa el teléfono»: cada persona toca su nombre, abre su sobre y lo cierra, y quien organiza no ve nada.'
  },
  {
    q: '¿El enlace es seguro?',
    a: 'El nombre va en la parte de la dirección que sigue al símbolo #, que el navegador no envía al servidor, y no se lee a simple vista. Aun así, quien tenga el enlace puede abrirlo y alguien con conocimientos técnicos podría fabricar uno, así que trátalo como un mensaje privado y no lo reenvíes.'
  },
  {
    q: '¿Qué pasa si recargo la página o cierro el navegador?',
    a: 'El sorteo queda guardado en tu teléfono o computador. Al volver aparece la opción de recuperarlo con los mismos enlaces y ver cuáles ya enviaste. Los enlaces de años anteriores siguen funcionando.'
  },
  {
    q: '¿Puedo subir la lista en Excel?',
    a: 'Sí. Sube un .xlsx o un .csv con el nombre en la columna A, el celular en la B y el deseo o pista en la C; la B y la C pueden ir vacías y la fila de títulos se salta sola. En la página hay una plantilla para descargar.'
  },
  {
    q: '¿Puedo poner presupuesto, fecha y lugar?',
    a: 'Sí. En los detalles opcionales puedes poner el nombre del grupo, el presupuesto máximo, la fecha, el lugar y un mensaje, y en «Qué le gustaría recibir a cada uno», un deseo o pista por persona. Quien abre su enlace los ve y puede añadir la fecha a su calendario.'
  },
  {
    q: '¿Sirve para la novena o el intercambio de la oficina?',
    a: 'Sí. Funciona igual para la oficina, el colegio, los amigos o la familia en las novenas de diciembre. Si el grupo está lejos, cada uno recibe su enlace por WhatsApp; si están juntos, basta un celular con «Pasa el teléfono».'
  }
];

export function schemaLD(socialImage) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://decidelo.app/amigo-secreto#webapp',
        name: 'Amigo Secreto Online — Decídelo.app',
        description: 'Sorteo de amigo secreto gratis y sin registro, hecho en el navegador: una sola cadena, exclusiones, presupuesto y fecha, enlaces por WhatsApp o modo «Pasa el teléfono».',
        url: 'https://decidelo.app/amigo-secreto',
        applicationCategory: 'UtilityApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires JavaScript',
        softwareVersion: '3.0.0',
        inLanguage: 'es',
        offers: { '@type': 'Offer', price: '0.00', priceCurrency: 'USD' },
        image: socialImage,
        screenshot: socialImage,
        publisher: {
          '@type': 'Organization',
          '@id': 'https://decidelo.app/#organization',
          name: 'Decídelo.app',
          url: 'https://decidelo.app/',
          logo: { '@type': 'ImageObject', url: 'https://decidelo.app/favicon.svg' }
        }
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://decidelo.app/amigo-secreto#faq',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://decidelo.app/amigo-secreto#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://decidelo.app/' },
          { '@type': 'ListItem', position: 2, name: 'Amigo Secreto', item: 'https://decidelo.app/amigo-secreto' }
        ]
      }
    ]
  };
}
