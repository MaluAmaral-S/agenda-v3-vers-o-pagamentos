import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CalendarCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [registerData, setRegisterData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    phone: ''
  });

  const [errors, setErrors] = useState({});

  const { register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.onboardingCompleted === false) {
        navigate('/primeiros-passos', { replace: true });
      } else {
        navigate('/painel', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const validateRegister = () => {
    const newErrors = {};
    if (!registerData.name) newErrors.name = 'Nome é obrigatório';
    if (!registerData.email) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(registerData.email)) {
      newErrors.email = 'Email inválido';
    }
    if (!registerData.password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (registerData.password.length < 6) {
      newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    }
    if (registerData.password !== registerData.confirmPassword) {
      newErrors.confirmPassword = 'Senhas não coincidem';
    }
    if (!registerData.businessName) newErrors.businessName = 'Nome da empresa é obrigatório';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validateRegister()) return;
    setIsLoading(true);
    try {
      const { confirmPassword, ...dataToSend } = registerData;
      await register(dataToSend);
      toast.success("Conta criada com sucesso! Redirecionando...");
      // A navegação será tratada pelo useEffect
    } catch (error) {
      toast.error(error.message || 'Ocorreu um erro ao registrar. Tente novamente.', {
        duration: 5000,
      });
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
          <h1 className="text-3xl font-bold text-white mb-2">Crie sua Conta no AgendaPro</h1>
          <p className="text-white/80">Comece a organizar seus agendamentos hoje mesmo.</p>
        </div>

        <div className="glass-effect rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="register-name" className="text-white">Nome *</Label>
                  <Input id="register-name" type="text" value={registerData.name} onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })} className="mt-1 bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white" placeholder="Seu nome" />
                  {errors.name && (<p className="mt-1 text-sm text-red-300">{errors.name}</p>)}
                </div>
                <div>
                  <Label htmlFor="register-phone" className="text-white">Telefone</Label>
                  <Input id="register-phone" type="tel" value={registerData.phone} onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })} className="mt-1 bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white" placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div>
                <Label htmlFor="register-email" className="text-white">Email *</Label>
                <Input id="register-email" type="email" value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} className="mt-1 bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white" placeholder="seu@email.com" />
                {errors.email && (<p className="mt-1 text-sm text-red-300">{errors.email}</p>)}
              </div>
              <div>
                <Label htmlFor="register-business" className="text-white">Nome da Empresa *</Label>
                <Input id="register-business" type="text" value={registerData.businessName} onChange={(e) => setRegisterData({ ...registerData, businessName: e.target.value })} className="mt-1 bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white" placeholder="Nome da sua empresa" />
                {errors.businessName && (<p className="mt-1 text-sm text-red-300">{errors.businessName}</p>)}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="register-password" className="text-white">Senha *</Label>
                  <div className="relative mt-1">
                    <Input id="register-password" type={showPassword ? 'text' : 'password'} value={registerData.password} onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })} className="bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white pr-10" placeholder="Mín. 6 caracteres" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/60 hover:text-white">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  {errors.password && (<p className="mt-1 text-sm text-red-300">{errors.password}</p>)}
                </div>
                <div>
                  <Label htmlFor="register-confirm" className="text-white">Confirmar Senha *</Label>
                  <div className="relative mt-1">
                    <Input id="register-confirm" type={showConfirmPassword ? 'text' : 'password'} value={registerData.confirmPassword} onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })} className="bg-white/20 border-white/30 text-white placeholder-white/60 focus:border-white focus:ring-white pr-10" placeholder="Confirme a senha" />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/60 hover:text-white">{showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  {errors.confirmPassword && (<p className="mt-1 text-sm text-red-300">{errors.confirmPassword}</p>)}
                </div>
              </div>
              <div className="flex items-center">
                <input type="checkbox" required className="rounded border-white/30 text-[#704abf] focus:ring-white" />
                <span className="ml-2 text-sm text-white">Aceito os <a href="#" className="underline hover:no-underline">termos de uso</a> e <a href="#" className="underline hover:no-underline">política de privacidade</a></span>
              </div>
              <Button type="submit" disabled={isLoading} className="w-full bg-white text-[#704abf] hover:bg-gray-100 font-semibold py-3 btn-hover">
                {isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando conta...</>) : ('Criar Conta Grátis')}
              </Button>
            </form>
          <div className="mt-6 text-center">
            <Link to="/login" className="text-white/80 hover:text-white text-sm">
              Já tem uma conta? Entre aqui.
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;