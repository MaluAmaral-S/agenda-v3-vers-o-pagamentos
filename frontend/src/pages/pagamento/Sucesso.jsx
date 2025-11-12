import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "../../services/api";

const Sucesso = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState(null);
  const [error, setError] = useState(null);

  // Parâmetros que o Mercado Pago envia de volta
  const collectionId = searchParams.get("collection_id"); // ID do pagamento
  const collectionStatus = searchParams.get("collection_status");
  const paymentId = searchParams.get("payment_id");
  const status = searchParams.get("status");
  const externalReference = searchParams.get("external_reference");
  const preferenceId = searchParams.get("preference_id");

  // Parâmetros customizados que enviamos nas back_urls
  const bookingSlug = searchParams.get("booking_slug");
  const bookingUrl = searchParams.get("booking_url");
  const appointmentId = searchParams.get("appointment_id");

  useEffect(() => {
    const loadPaymentData = async () => {
      try {
        setLoading(true);

        // Aguardar um pouco para dar tempo do webhook processar
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Se temos o ID do agendamento, buscar seus dados ATUALIZADOS
        if (appointmentId) {
          const response = await apiRequest.get(`/agendamentos/${appointmentId}/status`);
          setPaymentData(response);

          // Verificar o status REAL do pagamento
          const realStatus = response.paymentStatus || response.statusPagamento;

          // Se o pagamento ainda está pendente (pode acontecer com PIX/Boleto), redirecionar para pendente
          if (realStatus === 'pending' || realStatus === 'in_process' || realStatus === 'pendente') {
            setTimeout(() => {
              if (bookingSlug) {
                navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=pending`);
              } else if (bookingUrl) {
                window.location.href = `${bookingUrl}?view=appointments&appointment_id=${appointmentId}&payment_status=pending`;
              } else {
                navigate('/');
              }
            }, 2000);
            return;
          }
        }

        // Se foi aprovado, redirecionar para a página de booking da empresa após 3 segundos
        setTimeout(() => {
          if (bookingSlug) {
            // Redireciona para a página de booking com parâmetros para mostrar agendamento
            navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=approved`);
          } else if (bookingUrl) {
            window.location.href = `${bookingUrl}?view=appointments&appointment_id=${appointmentId}&payment_status=approved`;
          } else {
            navigate('/');
          }
        }, 1000);

      } catch (err) {
        console.error("Erro ao carregar dados do pagamento:", err);
        setError("Não foi possível carregar as informações do pagamento.");
      } finally {
        setLoading(false);
      }
    };

    loadPaymentData();
  }, [appointmentId, bookingSlug, bookingUrl, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pagamento Aprovado!
          </h1>
          <p className="text-gray-600">
            Seu pagamento foi processado com sucesso.
          </p>
        </div>

        {loading ? (
          <div className="py-6">
            <Loader2 className="w-8 h-8 text-green-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              Carregando informações do seu agendamento...
            </p>
          </div>
        ) : error ? (
          <div className="py-4">
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Voltar ao Início
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-medium text-green-800 mb-2">
                Detalhes do Pagamento
              </p>
              {collectionId && (
                <p className="text-xs text-gray-600">
                  ID da transação: {collectionId}
                </p>
              )}
              {appointmentId && (
                <p className="text-xs text-gray-600">
                  Agendamento: #{appointmentId}
                </p>
              )}
            </div>

            <p className="text-sm text-gray-600">
              Você será redirecionado para a página de agendamentos em instantes...
            </p>

            <button
              onClick={() => {
                if (bookingSlug) {
                  navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}`);
                } else {
                  navigate('/');
                }
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Ver Meus Agendamentos
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sucesso;
