import { Iniciativa } from '../types';
import { EtapaPipeline } from '../types';
import { ETAPAS_CONFIG, ETAPAS_MAP, ETAPAS_PLANIFICADAS_CONFIG, ETAPAS_PLANIFICADAS_MAP } from '../constants';

interface PipelineProps {
  iniciativas: Iniciativa[];
  onStageClick: (stage: EtapaPipeline) => void;
  activeStages: EtapaPipeline[];
  mode?: 'demanda' | 'planificadas';
}

export function Pipeline({ iniciativas, onStageClick, activeStages, mode = 'demanda' }: PipelineProps) {
  const isPlanificadas = mode === 'planificadas';
  const currentConfigList = isPlanificadas ? ETAPAS_PLANIFICADAS_CONFIG : ETAPAS_CONFIG;
  
  // Etapas del flujo normal (excluyendo terminales para el flujo principal)
  const mainStages = currentConfigList.filter(e => !e.isTerminal);
  const terminalStages = currentConfigList.filter(e => e.isTerminal);

  const getCount = (stageId: EtapaPipeline) =>
    iniciativas.filter(i => i.etapa_actual === stageId).length;

  const StageButton = ({ stage }: { stage: typeof ETAPAS_CONFIG[number] }) => {
    const count = getCount(stage.id);
    const isActive = activeStages.includes(stage.id);

    return (
      <button
        onClick={() => onStageClick(stage.id)}
        title={`Filtrar por: ${stage.label}`}
        style={
          isActive
            ? { borderColor: stage.color, backgroundColor: stage.bgColor }
            : undefined
        }
        className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg border-2 transition-all group min-w-[72px] ${
          isActive
            ? 'shadow-sm'
            : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
        }`}
      >
        <span
          className="text-2xl font-bold transition-colors"
          style={{ color: isActive ? stage.color : undefined }}
        >
          {count}
        </span>
        <span
          className="text-[10px] text-center font-semibold mt-0.5 uppercase tracking-wide leading-tight"
          style={{ color: isActive ? stage.color : '#6b7280' }}
        >
          {stage.label}
        </span>
        {isActive && (
          <span
            className="mt-1 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
        )}
      </button>
    );
  };

  const totalActivas = iniciativas.filter(i => isPlanificadas || i.etapa_actual !== 'eliminadas').length;
  const totalEliminadas = getCount('eliminadas');

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Pipeline de Iniciativas
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>
            <span className="font-semibold text-slate-600">{totalActivas}</span> activas
          </span>
          {activeStages.length > 0 && (
            <span className="bg-blue-100 text-blue-600 font-semibold px-2 py-0.5 rounded-full">
              {activeStages.length} etapa{activeStages.length > 1 ? 's' : ''} seleccionada{activeStages.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {/* Etapas del flujo principal */}
          {mainStages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center">
              <StageButton stage={stage} />
              {idx < mainStages.length - 1 && (
                <svg
                  className="w-4 h-4 flex-shrink-0 mx-0.5 text-gray-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}

          {/* Separador visual para etapas terminales si existen */}
          {terminalStages.length > 0 && (
            <>
              <div className="mx-3 flex items-center gap-1 text-gray-300">
                <div className="w-6 border-t-2 border-dashed border-gray-300" />
                <span className="text-[10px] uppercase font-bold text-gray-300">o</span>
                <div className="w-6 border-t-2 border-dashed border-gray-300" />
              </div>

              {/* Etapas terminales (eliminadas) */}
              {terminalStages.map(stage => (
                <div key={stage.id}>
                  <StageButton stage={stage} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Leyenda de colores */}
      <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap gap-2">
        {currentConfigList.map(stage => (
          <div key={stage.id} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <span className="text-[10px] text-gray-400">{stage.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
