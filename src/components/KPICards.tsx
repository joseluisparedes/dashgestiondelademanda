import React, { useMemo } from 'react';
import { Iniciativa } from '../types';
import { Activity, AlertCircle, Banknote, Briefcase, ShieldAlert } from 'lucide-react';
import { formatSoles } from '../lib/utils';

interface KPICardsProps {
  iniciativas: Iniciativa[];
}

export function KPICards({ iniciativas: all }: KPICardsProps) {
  const kpis = useMemo(() => {
    // Excluir eliminadas de todos los cálculos de KPI
    const activas = all.filter(i => i.etapa_actual !== 'eliminadas');
    const eliminadas = all.filter(i => i.etapa_actual === 'eliminadas');

    const sinEstimar = activas.filter(i =>
      ['registro_incompleto', 'por_estimar'].includes(i.etapa_actual)
    ).length;

    const etapasConPresupuestoComprometido = ['por_planificar', 'aprobar_planificacion', 'planificadas'];
    const etapasEnEvaluacion = ['por_aprobar_estimacion', 'por_habilitar_presupuesto'];

    const presComprometido = activas
      .filter(i => etapasConPresupuestoComprometido.includes(i.etapa_actual) && i.costo_soles)
      .reduce((sum, i) => sum + (i.costo_soles ?? 0), 0);

    const presEvaluacion = activas
      .filter(i => etapasEnEvaluacion.includes(i.etapa_actual) && i.costo_soles)
      .reduce((sum, i) => sum + (i.costo_soles ?? 0), 0);

    const soxCount = activas.filter(i => i.impacto_sox === 'SI').length;

    return {
      totalActivas: activas.length,
      sinEstimar,
      presComprometido,
      presEvaluacion,
      soxCount,
      eliminadas: eliminadas.length,
    };
  }, [all]);

  const formatPresupuesto = (val: number) => {
    if (val === 0) return 'S/ 0';
    if (val >= 1_000_000) return `S/ ${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `S/ ${Math.round(val / 1_000)}k`;
    return formatSoles(val);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      <Card
        title="Iniciativas Activas"
        value={kpis.totalActivas}
        subtitle="Excluye eliminadas"
        icon={<Activity size={18} className="text-blue-500" />}
        accentColor="#3b82f6"
      />
      <Card
        title="Sin Estimar"
        value={kpis.sinEstimar}
        subtitle="Fases iniciales del pipeline"
        icon={<AlertCircle size={18} className="text-orange-500" />}
        accentColor="#f97316"
        highlight={kpis.sinEstimar > 20}
      />
      <Card
        title="Presup. Comprometido"
        value={formatPresupuesto(kpis.presComprometido)}
        subtitle="En planificación activa"
        icon={<Banknote size={18} className="text-emerald-500" />}
        accentColor="#10b981"
      />
      <Card
        title="Presup. en Evaluación"
        value={formatPresupuesto(kpis.presEvaluacion)}
        subtitle="Pendiente de aprobación"
        icon={<Briefcase size={18} className="text-purple-500" />}
        accentColor="#8b5cf6"
      />
      <Card
        title="Impacto SOX"
        value={kpis.soxCount}
        subtitle="Requieren control regulatorio"
        icon={<ShieldAlert size={18} className="text-red-500" />}
        accentColor="#ef4444"
        highlight={kpis.soxCount > 0}
      />
    </div>
  );
}

interface CardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor?: string;
  highlight?: boolean;
}

function Card({ title, value, subtitle, icon, accentColor, highlight }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border p-5 flex flex-col hover:shadow-md transition-shadow ${
        highlight ? 'border-orange-200 shadow-sm' : 'border-gray-100 shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">
          {title}
        </span>
        <div
          className="p-2 rounded-lg flex-shrink-0"
          style={{ backgroundColor: accentColor ? `${accentColor}18` : '#f9fafb' }}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-800 leading-none">{value}</div>
      {subtitle && (
        <div className="mt-1.5 text-[11px] text-gray-400 font-medium">{subtitle}</div>
      )}
    </div>
  );
}
