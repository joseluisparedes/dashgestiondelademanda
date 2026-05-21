import React from 'react';

export interface FilterState {
  etapa: string;
  institucion: string;
  pilar: string;
  complejidad: string;
  it_bp: string;
  lider_dominio: string;
  tipo_recurso: string;
  impacto_sox: string;
  proyecto_spo: string;
  prioridad_brm: string;
  estabilizacion_sis: string;
}

export function Filters({ 
  filters, 
  setFilters, 
  options 
}: { 
  filters: FilterState, 
  setFilters: (f: React.SetStateAction<FilterState>) => void,
  options: { instituciones: string[], pilares: string[], complejidades: string[], it_bps: string[], lideres: string[], recursos: string[], prioridades: string[] }
}) {
  
  const update = (key: keyof FilterState, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  const SelectMenu = ({ label, field, opts }: { label: string, field: keyof FilterState, opts?: string[] }) => (
    <div className="flex-[1_0_120px]">
      <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-1">{label}</label>
      <select 
        value={filters[field]} 
        onChange={e => update(field, e.target.value)}
        className="w-full text-xs box-border rounded outline-none bg-gray-50 p-2 border border-gray-200 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Todas</option>
        {opts ? opts.map(o => <option key={o} value={o}>{o}</option>) : (
          <>
            <option value="SI">SI</option>
            <option value="NO">NO</option>
          </>
        )}
      </select>
    </div>
  );

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end mb-6">
      <SelectMenu label="Institución" field="institucion" opts={options.instituciones} />
      <SelectMenu label="Pilar Estratégico" field="pilar" opts={options.pilares} />
      <SelectMenu label="Complejidad" field="complejidad" opts={options.complejidades} />
      <SelectMenu label="IT BP" field="it_bp" opts={options.it_bps} />
      <SelectMenu label="Líder Dominio" field="lider_dominio" opts={options.lideres} />
      <SelectMenu label="Recurso" field="tipo_recurso" opts={options.recursos} />
      <SelectMenu label="Prioridad BRM" field="prioridad_brm" opts={options.prioridades} />
      <SelectMenu label="SPO" field="proyecto_spo" />
      <SelectMenu label="SOX" field="impacto_sox" />
      <SelectMenu label="Estab. SIS" field="estabilizacion_sis" />

      <div className="flex-[1_0_100px]">
        <button 
          onClick={() => setFilters({
            etapa: '', institucion: '', pilar: '', complejidad: '', it_bp: '', lider_dominio: '', tipo_recurso: '', impacto_sox: '', proyecto_spo: '', prioridad_brm: '', estabilizacion_sis: ''
          })}
          className="w-full p-2 h-[34px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded transition-colors"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
