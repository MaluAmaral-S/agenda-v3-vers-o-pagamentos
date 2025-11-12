import React from 'react';
import { Link } from 'react-router-dom';
import { 
  CalendarCheck, 
  CalendarDays, 
  Smartphone, 
  BarChart3, 
  Users, 
  CreditCard, 
  Settings, 
  Rocket, 
  PlayCircle, 
  Phone, 
  Check,
  CheckCircle2
} from 'lucide-react';
import BrandLogo from '@/assets/logo-agendemi-mark.svg';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ICONS, composePlanList, formatLimitLabel } from '@/utils/planUi';
import { PLANS } from '../utils/constants';

const Home = () => {
  return (
    <div className="bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-12 gap-4 items-center py-4">
            <div className="flex items-center space-x-3 col-span-1 md:col-span-3">
              <img src={BrandLogo} alt="Agende-mi" className="w-10 h-10" />
              <h1 className="text-2xl font-bold text-[#0B2A4A]">Agende-mi</h1>
            </div>
            <nav className="hidden md:flex md:col-span-6 items-center justify-center space-x-8">
              <a href="#inicio" className="text-gray-700 hover:text-[#0B2A4A] font-medium">Início</a>
              <a href="#recursos" className="text-gray-700 hover:text-[#0B2A4A] font-medium">Recursos</a>
              <a href="#planos" className="text-gray-700 hover:text-[#0B2A4A] font-medium">Planos</a>
              <a href="#contato" className="text-gray-700 hover:text-[#0B2A4A] font-medium">Contato</a>
            </nav>
            <div className="flex items-center justify-end space-x-4 col-span-1 md:col-span-3">
              <Link to="/login" className="text-gray-700 hover:text-[#0B2A4A] font-medium">
                Entrar
              </Link>
              <Link 
                to="/login?tab=register" 
                className="bg-[#0B2A4A] hover:bg-[#09304F] text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Começar Grátis
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section (desktop com grid 2 colunas) */}
      <section id="inicio" className="hero-bg text-white py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Texto à esquerda */}
            <div className="text-center lg:text-left lg:col-span-7">
              <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
                Transforme seu negócio com
                <span className="text-yellow-300"> agendamentos online</span>
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl lg:mx-0 mx-auto">
                Simplifique a gestão de horários, aumente suas vendas e ofereça uma experiência incrível para seus clientes
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl lg:max-w-none">
                <Link
                  to="/login?tab=register"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-[#0B2A4A] text-base md:text-lg font-semibold hover:bg-gray-100 transition-colors shadow-sm"
                >
                  <Rocket className="w-5 h-5 mr-2" />
                  Começar Agora - Grátis
                </Link>
                <a
                  href="#recursos"
                  className="inline-flex items-center justify-center rounded-lg border-2 border-white px-6 py-3 text-base md:text-lg font-semibold text-white hover:bg-white hover:text-[#0B2A4A] transition-colors"
                >
                  <PlayCircle className="w-5 h-5 mr-2" />
                  Ver Como Funciona
                </a>
              </div>
            </div>

            {/* Destaque visual à direita (apenas desktop) */}
            <div className="hidden lg:block lg:col-span-5">
              <div className="glass-effect rounded-2xl p-8 border border-white/20 bg-white/10 backdrop-blur-md shadow-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white/20 p-4 border border-white/10">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                      <CalendarDays className="w-6 h-6 text-blue-600" />
                    </div>
                    <p className="text-sm text-white/90 text-center">Agendamentos 24/7</p>
                  </div>
                  <div className="rounded-xl bg-white/20 p-4 border border-white/10">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                      <Smartphone className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="text-sm text-white/90 text-center">Notificações automáticas</p>
                  </div>
                  <div className="rounded-xl bg-white/20 p-4 border border-white/10">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                      <BarChart3 className="w-6 h-6 text-purple-600" />
                    </div>
                    <p className="text-sm text-white/90 text-center">Relatórios e métricas</p>
                  </div>
                  <div className="rounded-xl bg-white/20 p-4 border border-white/10">
                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                      <Users className="w-6 h-6 text-yellow-600" />
                    </div>
                    <p className="text-sm text-white/90 text-center">Gestão de clientes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Tudo que você precisa em um só lugar</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Recursos poderosos para automatizar seu negócio e conquistar mais clientes
            </p>
          </div>

          {/* Grid responsivo (1080p: 3x2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
            <div className="card-hover bg-white rounded-xl p-8 border border-gray-200 transition-all duration-300 h-full">
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <CalendarDays className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Agendamento Online 24/7</h3>
              <p className="text-gray-600">Seus clientes podem agendar a qualquer hora, de qualquer lugar. Sem ligações, sem complicações.</p>
            </div>

            <div className="card-hover bg-white rounded-xl p-8 border border-gray-200 transition-all duration-300 h-full">
              <div className="w-16 h-16 bg-green-100 rounded-lg flex items-center justify-center mb-6">
                <Smartphone className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Notificações Automáticas</h3>
              <p className="text-gray-600">Lembretes por WhatsApp e email reduzem faltas e mantêm seus clientes sempre informados.</p>
            </div>

            <div className="card-hover bg-white rounded-xl p-8 border border-gray-200 transition-all duration-300 h-full">
              <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center mb-6">
                <BarChart3 className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Relatórios Inteligentes</h3>
              <p className="text-gray-600">Acompanhe seu faturamento, horários mais procurados e performance do seu negócio.</p>
            </div>

            <div className="card-hover bg-white rounded-xl p-8 border border-gray-200 transition-all duration-300 h-full">
              <div className="w-16 h-16 bg-yellow-100 rounded-lg flex items-center justify-center mb-6">
                <Users className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Gestão de Clientes</h3>
              <p className="text-gray-600">Histórico completo, preferências e dados de contato organizados em um só lugar.</p>
            </div>

            <div className="card-hover bg-white rounded-xl p-8 border border-gray-200 transition-all duration-300 h-full">
              <div className="w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center mb-6">
                <CreditCard className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Pagamentos Online</h3>
              <p className="text-gray-600">Receba pagamentos antecipados e reduza cancelamentos de última hora.</p>
            </div>

            <div className="card-hover bg-white rounded-xl p-8 border border-gray-200 transition-all duration-300 h-full">
              <div className="w-16 h-16 bg-indigo-100 rounded-lg flex items-center justify-center mb-6">
                <Settings className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Personalização Total</h3>
              <p className="text-gray-600">Configure horários, serviços, preços e regras do seu jeito. Sua marca, suas regras.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Planos (visual igual ao Planos.jsx) */}
      <section id="planos" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Escolha o plano ideal para seu negócio</h2>
            <p className="text-xl text-gray-600">Comece grátis e escale conforme sua empresa cresce</p>
          </div>
          
          <div className="flex gap-6 overflow-x-auto items-stretch snap-x snap-mandatory pb-2 justify-center">
            {composePlanList().map((plan) => {
              const IconComponent = ICONS[plan.icon] ?? ICONS.star;
              const limitLabel = formatLimitLabel(plan.monthlyLimit);
              return (
                <div
                  key={plan.key}
                  className={cn(
                    'relative overflow-hidden rounded-3xl border border-white/60 shadow-xl transition-all duration-500 shrink-0 w-[320px] md:w-[360px] lg:w-[380px] snap-start',
                    plan.gradientClass,
                    'hover:-translate-y-2 hover:border-white'
                  )}
                >
                  <div className="absolute inset-0 bg-slate-950/30" />
                  <div className="relative z-10 flex h-full flex-col gap-6 p-8 text-white">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-8 w-8 text-amber-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]" />
                          <div className="text-left">
                            <p className="text-xs uppercase tracking-[0.3em] text-white/80">Plano</p>
                            <h2 className="text-2xl font-semibold drop-shadow-md">{plan.name}</h2>
                          </div>
                        </div>
                        <p className="text-sm text-white/80">{plan.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {plan.badge && (
                          <Badge className="bg-white/25 text-xs font-semibold uppercase tracking-wide text-white">
                            {plan.badge}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-4xl font-bold drop-shadow">{plan.priceLabel}</p>
                      <p className="text-sm uppercase tracking-[0.35em] text-white/75">{limitLabel}</p>
                    </div>

                    <div className="flex-1 space-y-3">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-300" />
                          <span className="text-sm text-white/90">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2">
                      <Button asChild className="w-full bg-[#0B2A4A] text-white hover:bg-[#09304F]">
                        <Link to="/login?tab=register">{plan.ctaLabel}</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="gradient-bg text-white py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-8 text-center lg:text-left">
              <h2 className="text-4xl font-bold mb-6">Pronto para revolucionar seu negócio?</h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl lg:mx-0 mx-auto">
                Junte-se a milhares de empresas que já transformaram seus agendamentos com o Agende-mi
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl lg:max-w-none">
                <Link
                  to="/login?tab=register"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-[#0B2A4A] text-base md:text-lg font-semibold hover:bg-gray-100 transition-colors shadow-sm"
                >
                  <Rocket className="w-5 h-5 mr-2" />
                  Começar avaliação grátis
                </Link>
                <a
                  href="#contato"
                  className="inline-flex items-center justify-center rounded-lg border-2 border-white px-6 py-3 text-base md:text-lg font-semibold text-white hover:bg-white hover:text-[#0B2A4A] transition-colors"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Falar com Especialista
                </a>
              </div>
            </div>
            <div className="hidden lg:block lg:col-span-4">
              <div className="glass-effect rounded-2xl p-6 border border-white/20 bg-white/10 backdrop-blur-md shadow-xl">
                <ul className="space-y-3">
                  <li className="flex items-center"><Check className="w-5 h-5 mr-2 text-yellow-300" />Sem taxas de instalação</li>
                  <li className="flex items-center"><Check className="w-5 h-5 mr-2 text-yellow-300" />Cancelamento a qualquer momento</li>
                  <li className="flex items-center"><Check className="w-5 h-5 mr-2 text-yellow-300" />Suporte prioritário</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contato" className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <img src={BrandLogo} alt="Agende-mi" className="w-10 h-10" />
                <h3 className="text-xl font-bold">Agende-mi</h3>
              </div>
              <p className="text-gray-400">
                A solução completa para gestão de agendamentos online.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#recursos" className="hover:text-white transition-colors">Recursos</a></li>
                <li><a href="#planos" className="hover:text-white transition-colors">Planos</a></li>
                <li><Link to="/login?tab=register" className="hover:text-white transition-colors">Começar</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Suporte</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Central de Ajuda</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contato</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Sobre</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Carreiras</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Agende-mi. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
