import { Iniciativa } from '../types';
import { Target, AlertCircle, Banknote, ShieldCheck, Activity, Briefcase } from 'lucide-react';
import { useMemo } from 'react';

export function KPICards({ iniciativas }: { iniciativas: Iniciativa[] }) {
  const kpis = useMemo(() => {
    let activas = 0;
    let sin_estimar = 0;
    let pres_comprometido = 0;
    let pres_evaluacion = 0;
    let con_presupuesto = 0;
    let sox_count = 0;

    const etapas_eval = ['por_aprobar_estimacion', 'priorizacion_brm', 'por_habilitar_presupuesto'];
    const etapas_req_pres = ['por_habilitar_presupuesto', 'por_planificar', 'aprobar_planificacion', 'planificadas'];

    iniciativas.forEach(i => {
      if (i.etapa_actual !== 'eliminadas') activas++;
      if (['registro_incompleto', 'por_confirmar', 'por_estimar'].includes(i.etapa_actual)) sin_estimar++;
      
      if (i.etapa_actual === 'planificadas' && i.costo_soles) pres_comprometido += i.costo_soles;
      if (etapas_eval.includes(i.etapa_actual) && i.costo_soles) pres_evaluacion += i.costo_soles;

      if (i.impacto_sox === 'SI') sox_count++;
    });

    const formatMoney = (val: number) => `S/ ${(val/1000000).toFixed(1)}M`;

    return { activas, sin_estimar, pres_comprometido, pres_evaluacion, sox_count };
  }, [iniciativas]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      <Card title="Iniciativas Activas" value={kpis.activas} subtitle="Excluye eliminadas" icon={<Activity className="text-blue-500" />} />
      <Card title="Sin Estimar" value={kpis.sin_estimar} subtitle="Fase inicial" icon={<AlertCircle className="text-orange-500" />} />
      <Card title="Pres. Comprometido" value={kpis.pres_comprometido ? `S/ ${(kpis.pres_comprometido/1000).toFixed(0)}k` : 'S/ 0'} subtitle="En planificadas" icon={<Banknote className="text-green-500" />} />
      <Card title="Pres. en Evaluación" value={kpis.pres_evaluacion ? `S/ ${(kpis.pres_evaluacion/1000).toFixed(0)}k` : 'S/ 0'} subtitle="Pendiente aprob." icon={<Briefcase className="text-purple-500" />} />
      <Card title="Impacto SOX" value={kpis.sox_count} subtitle="Control regulatorio" icon={<ShieldCheck className="text-red-500" />} />
    </div>
  );
}

function Card({ title, value, subtitle, icon }: { title: string; value: string | number; subtitle?: string; icon: import('react').ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
        <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-800">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-gray-400 font-medium">{subtitle}</div>}
    </div>
  )
}
