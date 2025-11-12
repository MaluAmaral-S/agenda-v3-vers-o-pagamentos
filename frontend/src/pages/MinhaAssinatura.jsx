// CONTEÚDO COMPLETO E CORRIGIDO PARA: src/pages/MinhaAssinatura.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Zap, Star, Crown, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import CancelSubscriptionModal from '../components/subscription/CancelSubscriptionModal';
import {
  fetchSubscription,
  cancelStripeSubscription,
} from '../services/subscriptionService';

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
};

const MinhaAssinatura = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const usageInfo = useMemo(() => {
    if (!data?.hasActive) {
      return {
        limit: 0,
        used: 0,
        remaining: 0,
        limitReached: false,
        percentage: 0,
      };
    }
    const limit = Number(data?.usage?.limit) || 0;
    const used = Number(data?.usage?.used) || 0;
    const remaining = Number.isFinite(data?.usage?.remaining)
      ? data.usage.remaining
      : limit > 0
        ? Math.max(limit - used, 0)
        : null;
    const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const limitReached = limit > 0 && used >= limit;
    return { limit, used, remaining, limitReached, percentage };
  }, [data]);

  // --- Fluxo de carregamento da assinatura e tratamento dos redirecionamentos ---
  useEffect(() => {
    let isMounted = true;

    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');

    if (statusParam === 'success') toast.success('Assinatura confirmada!');
    else if (statusParam === 'cancelled') toast.warning('Pagamento cancelado.');
    if (params.has('status')) navigate(window.location.pathname, { replace: true });

    const normaliseResponse = (response) => {
      if (!response) return null;
      if (typeof response.hasActive === 'boolean') return response;
      return { ...response, hasActive: Boolean(response.subscription) };
    };

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchSubscription();
        if (!isMounted) return;
        const normalised = normaliseResponse(response);
        setData(normalised ?? { hasActive: false });
      } catch (err) {
        if (!isMounted) return;
        if (err.response && err.response.status === 404) {
          setData({ hasActive: false });
        } else {
          setError('Ocorreu um erro ao comunicar com o servidor.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const scheduleRetry = (attempt = 1) => {
      if (!isMounted) return;
      if (statusParam !== 'success' || attempt > 5) return;

      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const response = await fetchSubscription();
          if (!isMounted) return;
          const normalised = normaliseResponse(response);
          if (normalised?.hasActive) {
            setData(normalised);
            return;
          }
        } catch (err) {
          if (!err.response || err.response.status !== 404) {
            return;
          }
        }
        scheduleRetry(attempt + 1);
      }, 2000);
    };

    loadData().then(() => scheduleRetry());

    return () => {
      isMounted = false;
    };
  }, [navigate]);
  // --- Fim do fluxo de carregamento ---

  const PLAN_VISUALS = {
    bronze: {
      gradient:
        'bg-[radial-gradient(circle_at_20%_20%,rgba(255,217,182,0.85),rgba(136,84,24,0.95)_45%,rgba(58,33,10,0.98))]',
      icon: Zap,
    },
    prata: {
      gradient:
        'bg-[radial-gradient(circle_at_20%_20%,rgba(245,245,247,0.9),rgba(168,174,186,0.95)_45%,rgba(82,88,99,0.98))]',
      icon: Star,
    },
    ouro: {
      gradient:
        'bg-[radial-gradient(circle_at_20%_20%,rgba(252,244,195,0.9),rgba(214,175,38,0.95)_45%,rgba(104,78,23,0.98))]',
      icon: Crown,
    },
    default: {
      gradient:
        'bg-[radial-gradient(circle_at_20%_20%,rgba(148,163,184,0.85),rgba(71,85,105,0.95)_45%,rgba(30,41,59,0.98))]',
      icon: Star,
    },
  };

  const planVisualKey = (data?.plan?.key || '').toLowerCase();
  const planVisual = PLAN_VISUALS[planVisualKey] || PLAN_VISUALS.default;
  const PlanIcon = planVisual.icon;
  const daysLeft = data?.subscription?.daysLeft ?? null;
  const planLimitLabel =
    usageInfo.limit > 0
      ? `${usageInfo.limit} agendamentos por ciclo`
      : 'Agendamentos ilimitados durante o ciclo atual';
  const formattedStartDate = formatDate(data?.subscription?.startsAt);
  const formattedEndDate = formatDate(data?.subscription?.expiresAt);
  const endDateLabel =
    formattedEndDate !== '-' ? formattedEndDate : 'o término do ciclo atual';
  const cancelScheduled = Boolean(
    data?.subscription?.cancelScheduled || data?.subscription?.cancelAtPeriodEnd,
  );

  const handleConfirmCancel = async () => {
    const subscriptionId = data?.subscription?.stripeSubscriptionId;
    if (!subscriptionId) {
      toast.error('Assinatura ativa não encontrada.');
      return;
    }

    setIsCanceling(true);
    try {
      const response = await cancelStripeSubscription(subscriptionId);
      const endDateIso = response?.endDate || data?.subscription?.expiresAt;
      const cancelAtPeriodEnd = response?.cancelAtPeriodEnd ?? true;

      toast.success(response?.message || 'Cancelamento agendado.');
      setIsCancelModalOpen(false);
      setData((prev) => {
        if (!prev) return prev;
        const updatedSubscription = {
          ...(prev.subscription || {}),
          expiresAt: endDateIso,
          cancelScheduled: cancelAtPeriodEnd,
          stripeSubscriptionId: subscriptionId,
          status: response?.status || prev.subscription?.status,
        };
        return { ...prev, subscription: updatedSubscription };
      });
    } catch (err) {
      const errorMessage =
        err?.response?.data?.error ||
        err?.message ||
        'Não foi possível cancelar a assinatura.';
      toast.error(errorMessage);
    } finally {
      setIsCanceling(false);
    }
  };

  // Os retornos condicionais agora são seguros, pois vêm DEPOIS de todos os hooks
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando assinatura...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl sm:p-10">
        <header className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
            Painel de assinatura
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Minha assinatura</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
            Acompanhe os detalhes do seu plano, os dias restantes do ciclo atual e o uso de
            agendamentos.
          </p>
        </header>

        {!data || !data.hasActive ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800">
              Você ainda não possui uma assinatura ativa.
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Escolha um plano para liberar novos agendamentos.
            </p>
            <Button
              className="mt-6 bg-[#0B2A4A] text-white hover:bg-[#09304F]"
              onClick={() => navigate('/planos')}
            >
              Assinar um plano
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <section
              className={cn(
                'relative overflow-hidden rounded-3xl border border-white/60 shadow-lg transition-colors',
                planVisual.gradient,
              )}
            >
              <div className="absolute inset-0 bg-slate-950/30" />
              <div className="relative z-10 flex flex-col gap-6 p-6 text-white sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                        <PlanIcon className="h-6 w-6 text-amber-200 drop-shadow" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/80">
                          Plano atual
                        </p>
                        <h2 className="text-2xl font-semibold drop-shadow-md">
                          {data.plan?.name || 'Plano ativo'}
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm text-white/80">{planLimitLabel}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/30 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">Início</p>
                    <p className="mt-2 text-base font-semibold text-white">{formattedStartDate}</p>
                  </div>
                  <div className="rounded-xl border border-white/30 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">Expira em</p>
                    <p className="mt-2 text-base font-semibold text-white">{formattedEndDate}</p>
                  </div>
                  <div className="rounded-xl border border-white/30 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">Dias restantes</p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {typeof daysLeft === 'number'
                        ? `${daysLeft} dia${daysLeft === 1 ? '' : 's'}`
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Uso do ciclo atual
                  </h3>
                  <p className="text-sm text-slate-600">
                    Você já fez {usageInfo.used} de {usageInfo.limit || '∞'} agendamentos neste
                    ciclo.
                  </p>
                </div>
                {/* Removido o botão de atualizar para evitar confusão durante o polling automático */}
              </div>
              <div className="mt-6">
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      usageInfo.limitReached ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${usageInfo.percentage}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>{usageInfo.used} realizados</span>
                  {usageInfo.limit > 0 && <span>{usageInfo.remaining} restantes</span>}
                </div>
                {usageInfo.limitReached && (
                  <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                    Você atingiu o limite de agendamentos deste ciclo. Novos agendamentos só serão
                    liberados no próximo ciclo ou após atualizar o plano.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Cancelar plano</h3>
                  <p className="text-sm text-slate-600">
                    Ao cancelar agora você continuará com acesso até {endDateLabel}.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="bg-red-500 hover:bg-red-600 focus-visible:ring-red-400"
                  onClick={() => setIsCancelModalOpen(true)}
                  disabled={cancelScheduled || isCanceling}
                >
                  {cancelScheduled
                    ? 'Cancelamento agendado'
                    : isCanceling
                      ? 'Cancelando...'
                      : 'Cancelar plano'}
                </Button>
              </div>
              {cancelScheduled && (
                <p className="mt-2 text-sm text-amber-600">
                  Cancelamento agendado. Acesso ativo até {endDateLabel}.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 shadow-sm">
              <p>
                Precisa de mais agendamentos? Você pode alterar o plano a qualquer momento na página
                de planos.
              </p>
              <Button
                className="mt-4 bg-[#0B2A4A] text-white hover:bg-[#09304F]"
                onClick={() => navigate('/planos')}
              >
                Ver planos disponíveis
              </Button>
            </section>
          </div>
        )}
      </div>
      {isCancelModalOpen && (
        <CancelSubscriptionModal
          endDate={endDateLabel}
          onClose={() => setIsCancelModalOpen(false)}
          onConfirmCancel={handleConfirmCancel}
          isProcessing={isCanceling}
        />
      )}
    </div>
  );
};

export default MinhaAssinatura;
