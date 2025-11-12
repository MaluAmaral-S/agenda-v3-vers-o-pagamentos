// src/services/api.js
// Compat: fornece 'apiRequest' como função e também com helpers .get/.post/.put/.patch/.delete
// Mantém export default 'api' (axios instance) e named exports de token helpers.
// Inclui fluxo de refresh automático ao receber 401 { code: 'TOKEN_EXPIRED' }.

import axios from 'axios';

// Usamos a mesma chave de armazenamento definida em STORAGE_KEYS.AUTH_TOKEN (utils/constants.js)
// para que AuthService e o interceptor de refresh compartilhem o mesmo token. Isso evita
// inconsistências entre diferentes locais de armazenamento de token. O valor é 'agendapro_token'.
const ACCESS_TOKEN_KEY = 'agendapro_token';
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// ---------- Token helpers ----------
export function getAuthToken() {
  try { return localStorage.getItem(ACCESS_TOKEN_KEY); } catch { return null; }
}
export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {}
}
export function clearAuth() {
  try { localStorage.removeItem(ACCESS_TOKEN_KEY); } catch {}
}

// ---------- Axios instance ----------
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// injeta Bearer em cada request
api.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

let isRefreshing = false;
let waitQueue = [];

function notifyQueue(newToken) {
  waitQueue.forEach(({ resolve }) => resolve(newToken));
  waitQueue = [];
}
function waitForRefresh() {
  return new Promise((resolve) => waitQueue.push({ resolve }));
}
function getApiRoot() {
  const base = api.defaults.baseURL || '';
  return base.endsWith('/api') ? base.slice(0, -4) : base;
}

// refresh automático e repetição da request original
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error?.config || {};
    const status = error?.response?.status;
    const code = error?.response?.data?.code;

    if (status === 401 && code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const root = getApiRoot();
          const { data } = await axios.post(`${root}/api/auth/refresh`, {}, { withCredentials: true });
          setAuthToken(data?.accessToken);
          isRefreshing = false;
          notifyQueue(data?.accessToken);
        } catch (e) {
          isRefreshing = false;
          waitQueue = [];
          clearAuth();
          return Promise.reject(e);
        }
      }

      const newToken = await waitForRefresh();
      original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newToken}` };
      return api(original);
    }

    if (status === 401) {
      clearAuth();
    }

    return Promise.reject(error);
  }
);

// ---------- Helper principal (retorna .data) ----------
async function baseRequest(method, url, data = undefined, config = {}) {
  const resp = await api({ method, url, data, ...config });
  return resp.data;
}

// exporta como função e com helpers de método para compatibilidade
export const apiRequest = Object.assign(
  function(method, url, data, config) {
    return baseRequest(method, url, data, config);
  },
  {
    get: (url, config = {}) => baseRequest('get', url, undefined, config),
    post: (url, data, config = {}) => baseRequest('post', url, data, config),
    put: (url, data, config = {}) => baseRequest('put', url, data, config),
    patch: (url, data, config = {}) => baseRequest('patch', url, data, config),
    delete: (url, config = {}) => baseRequest('delete', url, undefined, config),
  }
);

// Export default para usos existentes: import api from '@/services/api'
export default api;
