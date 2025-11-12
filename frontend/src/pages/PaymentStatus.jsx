import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  CalendarDays,
  User,
  Phone,
  Mail,
  Info,
  ExternalLink,
} from 'lucide-react';

const RAW_API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const API_ROOT = RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE}/api`;

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    title: 'Pagamento confirmado!',
    description: 'O Mercado Pago confirmou o pagamento via webhook e o agendamento foi liberado.',
    tone: 'success',
  },
  approved: {
    icon: CheckCircle2,
    title: 'Pagamento aprovado!',
    description: 'O Mercado Pago confirmou o pagamento via webhook e o agendamento foi liberado.',
    tone: 'success',
  },
  pending: {
    icon: Clock,
    title: 'Pagamento em análise',
    description: 'Ainda estamos aguardando o retorno automatizado do Mercado Pago. Pix e boletos podem levar alguns minutos.',
    tone: 'warning',
  },
  in_process: {
    icon: Clock,
    title: 'Pagamento em processamento',
    description: 'Registramos o pedido e seguimos aguardando o webhook do Mercado Pago para concluir o status.',
    tone: 'warning',
  },
  failure: {
    icon: XCircle,
    title: 'Pagamento não concluído',
    description: 'O Mercado Pago não confirmou a cobrança. Você pode tentar novamente acessando a página da empresa.',
    tone: 'error',
  },
};

const SUCCESS_STATES = new Set(['approved', 'accredited', 'success', 'paid', 'completed']);
const PENDING_STATES = new Set(['pending', 'in_process', 'in process', 'authorized', 'pending_waiting_payment']);
const FAILURE_STATES = new Set(['failure', 'rejected', 'cancelled', 'canceled', 'refunded', 'charged_back', 'chargeback']);

const STATUS_NOTES = {
  approved: 'Tudo pronto! O status foi sincronizado automaticamente assim que recebemos o webhook do Mercado Pago.',
  success: 'Tudo pronto! O status foi sincronizado automaticamente assim que recebemos o webhook do Mercado Pago.',
  pending: 'Seguimos consultando o Mercado Pago em tempo real. Quando o webhook chegar, esta tela é atualizada automaticamente.',
  in_process: 'Seguimos consultando o Mercado Pago em tempo real. Quando o webhook chegar, esta tela é atualizada automaticamente.',
  failure: 'O pagamento não foi autorizado. Você pode voltar para a página da empresa e tentar novamente quando quiser.',
};

const TONE_BADGE = {
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  error: 'bg-rose-50 text-rose-700 border border-rose-200',
};

function normalizeStatusKey(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (SUCCESS_STATES.has(normalized)) return 'approved';
  if (PENDING_STATES.has(normalized)) return 'pending';
  if (FAILURE_STATES.has(normalized)) return 'failure';
  if (normalized === 'success') return 'success';
  return null;
}

const PaymentStatus = () => {
  const { status: statusParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const externalReference = query.get('external_reference') || query.get('appointment_id');
  const bookingSlugFromQuery = query.get('booking_slug');
  const bookingUrlFromQuery = query.get('booking_url');
  const statusKeyFromQuery = (query.get('status') || statusParam || '').toLowerCase();
  const [liveStatus, setLiveStatus] = useState(null);
  const [appointmentDetails, setAppointmentDetails] = useState(null);
  const [checking, setChecking] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  const normalizedBookingUrlFromQuery = useMemo(() => {
    if (!bookingUrlFromQuery) return null;
    try {
      return decodeURIComponent(bookingUrlFromQuery);
    } catch (_err) {
      return bookingUrlFromQuery;
    }
  }, [bookingUrlFromQuery]);

  const sameOriginBookingUrl = useMemo(() => {
    if (!normalizedBookingUrlFromQuery || typeof window === 'undefined') {
      return null;
    }
    try {
      const parsed = new URL(normalizedBookingUrlFromQuery, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return parsed.toString();
      }
    } catch (_err) {
      return null;
    }
    return null;
  }, [normalizedBookingUrlFromQuery]);

  const appointmentUrl = useMemo(() => {
    if (!externalReference) return null;
    return `${API_ROOT}/public/appointments/${externalReference}`;
  }, [externalReference]);

  const refreshStatus = useCallback(async () => {
    if (!appointmentUrl) return;
    setChecking(true);
    setFetchError(null);
    try {
      const response = await fetch(appointmentUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Não foi possível consultar o status do pagamento.');
      }
      const data = await response.json();
      if (!isMounted.current) return;
      const amountRaw = data?.valorPago ?? data?.service?.preco ?? null;
      const amountNumber = amountRaw === null || amountRaw === undefined ? null : Number(amountRaw);
      setAppointmentDetails({
        serviceName: data?.service?.nome || null,
        amount: Number.isFinite(amountNumber) ? amountNumber : null,
        date: data?.appointmentDate || null,
        time: data?.appointmentTime || null,
        paymentStatus: data?.paymentStatus || null,
        statusPagamento: data?.statusPagamento || null,
        clientName: data?.clientName || null,
        clientEmail: data?.clientEmail || null,
        clientPhone: data?.clientPhone || null,
        businessName: data?.business?.name || null,
        businessSlug: data?.business?.slug || null,
        businessEmail: data?.business?.email || null,
        businessPhone: data?.business?.phone || null,
        bookingUrl: data?.business?.bookingUrl || null,
      });

      const derivedStatus =
        normalizeStatusKey(data?.paymentStatus) ||
        normalizeStatusKey(data?.statusPagamento) ||
        normalizeStatusKey(data?.status);
      if (derivedStatus) {
        setLiveStatus(derivedStatus);
      }
      setLastUpdated(new Date());
    } catch (error) {
      if (!isMounted.current) return;
      setFetchError(error.message || 'Falha ao consultar status.');
    } finally {
      if (isMounted.current) {
        setChecking(false);
      }
    }
  }, [appointmentUrl]);

  useEffect(() => {
    if (appointmentUrl) {
      refreshStatus();
    }
  }, [appointmentUrl, refreshStatus]);

  const effectiveStatusKey = useMemo(() => {
    if (liveStatus && STATUS_CONFIG[liveStatus]) return liveStatus;
    if (STATUS_CONFIG[statusKeyFromQuery]) return statusKeyFromQuery;
    return 'pending';
  }, [liveStatus, statusKeyFromQuery]);

  const shouldKeepPolling = externalReference && ['pending', 'in_process'].includes(effectiveStatusKey);

  useEffect(() => {
    if (!shouldKeepPolling) return undefined;
    const interval = setInterval(() => {
      refreshStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [shouldKeepPolling, refreshStatus]);

  const config = STATUS_CONFIG[effectiveStatusKey] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  const toneClass = TONE_BADGE[config.tone] || TONE_BADGE.warning;

  const bookingHref = useMemo(() => {
    if (bookingSlugFromQuery) return `/agendamento/${bookingSlugFromQuery}`;
    if (sameOriginBookingUrl) return sameOriginBookingUrl;
    if (appointmentDetails?.businessSlug) return `/agendamento/${appointmentDetails.businessSlug}`;
    if (appointmentDetails?.bookingUrl) return appointmentDetails.bookingUrl;
    return '/agendamento';
  }, [bookingSlugFromQuery, sameOriginBookingUrl, appointmentDetails]);

  const amountDisplay = useMemo(() => {
    if (appointmentDetails?.amount === 0 || appointmentDetails?.amount) {
      return appointmentDetails.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return null;
  }, [appointmentDetails]);

  const appointmentDateTime = useMemo(() => {
    if (!appointmentDetails?.date) return null;
    const time = appointmentDetails.time || '00:00';
    const date = new Date(`${appointmentDetails.date}T${time}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [appointmentDetails]);

  const formattedDateLabel = useMemo(() => {
    if (!appointmentDateTime) return null;
    const hasTime = Boolean(appointmentDetails?.time);
    const options = hasTime
      ? { dateStyle: 'full', timeStyle: 'short' }
      : { dateStyle: 'full' };
    return new Intl.DateTimeFormat('pt-BR', options).format(appointmentDateTime);
  }, [appointmentDateTime, appointmentDetails]);

  const detailRows = useMemo(() => {
    const rows = [];
    if (appointmentDetails?.serviceName) {
      rows.push({ label: 'Serviço contratado', value: appointmentDetails.serviceName, icon: ArrowRight });
    }
    if (formattedDateLabel) {
      rows.push({ label: 'Data e horário', value: formattedDateLabel, icon: CalendarDays });
    }
    if (appointmentDetails?.clientName) {
      rows.push({ label: 'Cliente', value: appointmentDetails.clientName, icon: User });
    }
    if (appointmentDetails?.clientEmail || appointmentDetails?.clientPhone) {
      rows.push({
        label: 'Contato informado',
        value: [appointmentDetails?.clientEmail, appointmentDetails?.clientPhone].filter(Boolean).join(' • '),
        icon: Mail,
      });
    }
    if (amountDisplay) {
      rows.push({ label: 'Valor pago', value: amountDisplay, icon: ArrowRight });
    }
    if (appointmentDetails?.paymentStatus || appointmentDetails?.statusPagamento) {
      rows.push({
        label: 'Status registrado no sistema',
        value: appointmentDetails.paymentStatus || appointmentDetails.statusPagamento,
        icon: Info,
      });
    }
    return rows;
  }, [appointmentDetails, amountDisplay, formattedDateLabel]);

  const contactRows = useMemo(() => {
    const rows = [];
    if (appointmentDetails?.businessPhone) {
      rows.push({
        label: 'phone',
        value: appointmentDetails.businessPhone,
        href: `tel:${appointmentDetails.businessPhone}`,
        icon: Phone,
      });
    }
    if (appointmentDetails?.businessEmail) {
      rows.push({
        label: 'mail',
        value: appointmentDetails.businessEmail,
        href: `mailto:${appointmentDetails.businessEmail}`,
        icon: Mail,
      });
    }
    return rows;
  }, [appointmentDetails]);

  const timelineSteps = useMemo(() => {
    const steps = [
      {
        key: 'created',
        label: 'Pedido recebido',
        description: 'Registramos o agendamento e enviamos o resumo para a empresa.',
      },
      {
        key: 'processing',
        label: 'Pagamento em análise',
        description: 'Aguardamos o Mercado Pago retornar o webhook oficial.',
      },
      {
        key: 'completed',
        label: effectiveStatusKey === 'failure' ? 'Pagamento não aprovado' : 'Pagamento confirmado',
        description:
          STATUS_NOTES[effectiveStatusKey] ||
          'Assim que o webhook chegar, seu agendamento será atualizado automaticamente.',
      },
    ];

    const currentStep = effectiveStatusKey === 'approved' || effectiveStatusKey === 'success'
      ? 2
      : effectiveStatusKey === 'failure'
      ? 2
      : 1;

    return steps.map((step, index) => ({
      ...step,
      completed: index < currentStep || (index === currentStep && ['approved', 'success'].includes(effectiveStatusKey)),
      active: index === currentStep,
      failed: effectiveStatusKey === 'failure' && index === 2,
    }));
  }, [effectiveStatusKey]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-3xl bg-white/80 p-8 shadow-2xl ring-1 ring-black/5 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl ${toneClass}`}>
              <Icon className="h-8 w-8" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Status do pagamento</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">{config.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{config.description}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            {externalReference && <span>Agendamento #{externalReference}</span>}
            {lastUpdated && (
              <span>
                Última verificação {lastUpdated.toLocaleTimeString('pt-BR', { hour12: false })}
              </span>
            )}
            {checking && (
              <span className="inline-flex items-center gap-1 text-purple-600">
                <RefreshCw className="h-4 w-4 animate-spin" /> Consultando webhook...
              </span>
            )}
          </div>
        </section>

        {fetchError && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {fetchError}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
          <section className="rounded-3xl bg-white/90 p-6 shadow-lg ring-1 ring-black/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Resumo do agendamento</p>
                <p className="text-xs text-slate-500">Sincronizado automaticamente pelos webhooks do Mercado Pago.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>{config.title}</span>
            </div>
            <dl className="mt-6 space-y-4">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between border-b border-slate-100 pb-3 last:border-none last:pb-0"
                >
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{row.label}</p>
                    <div className="mt-1 flex items-center gap-2 text-base font-medium text-slate-900">
                      {row.icon && <row.icon className="h-4 w-4 text-slate-400" />}
                      <span>{row.value}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!detailRows.length && (
                <p className="text-sm text-slate-500">Carregando detalhes do agendamento...</p>
              )}
            </dl>

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-900">Linha do tempo</h3>
              <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
                {timelineSteps.map((step, index) => (
                  <div key={step.key} className="flex flex-1 items-start gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                        step.failed
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : step.completed
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {step.completed ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                      <p className="text-xs text-slate-500">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white/90 p-6 shadow-lg ring-1 ring-black/5">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">O que acontece agora?</p>
                <p className="mt-1 text-slate-600">{STATUS_NOTES[effectiveStatusKey]}</p>
                {shouldKeepPolling && (
                  <p className="mt-2 text-xs text-slate-500">Atualizamos automaticamente a cada 10 segundos.</p>
                )}
              </div>

              <button
                type="button"
                onClick={refreshStatus}
                disabled={checking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Verificando status...' : 'Consultar status agora'}
              </button>

              <a
                href={bookingHref}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-purple-700"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para a página da empresa
              </a>

              <a
                href={bookingHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Abrir agenda em nova aba <ExternalLink className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-800"
              >
                Voltar para a página anterior
              </button>

              {contactRows.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Precisa falar com {appointmentDetails?.businessName || 'a empresa'}?
                  </p>
                  {contactRows.map((row) => (
                    <a
                      key={row.label}
                      href={row.href}
                      className="flex items-center gap-2 rounded-2xl border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <row.icon className="h-4 w-4 text-slate-400" />
                      <span>{row.value}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatus;
