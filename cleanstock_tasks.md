# 📦 CleanStock - Desglose de Tareas del Sistema

Basado en la especificación del proyecto, aquí tienes un desglose estructurado en tareas (épicas y subtareas) para comenzar a desarrollar **CleanStock**. El enfoque principal está en la seguridad (RBAC + Tokens) y el flujo operativo.

---

## 🔐 Épica 1: Autenticación, Seguridad y Tokens de Validación
*Dado que la seguridad y el control de accesos (RBAC) son requerimientos clave (RF2, RNF01, RNF02), esta debe ser la base del sistema.*

- [x] **T1.1 Configurar base de datos para Usuarios y Roles.**
  - Crear tablas/modelos para `Usuarios`, `Roles` y `Permisos`.
  - Encriptar contraseñas (bcrypt o similar) antes de guardar (RNF01).
- [x] **T1.2 Implementar sistema de Login y Generación de Tokens.**
  - Crear endpoint de inicio de sesión.
  - Implementar generación de JWT (JSON Web Tokens) al loguear exitosamente.
  - Incluir el rol del usuario (Admin, Solicitante, etc.) dentro del payload del token.
- [x] **T1.3 Implementar Middlewares de Validación de Tokens.**
  - Crear un middleware para verificar que la petición HTTP contenga un token JWT válido.
  - Crear un middleware de autorización que lea el rol del token y permita o deniegue el acceso a ciertas rutas (RBAC).
- [x] **T1.4 Sistema de Tokens para Validaciones Específicas.**
  - Implementar generación de tokens de un solo uso (o corta duración) para acciones sensibles (ej. aprobación del Administrador de un pedido urgente o restablecimiento de contraseñas).
- [x] **T1.5 Registro de Actividad (Auditoría/Logs).**
  - Desarrollar un sistema de logging que guarde qué usuario (extraído del token) realizó cada acción importante (RNF02).

## 👥 Épica 2: Gestión de Usuarios (Módulo Administrador)
*Refiere al RF1 y los conflictos de interés del Administrador.*

- [x] **T2.1 CRUD de Usuarios.**
  - Endpoint y UI para que el Administrador registre nuevos usuarios.
  - Endpoint y UI para modificar datos o roles de usuarios existentes.
  - Endpoint y UI para dar de baja (soft delete o bloqueo) a cuentas de usuario.
- [x] **T2.2 Panel de Control de Administrador (Dashboard).**
  - Interfaz exclusiva para ver usuarios activos, roles asignados y un resumen rápido del sistema.

## 📦 Épica 3: Gestión de Inventario Multirubro
*Refiere a RF3, RF4 y la responsabilidad del 'Usuario Responsable'.*

- [x] **T3.1 Modelado de Productos y Categorías.**
  - Crear modelos para `Rubros/Categorías` y `Productos`.
  - Crear interfaz para dar de alta/modificar categorías.
- [x] **T3.2 Registro de Ingresos de Stock (Usuario Responsable).**
  - Formulario de ingreso de stock con validación de campos obligatorios.
  - Inserción de atributos técnicos críticos: Nombre, Lote, Fecha de Vencimiento y Cantidad.
- [x] **T3.3 Lógica de control de duplicados.**
  - Estandarizar la información (Objetivo Secundario 3) al ingresar nuevos insumos, evitando nombres ambiguos.

## 🛒 Épica 4: Catálogo y Módulo de Pedidos (Solicitante)
*Refiere a RF5, RF6 y RF7.*

- [x] **T4.1 Catálogo Interactivo.**
  - Desarrollar vista de catálogo de productos para el Solicitante.
  - Implementar barra de búsqueda y filtros por categorías/rubros.
- [x] **T4.2 Carrito y Generación de Órdenes.**
  - Funcionalidad de "Carrito" temporal (almacenado en sesión o base de datos).
  - Endpoint para convertir el carrito en una `Orden de Pedido` formal.
- [x] **T4.3 Flujo de Aprobación Administrador (Condicional).**
  - Lógica para detectar si una orden requiere validación del Admin antes de pasar al Despachante.
  - Notificación y uso del token de validación por parte del Admin para aprobar la orden.

## 🚚 Épica 5: Trazabilidad y Procesamiento de Pedidos (Despachante)
*Refiere a RF6, RF7 y el seguimiento de ciclo de vida.*

- [x] **T5.1 Panel del Despachante.**
  - Lista de órdenes entrantes, ordenadas por prioridad o fecha.
- [x] **T5.2 Máquina de Estados del Pedido.**
  - Lógica y UI para avanzar el estado: `Pendiente` ➔ `En Preparación` ➔ `Despachado`.
- [x] **T5.3 Confirmación de Recepción.**
  - Interfaz para el Solicitante o Usuario Responsable para marcar el pedido como `Entregado`.
- [x] **T5.4 Trazabilidad e Historial.**
  - Historial de movimientos que documente por qué personas (y roles) pasó cada pedido y el tiempo entre cada estado.

## 🎨 Épica 6: Frontend, UX y Requerimientos No Funcionales
- [x] **T6.1 Diseño Responsivo (RNF04).**
  - Asegurar que todas las interfaces (especialmente catálogo y paneles) funcionen en móviles y PC.
- [x] **T6.2 UI/UX basada en la Identidad Visual.**
  - Implementar la paleta de colores: Celestes claros (tecnología/procesos limpios) y Verdes (eficiencia).
  - Fuentes y contrastes que reflejen simplicidad ("Clean") pero importancia y peso ("Stock").
- [x] **T6.3 Optimización y Compatibilidad.**
  - Pruebas Cross-Browser (RNF07) y optimización para soportar usuarios concurrentes sin degradar tiempos de respuesta (RNF03).
