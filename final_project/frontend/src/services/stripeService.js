// frontend/src/services/stripeService.js
import api from './api';

export const createCheckoutSession = async (planId) => {
    try {
        const response = await api.post('/stripe/create-checkout-session', { planId });
        return response.data;
    } catch (error) {
        // Extraia a mensagem de erro do objeto retornado pelo backend para evitar logs como [object Object]
        const backendMessage = error.response?.data?.error || error.response?.data?.message;
        const message = backendMessage || error.message || 'Erro desconhecido';
        console.error('Erro ao criar sessão de checkout:', message, error.response?.data);
        throw new Error(message);
    }
};

export const createPortalSession = async () => {
    try {
        const response = await api.post('/stripe/create-portal-session');
        return response.data;
    } catch (error) {
        const backendMessage = error.response?.data?.error || error.response?.data?.message;
        const message = backendMessage || error.message || 'Erro desconhecido';
        console.error('Erro ao criar sessão do portal:', message, error.response?.data);
        throw new Error(message);
    }
};