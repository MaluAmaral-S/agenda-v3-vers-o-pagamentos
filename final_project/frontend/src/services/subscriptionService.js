import { apiRequest } from './api';
import { API_ROUTES } from '@/utils/constants';

export const fetchPlans = () => apiRequest.get(API_ROUTES.SUBSCRIPTIONS.PLANS);

export const createSubscription = (planKey) =>
  apiRequest.post(API_ROUTES.SUBSCRIPTIONS.CREATE, { planKey });

export const fetchMySubscription = () =>
  apiRequest.get(API_ROUTES.SUBSCRIPTIONS.ME);

export const createStripeCheckoutSession = (planId) =>
  apiRequest.post(API_ROUTES.STRIPE.CREATE_CHECKOUT, { planId });

export const createStripePortalSession = () =>
  apiRequest.post(API_ROUTES.STRIPE.CREATE_PORTAL);


export const fetchSubscription = () => apiRequest.get(API_ROUTES.SUBSCRIPTIONS.CURRENT);
