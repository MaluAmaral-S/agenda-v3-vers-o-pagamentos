import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "../components/common/LoadingSpinner";
import BusinessHours from "./BusinessHours";
import Servicos from "./Services";
import Appointments from "./Appointments";
import Account from "./Account";
import MinhaAssinatura from "./MinhaAssinatura";
import MercadoPagoConnect from "./MercadoPagoConnect";
import Header from "../components/layout/Header"; // Import the new Header
import { apiRequest } from "../services/api";
import { Calendar, CalendarCheck, LayoutGrid, DollarSign, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildBusinessSlug } from "@/utils/slug";


const TAB_IDS = [
  "dashboard",
  "servicos",
  "horarios",
  "agendamentos",
  "pagamentos",
  "minha-assinatura",
  "conta",
];

const DEFAULT_TAB = "dashboard";

const Dashboard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => {
    const tabParam = searchParams.get("tab");
    return tabParam && TAB_IDS.includes(tabParam) ? tabParam : DEFAULT_TAB;
  }, [searchParams]);
  const [stats, setStats] = useState({
    todayBookings: 0,
    monthBookings: 0,
    activeServices: 0,
    monthlyRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [publicLink, setPublicLink] = useState("");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam || !TAB_IDS.includes(tabParam)) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", DEFAULT_TAB);
        return params;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const setActiveTab = useCallback((tab) => {
    if (!TAB_IDS.includes(tab)) {
      return;
    }
    if (searchParams.get("tab") === tab) {
      return;
    }
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", tab);
      return params;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let isActive = true;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await apiRequest.get('/dashboard/stats');
        if (isActive) {
          setStats(data);
        }
      } catch (error) {
        console.error("Erro ao buscar estatísticas:", error);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.businessName) {
      setPublicLink("");
      return;
    }

    const businessSlug = buildBusinessSlug(user);
    setPublicLink(`${window.location.origin}/agendamento/${businessSlug}`);
  }, [user?.businessName, user?.id]);

  const copyPublicLink = () => {
    navigator.clipboard.writeText(publicLink);
    toast.success("Link copiado para a área de transferência!", {
      duration: 3000,
    });
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-8">
        {activeTab === "dashboard" && (
          <div className="px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Estatísticas em forma de funil (3 no topo, 1 central embaixo) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Topo - 3 cartões, conteúdo centralizado */}
              <div className="bg-white rounded-xl p-6 shadow-sm border cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-gray-600">Agendamentos Hoje</p>
                <p className="text-2xl font-bold text-gray-900">{stats.todayBookings}</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <CalendarCheck className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-gray-600">Este Mês</p>
                <p className="text-2xl font-bold text-gray-900">{stats.monthBookings}</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <LayoutGrid className="w-6 h-6 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-gray-600">Serviços Ativos</p>
                <p className="text-2xl font-bold text-gray-900">{stats.activeServices}</p>
              </div>
            </div>

            {/* Base do funil - 1 cartão centralizado */}
            <div className="max-w-sm mx-auto w-full">
              <div className="bg-white rounded-xl p-6 shadow-sm border cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-center">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-6 h-6 text-yellow-600" />
                </div>
                <p className="text-sm font-medium text-gray-600">Receita Mensal</p>
                <p className="text-2xl font-bold text-gray-900">R$ {stats.monthlyRevenue.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Sua Página de Agendamento
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Compartilhe este link com seus clientes para que possam agendar online.
                  </p>
                </div>
                <div className="mt-1 lg:mt-0 grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
                  <Input className="lg:col-span-2" type="text" readOnly value={publicLink} />
                  <Button onClick={copyPublicLink} className="bg-purple-600 hover:bg-purple-700 w-full lg:w-auto justify-center">
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "servicos" && <Servicos />}
        {activeTab === "horarios" && <BusinessHours />}
        {activeTab === "agendamentos" && <Appointments />}
        {activeTab === "pagamentos" && <MercadoPagoConnect />}
        {activeTab === "minha-assinatura" && <MinhaAssinatura />}
        {activeTab === "conta" && <Account />}
      </main>
    </div>
  );
};

export default Dashboard;
