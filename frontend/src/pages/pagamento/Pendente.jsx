import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock, Loader2, CheckCircle } from "lucide-react";
import { apiRequest } from "../../services/api";
import { toast } from "sonner";

const Pendente = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState(null);

  // Parâmetros que o Mercado Pago envia de volta
  const collectionId = searchParams.get("collection_id");
  const collectionStatus = searchParams.get("collection_status");
  const paymentId = searchParams.get("payment_id");
  const status = searchParams.get("status");
  const externalReference = searchParams.get("external_reference");
  const preferenceId = searchParams.get("preference_id");
  const paymentType = searchParams.get("payment_type");

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
        let finalPaymentData = null;
        if (appointmentId) {
          const response = await apiRequest.get(`/agendamentos/${appointmentId}/status`);
          finalPaymentData = response;
          setPaymentData(response);

          // Verificar o status REAL do pagamento
          const realStatus = response.paymentStatus || response.statusPagamento;

          // Se o pagamento foi aprovado, mostrar mensagem e redirecionar
          if (realStatus === 'paid' || realStatus === 'pago' || realStatus === 'approved') {
            toast.success('Pagamento aprovado! Redirecionando...', {
              icon: <CheckCircle className="w-5 h-5" />,
            });

            setTimeout(() => {
              if (bookingSlug) {
                navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=approved`);
              } else if (bookingUrl) {
                window.location.href = `${bookingUrl}?view=appointments&appointment_id=${appointmentId}&payment_status=approved`;
              } else {
                navigate('/');
              }
            }, 2000);
            return;
          }
        }

        // Se não foi aprovado, continuar na página de pendente e redirecionar após 4 segundos
        setTimeout(() => {
          if (bookingSlug) {
            navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=pending`);
          } else if (bookingUrl) {
            window.location.href = `${bookingUrl}?view=appointments&appointment_id=${appointmentId}&payment_status=pending`;
          } else {
            navigate('/');
          }
        }, 2000);

      } catch (err) {
        console.error("Erro ao carregar dados do pagamento:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPaymentData();
  }, [appointmentId, bookingSlug, bookingUrl, navigate]);

  const getPaymentInstructions = () => {
    const type = (paymentType || "").toLowerCase();
    const stat = (status || collectionStatus || "").toLowerCase();

    if (type === "ticket" || type === "boleto") {
      return {
        title: "Boleto Gerado",
        message: "Seu boleto foi gerado com sucesso. Você receberá as instruções de pagamento por e-mail.",
        instructions: [
          "Pague o boleto até a data de vencimento",
          "O pagamento pode levar até 2 dias úteis para ser confirmado",
          "Após a confirmação, você receberá um e-mail de confirmação"
        ]
      };
    }

    if (type === "pix") {
      return {
        title: "PIX Pendente",
        message: "Aguardando a confirmação do pagamento via PIX.",
        instructions: [
          "Complete o pagamento PIX através do QR Code ou código",
          "A confirmação é instantânea após o pagamento",
          "Você receberá uma notificação assim que for confirmado"
        ]
      };
    }

    return {
      title: "Pagamento Pendente",
      message: "Seu pagamento está sendo processado.",
      instructions: [
        "Aguarde a confirmação do pagamento",
        "Você receberá um e-mail quando o status for atualizado",
        "O processo pode levar alguns minutos"
      ]
    };
  };

  const instructions = getPaymentInstructions();

  // Se o pagamento foi aprovado (verificado depois de carregar), mostrar ícone de sucesso
  const isPaid = paymentData && (paymentData.paymentStatus === 'paid' || paymentData.paymentStatus === 'approved' || paymentData.statusPagamento === 'pago');

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-amber-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className={`mx-auto w-20 h-20 ${isPaid ? 'bg-green-100' : 'bg-yellow-100'} rounded-full flex items-center justify-center mb-4`}>
            {isPaid ? (
              <CheckCircle className="w-12 h-12 text-green-600" />
            ) : (
              <Clock className="w-12 h-12 text-yellow-600" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isPaid ? 'Pagamento Aprovado!' : instructions.title}
          </h1>
          <p className="text-gray-600">
            {isPaid ? 'Seu pagamento foi confirmado com sucesso!' : instructions.message}
          </p>
        </div>

        {loading ? (
          <div className="py-6">
            <Loader2 className="w-8 h-8 text-yellow-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              Carregando informações...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(collectionId || paymentId) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-medium text-yellow-800 mb-2">
                  Detalhes do Pagamento
                </p>
                {(collectionId || paymentId) && (
                  <p className="text-xs text-gray-600">
                    ID da transação: {collectionId || paymentId}
                  </p>
                )}
                {appointmentId && (
                  <p className="text-xs text-gray-600">
                    Agendamento: #{appointmentId}
                  </p>
                )}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
              <p className="text-sm font-medium text-blue-800 mb-2">
                Próximos Passos:
              </p>
              <ul className="text-xs text-blue-700 space-y-1">
                {instructions.instructions.map((instruction, index) => (
                  <li key={index}>• {instruction}</li>
                ))}
              </ul>
            </div>

            <p className="text-sm text-gray-600">
              Você será redirecionado para a página de agendamentos em instantes...
            </p>

            <button
              onClick={() => {
                if (bookingSlug) {
                  navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}`);
                } else if (bookingUrl) {
                  window.location.href = `${bookingUrl}?view=appointments&appointment_id=${appointmentId}`;
                } else {
                  navigate('/');
                }
              }}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Ver Meus Agendamentos
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pendente;
