const { Appointment, User, Service, BusinessHours } = require("../models");
const { Op } = require("sequelize");
const validator = require("validator");

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

    const [business, service, businessHours] = await Promise.all([
      User.findByPk(userId),
      Service.findOne({ where: { id: serviceId, userId } }),
      BusinessHours.findOne({ where: { userId } })
    ]);

    if (!business) return res.status(404).json({ message: "Empresa não encontrada." });
    if (!service) return res.status(404).json({ message: "Serviço não encontrado." });
    if (!businessHours) return res.status(400).json({ message: "Horários de funcionamento não configurados para esta empresa." });

    const endTime = minutesToTime(timeToMinutes(appointmentTime) + service.duracao_minutos);
    const dayOfWeek = new Date(`${appointmentDate}T00:00:00`).getDay();

    if (!isWithinBusinessHours(businessHours.businessHours, dayOfWeek, appointmentTime, endTime)) {
      return res.status(400).json({ message: "Horário fora do funcionamento da empresa." });
    }

    if (await hasTimeConflict(userId, appointmentDate, appointmentTime, endTime)) {
      return res.status(409).json({ message: "Este horário não está disponível." }); // 409 Conflict
    }

    const newAppointment = await Appointment.create({
      userId, serviceId, clientName, clientEmail, clientPhone, 
      appointmentDate, appointmentTime, endTime, observations, status: "pending"
    });

    const appointmentWithDetails = await Appointment.findByPk(newAppointment.id, {
      include: [{ model: Service, as: "service", attributes: ["nome", "duracao_minutos", "preco"] }]
    });

    res.status(201).json({
      message: "Agendamento solicitado com sucesso. Aguardando confirmação.",
      appointment: appointmentWithDetails
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

    // Regra de negócio: não permitir cancelamento muito perto do horário
    const appointmentDateTime = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}`);
    const now = new Date();
    const hoursDifference = (appointmentDateTime - now) / (1000 * 60 * 60);
    if (hoursDifference < (process.env.CANCEL_DEADLINE_HOURS || 2)) {
        return res.status(400).json({ message: `Não é possível cancelar com menos de ${process.env.CANCEL_DEADLINE_HOURS || 2} horas de antecedência.` });
    }

    appointment.status = "canceled";
    await appointment.save();

    res.status(200).json({ message: "Agendamento cancelado com sucesso." });
  } catch (error) {
    console.error("Erro ao cancelar agendamento pelo cliente:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

module.exports = exports;

