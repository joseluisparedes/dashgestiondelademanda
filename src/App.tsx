/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { generateMockData } from './mockData';
import { DashboardData, Iniciativa, EtapaPipeline } from './types';
import { KPICards } from './components/KPICards';
import { Charts } from './components/Charts';
import { DataTable } from './components/DataTable';
import { Filters, FilterState } from './components/Filters';
import { Pipeline } from './components/Pipeline';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

const HOJAS_OPERATIVAS: Record<string, EtapaPipeline> = {
  'Registro incompleto': 'registro_incompleto',
  'Por confirmar': 'por_confirmar',
  'Por estimar': 'por_estimar',
  'Por aprobar estimacion': 'por_aprobar_estimacion',
  'Priorización BRM': 'priorizacion_brm',
  'Por habilitar presup.': 'por_habilitar_presupuesto',
  'Por planificar': 'por_planificar',
  'Aprobar Planificación': 'aprobar_planificacion',
  'Planificadas': 'planificadas',
  'Eliminados': 'eliminadas'
};

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  
  const [filters, setFilters] = useState<FilterState>({
    etapa: '',
    institucion: '',
    pilar: '',
    complejidad: '',
    it_bp: '',
    lider_dominio: '',
    tipo_recurso: '',
    impacto_sox: '',
    proyecto_spo: '',
    prioridad_brm: '',
    estabilizacion_sis: ''
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const dataUi8 = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(dataUi8, { type: 'array', cellDates: true });
      
      let allIniciativas: Iniciativa[] = [];
      
      Object.entries(HOJAS_OPERATIVAS).forEach(([sheetName, etapa]) => {
        if (workbook.Sheets[sheetName]) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
          
          const parsed: Iniciativa[] = jsonData.map((row, i) => {
            const getVal = (...keys: string[]) => {
              for (const key of keys) {
                const found = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase().trim() || k.toLowerCase().includes(key.toLowerCase()));
                if (found && row[found] !== undefined && row[found] !== '') return row[found];
              }
              return null;
            };

            const formatDt = (val: any) => {
              if (!val) return null;
              try {
                return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
              } catch (e) {
                return null;
              }
            };

            const parseNum = (val: any) => {
              if (typeof val === 'number') return val;
              if (typeof val === 'string') {
                const clean = val.replace(/[^0-9.-]+/g, "");
                return parseFloat(clean) || null;
              }
              return null;
            };

            return {
              id: parseNum(getVal('Id', 'N° Ticket')) || Number(`${i+1}${Math.floor(Math.random()*1000)}`),
              etapa_actual: etapa,
              fecha_registro: formatDt(getVal('Hora de inicio', 'Fecha Registro')) || new Date().toISOString(),
              titulo: String(getVal('Título de la INICIATIVA', 'Titulo') || 'Sin Título'),
              objetivo: String(getVal('Objetivo') || ''),
              institucion: String(getVal('Institución', 'Institucion', 'Universidad') || ''),
              vp_solicitante: String(getVal('VP del área solicitante', 'VP') || ''),
              usuario_negocio: String(getVal('Usuario solicitante del negocio', 'Usuario') || ''),
              it_bp: String(getVal('IT BP', 'BP') || ''),
              fecha_entrega_requerida: formatDt(getVal('Fecha de entrega requerida', 'Para cuando se necesita')) || null,
              proyecto_spo: String(getVal('Proyecto SPO', 'SPO') || 'NO'),
              tipo_iniciativa: String(getVal('Tipo de iniciativa', 'Tipo') || ''),
              pilar_estrategico: String(getVal('Pilar estratégico', 'Pilar') || ''),
              estabilizacion_sis: String(getVal('estabilización de procesos SIS', 'SIS') || 'NO'),
              usuarios_beneficiados: String(getVal('Usuarios beneficiados', 'afectados') || ''),
              beneficio_cuantitativo: String(getVal('Beneficio cuantitativo', 'Beneficio') || ''),
              complejidad: String(getVal('Complejidad') || ''),
              lider_dominio: String(getVal('Líder de Dominio', 'Lider') || ''),
              asignado_por: String(getVal('Asignado por') || null),
              fecha_asignacion: formatDt(getVal('Fecha de asignación esperada')) || null,
              duracion_meses: parseNum(getVal('Tiempo estimado', 'meses')) || null,
              costo_usd: parseNum(getVal('Costo dolares', 'Costo total dolares', 'USD')) || null,
              costo_soles: parseNum(getVal('Costo Soles', 'Costo total Soles')) || null,
              tipo_recurso: String(getVal('Recursos internos o externos', 'Recurso') || null),
              proyecto_o_req: String(getVal('Proyecto o Requerimiento', 'No BAU') || null),
              funcionalidad_nueva: String(getVal('Funcionalidad nueva') || null),
              estatus_estimacion: String(getVal('Estatus Estimación') || null),
              accion_brm: String(getVal('Acción (Atender', 'Accion') || null),
              prioridad_brm: String(getVal('Priorización de atención', 'Prioridad') || null),
              fecha_inicio_planificada: formatDt(getVal('Fecha inicio [Planificada]')) || null,
              fecha_fin_planificada: formatDt(getVal('Fecha fin [Planificada]')) || null,
              impacto_sox: String(getVal('Impacto SOX', 'SOX') || 'NO')
            };
          });
          
          allIniciativas = [...allIniciativas, ...parsed];
        }
      });

      // Deduplicate by ID favoring more advanced stages (this is simpler, we just take the first we find or deduplicate later if needed)
      // Since order of keys in HOJAS_OPERATIVAS matches pipeline somewhat, we will just use it.
      
      const resumenPorEtapa: Record<string, number> = {};
      Object.values(HOJAS_OPERATIVAS).forEach(e => resumenPorEtapa[e] = 0);
      allIniciativas.forEach(i => {
         if(resumenPorEtapa[i.etapa_actual] !== undefined) {
             resumenPorEtapa[i.etapa_actual]++;
         }
      });

      setData({
        ultima_actualizacion: new Date().toISOString(),
        tipo_de_cambio: 3.75, // fallback if not read
        resumen: {
          total_iniciativas: allIniciativas.length,
          por_etapa: resumenPorEtapa
        },
        iniciativas: allIniciativas.sort((a,b) => new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime())
      });
      
      setFilters({
        etapa: '', institucion: '', pilar: '', complejidad: '', it_bp: '', lider_dominio: '', tipo_recurso: '', impacto_sox: '', proyecto_spo: '', prioridad_brm: '', estabilizacion_sis: ''
      });
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    // Load mock data mimicking data.json
    const load = async () => {
      const mockResult = generateMockData();
      setData(mockResult);
    };
    load();
  }, []);

  const filteredIniciativas = useMemo(() => {
    if (!data) return [];
    return data.iniciativas.filter(t => {
      if (filters.etapa && t.etapa_actual !== filters.etapa) return false;
      if (filters.institucion && t.institucion !== filters.institucion) return false;
      if (filters.pilar && t.pilar_estrategico !== filters.pilar) return false;
      if (filters.complejidad && t.complejidad !== filters.complejidad) return false;
      if (filters.it_bp && t.it_bp !== filters.it_bp) return false;
      if (filters.lider_dominio && t.lider_dominio !== filters.lider_dominio) return false;
      if (filters.tipo_recurso && t.tipo_recurso !== filters.tipo_recurso) return false;
      if (filters.impacto_sox && t.impacto_sox !== filters.impacto_sox) return false;
      if (filters.proyecto_spo && t.proyecto_spo !== filters.proyecto_spo) return false;
      if (filters.prioridad_brm && t.prioridad_brm !== filters.prioridad_brm) return false;
      if (filters.estabilizacion_sis && t.estabilizacion_sis !== filters.estabilizacion_sis) return false;
      return true;
    });
  }, [data, filters]);

  const filterOptions = useMemo(() => {
    if (!data) return { instituciones: [], pilares: [], complejidades: [], it_bps: [], lideres: [], recursos: [], prioridades: [] };
    return {
      instituciones: Array.from(new Set(data.iniciativas.map(t => t.institucion).filter(Boolean))),
      pilares: Array.from(new Set(data.iniciativas.map(t => t.pilar_estrategico).filter(Boolean))),
      complejidades: Array.from(new Set(data.iniciativas.map(t => t.complejidad).filter(Boolean))),
      it_bps: Array.from(new Set(data.iniciativas.map(t => t.it_bp).filter(Boolean))),
      lideres: Array.from(new Set(data.iniciativas.map(t => t.lider_dominio).filter(Boolean))),
      recursos: Array.from(new Set(data.iniciativas.map(t => t.tipo_recurso).filter(Boolean))),
      prioridades: Array.from(new Set(data.iniciativas.map(t => t.prioridad_brm).filter(Boolean)))
    };
  }, [data]);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">TI</span>
              </div>
              <h1 className="text-lg font-bold text-slate-800">
                Gestión de la Demanda TI <span className="text-gray-400 font-normal">| Laureate Perú</span>
              </h1>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-sm text-gray-500 flex flex-col items-end">
                <span className="font-medium text-xs text-gray-400 uppercase tracking-wider">Última actualización SharePoint o Archivo</span>
                <span>{format(parseISO(data.ultima_actualizacion), "dd MMM yyyy HH:mm", { locale: es })}</span>
              </div>
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors">
                <Upload size={16} />
                <span>Subir Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Filters filters={filters} setFilters={setFilters} options={filterOptions} />
        <Pipeline iniciativas={filteredIniciativas} onStageClick={(s) => setFilters(f => ({ ...f, etapa: s === f.etapa ? '' : s }))} activeStage={filters.etapa} />
        <KPICards iniciativas={filteredIniciativas} />
        <Charts iniciativas={filteredIniciativas} />
        <DataTable iniciativas={filteredIniciativas} />
      </main>
    </div>
  );
}
