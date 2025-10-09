import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CalendarCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || (user?.onboardingCompleted === false ? '/primeiros-passos' : '/painel');
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);
  
  const validateLogin = () => {
    const newErrors = {};
    if (!loginData.email) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(loginData.email)) {
      newErrors.email = 'Email inválido';
    }
    if (!loginData.password) newErrors.password = 'Senha é obrigatória';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateLogin()) return;
    setIsLoading(true);
    try {
      await login(loginData);
    } catch (error) {
      toast.error(error.message || 'Ocorreu um erro. Tente novamente.', { duration: 5000 });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4 shadow-lg">
            <CalendarCheck className="w-8 h-8 text-[#704abf]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">AgendaPro</h1>
          <p className="text-white/80">Acesse sua conta para continuar</p>
        </div>

        <div className="glass-effect rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <Label htmlFor="login-email" className="text-white">Email</Label>
              <Input id="login-email" type="email" value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} className="mt-1 bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white" placeholder="seu@email.com" />
              {errors.email && (<p className="mt-1 text-sm text-red-300">{errors.email}</p>)}
            </div>
            <div>
              <Label htmlFor="login-password" className="text-white">Senha</Label>
              <div className="relative mt-1">
                <Input id="login-password" type={showPassword ? 'text' : 'password'} value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} className="bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white pr-10" placeholder="Sua senha" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/60 hover:text-white">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
              {errors.password && (<p className="mt-1 text-sm text-red-300">{errors.password}</p>)}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-white/30 text-[#704abf] focus:ring-white" />
                <span className="ml-2 text-sm text-white">Lembrar-me</span>
              </label>
              <Link to="/recuperar-senha" className="text-sm text-white hover:underline">Esqueceu a senha?</Link>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full bg-white text-[#704abf] hover:bg-gray-100 font-semibold py-3 btn-hover">
              {isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Entrando...</>) : 'Entrar'}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-white/80">
              Não tem uma conta?{' '}
              <Link to="/register" className="font-semibold text-white hover:underline">Crie uma agora</Link>
            </p>
          </div>
          <div className="mt-4 text-center">
            <Link to="/" className="text-white/80 hover:text-white text-sm">← Voltar para o site</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;