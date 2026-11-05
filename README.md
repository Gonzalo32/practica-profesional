# CleanStock

**Datos claros generan información confiable.**

CleanStock es un sistema web de gestión de stock por sucursales para empresas, comercios y supermercados. Centraliza el catálogo de productos, los ingresos y egresos de mercadería, los lotes con vencimiento, los pedidos internos entre sucursales y las compras a proveedores, con control de acceso según el rol de cada usuario.

Proyecto Final de Práctica Profesional II — IFES. Grupo: Guerrero, Marambio.

## Funcionalidades

- Inicio de sesión con roles: Administrador, Usuario Responsable, Solicitante, Despachante y Proveedor.
- Catálogo de productos con categorías, SKU y stock mínimo.
- Ingresos de stock con lote y vencimiento, ingresos extraordinarios, egresos y mermas.
- Pedidos entre sucursales con aprobación, panel de despacho (Kanban) y trazabilidad de cada estado.
- Proveedores y órdenes de compra.
- Alertas de stock bajo y de vencimientos, con salida FEFO (primero vence, primero sale).
- Conteo físico de inventario con ajuste de diferencias.
- Panel con gráficos y exportación a Excel y PDF.
- Modo para comercios de un solo local.
- Auditoría de las acciones de los usuarios.

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| Frontend | HTML, CSS y JavaScript sin frameworks, dividido en módulos (`public/js/`); Chart.js, SheetJS y jsPDF desde CDN |
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

   El archivo `.env` contiene claves y no se sube al repositorio.

## Ejecución

```bash
npm start
```

Abrir <http://localhost:3000> en el navegador (o el puerto configurado en `PORT`).

Durante el desarrollo, `npm run dev` reinicia el servidor cada vez que se guarda un archivo.

### Usuario de prueba

Si la base no tiene ningún administrador, al arrancar se crea el usuario **admin@cleanstock.com** con la contraseña de `ADMIN_INITIAL_PASSWORD`. Si esa variable no está definida, se genera una clave al azar y se muestra una sola vez en la consola.

Para crear o restablecer ese usuario en cualquier momento:

```bash
npm run seed:admin
```

Conviene cambiar la contraseña después del primer ingreso. Desde el panel del Administrador se crean los demás usuarios, sucursales y productos.

## Pruebas

```bash
npm test
```

Corre 50 pruebas automatizadas sobre una base de datos en memoria, sin tocar la base real. Cubren autenticación, permisos por rol y por sucursal, pedidos, stock, proveedores, conteos, configuración, espacios físicos y reportes.

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
├── services/         Stock atómico, lotes y configuración del negocio
├── models/           Esquemas de Mongoose
├── utils/            Funciones auxiliares
├── public/           Frontend: index.html, style.css y módulos en js/
└── tests/            Pruebas automatizadas
```

## API

La API REST se publica bajo `/api` y, salvo el inicio de sesión, exige un token JWT en el encabezado `Authorization: Bearer <token>`.

| Recurso | Uso |
| --- | --- |
| `/api/auth` | Inicio de sesión y token de validación de pedidos |
| `/api/users` | Usuarios y auditoría |
| `/api/branches` | Sucursales, stock por sucursal y movimientos |
| `/api/inventory` | Categorías, productos, ingresos, egresos y lotes |
| `/api/orders` | Pedidos, aprobación, estados e historial |
| `/api/alerts` | Alertas de stock y vencimientos, indicadores |
| `/api/suppliers` | Proveedores y órdenes de compra |
| `/api/counts` | Conteos físicos de inventario |
| `/api/reports` | Datos del panel |
| `/api/spaces` | Espacios físicos |
| `/api/settings` | Configuración del negocio |
