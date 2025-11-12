const { Appointment, User, Service, BusinessHours, Subscription, Plan } = require("../models");
const { Op } = require("sequelize");
const validator = require("validator");
const { refundPaymentIntent } = require('../services/stripePaymentService');
const { processRefund: processMercadoPagoRefund } = require('../services/mercadoPagoPaymentService');
const logger = require('../utils/logger');
const { formatBusinessPublicData } = require('../utils/businessSlug');

const CLIENT_BASE_URL = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

// --- Funções Auxiliares de Tempo ---

/**
 * Converte uma string de tempo "HH:MM" para o total de minutos desde a meia-noite.
 * @param {string} timeString - A string de tempo a ser convertida.
 * @returns {number} - O total de minutos.
 */
const timeToMinutes = (timeString) => {
  if (!timeString || !/^\d{2}:\d{2}(?::\d{2})?$/.test(timeString)) return 0;
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * Converte um total de minutos em uma string de tempo "HH:MM".
 * @param {number} totalMinutes - O total de minutos a ser convertido.
 * @returns {string} - A string de tempo formatada.
 */
const minutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

// --- Funções de Validação de Agendamento ---

/**
 * Verifica se um determinado horário de agendamento está dentro do horário de funcionamento.
 * @param {Object} businessHours - O objeto de horários de funcionamento.
 * @param {number} dayOfWeek - O dia da semana (0-6).
 * @param {string} startTime - O horário de início do agendamento.
 * @param {string} endTime - O horário de término do agendamento.
 * @returns {boolean} - True se estiver dentro do horário, false caso contrário.
 */
const isWithinBusinessHours = (businessHours, dayOfWeek, startTime, endTime) => {
  const daySchedule = businessHours[dayOfWeek.toString()];
  if (!daySchedule || !daySchedule.isOpen || !Array.isArray(daySchedule.intervals)) {
    return false;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  return daySchedule.intervals.some(interval => {
    const intervalStart = timeToMinutes(interval.start);
    const intervalEnd = timeToMinutes(interval.end);
    return startMinutes >= intervalStart && endMinutes <= intervalEnd;
  });
};

/**
 * Verifica se há conflitos de horário para um novo agendamento.
 * @param {number} userId - O ID do usuário (empresa).
 * @param {string} date - A data do agendamento.
 * @param {string} startTime - O horário de início do agendamento.
 * @param {string} endTime - O horário de término do agendamento.
 * @param {number|null} excludeAppointmentId - O ID de um agendamento a ser excluído da verificação (para atualizações).
 * @returns {Promise<boolean>} - True se houver conflito, false caso contrário.
 */
const hasTimeConflict = async (userId, date, startTime, endTime, excludeAppointmentId = null) => {
  const whereClause = {
    userId,
    appointmentDate: date,
    status: ["confirmed", "pending"],
    [Op.or]: [
      { appointmentTime: { [Op.lt]: endTime }, endTime: { [Op.gt]: startTime } },
    ],
  };

  if (excludeAppointmentId) {
    whereClause.id = { [Op.ne]: excludeAppointmentId };
  }

  const conflictingCount = await Appointment.count({ where: whereClause });
  return conflictingCount > 0;
};

const getCancelDeadlineHours = () => {
  const raw = Number(process.env.CANCEL_DEADLINE_HOURS || 2);
  return Number.isNaN(raw) ? 2 : raw;
};

const getRefundWindowDays = () => {
  const raw = Number(process.env.REFUND_WINDOW_DAYS || 7);
  return Number.isNaN(raw) ? 7 : raw;
};

const buildRefundMetadata = (appointment, initiator) => ({
  appointmentId: String(appointment.id),
  businessId: String(appointment.userId),
  cancelledBy: initiator,
});

const processAppointmentCancellation = async (appointment, initiator) => {
  if (appointment.status === 'canceled') {
    return { appointment, refund: null, alreadyCanceled: true };
  }

  let refund = null;
  const hasMercadoPagoPayment =
    appointment.mpPaymentId && ['paid', 'partially_refunded'].includes(appointment.paymentStatus);
  const hasStripePayment = appointment.paymentIntentId && appointment.statusPagamento === 'pago';

  if (hasMercadoPagoPayment) {
    try {
      refund = await processMercadoPagoRefund({
        appointment,
        amount: null,
        initiator,
      });
      appointment.paymentStatus = 'refunded';
      appointment.statusPagamento = 'reembolsado';
      logger.audit('appointment.refund.mercadopago_initiated', {
        appointmentId: appointment.id,
        paymentId: appointment.mpPaymentId,
        initiator,
      });
    } catch (error) {
      logger.error('appointment.refund.mercadopago_failed', {
        appointmentId: appointment.id,
        paymentId: appointment.mpPaymentId,
        initiator,
        error: error.message,
      });
      throw new Error('Não foi possível processar o reembolso no Mercado Pago. Tente novamente em instantes.');
    }
  } else if (hasStripePayment) {
    try {
      refund = await refundPaymentIntent(appointment.paymentIntentId, {
        metadata: buildRefundMetadata(appointment, initiator),
      });
      appointment.statusPagamento = 'reembolsado';
      appointment.paymentStatus = 'refunded';
      logger.audit('appointment.refund.initiated', {
        appointmentId: appointment.id,
        paymentIntentId: appointment.paymentIntentId,
        initiator,
        refundId: refund.id,
      });
    } catch (error) {
      logger.error('appointment.refund.failed', {
        appointmentId: appointment.id,
        paymentIntentId: appointment.paymentIntentId,
        initiator,
        error: error.message,
      });
      throw new Error('Não foi possível processar o reembolso. Tente novamente em instantes.');
    }
  }

  appointment.status = 'canceled';
  await appointment.save();

  logger.audit('appointment.canceled', {
    appointmentId: appointment.id,
    userId: appointment.userId,
    initiator,
    refunded: Boolean(refund),
  });

  return { appointment, refund, alreadyCanceled: false };
};

// --- Controladores de Agendamento ---

/**
 * [PÚBLICO] Cria um novo agendamento para uma empresa.
 */
exports.createAppointment = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { serviceId, clientName, clientEmail, clientPhone, appointmentDate, appointmentTime, observations } = req.body;

    // Validação de entrada
    if (!serviceId || !clientName || !clientEmail || !clientPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ message: "Todos os campos obrigatórios devem ser preenchidos." });
    }
    if (!validator.isEmail(clientEmail)) {
      return res.status(400).json({ message: "Formato de e-mail do cliente inválido." });
    }

    const [business, service, businessHours, activeSubscription] = await Promise.all([
      User.findByPk(userId),
      Service.findOne({ where: { id: serviceId, userId } }),
      BusinessHours.findOne({ where: { userId } }),
      Subscription.findOne({
        where: { userId, status: 'active' },
        include: [{ model: Plan, as: 'plan' }],
        order: [['createdAt', 'DESC']],
      }),
    ]);

    if (!business) return res.status(404).json({ message: "Empresa não encontrada." });
    if (!service) return res.status(404).json({ message: "Serviço não encontrado." });
    if (!businessHours) return res.status(400).json({ message: "Horários de funcionamento não configurados para esta empresa." });

    const endTime = minutesToTime(timeToMinutes(appointmentTime) + service.duracao_minutos);
    const dayOfWeek = new Date(`${appointmentDate}T00:00:00`).getDay();

    if (!isWithinBusinessHours(businessHours.businessHours, dayOfWeek, appointmentTime, endTime)) {
      return res.status(400).json({ message: "Horário fora do funcionamento da empresa." });
    }

    const servicePrice = Number(service.preco);
    const planKey = (activeSubscription?.plan?.key || '').toLowerCase();
    const eligiblePlan = planKey === 'prata' || planKey === 'ouro';
    const hasMarketplace = Boolean(eligiblePlan && business.paymentsEnabled && business.mpAccessToken);
    const requiresPayment = Boolean(hasMarketplace && Number.isFinite(servicePrice) && servicePrice > 0);

    if (await hasTimeConflict(userId, appointmentDate, appointmentTime, endTime)) {
      const reusableAppointment = await Appointment.findOne({
        where: {
          userId,
          appointmentDate,
          appointmentTime,
          endTime,
          status: 'pending',
          clientEmail,
          clientPhone,
        },
        include: [{ model: Service, as: 'service', attributes: ['nome', 'duracao_minutos', 'preco'] }],
        order: [['updatedAt', 'DESC']],
      });

      const reusableStatuses = new Set(['pending', 'in_process']);

      if (reusableAppointment && reusableStatuses.has(reusableAppointment.paymentStatus)) {
        const updates = {};
        if (reusableAppointment.clientName !== clientName) {
          updates.clientName = clientName;
        }
        if (observations !== undefined && observations !== reusableAppointment.observations) {
          updates.observations = observations;
        }
        if (Object.keys(updates).length > 0) {
          await reusableAppointment.update(updates);
        }

        if (!reusableAppointment.mpExternalReference) {
          await reusableAppointment.update({ mpExternalReference: String(reusableAppointment.id) });
        }

        return res.status(200).json({
          message: requiresPayment
            ? 'Agendamento já existe. Retomaremos o pagamento no Mercado Pago.'
            : 'Você já possui um agendamento neste horário.',
          appointment: reusableAppointment,
          payment: requiresPayment
            ? {
                processor: 'mercadopago',
                status: reusableAppointment.paymentStatus,
                bookingId: reusableAppointment.id,
              }
            : null,
          reused: true,
        });
      }

      return res.status(409).json({ message: "Este horário não está disponível." }); // 409 Conflict
    }

    const newAppointment = await Appointment.create({
      userId,
      serviceId,
      clientName,
      clientEmail,
      clientPhone,
      appointmentDate,
      appointmentTime,
      endTime,
      observations,
      status: "pending",
      amount: Number.isFinite(servicePrice) ? servicePrice : null,
      currency: 'BRL',
      paymentStatus: requiresPayment ? 'pending' : 'not_required',
      statusPagamento: 'pendente',
    });

    if (!newAppointment.mpExternalReference) {
      await newAppointment.update({ mpExternalReference: String(newAppointment.id) });
    }

    const appointmentWithDetails = await Appointment.findByPk(newAppointment.id, {
      include: [{ model: Service, as: "service", attributes: ["nome", "duracao_minutos", "preco"] }]
    });

    return res.status(201).json({
      message: requiresPayment
        ? "Agendamento solicitado. Redirecionaremos para o pagamento no Mercado Pago."
        : "Agendamento solicitado com sucesso.",
      appointment: appointmentWithDetails,
      payment: requiresPayment
        ? {
            processor: 'mercadopago',
            status: 'pending',
            bookingId: appointmentWithDetails.id,
          }
        : null,
    });

  } catch (error) {
    console.error("Erro ao criar agendamento:", error);
    res.status(500).json({ message: "Erro interno do servidor ao criar agendamento." });
  }
};

/**
 * [PROTEGIDO] Lista os agendamentos de uma empresa com filtros e paginação.
 */
exports.getAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, date, page = 1, limit = 10 } = req.query;

    const whereClause = { userId };
    if (status) whereClause.status = status;
    if (date) whereClause.appointmentDate = date;

    const { count, rows: appointments } = await Appointment.findAndCountAll({
      where: whereClause,
      include: [{ model: Service, as: "service", attributes: ["nome", "duracao_minutos", "preco"] }],
      order: [["appointmentDate", "ASC"], ["appointmentTime", "ASC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.status(200).json({
      appointments,
      pagination: {
        totalItems: count,
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar agendamentos." });
  }
};

/**
 * [PROTEGIDO] Atualiza o status de um agendamento (confirmar, recusar, etc.).
 */
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { status, rejectionReason } = req.body;

    if (!status || !["confirmed", "rejected", "completed", "canceled", "rescheduled"].includes(status)) {
      return res.status(400).json({ message: "Status inválido." });
    }

    const appointment = await Appointment.findOne({ where: { id, userId } });

    if (!appointment) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    // Lógica para remarcação, se o status for 'rescheduled'
    if (status === "rescheduled") {
      const { suggestedDate, suggestedTime } = req.body;
      if (!suggestedDate || !suggestedTime) {
        return res.status(400).json({ message: "Data e hora sugeridas são obrigatórias para remarcação." });
      }

      const service = await Service.findByPk(appointment.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Serviço associado ao agendamento não encontrado." });
      }

      const newEndTime = minutesToTime(timeToMinutes(suggestedTime) + service.duracao_minutos);
      const dayOfWeek = new Date(`${suggestedDate}T00:00:00`).getDay();

      const businessHours = await BusinessHours.findOne({ where: { userId } });
      if (!businessHours) {
        return res.status(400).json({ message: "Horários de funcionamento não configurados para esta empresa." });
      }

      if (!isWithinBusinessHours(businessHours.businessHours, dayOfWeek, suggestedTime, newEndTime)) {
        return res.status(400).json({ message: "Horário sugerido fora do funcionamento da empresa." });
      }

      if (await hasTimeConflict(userId, suggestedDate, suggestedTime, newEndTime, id)) {
        return res.status(409).json({ message: "Horário sugerido não disponível." });
      }

      appointment.appointmentDate = suggestedDate;
      appointment.appointmentTime = suggestedTime;
      appointment.endTime = newEndTime;
      appointment.status = "rescheduled";

    } else {
      appointment.status = status;
      if (status === "rejected" && rejectionReason) {
        appointment.rejectionReason = rejectionReason;
      } else {
        appointment.rejectionReason = null; // Limpa a razão de rejeição se o status não for 'rejected'
      }
    }

    await appointment.save();

    res.status(200).json({ message: `Agendamento ${status} com sucesso.`, appointment });
  } catch (error) {
    console.error("Erro ao atualizar status do agendamento:", error);
    res.status(500).json({ message: "Erro interno do servidor ao atualizar status." });
  }
};

/**
 * [PÚBLICO] Busca horários disponíveis para um serviço em uma data específica.
 */
exports.getAvailableSlots = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { date, serviceId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ message: "Data e serviço são obrigatórios." });
    }

    const [service, businessHoursRecord] = await Promise.all([
      Service.findOne({ where: { id: serviceId, userId } }),
      BusinessHours.findOne({ where: { userId } })
    ]);

    if (!service) return res.status(404).json({ message: "Serviço não encontrado." });
    if (!businessHoursRecord) return res.status(400).json({ message: "Horários de funcionamento não configurados." });

    const dateObj = new Date(`${date}T00:00:00`);
    const dayOfWeek = dateObj.getDay();
    const daySchedule = businessHoursRecord.businessHours[dayOfWeek.toString()];

    if (!daySchedule || !daySchedule.isOpen || !Array.isArray(daySchedule.intervals)) {
      return res.status(200).json({ availableSlots: [] });
    }

    const existingAppointments = await Appointment.findAll({
      where: { userId, appointmentDate: date, status: ["pending", "confirmed", "rescheduled"] }
    });

    const bookedSlots = existingAppointments.map(app => ({
      start: timeToMinutes(app.appointmentTime),
      end: timeToMinutes(app.endTime)
    }));

    const availableSlots = [];
    const serviceDuration = service.duracao_minutos;
    const slotIncrement = parseInt(process.env.SLOT_INCREMENT || "15"); // Incremento em minutos

    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const interval of daySchedule.intervals) {
      let potentialStartMinutes = timeToMinutes(interval.start);
      const intervalEndMinutes = timeToMinutes(interval.end);

      while (potentialStartMinutes + serviceDuration <= intervalEndMinutes) {
        const potentialEndMinutes = potentialStartMinutes + serviceDuration;

        if (isToday && potentialStartMinutes < currentMinutes) {
          potentialStartMinutes += slotIncrement;
          continue;
        }

        const hasConflict = bookedSlots.some(booked => 
          potentialStartMinutes < booked.end && potentialEndMinutes > booked.start
        );

        if (!hasConflict) {
          availableSlots.push({ startTime: minutesToTime(potentialStartMinutes) });
        }
        
        potentialStartMinutes += slotIncrement;
      }
    }

    res.status(200).json({ availableSlots });

  } catch (error) {
    console.error("Erro ao buscar horários disponíveis:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar horários." });
  }
};

/**
 * [PÚBLICO] Lista os agendamentos de um cliente específico para uma empresa.
 */
exports.getClientAppointments = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { email, phone } = req.query;

    if (!email || !phone) {
      return res.status(400).json({ message: "Email e telefone são obrigatórios para a consulta." });
    }

    const appointments = await Appointment.findAll({
      where: { userId, clientEmail: email, clientPhone: phone },
      include: [{ model: Service, as: "service", attributes: ["nome", "duracao_minutos", "preco"] }],
      order: [["appointmentDate", "DESC"], ["appointmentTime", "DESC"]]
    });

    res.status(200).json({ appointments });
  } catch (error) {
    console.error("Erro ao buscar agendamentos do cliente:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

/**
 * [PÚBLICO] Permite que um cliente solicite a remarcação de um agendamento.
 */
exports.requestRescheduleByClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone, suggestedDate, suggestedTime } = req.body || {};

    if (!email || !phone || !suggestedDate || !suggestedTime) {
      return res.status(400).json({ message: "Email, telefone, data e horário sugeridos são obrigatórios." });
    }

    const appointment = await Appointment.findByPk(id);
    if (!appointment) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    if (appointment.clientEmail !== email || appointment.clientPhone !== phone) {
      return res.status(403).json({ message: "Você não tem permissão para alterar este agendamento." });
    }

    const service = await Service.findByPk(appointment.serviceId);
    if (!service) {
      return res.status(404).json({ message: "Serviço não encontrado para o agendamento." });
    }

    const businessHoursRecord = await BusinessHours.findOne({ where: { userId: appointment.userId } });
    if (!businessHoursRecord) {
      return res.status(400).json({ message: "Horários de funcionamento não configurados para esta empresa." });
    }

    const newEndTime = minutesToTime(timeToMinutes(suggestedTime) + service.duracao_minutos);
    const dayOfWeek = new Date(`${suggestedDate}T00:00:00`).getDay();

    if (!isWithinBusinessHours(businessHoursRecord.businessHours, dayOfWeek, suggestedTime, newEndTime)) {
      return res.status(400).json({ message: "Horário sugerido fora do funcionamento da empresa." });
    }

    if (await hasTimeConflict(appointment.userId, suggestedDate, suggestedTime, newEndTime, appointment.id)) {
      return res.status(409).json({ message: "Horário sugerido não disponível." });
    }

    appointment.suggestedDate = suggestedDate;
    appointment.suggestedTime = suggestedTime;
    appointment.suggestedEndTime = newEndTime;
    appointment.status = "rescheduled";
    await appointment.save();

    return res.status(200).json({
      message: "Solicitação de remarcação enviada com sucesso.",
      appointment,
    });
  } catch (error) {
    console.error("Erro ao solicitar remarcação:", error);
    res.status(500).json({ message: "Erro interno do servidor ao solicitar remarcação." });
  }
};

exports.cancelAppointmentByBusiness = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const appointment = await Appointment.findOne({ where: { id, userId } });

    if (!appointment) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }

    const { refund, alreadyCanceled } = await processAppointmentCancellation(appointment, 'business');

    if (alreadyCanceled) {
      return res.status(200).json({
        message: 'Agendamento já estava cancelado.',
        refundStatus: appointment.statusPagamento,
      });
    }

    return res.status(200).json({
      message: 'Agendamento cancelado pela empresa com sucesso.',
      refundStatus: appointment.statusPagamento,
      refundId: refund?.id || null,
    });
  } catch (error) {
    logger.error('appointment.cancel.business_failed', { error: error.message });
    return res.status(500).json({ message: error.message || 'Erro ao cancelar o agendamento.' });
  }
};

/**
 * [PÚBLICO] Permite que um cliente cancele um agendamento.
 */
exports.cancelAppointmentByClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone } = req.query;

    if (!email || !phone) {
      return res.status(400).json({ message: "Email e telefone são obrigatórios para cancelar." });
    }

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    if (appointment.clientEmail !== email || appointment.clientPhone !== phone) {
      return res.status(403).json({ message: "Você não tem permissão para cancelar este agendamento." });
    }

    const deadlineHours = getCancelDeadlineHours();
    const appointmentDateTime = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}`);
    const now = new Date();
    const hoursDifference = (appointmentDateTime - now) / (1000 * 60 * 60);

    if (hoursDifference < deadlineHours) {
      return res.status(400).json({
        message: `Não é possível cancelar com menos de ${deadlineHours} horas de antecedência.`,
      });
    }

    const { refund, alreadyCanceled } = await processAppointmentCancellation(appointment, 'client');

    if (alreadyCanceled) {
      return res.status(200).json({
        message: 'Este agendamento já havia sido cancelado.',
        refundStatus: appointment.statusPagamento,
      });
    }

    res.status(200).json({
      message: `Agendamento cancelado com sucesso. O valor será estornado em até ${getRefundWindowDays()} dias úteis.`,
      refundStatus: appointment.statusPagamento,
      refundId: refund?.id || null,
    });
  } catch (error) {
    logger.error('appointment.cancel.client_failed', { error: error.message });
    res.status(500).json({ message: error.message || "Erro interno do servidor." });
  }
};

module.exports = exports;
/**
 * [PÚBLICO] Retorna dados essenciais de um agendamento para exibição pós-checkout.
 */
exports.getAppointmentPublic = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findByPk(id, {
      include: [
        { model: Service, as: 'service', attributes: ['nome', 'preco', 'duracao_minutos'] },
        {
          model: User,
          as: 'business',
          attributes: [
            'id',
            'businessName',
            'name',
            'businessType',
            'email',
            'phone',
            'paymentsEnabled',
            'stripeChargesEnabled',
            'stripePayoutsEnabled',
            'mpUserId',
            'mpAccessToken',
          ],
        },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Agendamento n?o encontrado.' });
    }

    const businessFormatted = appointment.business ? formatBusinessPublicData(appointment.business) : null;
    const bookingUrl = businessFormatted ? `${CLIENT_BASE_URL}/agendamento/${businessFormatted.slug}` : null;

    return res.json({
      id: appointment.id,
      service: appointment.service
        ? {
            nome: appointment.service.nome,
            preco: appointment.service.preco,
            duracao_minutos: appointment.service.duracao_minutos,
          }
        : null,
      clientName: appointment.clientName,
      clientEmail: appointment.clientEmail,
      clientPhone: appointment.clientPhone,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      status: appointment.status,
      statusPagamento: appointment.statusPagamento,
      paymentStatus: appointment.paymentStatus,
      valorPago: appointment.valorPago,
      mpPaymentId: appointment.mpPaymentId,
      mpPreferenceId: appointment.mpPreferenceId,
      business: businessFormatted
        ? {
            id: businessFormatted.id,
            name: businessFormatted.name,
            ownerName: businessFormatted.ownerName,
            slug: businessFormatted.slug,
            email: businessFormatted.email,
            phone: businessFormatted.phone,
            bookingUrl,
          }
        : null,
    });
  } catch (error) {
    console.error('Erro ao obter agendamento p?blico:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};
