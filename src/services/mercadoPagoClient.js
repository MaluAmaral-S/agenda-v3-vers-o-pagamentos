const axios = require('axios');

const API_BASE_URL = process.env.MP_API_BASE_URL || 'https://api.mercadopago.com';

function createMercadoPagoClient(accessToken, options = {}) {
  if (!accessToken) {
    throw new Error('Access token do Mercado Pago é obrigatório.');
  }

  return axios.create({
    baseURL: API_BASE_URL,
    timeout: options.timeout || 15000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

module.exports = {
  API_BASE_URL,
  createMercadoPagoClient,
};
