import { apiRequest, setAuthToken, clearAuth, getAuthToken } from './api';
import { API_ROUTES, STORAGE_KEYS } from '../utils/constants';

class AuthService {
  /**
   * Fazer login
   */
  async login(credentials) {
    try {
      const response = await apiRequest.post(API_ROUTES.AUTH.LOGIN, credentials);
      
      if (response.token && response.user) {
        setAuthToken(response.token);
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      clearAuth();
      throw error;
    }
  }
  
  /**
   * Fazer registro
   */
  async register(userData) {
    try {
      const response = await apiRequest.post(API_ROUTES.AUTH.REGISTER, userData);

      if (response.token && response.user) {
        setAuthToken(response.token);
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      clearAuth();
      throw error;
    }
  }
  
  /**
   * Fazer logout
   */
  async logout() {
    try {
      // A rota de logout agora é POST
      await apiRequest.post(API_ROUTES.AUTH.LOGOUT);
    } catch (error) {
      console.warn('Erro ao fazer logout na API, limpando localmente de qualquer maneira.', error.message);
    } finally {
      clearAuth();
    }
  }
  
  /**
   * Solicitar recuperação de senha
   */
  async forgotPassword(email) {
    try {
      return await apiRequest.post(API_ROUTES.AUTH.FORGOT_PASSWORD, { email });
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verificar código de recuperação
   */
  async verifyCode(token, code) {
    try {
      return await apiRequest.post(API_ROUTES.AUTH.VERIFY_CODE, { token, code });
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Redefinir senha
   */
  async resetPassword(token, code, password) {
    try {
      return await apiRequest.patch(API_ROUTES.AUTH.RESET_PASSWORD, { token, code, password });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Tenta validar a sessão atual com o servidor
   */
  async validateSession() {
    try {
      const response = await apiRequest.get(API_ROUTES.AUTH.PROFILE);
      return response;
    } catch (error) {
      // Se a validação falhar (ex: 401), o interceptor já terá limpado o token.
      // Apenas retornamos null para indicar que a sessão não é válida.
      return null;
    }
  }
  
  /**
   * Obter dados do usuário atual do localStorage
   */
  getCurrentUser() {
    try {
      const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Erro ao obter dados do usuário:', error);
      clearAuth();
      return null;
    }
  }
  
  /**
   * Verificar se usuário está autenticado (baseado em dados locais)
   */
  isAuthenticated() {
    const token = getAuthToken();
    return !!token;
  }
  
  /**
   * Atualizar dados do usuário no localStorage
   */
  updateUserData(userData) {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    } catch (error) {
      console.error('Erro ao atualizar dados do usuário:', error);
    }
  }
  
  /**
   * Obter token de autenticação
   */
  getToken() {
    return getAuthToken();
  }
}

// Exportar instância única do serviço
const authService = new AuthService();
export default authService;

