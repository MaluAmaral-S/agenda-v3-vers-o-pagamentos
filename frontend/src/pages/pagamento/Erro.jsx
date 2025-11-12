import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { XCircle, Loader2 } from "lucide-react";
import { apiRequest } from "../../services/api";

const Erro = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [paymentData, setPaymentData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Parâmetros que o Mercado Pago envia de volta
  const collectionId = searchParams.get("collection_id");
  const collectionStatus = searchParams.get("collection_status");
  const paymentId = searchParams.get("payment_id");
  const status = searchParams.get("status");
  const externalReference = searchParams.get("external_reference");
  const preferenceId = searchParams.get("preference_id");

  // Parâmetros customizados que enviamos nas back_urls
  const bookingSlug = searchParams.get("booking_slug");
  const bookingUrl = searchParams.get("booking_url");
  const appointmentId = searchParams.get("appointment_id");

  // Verificar status real do pagamento
  useEffect(() => {
    const checkPaymentStatus = async () => {
      try {
        setLoading(true);

        // Aguardar um pouco para dar tempo do webhook processar
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (appointmentId) {
          const response = await apiRequest.get(`/agendamentos/${appointmentId}/status`);
          setPaymentData(response);

          // Verificar o status REAL do pagamento
          const realStatus = response.paymentStatus || response.statusPagamento;

          // Se o pagamento foi aprovado, redirecionar para página de sucesso
          if (realStatus === 'paid' || realStatus === 'pago' || realStatus === 'approved') {
            navigate(`/pagamento/sucesso?${searchParams.toString()}`);
            return;
          }

          // Se está pendente, redirecionar para pendente
          if (realStatus === 'pending' || realStatus === 'in_process' || realStatus === 'pendente') {
            navigate(`/pagamento/pendente?${searchParams.toString()}`);
            return;
          }
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkPaymentStatus();
  }, [appointmentId, searchParams, navigate]);

  const getErrorMessage = () => {
    const statusLower = (status || collectionStatus || "").toLowerCase();

    if (statusLower === "rejected" || statusLower === "cancelled") {
      return "O pagamento foi rejeitado ou cancelado.";
    }

    return "Não foi possível processar seu pagamento. Por favor, tente novamente.";
  };

  const handleTryAgain = () => {
    if (bookingSlug) {
      navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=failed`);
    } else if (bookingUrl) {
      window.location.href = `${bookingUrl}?view=appointments&appointment_id=${appointmentId}&payment_status=failed`;
    } else {
      navigate('/');
    }
  };

  const handleBackToBooking = () => {
    if (bookingSlug) {
      navigate(`/agendamento/${bookingSlug}`);
    } else if (bookingUrl) {
      window.location.href = bookingUrl;
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando status do pagamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pagamento Não Aprovado
          </h1>
          <p className="text-gray-600">
            {getErrorMessage()}
          </p>
        </div>

        <div className="space-y-4">
          {(collectionId || paymentId) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                Detalhes da Tentativa
              </p>
              {(collectionId || paymentId) && (
                <p className="text-xs text-gray-600">
                  ID da transação: {collectionId || paymentId}
                </p>
              )}
              {status && (
                <p className="text-xs text-gray-600">
                  Status: {status}
                </p>
              )}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Dicas:</strong>
            </p>
            <ul className="text-xs text-blue-700 text-left mt-2 space-y-1">
              <li>• Verifique se os dados do cartão estão corretos</li>
              <li>• Certifique-se de ter limite disponível</li>
              <li>• Tente outro método de pagamento (PIX, por exemplo)</li>
              <li>• Entre em contato com seu banco se necessário</li>
            </ul>
          </div>

          <button
            onClick={handleTryAgain}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-6 rounded-lg transition-colors mb-2"
          >
            Ver Meu Agendamento
          </button>

          <button
            onClick={handleBackToBooking}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Voltar à Página de Agendamento
          </button>
        </div>
      </div>
    </div>
  );
};

export default Erro;
