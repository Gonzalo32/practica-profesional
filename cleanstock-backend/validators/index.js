const { body, param, query } = require('express-validator');
const { validate } = require('../middlewares/validate');

// Reglas de validación de entrada por endpoint. Cada arreglo termina con `validate`,
// que corta la petición con 400 y un mensaje claro si algo no cumple.

const ROLES = ['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable', 'Proveedor'];
const BRANCH_TYPES = ['filial', 'Zona', 'sucursal', 'dependencia', 'sector'];
const ORDER_STATUSES = ['EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECHAZADO'];
const INFORMAL_ENTRY_TYPES = ['ENCONTRADO', 'DONACION', 'DEVOLUCION', 'EXCEDENTE', 'SIN_OC'];
const EXIT_TYPES = ['VENTA', 'CONSUMO', 'ROTURA', 'VENCIDO', 'OTRO'];

const mongoId = (field, label) => body(field).isMongoId().withMessage(`${label} inválido`);
const optionalMongoId = (field, label) => body(field).optional({ values: 'falsy' }).isMongoId().withMessage(`${label} inválido`);
const idParam = (name = 'id') => param(name).isMongoId().withMessage('Identificador inválido');
const positiveInt = (field, label) => body(field).isInt({ min: 1 }).withMessage(`${label} debe ser un número entero mayor a 0`).toInt();
const requiredText = (field, label, max = 200) => body(field)
  .isString().withMessage(`${label} es obligatorio`)
  .trim()
  .notEmpty().withMessage(`${label} es obligatorio`)
  .isLength({ max }).withMessage(`${label} no puede superar ${max} caracteres`);
const optionalText = (field, label, max = 500) => body(field)
  .optional({ values: 'null' })
  .isString().withMessage(`${label} debe ser texto`)
  .trim()
  .isLength({ max }).withMessage(`${label} no puede superar ${max} caracteres`);

const login = [
  requiredText('username', 'El usuario'),
  body('password').isString().notEmpty().withMessage('La contraseña es obligatoria'),
  validate
];

const validationToken = [
  mongoId('orderId', 'Pedido'),
  validate
];

const createUser = [
  body('username').isEmail().withMessage('El correo electrónico no es válido').normalizeEmail({ gmail_remove_dots: false }),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('El correo electrónico no es válido').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isString().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('role').isIn(ROLES).withMessage('Rol inválido'),
  optionalMongoId('physicalSpaceId', 'Sucursal'),
  optionalMongoId('supplierId', 'Proveedor'),
  body('supplierId').if(body('role').equals('Proveedor')).isMongoId().withMessage('Seleccioná la empresa proveedora del usuario'),
  optionalText('firstName', 'El nombre', 80),
  optionalText('lastName', 'El apellido', 80),
  validate
];

const updateUser = [
  idParam(),
  body('username').optional().isEmail().withMessage('El correo electrónico no es válido').normalizeEmail({ gmail_remove_dots: false }),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('El correo electrónico no es válido').normalizeEmail({ gmail_remove_dots: false }),
  body('password').optional({ values: 'falsy' }).isString().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('role').optional().isIn(ROLES).withMessage('Rol inválido'),
  optionalMongoId('physicalSpaceId', 'Sucursal'),
  optionalMongoId('supplierId', 'Proveedor'),
  validate
];

const branch = [
  requiredText('name', 'El nombre de la sucursal', 100),
  body('type').optional().isIn(BRANCH_TYPES).withMessage('Tipo de sucursal inválido'),
  optionalText('address', 'La dirección', 200),
  optionalText('phone', 'El teléfono', 50),
  optionalText('description', 'La descripción', 200),
  validate
];

const branchUpdate = [
  idParam(),
  body('name').optional().isString().trim().notEmpty().withMessage('El nombre no puede quedar vacío').isLength({ max: 100 }),
  body('type').optional().isIn(BRANCH_TYPES).withMessage('Tipo de sucursal inválido'),
  optionalText('address', 'La dirección', 200),
  optionalText('phone', 'El teléfono', 50),
  optionalText('description', 'La descripción', 200),
  validate
];

const space = [
  requiredText('name', 'El nombre del espacio', 100),
  body('type').isIn(BRANCH_TYPES).withMessage(`Tipo inválido. Debe ser uno de: ${BRANCH_TYPES.join(', ')}`),
  optionalText('description', 'La descripción', 200),
  validate
];

const spaceUpdate = [
  idParam(),
  body('name').optional().isString().trim().notEmpty().withMessage('El nombre no puede quedar vacío').isLength({ max: 100 }).withMessage('El nombre no puede superar 100 caracteres'),
  body('type').optional().isIn(BRANCH_TYPES).withMessage(`Tipo inválido. Debe ser uno de: ${BRANCH_TYPES.join(', ')}`),
  optionalText('description', 'La descripción', 200),
  validate
];

const stockAdjust = [
  idParam(),
  mongoId('productId', 'Producto'),
  body('quantity').isInt().withMessage('La cantidad debe ser un número entero').toInt(),
  requiredText('reason', 'El motivo', 200),
  validate
];

const category = [
  requiredText('name', 'El nombre de la categoría', 80),
  optionalText('description', 'La descripción', 300),
  validate
];

const productFields = [
  optionalMongoId('categoryId', 'Categoría'),
  optionalText('description', 'La descripción', 500),
  body('minimumStock').optional().isInt({ min: 0 }).withMessage('El stock mínimo debe ser un número entero mayor o igual a 0').toInt(),
  body('sku').optional({ values: 'falsy' }).isString().trim().isLength({ max: 40 }).withMessage('El SKU no puede superar 40 caracteres'),
  body('perishable').optional().isBoolean().withMessage('Indicá si el producto tiene vencimiento').toBoolean()
];

const createProduct = [
  requiredText('name', 'El nombre del producto', 120),
  ...productFields,
  validate
];

const updateProduct = [
  idParam(),
  body('name').optional().isString().trim().notEmpty().withMessage('El nombre no puede quedar vacío').isLength({ max: 120 }),
  ...productFields,
  validate
];

const stockEntry = [
  mongoId('productId', 'Producto'),
  mongoId('branchId', 'Sucursal'),
  positiveInt('quantity', 'La cantidad'),
  // Lote y vencimiento: el controlador los exige solo si el producto es perecedero
  optionalText('lotNumber', 'El número de lote', 60),
  body('expirationDate').optional({ values: 'falsy' }).isISO8601().withMessage('El vencimiento debe ser una fecha válida'),
  optionalMongoId('supplierId', 'Proveedor'),
  validate
];

const informalEntry = [
  mongoId('productId', 'Producto'),
  mongoId('branchId', 'Sucursal'),
  positiveInt('quantity', 'La cantidad'),
  body('entryType').isIn(INFORMAL_ENTRY_TYPES).withMessage(`Tipo de ingreso inválido. Usar uno de: ${INFORMAL_ENTRY_TYPES.join(', ')}`),
  requiredText('description', 'La descripción', 500),
  validate
];

const stockExit = [
  mongoId('productId', 'Producto'),
  mongoId('branchId', 'Sucursal'),
  positiveInt('quantity', 'La cantidad'),
  body('exitType').isIn(EXIT_TYPES).withMessage(`Tipo de egreso inválido. Usar uno de: ${EXIT_TYPES.join(', ')}`),
  optionalText('description', 'El motivo', 500),
  validate
];

const createOrder = [
  body('items').isArray({ min: 1 }).withMessage('El carrito está vacío'),
  body('items.*.productId').isMongoId().withMessage('Producto inválido en el pedido'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Las cantidades deben ser números enteros mayores a 0').toInt(),
  optionalMongoId('fromBranchId', 'Sucursal de origen'),
  optionalMongoId('toBranchId', 'Sucursal de destino'),
  optionalText('notes', 'Las notas', 500),
  validate
];

const approveOrder = [
  idParam('orderId'),
  body('validationToken').isString().notEmpty().withMessage('Se requiere un token de validación'),
  validate
];

const orderStatus = [
  idParam('orderId'),
  body('status').isIn(ORDER_STATUSES).withMessage('Estado inválido'),
  validate
];

const branchMinStock = [
  mongoId('branchId', 'Sucursal'),
  mongoId('productId', 'Producto'),
  body('branchMinStock').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('El mínimo debe ser un entero mayor o igual a 0'),
  validate
];

const supplier = [
  requiredText('name', 'La razón social', 120),
  body('cuit').optional({ values: 'falsy' }).matches(/^\d{2}-?\d{8}-?\d$/).withMessage('El CUIT debe tener 11 dígitos (ej: 30-12345678-9)'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('El correo electrónico no es válido'),
  optionalText('contactName', 'El contacto', 100),
  optionalText('phone', 'El teléfono', 50),
  optionalText('address', 'La dirección', 200),
  optionalText('notes', 'Las notas', 500),
  body('productIds').optional().isArray().withMessage('Productos inválidos'),
  body('productIds.*').isMongoId().withMessage('Producto inválido'),
  validate
];

const supplierUpdate = [idParam(), ...supplier];

const purchaseOrder = [
  mongoId('supplierId', 'Proveedor'),
  mongoId('branchId', 'Sucursal'),
  body('items').isArray({ min: 1 }).withMessage('Agregá al menos un producto a la orden de compra'),
  body('items.*.productId').isMongoId().withMessage('Producto inválido'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Las cantidades deben ser enteros mayores a 0'),
  optionalText('notes', 'Las notas', 500),
  validate
];

const receivePurchaseOrder = [
  idParam(),
  body('lots').optional().isArray().withMessage('Lotes inválidos'),
  body('lots.*.productId').isMongoId().withMessage('Producto inválido'),
  body('lots.*.lotNumber').optional({ values: 'falsy' }).isString().trim(),
  body('lots.*.expirationDate').optional({ values: 'falsy' }).isISO8601().withMessage('Indicá una fecha de vencimiento válida'),
  validate
];

const createCount = [
  mongoId('branchId', 'Sucursal'),
  optionalText('notes', 'Las notas', 500),
  validate
];

const updateCount = [
  idParam(),
  body('items').isArray().withMessage('Ítems inválidos'),
  body('items.*.productId').isMongoId().withMessage('Producto inválido'),
  body('items.*.countedQty').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('Las cantidades contadas deben ser enteros mayores o iguales a 0'),
  validate
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
  query('limit').optional().isInt({ min: 0 }).withMessage('Límite inválido'),
  query('branchId').optional({ values: 'falsy' }).isMongoId().withMessage('Sucursal inválida'),
  query('productId').optional({ values: 'falsy' }).isMongoId().withMessage('Producto inválido'),
  query('from').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha desde inválida'),
  query('to').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha hasta inválida'),
  validate
];

const settings = [
  body('businessName').optional().isString().trim().notEmpty().withMessage('El nombre del negocio no puede quedar vacío').isLength({ max: 80 }),
  body('singleBranchMode').optional().isBoolean().withMessage('Modo de trabajo inválido').toBoolean(),
  optionalMongoId('mainBranchId', 'Local principal'),
  validate
];

const onlyId = [idParam(), validate];

module.exports = {
  login,
  validationToken,
  createUser,
  updateUser,
  branch,
  branchUpdate,
  space,
  spaceUpdate,
  stockAdjust,
  category,
  createProduct,
  updateProduct,
  stockEntry,
  informalEntry,
  stockExit,
  createOrder,
  approveOrder,
  orderStatus,
  branchMinStock,
  supplier,
  supplierUpdate,
  purchaseOrder,
  receivePurchaseOrder,
  createCount,
  updateCount,
  listQuery,
  settings,
  onlyId
};
