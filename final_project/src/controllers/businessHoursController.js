const BusinessHours = require("../models/BusinessHours");

/**
 * Horários de funcionamento padrão para um novo usuário.
 * Representa os dias da semana (0=Domingo, 6=Sábado).
 */
const DEFAULT_BUSINESS_HOURS = {
  "0": { isOpen: false, intervals: [] }, // Domingo
  "1": { isOpen: true,  intervals: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }] }, // Segunda
  "2": { isOpen: true,  intervals: [{ start: "08:00", end: "18:00" }] }, // Terça
  "3": { isOpen: true,  intervals: [{ start: "08:00", end: "18:00" }] }, // Quarta
  "4": { isOpen: true,  intervals: [{ start: "08:00", end: "18:00" }] }, // Quinta
  "5": { isOpen: true,  intervals: [{ start: "08:00", end: "18:00" }] }, // Sexta
  "6": { isOpen: true,  intervals: [{ start: "09:00", end: "13:00" }] }  // Sábado
};

/**
 * Verifica se uma string está no formato HH:MM.
 * @param {string} timeString - A string de tempo a ser verificada.
 * @returns {boolean} - True se a string estiver no formato HH:MM, false caso contrário.
 */
const isHHMM = (timeString) => /^\d{2}:\d{2}$/.test(timeString);

/**
 * Converte uma string de tempo HH:MM para minutos totais desde a meia-noite.
 * @param {string} timeString - A string de tempo no formato HH:MM.
 * @returns {number} - O número total de minutos.
 */
const toMinutes = (timeString) => {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * Normaliza os intervalos de um único dia, filtrando inválidos e mesclando sobreposições.
 * @param {Object} dayObject - Objeto representando os horários de um dia.
 * @param {boolean} dayObject.isOpen - Indica se o estabelecimento está aberto neste dia.
 * @param {Array<Object>} dayObject.intervals - Array de objetos { start: "HH:MM", end: "HH:MM" }.
 * @returns {Object} - Objeto normalizado com isOpen e intervalos mesclados.
 */
const normalizeDay = (dayObject) => {
  if (!dayObject || !dayObject.isOpen) {
    return { isOpen: false, intervals: [] };
  }

  let validIntervals = (dayObject.intervals || [])
    .filter(interval => 
      interval && 
      isHHMM(interval.start) && 
      isHHMM(interval.end) && 
      toMinutes(interval.start) < toMinutes(interval.end)
    )
    .map(interval => ({ start: interval.start, end: interval.end }))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const mergedIntervals = [];
  for (const currentInterval of validIntervals) {
    if (mergedIntervals.length === 0) {
      mergedIntervals.push(currentInterval);
      continue;
    }

    const lastMergedInterval = mergedIntervals[mergedIntervals.length - 1];
    if (toMinutes(currentInterval.start) <= toMinutes(lastMergedInterval.end)) {
      // Mescla intervalos sobrepostos ou adjacentes
      if (toMinutes(currentInterval.end) > toMinutes(lastMergedInterval.end)) {
        lastMergedInterval.end = currentInterval.end;
      }
    } else {
      mergedIntervals.push(currentInterval);
    }
  }
  return { isOpen: mergedIntervals.length > 0, intervals: mergedIntervals };
};

/**
 * Normaliza todos os horários de funcionamento para a semana inteira.
 * @param {Object} businessHoursPayload - Objeto contendo os horários de funcionamento para cada dia.
 * @returns {Object} - Objeto com horários de funcionamento normalizados para todos os 7 dias.
 */
const normalizeAllBusinessHours = (businessHoursPayload) => {
  const normalizedHours = {};
  for (let day = 0; day <= 6; day++) {
    normalizedHours[day] = normalizeDay(businessHoursPayload?.[day]);
  }
  return normalizedHours;
};

/**
 * Obtém os horários de funcionamento do usuário autenticado.
 * Se não existirem, cria com valores padrão.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.getBusinessHours = async (req, res) => {
  try {
    const userId = req.user.id;
    const [businessHoursRecord] = await BusinessHours.findOrCreate({
      where: { userId },
      defaults: { userId, businessHours: DEFAULT_BUSINESS_HOURS }
    });
    res.status(200).json(businessHoursRecord);
  } catch (error) {
    console.error("Erro ao buscar horários de funcionamento:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar horários de funcionamento.", error: error.message });
  }
};

/**
 * Salva ou atualiza os horários de funcionamento do usuário autenticado.
 * Os horários são normalizados antes de serem salvos.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.saveBusinessHours = async (req, res) => {
  try {
    const userId = req.user.id;
    const { businessHours } = req.body;

    if (!businessHours) {
      return res.status(400).json({ message: "Dados de horários de funcionamento são obrigatórios." });
    }

    const normalizedBusinessHours = normalizeAllBusinessHours(businessHours);

    const [businessHoursRecord, created] = await BusinessHours.findOrCreate({
      where: { userId },
      defaults: { userId, businessHours: normalizedBusinessHours }
    });

    if (!created) {
      businessHoursRecord.businessHours = normalizedBusinessHours;
      await businessHoursRecord.save();
    }

    res.status(200).json({ message: "Horários de funcionamento salvos com sucesso!", businessHours: businessHoursRecord.businessHours });
  } catch (error) {
    console.error("Erro ao salvar horários de funcionamento:", error);
    res.status(500).json({ message: "Erro interno do servidor ao salvar horários de funcionamento.", error: error.message });
  }
};

