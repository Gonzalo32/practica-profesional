# CleanStock – Stack Técnico

## Lenguaje
- **JavaScript** (Node.js – runtime del servidor)

## Framework backend
- **Express.js v5** – manejo de rutas, middlewares y servidor HTTP
- La aplicación se arma en `app.js` y `server.js` solo la levanta (así los tests la usan sin abrir un puerto)

## Frontend
- **Sin framework** (no usa React, Angular ni Vue)
- HTML + CSS + JavaScript vanilla
- SPA manual: una sola página (`index.html`) con la lógica dividida en módulos dentro de `public/js/`:
  `core.js` (API, helpers, modales), `auth.js` (sesión y navegación), `admin.js`, `orders.js`, `dispatch.js`,
  `inventory.js`, `catalog.js`, `branches.js`, `expirations.js`, `counts.js`, `suppliers.js`, `export.js`, `notifications.js`
- Modo claro / oscuro con variables CSS
- Librerías por CDN (cdnjs): **Chart.js** (gráficos), **SheetJS** y **jsPDF** (exportar a Excel y PDF, se cargan al exportar)
- Servido estáticamente por Express desde la carpeta `public/`

## Base de datos
- **MongoDB** – base de datos NoSQL documental
- **Mongoose v9** – ODM para definir Schemas, validaciones y modelos
- Los movimientos de stock usan operaciones atómicas (`$inc` con condición) para evitar inconsistencias con usuarios simultáneos

## Autenticación / Seguridad
- **jsonwebtoken (JWT)** – generación y validación de tokens de acceso (el secreto se toma de `JWT_SECRET`)
- **bcryptjs** – hasheo de contraseñas
- **helmet** – encabezados HTTP de seguridad (incluye Content-Security-Policy)
- **express-rate-limit** – límite de intentos fallidos de login
- **express-validator** – validación de los datos de entrada en cada endpoint
- El frontend escapa todo texto antes de insertarlo en el HTML (prevención de XSS)

## Otros paquetes
- **dotenv** – carga de variables de entorno desde `.env`
- **cors** – habilita solicitudes cross-origin (útil para el frontend)

## Tests
- **node:test** (runner incluido en Node.js) + **supertest** + **mongodb-memory-server**
- Ejecutar con `npm test` dentro de `cleanstock-backend/` (usa una base en memoria, no toca la base real)

## Modelos / Entidades
- `User`
- `PhysicalSpace`
- `Category`
- `Product` (con SKU, código de barras y costo)
- `StockEntry` (lotes con vencimiento y saldo)
- `StockMovement` (registro de cada ingreso, egreso, ajuste, transferencia y conteo)
- `Order`
- `OrderItem`
- `ActivityLog`
- `BranchStock`
- `Supplier`
- `PurchaseOrder`
- `InventoryCount`
- `Counter` (números correlativos: PED-0001, OC-0001)

## Rutas API (`/api/...`)
| Prefijo           | Archivo              |
|-------------------|----------------------|
| `/api/auth`       | authRoutes.js        |
| `/api/users`      | userRoutes.js        |
| `/api/inventory`  | inventoryRoutes.js   |
| `/api/orders`     | orderRoutes.js       |
| `/api/branches`   | branchRoutes.js      |
| `/api/alerts`     | alertRoutes.js       |
| `/api/spaces`     | spaceRoutes.js       |
| `/api/suppliers`  | supplierRoutes.js    |
| `/api/counts`     | countRoutes.js       |
| `/api/reports`    | reportRoutes.js      |

## Puerto por defecto
- `3000` (configurable por variable de entorno `PORT`)

## Usuario administrador inicial
- Si la base no tiene ningún administrador, al iniciar se crea `admin@cleanstock.com`
  con la contraseña de `ADMIN_INITIAL_PASSWORD` (o `admin123` si no está definida). Conviene cambiarla al ingresar.
