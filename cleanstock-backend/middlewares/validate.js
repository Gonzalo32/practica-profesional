const { validationResult } = require('express-validator');

// Corta la petición con 400 y el primer error de validación encontrado
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ message: first.msg, field: first.path, errors: errors.array() });
  }
  next();
};

module.exports = { validate };
