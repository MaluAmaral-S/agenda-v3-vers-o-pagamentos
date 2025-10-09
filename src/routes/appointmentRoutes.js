// src/routes/appointmentRoutes.js
const express = require("express");
const router = express.Router();
const {
  createAppointment,
  getAppointments,
  updateAppointmentStatus, // Função unificada para confirmar, recusar, etc.
  getAvailableSlots,
  getClientAppointments,
  cancelAppointmentByClient,
  // requestRescheduleByClient, // Esta função não foi implementada no controller, remover ou implementar
} = require("../controllers/appointmentController");
const { protect } = require("../controllers/authController"); // Usar 'protect' em vez de 'authenticateToken'
const requireSubscription = require("../middleware/requireSubscription");
const enforceMonthlyLimit = require("../middleware/enforceMonthlyLimit");

// Rotas públicas (para clientes)
router.post(
  "/empresa/:id/agendamentos",
  requireSubscription,
  enforceMonthlyLimit,
  createAppointment
);
router.get("/empresa/:id/horarios-disponiveis", getAvailableSlots);
router.get("/empresa/:id/agendamentos-cliente", getClientAppointments);
router.delete("/agendamentos/:id", cancelAppointmentByClient);
// router.patch("/agendamentos/:id/solicitar-remarcacao", requestRescheduleByClient); // Descomentar se for implementar

// Rotas protegidas (para empresas)
router.use(protect); // Aplica o middleware de proteção a todas as rotas abaixo

router.get("/agendamentos", getAppointments); // Rota para listar agendamentos do usuário logado
router.patch("/agendamentos/:id/status", updateAppointmentStatus); // Rota para atualizar o status do agendamento

module.exports = router;

