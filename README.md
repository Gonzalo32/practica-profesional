# CleanStock

**Datos claros generan información confiable.**

CleanStock es un sistema web de gestión de stock por sucursales para empresas, comercios y supermercados. Centraliza el catálogo de productos y marcas, los ingresos de mercadería, las provisiones de los proveedores, los lotes con vencimiento y los pedidos internos entre sucursales, con control de acceso según el rol de cada usuario.

Proyecto Final de Práctica Profesional II — IFES. Grupo: Guerrero, Marambio.

## Funcionalidades

- Inicio de sesión con roles: Administrador, Usuario Responsable, Solicitante, Despachante y Proveedor. Cada rol ve solo su menú y su sucursal.
- Catálogo de productos con categorías, marcas (elegidas de una lista con buscador, sin duplicados), SKU y stock mínimo.
- Stock por sucursal con lotes, vencimiento y marca; ingresos manuales, baja por variantes (lote por lote) e historial de movimientos.
- Provisiones: la mercadería de los proveedores se carga pendiente y entra al stock recién cuando el Responsable o el Administrador la aprueba; se puede ver y corregir.
- Pedidos entre sucursales: solo se ofrecen productos con stock en el origen; se pueden modificar o cancelar mientras no se preparan; los grandes pasan por Revisión y los aprueba el Administrador o el Responsable de la sucursal de origen; el Despachante elige los lotes al preparar.
- Alertas de stock bajo y de vencimientos, con salida FEFO (primero vence, primero sale), e Inicio con lo pendiente de la sucursal propia.
- Conteo físico de inventario con ajuste de diferencias.
- Panel con gráficos y exportación a Excel y PDF.
- Auditoría de las acciones de los usuarios.

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| Frontend | HTML y JavaScript sin frameworks, dividido en módulos (`public/js/`); estilos con Tailwind CSS; Chart.js, SheetJS y jsPDF desde CDN |
| Backend | Node.js con Express 5, organizado en rutas, middlewares, validadores, controladores, servicios y modelos |
| Base de datos | MongoDB con Mongoose |
| Seguridad | JWT, bcryptjs, helmet, express-rate-limit y express-validator |
| Pruebas | node:test, Supertest y mongodb-memory-server |

## Requisitos

- [Node.js](https://nodejs.org/) 22 o superior (probado con Node.js 24).
- Una base de datos MongoDB: una instalación local o un cluster gratuito de [MongoDB Atlas](https://www.mongodb.com/atlas).
  Si no hay ninguna disponible, el sistema arranca igual con una base en memoria, útil para probarlo; los datos se pierden al cerrarlo.

## Instalación

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Gonzalo32/practica-profesional.git
   cd practica-profesional/cleanstock-backend
   ```

2. Instalar las dependencias:

   ```bash
   npm install
   ```

3. Crear el archivo de configuración a partir del ejemplo y completarlo:

   ```bash
   cp .env.example .env
   ```

   | Variable | Para qué sirve |
   | --- | --- |
   | `PORT` | Puerto del servidor. Por defecto, 3000 |
   | `MONGODB_URI` | Cadena de conexión a MongoDB (local o Atlas) |
   | `JWT_SECRET` | Secreto con el que se firman los tokens de sesión. Usar un texto largo y aleatorio |
   | `ADMIN_INITIAL_PASSWORD` | Contraseña del usuario de prueba `admin@cleanstock.com` |
   | `LOGIN_RATE_LIMIT` | Intentos fallidos de inicio de sesión permitidos cada 15 minutos. Opcional, por defecto 10 |
   | `DEMO_DATA` | Con `true`, si la base está vacía se cargan datos de demostración al iniciar. Opcional |

   El archivo `.env` contiene claves y no se sube al repositorio.

## Ejecución

```bash
npm start
```

Abrir <http://localhost:3000> en el navegador (o el puerto configurado en `PORT`).

Durante el desarrollo, `npm run dev` reinicia el servidor cada vez que se guarda un archivo. Los estilos se escriben en `src/tailwind.css`; después de cambiarlos, `npm run build:css` genera `public/style.css` (o `npm run watch:css` mientras se trabaja).

### Usuario de prueba

Si la base no tiene ningún administrador, al arrancar se crea el usuario **admin@cleanstock.com** con la contraseña de `ADMIN_INITIAL_PASSWORD`. Si esa variable no está definida, se genera una clave al azar y se muestra una sola vez en la consola.

Para crear o restablecer ese usuario en cualquier momento:

```bash
npm run seed:admin
```

Conviene cambiar la contraseña después del primer ingreso. Desde el panel del Administrador se crean los demás usuarios, sucursales y productos.

### Datos de demostración

Para probar el sistema con datos de ejemplo, sobre una base **vacía**:

```bash
npm run seed:demo
```

Carga tres sucursales, nueve productos con lotes y vencimientos, dos proveedores con provisiones aprobadas y pendientes, pedidos en todos los estados y un usuario por rol. Los datos se cargan a través de la propia API, así que pasan por las mismas validaciones y reglas que el uso normal. Si la base ya tiene productos o pedidos, el comando no hace nada: nunca borra ni pisa datos.

Usuarios (todos con la contraseña de `ADMIN_INITIAL_PASSWORD`):

| Usuario | Rol |
| --- | --- |
| `admin@cleanstock.com` | Administrador |
| `responsable@cleanstock.com` | Usuario Responsable (Depósito Central) |
| `norte@cleanstock.com` | Solicitante (Sucursal Norte) |
| `sur@cleanstock.com` | Solicitante (Sucursal Sur) |
| `despachante@cleanstock.com` | Despachante |
| `proveedor@cleanstock.com` | Proveedor (Química del Sur SA) |

Con `DEMO_DATA=true` en el `.env`, los mismos datos se cargan al iniciar el servidor si la base está vacía. Sirve para la base en memoria, que se usa cuando no hay conexión con MongoDB. La base en memoria descarga MongoDB (unos 780 MB) la primera vez que se usa, así que conviene arrancarla una vez con conexión antes de necesitarla sin internet.

## Pruebas

```bash
npm test
```

Corre 75 pruebas automatizadas sobre una base de datos en memoria, sin tocar la base real. Cubren autenticación, permisos por rol y por sucursal, pedidos, stock, provisiones, marcas, proveedores, conteos, configuración, espacios físicos, reportes y datos de demostración.

## Estructura del proyecto

```
cleanstock-backend/
├── app.js            Arma la aplicación Express (seguridad, rutas y manejo de errores)
├── server.js         Conecta la base y levanta el servidor
├── seed_admin.js     Crea o restablece el usuario de prueba
├── config/           Conexión a MongoDB
├── routes/           Endpoints de la API, uno por recurso
├── middlewares/      Token, roles, acceso por sucursal y validación
├── validators/       Reglas de los datos de entrada
├── controllers/      Lógica de cada operación
├── services/         Stock atómico, lotes, configuración del negocio y datos de demostración
├── models/           Esquemas de Mongoose
├── utils/            Funciones auxiliares
├── src/              Fuente de los estilos (Tailwind CSS)
├── public/           Frontend: index.html, style.css (generado) y módulos en js/
└── tests/            Pruebas automatizadas
```

## API

La API REST se publica bajo `/api` y, salvo el inicio de sesión, exige un token JWT en el encabezado `Authorization: Bearer <token>`.

| Recurso | Uso |
| --- | --- |
| `/api/auth` | Inicio de sesión |
| `/api/users` | Usuarios y auditoría |
| `/api/branches` | Sucursales, stock por sucursal y movimientos |
| `/api/inventory` | Categorías, marcas, productos, ingresos, provisiones y lotes |
| `/api/orders` | Pedidos: alta, modificación, cancelación, aprobación, preparación por variantes, estados e historial |
| `/api/alerts` | Alertas de stock y vencimientos, indicadores |
| `/api/suppliers` | Proveedores (las órdenes de compra siguen en la API, sin pantalla) |
| `/api/counts` | Conteos físicos de inventario |
| `/api/reports` | Datos del panel |
| `/api/spaces` | Espacios físicos |
| `/api/settings` | Configuración del negocio (sin pantalla) |
