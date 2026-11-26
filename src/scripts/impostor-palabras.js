// ==========================================================
// EL IMPOSTOR — palabras por categoría
// ==========================================================
// Solo las usa el servidor (worker/sala.js), que es quien reparte los
// roles, y la página en tiempo de build para escribir el selector de
// categoría. El navegador del jugador nunca las descarga: si bajaran en
// el bundle, cualquiera podría abrir las herramientas de desarrollo y
// mirar cuál es la lista antes de saber su rol.
//
// Reglas para añadir palabras: una o dos palabras, nombres comunes que
// cualquiera del grupo conozca (el impostor tiene que poder improvisar una
// pista creíble), sin marcas ni personas reales y sin que dos palabras de la
// misma categoría sean sinónimos. Mejor 40 buenas que 200 dudosas.

export const CATEGORIAS = {
  animales: {
    etiqueta: 'Animales',
    palabras: [
      'Perro', 'Gato', 'Caballo', 'Vaca', 'Gallina', 'Cerdo', 'Oveja', 'Conejo', 'León', 'Tigre',
      'Elefante', 'Jirafa', 'Mono', 'Oso', 'Lobo', 'Zorro', 'Delfín', 'Tiburón', 'Ballena', 'Pulpo',
      'Tortuga', 'Cocodrilo', 'Serpiente', 'Rana', 'Águila', 'Loro', 'Pingüino', 'Búho', 'Murciélago', 'Hormiga',
      'Mariposa', 'Abeja', 'Araña', 'Caracol', 'Cangrejo', 'Canguro', 'Cebra', 'Hipopótamo', 'Colibrí', 'Capibara',
    ],
  },
  comida: {
    etiqueta: 'Comida',
    palabras: [
      'Pizza', 'Hamburguesa', 'Sushi', 'Tacos', 'Arepa', 'Empanada', 'Sancocho', 'Bandeja paisa', 'Ajiaco', 'Tamal',
      'Lasaña', 'Espagueti', 'Ensalada', 'Sopa', 'Arroz con pollo', 'Pollo asado', 'Pescado frito', 'Patacones', 'Buñuelo', 'Pan de bono',
      'Helado', 'Torta', 'Flan', 'Brownie', 'Galletas', 'Chocolate', 'Palomitas', 'Papas fritas', 'Perro caliente', 'Sándwich',
      'Huevos revueltos', 'Pancakes', 'Cereal', 'Yogur', 'Aguacate', 'Mango', 'Banano', 'Fresas', 'Sandía', 'Maracuyá',
    ],
  },
  lugares: {
    etiqueta: 'Lugares',
    palabras: [
      'Playa', 'Montaña', 'Aeropuerto', 'Hospital', 'Biblioteca', 'Cine', 'Supermercado', 'Estadio', 'Museo', 'Parque',
      'Gimnasio', 'Restaurante', 'Panadería', 'Farmacia', 'Banco', 'Terminal de buses', 'Iglesia', 'Piscina', 'Zoológico', 'Discoteca',
      'Universidad', 'Colegio', 'Hotel', 'Cárcel', 'Granja', 'Selva', 'Desierto', 'Isla', 'Volcán', 'Cascada',
      'Centro comercial', 'Plaza de mercado', 'Peluquería', 'Taller mecánico', 'Estación de bomberos', 'Teatro', 'Circo', 'Casino', 'Finca', 'Mirador',
    ],
  },
  oficina: {
    etiqueta: 'Oficina y trabajo',
    palabras: [
      'Reunión', 'Correo', 'Impresora', 'Grapadora', 'Escritorio', 'Silla', 'Computador', 'Teclado', 'Mouse', 'Pantalla',
      'Café', 'Nevera', 'Microondas', 'Ascensor', 'Recepción', 'Jefe', 'Nómina', 'Vacaciones', 'Prima', 'Horario',
      'Presentación', 'Informe', 'Contrato', 'Cliente', 'Proveedor', 'Factura', 'Videollamada', 'Teletrabajo', 'Carné', 'Parqueadero',
      'Almuerzo', 'Cumpleaños', 'Capacitación', 'Pizarra', 'Marcador', 'Agenda', 'Calendario', 'Renuncia', 'Ascenso', 'Sala de juntas',
    ],
  },
  casa: {
    etiqueta: 'Cosas de la casa',
    palabras: [
      'Nevera', 'Estufa', 'Lavadora', 'Televisor', 'Sofá', 'Cama', 'Almohada', 'Cobija', 'Espejo', 'Ducha',
      'Inodoro', 'Cepillo de dientes', 'Jabón', 'Toalla', 'Cortina', 'Alfombra', 'Lámpara', 'Ventilador', 'Plancha', 'Escoba',
      'Trapero', 'Olla', 'Sartén', 'Cuchillo', 'Tenedor', 'Cuchara', 'Plato', 'Vaso', 'Licuadora', 'Tostadora',
      'Reloj de pared', 'Llaves', 'Puerta', 'Ventana', 'Balcón', 'Terraza', 'Garaje', 'Clóset', 'Mesa', 'Control remoto',
    ],
  },
  deportes: {
    etiqueta: 'Deportes y juegos',
    palabras: [
      'Fútbol', 'Baloncesto', 'Tenis', 'Natación', 'Ciclismo', 'Voleibol', 'Béisbol', 'Boxeo', 'Atletismo', 'Golf',
      'Patinaje', 'Yoga', 'Esquí', 'Surf', 'Escalada', 'Gimnasia', 'Rugby', 'Ajedrez', 'Dominó', 'Parqués',
      'Tejo', 'Billar', 'Bolos', 'Pingpong', 'Karate', 'Maratón', 'Equitación', 'Remo', 'Buceo', 'Skate',
      'Árbitro', 'Portería', 'Medalla', 'Estadio', 'Entrenador', 'Penalti', 'Cancha', 'Raqueta', 'Casco', 'Trofeo',
    ],
  },
  profesiones: {
    etiqueta: 'Profesiones',
    palabras: [
      'Médico', 'Profesor', 'Bombero', 'Policía', 'Cocinero', 'Piloto', 'Abogado', 'Ingeniero', 'Arquitecto', 'Dentista',
      'Mecánico', 'Carpintero', 'Electricista', 'Plomero', 'Peluquero', 'Cantante', 'Actor', 'Pintor', 'Escritor', 'Periodista',
      'Taxista', 'Mesero', 'Cajero', 'Veterinario', 'Enfermero', 'Panadero', 'Agricultor', 'Fotógrafo', 'Diseñador', 'Programador',
      'Contador', 'Psicólogo', 'Carnicero', 'Jardinero', 'Astronauta', 'Detective', 'Payaso', 'Mago', 'Árbitro', 'Cartero',
    ],
  },
  colombia: {
    etiqueta: 'Colombia',
    palabras: [
      'Bogotá', 'Medellín', 'Cali', 'Cartagena', 'Barranquilla', 'Santa Marta', 'Bucaramanga', 'Manizales', 'Pereira', 'Leticia',
      'Arepa', 'Empanada', 'Bandeja paisa', 'Sancocho', 'Ajiaco', 'Lechona', 'Changua', 'Aguardiente', 'Tinto', 'Panela',
      'Cumbia', 'Vallenato', 'Salsa', 'Reguetón', 'Carnaval', 'Feria de las flores', 'Sombrero vueltiao', 'Ruana', 'Chiva', 'Transmilenio',
      'Café', 'Esmeralda', 'Orquídea', 'Cóndor', 'Páramo', 'Caño Cristales', 'Tayrona', 'Nevado del Ruiz', 'Río Magdalena', 'Guatapé',
    ],
  },
  peliculas: {
    etiqueta: 'Cine y series (géneros y cosas)',
    palabras: [
      'Comedia', 'Terror', 'Romance', 'Ciencia ficción', 'Western', 'Telenovela', 'Documental', 'Dibujos animados', 'Superhéroe', 'Pirata',
      'Vampiro', 'Zombi', 'Fantasma', 'Robot', 'Dinosaurio', 'Extraterrestre', 'Princesa', 'Dragón', 'Espía', 'Detective',
      'Palomitas', 'Alfombra roja', 'Director', 'Guion', 'Doblaje', 'Subtítulos', 'Estreno', 'Maratón de series', 'Final de temporada', 'Tráiler',
      'Efectos especiales', 'Extra', 'Villano', 'Secuela', 'Karaoke', 'Concierto', 'Disfraz', 'Máscara', 'Escenario', 'Aplausos',
    ],
  },
};

export const CLAVES_CATEGORIAS = Object.keys(CATEGORIAS);

/** Categoría especial: el servidor elige una al azar en cada partida. */
export const CATEGORIA_AL_AZAR = 'azar';
