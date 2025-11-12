// src/routes/appointmentRoutes.js
const express = require("express");
const router = express.Router();
const {
  createAppointment,
  getAppointments,
  updateAppointmentStatus, // confirmar, recusar, etc.
  getAvailableSlots,
  getClientAppointments,
  cancelAppointmentByClient,
  requestRescheduleByClient,
  cancelAppointmentByBusiness,
} = require("../controllers/appointmentController");

const { protect } = require("../middlewares/auth"); // padronizado
const requireSubscription = require("../middlewares/requireSubscription");
const enforceMonthlyLimit = require("../middlewares/enforceMonthlyLimit");

// Rotas públicas (clientes)
router.post(
  "/empresa/:id/agendamentos",
  requireSubscription,
  enforceMonthlyLimit,
  createAppointment
);
router.get("/empresa/:id/horarios-disponiveis", getAvailableSlots);
router.get("/empresa/:id/agendamentos-cliente", getClientAppointments);
router.delete("/agendamentos/:id", cancelAppointmentByClient);
router.patch("/agendamentos/:id/solicitar-remarcacao", requestRescheduleByClient);

// Quando um proprietário de empresa acessa o painel de agendamentos, o frontend
// solicita GET /empresa/:id/agendamentos passando o ID do usuário na URL. No back
// podemos reutilizar o controlador getAppointments, mas precisamos garantir que
// o ID no caminho corresponde ao usuário autenticado para evitar que um usuário
// acesse dados de outra empresa. Aqui aplicamos o middleware de proteção e
// fazemos a verificação antes de delegar ao controlador original.
router.get("/empresa/:id/agendamentos", protect, (req, res, next) => {
  const paramId = parseInt(req.params.id, 10);
  const userId = parseInt(req.user?.id, 10);
  // Se o ID na URL não corresponde ao usuário logado, retornamos 403.
  if (!userId || paramId !== userId) {
    return res.status(403).json({ message: "Operação não permitida." });
  }
  // Chama getAppointments com o mesmo req/res
  return getAppointments(req, res, next);
});

// Rotas protegidas (empresa)
router.use(protect);
router.get("/agendamentos", getAppointments);
router.patch("/agendamentos/:id/status", updateAppointmentStatus);
router.patch("/agendamentos/:id/cancelar", cancelAppointmentByBusiness);

module.exports = router;
