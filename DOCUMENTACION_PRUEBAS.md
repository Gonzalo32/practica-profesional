# 📋 Documentación de Cambios, Pruebas y Casos de Prueba

**Proyecto:** CleanStock — Sistema de Gestión de Inventario  
**Módulo:** 📥 Ingresos o Provisiones (Stock e Ingresos Extraordinarios)  
**Ubicación:** `cleanstock-backend` (Raíz del proyecto)

---

## 1. 🛠️ Qué se Hizo

Se rediseñó el módulo de entrada de inventario para transformarlo en una vista orientada a **Ingresos y Provisiones de Stock**:

1. **Navegación Lateral:**
   - Se actualizó el menú lateral renombrando *"Gestión de Inventario"* por **`📥 Ingresos o Provisiones`**.
2. **Vista Principal (`#panel-responsable`):**
   - Se reemplazó la vista anterior por una **tabla de ancho completo** que muestra el historial reciente de ingresos y provisiones.
   - Se agregaron dos botones de acción principal en la cabecera:
     - `➕ Agregar Ingreso` (Abre el pop-up de ingreso de stock estándar con lote y vencimiento).
     - `📌 Ingreso Extraordinario` (Abre el pop-up de ingreso fuera de orden de compra / donación / hallazgo).
3. **Pop-up Formulario — Ingreso Estándar (`#modal-create-stock-entry`):**
   - Selector de **Sucursal Destino**.
   - Campos de alta de ítem: Insumo, Cantidad, Lote y Fecha de Vencimiento + botón **`➕`**.
   - **Lógica de agrupación inteligente:**
     - Si se agrega un artículo con el **mismo Producto, mismo Lote y misma Fecha de Vencimiento**, se **suman las cantidades** en la lista.
     - Si coincide el Producto pero varía el **Lote o Fecha de Vencimiento**, se mantienen en **filas separadas**.
4. **Pop-up Formulario — Ingreso Extraordinario (`#modal-create-informal-entry`):**
   - Campos: **Sucursal Destino**, **Tipo de Ingreso** (`ENCONTRADO`, `DONACION`, `DEVOLUCION`, `EXCEDENTE`, `SIN_OC`), **Descripción / Motivo**.
   - Selección de producto, cantidad y botón **`➕`** para armar la lista dinámica de carga.

---

## 2. 🧪 Qué se Probó

- **Pruebas de Interfaz y Navegación:**
  - Apertura y cierre de modales emergentes sin recargar la página.
  - Renderizado dinámico de la tabla de lista temporal antes de confirmar.
  - Reseteo automático de formularios tras la confirmación o cancelación.
- **Pruebas de Lógica de Agrupación:**
  - Inserción repetida del mismo ítem + mismo lote + misma fecha -> verificación del incremento en la columna cantidad.
  - Inserción del mismo ítem con lote distinto -> verificación de creación de nueva fila.
- **Pruebas de Backend y Persistencia:**
  - Verificación de la API `POST /api/inventory/stock` e incremento del stock en `BranchStock`.
  - Verificación de la API `POST /api/inventory/informal-entry` e inserción en el registro de auditoría (`ActivityLog`).
  - Carga y actualización en tiempo real de la tabla principal de Ingresos y de la vista de Stock por Sucursal.

---

## 3. 📝 Casos de Prueba (Para Revisión por Compañero)

### **Caso de Prueba 1: Registro de Ingreso Estándar con Agrupación**
* **Objetivo:** Validar la carga de insumos con lote y fecha de vencimiento y la regla de suma/separación de filas.
* **Pasos:**
  1. Iniciar sesión como `Administrador` o `Usuario Responsable`.
  2. En el menú lateral, hacer click en **`📥 Ingresos o Provisiones`**.
  3. Hacer click en el botón **`➕ Agregar Ingreso`**.
  4. Seleccionar la **Sucursal Destino** (ej: *Sucursal Centro*).
  5. Cargar Insumo: *Paracetamol 500mg*, Cantidad: `10`, Lote: `LOT-100`, Vencimiento: `2027-12-31` y presionar **`➕`**.
  6. Repetir la carga exactamente igual (*Paracetamol 500mg*, Cantidad: `5`, Lote: `LOT-100`, Vencimiento: `2027-12-31`) y presionar **`➕`**.
  7. Cargar el mismo insumo con lote distinto (*Paracetamol 500mg*, Cantidad: `8`, Lote: `LOT-200`, Vencimiento: `2027-12-31`) y presionar **`➕`**.
* **Resultado Esperado:**
  - La lista del modal debe mostrar **2 filas**: la primera con `15` unidades (Lote `LOT-100`) y la segunda con `8` unidades (Lote `LOT-200`).
  - Al presionar **Confirmar Ingreso de Stock**, se cierra el modal, aparece el mensaje de éxito y la tabla principal muestra los registros ingresados.

---

### **Caso de Prueba 2: Ingreso Extraordinario / Sin Orden de Compra**
* **Objetivo:** Validar el registro de insumos sin lote/vencimiento pero con motivo justificado.
* **Pasos:**
  1. En el panel **`📥 Ingresos o Provisiones`**, hacer click en **`📌 Ingreso Extraordinario`**.
  2. Seleccionar Sucursal Destino, Tipo de Ingreso (ej: `🔍 Encontrado en depósito`) y escribir una Descripción (ej: *"Hallazgo durante inventario físico en estantería B"*).
  3. Seleccionar un producto, indicar cantidad `20` y presionar **`➕`**.
  4. Hacer click en **Confirmar Ingreso Extraordinario**.
* **Resultado Esperado:**
  - El sistema procesa la solicitud, muestra notificación de éxito y añade la fila a la tabla principal con la etiqueta **📌 Extraordinario**.
  - Al ir a **`📊 Stock por Sucursal`**, el stock disponible de la sucursal seleccionada debe haberse incrementado en 20 unidades.

---

## 4. 💡 Sugerencias y Futuras Mejoras

1. **Impresión de Comprobante / Remito de Ingreso (PDF):**
   - Permitir descargar un PDF resumen firmado por el responsable al confirmar un ingreso masivo de stock.
2. **Exportación de Historial:**
   - Botón para exportar la tabla de Ingresos y Provisiones a **CSV / Excel** filtrando por rango de fechas.
3. **Escáner de Código de Barras / QR:**
   - Integrar lectura con escáner para completar el número de lote y fecha de vencimiento automáticamente al recibir mercadería.
4. **Notificaciones de Vencimiento Próximo:**
   - Alerta visual automática en la tabla cuando la fecha de vencimiento ingresada esté a menos de 30 días de vencer.
