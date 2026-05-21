import { Iniciativa } from '../types';
import { cn } from '../lib/utils';
import { ChevronRight } from 'lucide-react';

const etapasConfig = [
  { id: 'registro_incompleto', label: 'Incompleto' },
  { id: 'por_confirmar', label: 'Confirmar' },
  { id: 'por_estimar', label: 'Estimar' },
  { id: 'por_aprobar_estimacion', label: 'Aprobar Est.' },
  { id: 'priorizacion_brm', label: 'Prior. BRM' },
  { id: 'por_habilitar_presupuesto', label: 'Hab. Presup.' },
  { id: 'por_planificar', label: 'Planificar' },
  { id: 'aprobar_planificacion', label: 'Aprobar Plan.' },
  { id: 'planificadas', label: 'Planificadas' },
  { id: 'eliminadas', label: 'Eliminadas' },
];

export function Pipeline({ iniciativas, onStageClick, activeStage }: { iniciativas: Iniciativa[], onStageClick: (stage: string) => void, activeStage: string }) {
  const counts = etapasConfig.map(e => ({
    ...e,
    count: iniciativas.filter(i => i.etapa_actual === e.id).length
  }));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-800 mb-4 uppercase tracking-wider">Pipeline de Iniciativas</h3>
      <div className="flex items-center min-w-[800px]">
        {counts.map((stage, idx) => (
          <div key={stage.id} className="flex items-center flex-1">
            <button
              onClick={() => onStageClick(stage.id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all group",
                activeStage === stage.id 
                  ? "border-blue-500 bg-blue-50 shadow-sm" 
                  : "border-transparent hover:border-gray-200 hover:bg-gray-50",
                stage.id === 'eliminadas' && activeStage === stage.id ? "border-red-500 bg-red-50" : ""
              )}
            >
              <span className="text-2xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                {stage.count}
              </span>
              <span className="text-[10px] text-center font-medium mt-1 text-gray-500 uppercase">
                {stage.label}
              </span>
            </button>
            {idx < counts.length - 1 && (
              <ChevronRight className="text-gray-300 w-5 h-5 flex-shrink-0 mx-1" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
