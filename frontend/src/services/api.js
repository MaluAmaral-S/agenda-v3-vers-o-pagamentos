import axios from 'axios';
import { API_BASE_URL, ERROR_MESSAGES, STORAGE_KEYS } from '../utils/constants';

// Criar instância do axios
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Variável para evitar loops de refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Interceptor para tratar respostas e erros
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const { response } = error;

    if (response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { token: newToken } = await api.post('/auth/refresh-token');
        setAuthToken(newToken);
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    // Tratar outros tipos de erro
    if (!response) {
      throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
    }
    
    const backendMessage = response.data?.error || response.data?.message;

    switch (response.status) {
      case 403:
        throw new Error(backendMessage || ERROR_MESSAGES.FORBIDDEN);
      case 404:
        throw new Error(backendMessage || ERROR_MESSAGES.NOT_FOUND);
      case 422:
        const validationErrors = response.data?.errors || {};
        const firstError = Object.values(validationErrors)[0];
        throw new Error(firstError || backendMessage || ERROR_MESSAGES.VALIDATION_ERROR);
      case 500:
        throw new Error(backendMessage || ERROR_MESSAGES.SERVER_ERROR);
      default:
        // Se não for 401, rejeita o erro para não quebrar a cadeia
        if(response.status !== 401) {
            throw new Error(backendMessage || ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    return Promise.reject(error);
  }
);

// Funções auxiliares para diferentes tipos de requisição
export const apiRequest = {
  get: async (url, config = {}) => {
    try {
      const response = await api.get(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  post: async (url, data = {}, config = {}) => {
    try {
      const response = await api.post(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  put: async (url, data = {}, config = {}) => {
    try {
      const response = await api.put(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  patch: async (url, data = {}, config = {}) => {
    try {
      const response = await api.patch(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  delete: async (url, config = {}) => {
    try {
      const response = await api.delete(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Função para definir token de autenticação
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    delete api.defaults.headers.common['Authorization'];
  }
};

// Função para obter token atual
export const getAuthToken = () => {
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
};

// Função para limpar dados de autenticação
export const clearAuth = () => {
  localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER_DATA);
  delete api.defaults.headers.common['Authorization'];
};

export default api;

// Export named para compatibilidade
export { api };
