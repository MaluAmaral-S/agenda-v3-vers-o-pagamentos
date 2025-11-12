import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PlugZap,
  ShieldCheck,
  TicketCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import {
  fetchIntegrationStatus,
  getAuthorizationUrl,
  fetchPaymentSettings,
  updatePaymentSettings,
  listRecentPayments,
} from '../services/mercadoPagoIntegrationService';

const STATUS_LABELS = {
  connected: {
    label: 'Conta conectada',
    description: 'Pagamentos online habilitados via Mercado Pago.',
    tone: 'success',
  },
  disconnected: {
    label: 'Conexão pendente',
    description: 'Conecte sua conta Mercado Pago para receber repasses automáticos.',
    tone: 'warning',
  },
};

const formatCurrency = (amount, currency = 'BRL') => {
  if (amount === null || amount === undefined) return '-';
  const parsed = Number(amount);
  if (Number.isNaN(parsed)) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(parsed);
};

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch (error) {
    return '-';
  }
};

const MercadoPagoConnect = () => {
  const { updateUser } = useAuth();
  const updateUserRef = useRef(updateUser);
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    updateUserRef.current = updateUser;
  }, [updateUser]);

  const integrationStatus = useMemo(() => {
    const connected = Boolean(statusData?.connected && statusData?.mpUserId);
    return connected ? STATUS_LABELS.connected : STATUS_LABELS.disconnected;
  }, [statusData]);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    const message = searchParams.get('message');
    if (!statusParam) return;

    if (statusParam === 'success') {
      toast.success('Conta Mercado Pago conectada com sucesso!');
    } else if (statusParam === 'error') {
      toast.error(message || 'Não foi possível concluir a conexão com o Mercado Pago.');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('status');
    next.delete('message');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const data = await fetchIntegrationStatus();
      setStatusData(data);
      updateUserRef.current?.({
        paymentsEnabled: Boolean(data?.paymentsEnabled),
        mpConnected: Boolean(data?.connected),
      });
      setAccessDenied(false);
      setLoadError(null);
    } catch (error) {
      if (error?.response?.status === 403) {
        setAccessDenied(true);
      } else {
        toast.error('Não foi possível obter o status da integração.');
        setLoadError('Falha ao carregar status da integração Mercado Pago.');
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await fetchPaymentSettings();
      setSettings(data);
      updateUserRef.current?.({ paymentsEnabled: Boolean(data?.paymentsEnabled) });
      setAccessDenied(false);
      setLoadError(null);
    } catch (error) {
      if (error?.response?.status === 403) {
        setAccessDenied(true);
      } else {
        toast.error('Não foi possível carregar as configurações de pagamento.');
        setLoadError('Falha ao carregar configurações de pagamento.');
      }
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const data = await listRecentPayments();
      setPayments(Array.isArray(data?.payments) ? data.payments : []);
      setAccessDenied(false);
      setLoadError(null);
    } catch (error) {
      if (error?.response?.status === 403) {
        setAccessDenied(true);
      } else {
        toast.error('Não foi possível carregar os pagamentos recentes.');
        setLoadError('Falha ao carregar lista de pagamentos.');
      }
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      setLoading(true);
      try {
        await Promise.all([loadStatus(), loadSettings(), loadPayments()]);
      } catch (error) {
        // Erros individuais já são tratados; guardamos fallback
        if (mounted) {
          setLoadError('Não foi possível carregar todas as informações de pagamentos.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadStatus, loadSettings, loadPayments]);

  const handleConnect = async () => {
    try {
      const { url } = await getAuthorizationUrl();
      if (url) {
        window.location.href = url;
      } else {
        toast.error('URL de autorização não recebida.');
      }
    } catch (error) {
      if (error?.response?.status === 403) {
        setAccessDenied(true);
      } else if (error?.response?.status === 404) {
        toast.error('Rota de conexão não encontrada. Verifique a API.');
      } else {
        toast.error('Não foi possível iniciar a conexão com o Mercado Pago.');
      }
    }
  };

  const handleTogglePayments = async (checked) => {
    try {
      setSettingsLoading(true);
      const response = await updatePaymentSettings(checked);
      setSettings(response);
      updateUserRef.current?.({ paymentsEnabled: Boolean(response?.paymentsEnabled) });
      toast.success(checked ? 'Pagamentos online ativados.' : 'Pagamentos online desativados.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Não foi possível atualizar as configurações.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const connected = Boolean(statusData?.connected && statusData?.mpUserId);
  const paymentsEnabled = Boolean(settings?.paymentsEnabled && connected);

  const badgeClassName = useMemo(() => {
    if (integrationStatus.tone === 'success') {
      return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    }
    if (integrationStatus.tone === 'warning') {
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    }
    return '';
  }, [integrationStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner label="Carregando integrações..." />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 space-y-3">
        <p className="text-base font-semibold">Plano não elegível</p>
        <p className="text-sm">
          Para habilitar o Marketplace com Mercado Pago, atualize para um plano Prata ou Ouro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {loadError}
        </div>
      )}
      <Card className="border-purple-200">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl font-semibold text-purple-900 flex items-center gap-2">
              <PlugZap className="w-5 h-5" />
              Conexão com Mercado Pago
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Conecte sua conta para receber 100% dos pagamentos via Checkout Pro, incluindo Pix.
            </p>
          </div>
          <Badge
            variant="outline"
            className={`flex items-center gap-1 ${badgeClassName}`}
          >
            {integrationStatus.tone === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            {integrationStatus.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-gray-700 max-w-2xl">
              <p>{integrationStatus.description}</p>
              <p className="mt-2 text-gray-600">
                A confirmação dos pagamentos acontece automaticamente via Webhook. O repasse vai direto para a sua conta Mercado Pago conectada.
              </p>
            </div>
            <Button onClick={handleConnect} variant={connected ? 'outline' : 'default'} className="flex items-center gap-2">
              {statusLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
              {connected ? 'Gerenciar conexão' : 'Conectar Mercado Pago'}
            </Button>
          </div>
          {connected && (
            <div className="grid sm:grid-cols-2 gap-4 text-sm text-gray-600">
              <div className="p-3 rounded-lg border bg-purple-50 border-purple-100">
                <p className="font-semibold text-purple-900">Conta conectada</p>
                <p>ID Mercado Pago: {statusData?.mpUserId}</p>
              </div>
              <div className="p-3 rounded-lg border bg-purple-50 border-purple-100">
                <p className="font-semibold text-purple-900">Validade do token</p>
                <p>{statusData?.tokenExpiresAt ? formatDateTime(statusData.tokenExpiresAt) : 'Atualização automática ativa'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Configurações de cobrança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Pagamentos online na página de agendamento</p>
              <p className="text-sm text-gray-600">
                Quando ativo, os clientes serão redirecionados ao Checkout Pro e poderão pagar com Pix ou cartão.
              </p>
            </div>
            <Switch
              disabled={settingsLoading || !connected}
              checked={paymentsEnabled}
              onCheckedChange={handleTogglePayments}
            />
          </div>
          {!connected && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-1" />
              <p>Conecte sua conta Mercado Pago antes de ativar os pagamentos online.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TicketCheck className="w-5 h-5" />
            Últimos pagamentos registrados
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadPayments}
            disabled={paymentsLoading}
            className="flex items-center gap-1"
          >
            {paymentsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner label="Carregando pagamentos..." />
            </div>
          ) : payments.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-lg py-10 text-center text-sm text-gray-500">
              Nenhum pagamento foi registrado ainda. Compartilhe sua página de agendamento para começar a receber.
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={`${payment.mpPaymentId}-${payment.appointmentId}`}
                  className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{payment.clientName || 'Cliente'}</p>
                    <p className="text-xs text-gray-600">{payment.clientEmail || 'Sem e-mail informado'}</p>
                    <p className="text-xs text-gray-600">Agendamento #{payment.appointmentId}</p>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p className="font-medium text-gray-900">{formatCurrency(payment.amount, payment.currency)}</p>
                    <p>Status: <span className="capitalize">{payment.paymentStatus}</span></p>
                    <p className="text-xs">Atualizado em {formatDateTime(payment.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MercadoPagoConnect;
