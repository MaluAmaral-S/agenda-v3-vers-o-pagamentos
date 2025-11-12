// src/controllers/businessController.js
const { User, Service, BusinessHours, Appointment } = require('../models');
const { Op, fn, col } = require('sequelize');
const { findBusinessBySlug, formatBusinessPublicData } = require('../utils/businessSlug');

// GET /api/empresa/:businessName/dados - Obter dados públicos da empresa
const getBusinessByName = async (req, res) => {
  try {
    const { businessName } = req.params;
    const decoded = decodeURIComponent(businessName || '');
    const business =
      (await findBusinessBySlug(decoded)) ||
      (await User.findOne({
        where: {
          businessName: {
            [Op.iLike]: `%${decoded.replace(/-/g, ' ')}%`,
          },
        },
        attributes: ['id', 'name', 'businessName', 'businessType', 'email', 'phone'],
      }));

    if (!business) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const formatted = formatBusinessPublicData(business);

    res.json({
      data: {
        id: formatted.id,
        name: formatted.ownerName,
        businessName: formatted.name,
        businessType: formatted.businessType,
        email: formatted.email,
        phone: formatted.phone,
        slug: formatted.slug,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar dados da empresa:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// GET /api/empresa/:businessName/servicos - Obter serviços públicos da empresa
const getBusinessServices = async (req, res) => {
  try {
    const { businessName } = req.params;
    const decoded = decodeURIComponent(businessName || '');

    const business =
      (await findBusinessBySlug(decoded)) ||
      (await User.findOne({
        where: {
          businessName: {
            [Op.iLike]: decoded.replace(/-/g, ' '),
          },
        },
      }));

    if (!business) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const services = await Service.findAll({
      where: { userId: business.id },
      attributes: ['id', 'nome', 'descricao', 'duracao_minutos', 'preco'],
      order: [['nome', 'ASC']],
    });

    res.json({
      data: services,
    });
  } catch (error) {
    console.error('Erro ao buscar serviços da empresa:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// GET /api/empresa/:businessName/horarios - Obter horários de funcionamento públicos
const getBusinessHours = async (req, res) => {
  try {
    const { businessName } = req.params;
    const decoded = decodeURIComponent(businessName || '');

    const business =
      (await findBusinessBySlug(decoded)) ||
      (await User.findOne({
        where: {
          businessName: {
            [Op.iLike]: decoded.replace(/-/g, ' '),
          },
        },
      }));

    if (!business) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const businessHours = await BusinessHours.findOne({
      where: { userId: business.id },
    });

    res.json({
      data: businessHours ? businessHours.businessHours : {},
    });
  } catch (error) {
    console.error('Erro ao buscar horários da empresa:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// GET /api/empresa/:businessName/completo - Obter todos os dados públicos da empresa
// src/controllers/businessController.js

const getCompleteBusinessData = async (req, res) => {
  try {
    const { businessSlug } = req.params;
    const business = await findBusinessBySlug(decodeURIComponent(businessSlug || ''));

    if (!business) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const services = await Service.findAll({
      where: { userId: business.id },
      attributes: ['id', 'nome', 'descricao', 'duracao_minutos', 'preco'],
      order: [['nome', 'ASC']],
    });

    const businessHours = await BusinessHours.findOne({
      where: { userId: business.id },
    });

    const formatted = formatBusinessPublicData(business);

    res.json({
      business: {
        id: formatted.id,
        slug: formatted.slug,
        name: formatted.name,
        ownerName: formatted.ownerName,
        businessType: formatted.businessType,
        email: formatted.email,
        phone: formatted.phone,
        paymentsEnabled: formatted.paymentsEnabled,
        stripeChargesEnabled: formatted.stripeChargesEnabled,
        stripePayoutsEnabled: formatted.stripePayoutsEnabled,
        mpUserId: formatted.mpUserId,
        mpConnected: formatted.mpConnected,
      },
      services,
      businessHours: businessHours ? businessHours.businessHours : {},
    });
  } catch (error) {
    console.error('Erro ao buscar dados completos da empresa:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.user;

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. Today's Bookings
    const todayBookings = await Appointment.count({
      where: {
        userId,
        appointmentDate: {
          [Op.gte]: startOfToday,
          [Op.lt]: endOfToday,
        },
        status: { [Op.in]: ['confirmed', 'pending'] },
      },
    });

    // 2. Month's Bookings
    const monthBookings = await Appointment.count({
      where: {
        userId,
        appointmentDate: {
          [Op.between]: [startOfMonth, endOfMonth],
        },
        status: { [Op.in]: ['confirmed', 'pending'] },
      },
    });

    // 3. Active Services
    const activeServices = await Service.count({
      where: { userId },
    });

    // 4. Monthly Revenue
    const monthlyRevenueResult = await Appointment.findOne({
      attributes: [
        [fn('SUM', col('service.preco')), 'totalRevenue'],
      ],
      include: [{
        model: Service,
        as: 'service',
        attributes: [],
      }],
      where: {
        userId,
        appointmentDate: {
          [Op.between]: [startOfMonth, endOfMonth],
        },
        status: 'confirmed',
      },
      group: ['Appointment.userId'],
      raw: true,
    });
    
    const monthlyRevenue = monthlyRevenueResult ? parseFloat(monthlyRevenueResult.totalRevenue) : 0;

    res.json({
      todayBookings,
      monthBookings,
      activeServices,
      monthlyRevenue,
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getBusinessByName,
  getBusinessServices,
  getBusinessHours,
  getCompleteBusinessData,
  getDashboardStats
};
