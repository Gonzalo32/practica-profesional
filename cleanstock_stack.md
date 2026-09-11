# CleanStock – Stack Técnico

## Lenguaje
- **JavaScript** (Node.js – runtime del servidor)

## Framework backend
- **Express.js v5** – manejo de rutas, middlewares y servidor HTTP

## Frontend
- **Sin framework** (no usa React, Angular ni Vue)
- HTML + CSS + JavaScript vanilla
- SPA manual: una sola página (`index.html`) con vistas manejadas desde `app.js`
- Servido estáticamente por Express desde la carpeta `public/`

## Base de datos
- **SQLite** – archivo local `cleanstock.sqlite` en la raíz del backend
- **Sequelize v6** – ORM para definir modelos, relaciones y sincronizar el esquema

## Autenticación / Seguridad
- **jsonwebtoken (JWT)** – generación y validación de tokens de acceso
- **bcryptjs** – hasheo de contraseñas

## Otros paquetes
- **dotenv** – carga de variables de entorno desde `.env`
- **cors** – habilita solicitudes cross-origin (útil para el frontend)

## Modelos / Entidades
- `User`
- `PhysicalSpace`
- `Category`
- `Product`
- `StockEntry`
- `Order`
- `OrderItem`
- `ActivityLog`

## Rutas API (`/api/...`)
| Prefijo           | Archivo              |
|-------------------|----------------------|
| `/api/auth`     | authRoutes.js        |
| `/api/users`    | userRoutes.js        |
| `/api/inventory`| inventoryRoutes.js   |
| `/api/orders`   | orderRoutes.js       |
| `/api/spaces`   | spaceRoutes.js       |

## Puerto por defecto
- `3000` (configurable por variable de entorno `PORT`)
