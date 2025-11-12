import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

const BENEFITS = [
  'Acesso ilimitado aos seus agendamentos.',
  'Relatórios e estatísticas completas.',
  'Suporte prioritário.',
];

const CancelSubscriptionModal = ({
  endDate,
  onConfirmCancel,
  onClose,
  isProcessing = false,
}) => {
  const handleOverlayClick = (event) => {
    if (isProcessing) return;
    if (event.target === event.currentTarget && typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-subscription-title"
      onClick={handleOverlayClick}
    >
      <div className="animate-fade-in relative w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Fechar modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2
              id="cancel-subscription-title"
              className="text-lg font-semibold text-slate-900 sm:text-xl"
            >
              Tem certeza que deseja cancelar sua assinatura?
            </h2>
            <p className="text-sm text-slate-600">
              Sua assinatura continuará ativa até{' '}
              <span className="font-medium text-slate-800">{endDate}</span> e não será renovada no próximo
              período.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Ao cancelar agora você perderá:
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-slate-500">
            Considere migrar para um plano mais acessível em vez de cancelar.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="group relative flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0B2A4A] via-[#0C3B66] to-[#16A34A] transition group-hover:brightness-110" />
            <span className="relative z-10">Manter assinatura</span>
          </button>
          <button
            type="button"
            onClick={onConfirmCancel}
            disabled={isProcessing}
            className="w-full rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing ? 'Cancelando...' : 'Cancelar mesmo assim'}
          </button>
        </div>

        <div className="mt-6 text-center">
          <a
            href="mailto:suporte@agendapro.com"
            className="text-sm font-medium text-blue-600 transition hover:underline"
            onClick={onClose}
          >
            Falar com o suporte antes de decidir
          </a>
        </div>
      </div>
    </div>
  );
};

export default CancelSubscriptionModal;
