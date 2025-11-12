// src/routes/businessRoutes.js
const express = require('express');
const router = express.Router();
const { User, Service, BusinessHours } = require("../models/index");
const { findBusinessBySlug, formatBusinessPublicData } = require("../utils/businessSlug");

// Buscar dados da empresa por slug
router.get('/business/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const business = await findBusinessBySlug(slug);

    if (!business) return res.status(404).json({ message: 'Empresa não encontrada' });

    const services = await Service.findAll({
      where: { userId: business.id },
      attributes: ['id', 'nome', 'descricao', 'duracao_minutos', 'preco'],
    });

    const businessHours = await BusinessHours.findOne({ where: { userId: business.id } });
    const formatted = formatBusinessPublicData(business);

    res.json({
      business: {
        id: formatted.id,
        name: formatted.name,
        ownerName: formatted.ownerName,
        slug: formatted.slug,
        email: formatted.email,
        phone: formatted.phone,
        paymentsEnabled: formatted.paymentsEnabled,
        stripeChargesEnabled: formatted.stripeChargesEnabled,
        stripePayoutsEnabled: formatted.stripePayoutsEnabled,
      },
      services,
      businessHours: businessHours ? businessHours.businessHours : {},
    });
  } catch (error) {
    console.error('Erro ao buscar dados da empresa:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Criar agendamento público
router.post('/booking', async (req, res) => {
  try {
    const { businessSlug, serviceId, date, time, clientData } = req.body;

    if (!businessSlug || !serviceId || !date || !time || !clientData?.nome || !clientData?.telefone) {
      return res.status(400).json({ message: 'Dados obrigatórios não fornecidos' });
    }

    const business = await User.findOne({
      where: { businessName: { [require('sequelize').Op.iLike]: businessSlug.replace(/-/g, ' ') } }
    });
    if (!business) return res.status(404).json({ message: 'Empresa não encontrada' });

    const service = await Service.findOne({ where: { id: serviceId, userId: business.id } });
    if (!service) return res.status(404).json({ message: 'Serviço não encontrado' });

    const bookingData = {
      id: Date.now(),
      businessId: business.id,
      serviceId: service.id,
      serviceName: service.nome,
      date,
      time,
      clientName: clientData.nome,
      clientPhone: clientData.telefone,
      clientEmail: clientData.email || null,
      status: 'confirmed',
      createdAt: new Date()
    };

    console.log('Agendamento criado:', bookingData);
    res.status(201).json({ message: 'Agendamento criado com sucesso', booking: bookingData });

  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;
