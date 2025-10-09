// src/routes/serviceRoutes.js
const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/serviceController");
const { protect } = require("../controllers/authController"); // Importa o middleware de proteção

// Todas as rotas de serviços são protegidas, exigindo que o usuário esteja logado.
router.use(protect);

router.route("/")
  .post(serviceController.createService) // Rota para CRIAR um serviço (POST /api/servicos)
  .get(serviceController.getServices);   // Rota para LISTAR os serviços (GET /api/servicos)

router.route("/:id")
  .put(serviceController.updateService) // Rota para ATUALIZAR um serviço (PUT /api/servicos/123)
  .delete(serviceController.deleteService); // Rota para DELETAR um serviço (DELETE /api/servicos/123)

module.exports = router;

