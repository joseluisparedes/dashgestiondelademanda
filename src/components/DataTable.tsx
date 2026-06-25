import React, { useMemo, useState, useEffect } from 'react';
import { Iniciativa } from '../types';
import { ETAPAS_MAP, ETAPAS_PLANIFICADAS_MAP } from '../constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, FileDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { escapeCsvField } from '../lib/utils';

interface DataTableProps {
  iniciativas: Iniciativa[];
  expandedId?: number | null;
  onExpandedIdChange?: (id: number | null) => void;
  mode?: 'demanda' | 'planificadas';
}

interface ColumnDef {
  id: string;
  label: string;
  render: (t: Iniciativa) => React.ReactNode;
  sortKey?: keyof Iniciativa;
  className?: string;
}

const ITEMS_PER_PAGE = 25;

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------
function fmtDate(d: string | null): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

function fmtMoney(v: number | null): string {
  if (!v) return '—';
  return `S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Badge de etapa con colores de ETAPAS_MAP
// ---------------------------------------------------------------------------
function EtapaBadge({ etapa, mode = 'demanda' }: { etapa: string; mode?: 'demanda' | 'planificadas' }) {
  const isPlanificadas = mode === 'planificadas';
  const config = isPlanificadas
    ? ETAPAS_PLANIFICADAS_MAP.get(etapa as Parameters<typeof ETAPAS_PLANIFICADAS_MAP.get>[0])
    : ETAPAS_MAP.get(etapa as Parameters<typeof ETAPAS_MAP.get>[0]);
    
  if (!config) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium whitespace-nowrap">
        {etapa.replace(/_/g, ' ')}
      </span>
    );
  }
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ backgroundColor: config.bgColor, color: config.textColor }}
    >
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badge de complejidad
// ---------------------------------------------------------------------------
function ComplejidadBadge({ value }: { value: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    Alta:  { bg: '#fef2f2', text: '#b91c1c' },
    Media: { bg: '#fffbeb', text: '#92400e' },
    Baja:  { bg: '#f0fdf4', text: '#166534' },
  };
  const s = styles[value];
  if (!s) return <span className="text-xs text-gray-400">{value || '—'}</span>;
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Fila expandida con detalle completo
// ---------------------------------------------------------------------------
function ExpandedRow({ t, mode = 'demanda' }: { t: Iniciativa; mode?: 'demanda' | 'planificadas' }) {
  const isPlanificadas = mode === 'planificadas';

  const fields: Array<{ label: string; value: string | null | number }> = isPlanificadas
    ? [
        { label: 'Frente', value: t.frente ?? null },
        { label: 'Sub Estado', value: t.sub_estado ?? null },
        { label: 'ID Jira', value: t.id_jira ?? null },
        { label: 'Ticket SN RITM', value: t.ticket_sn_rit ?? null },
        { label: 'Líder de dominio', value: t.lider_dominio },
        { label: 'IT BP', value: t.it_bp },
        { label: 'Solicitante', value: t.usuario_negocio },
        { label: 'Costo Soles', value: fmtMoney(t.costo_soles) },
        { label: 'Inicio Planificado', value: fmtDate(t.fecha_inicio_planificada) },
        { label: 'Fin Planificado', value: fmtDate(t.fecha_fin_planificada) },
        { label: 'Inicio Real', value: fmtDate(t.fecha_inicio_real ?? null) },
        { label: 'Fin Real', value: fmtDate(t.fecha_fin_real ?? null) },
        { label: 'Desviación (%)', value: t.desviacion_pct !== null && t.desviacion_pct !== undefined ? `${t.desviacion_pct}%` : null },
        { label: 'Aviso a Negocio cambio de fecha', value: t.aviso_negocio_cambio_fecha ?? null },
        { label: 'Motivo de Replanificación', value: t.motivo_replanificacion ?? null },
      ]
    : [
        { label: 'Objetivo', value: t.objetivo },
        { label: 'VP Solicitante', value: t.vp_solicitante },
        { label: 'Usuario de Negocio', value: t.usuario_negocio },
        { label: 'Tipo de Iniciativa', value: t.tipo_iniciativa },
        { label: 'Pilar Estratégico', value: t.pilar_estrategico },
        { label: 'Beneficio Cuantitativo', value: t.beneficio_cuantitativo },
        { label: 'Usuarios Beneficiados', value: t.usuarios_beneficiados },
        { label: 'Tipo de Recurso', value: t.tipo_recurso },
        { label: 'Proyecto o Req.', value: t.proyecto_o_req },
        { label: 'Proyecto SPO', value: t.proyecto_spo },
        { label: 'Estabilización SIS', value: t.estabilizacion_sis },
        { label: 'Funcionalidad Nueva', value: t.funcionalidad_nueva },
        { label: 'Estatus Estimación', value: t.estatus_estimacion },
        { label: 'Acción BRM', value: t.accion_brm },
        { label: 'Prioridad BRM', value: t.prioridad_brm },
        { label: 'Impacto SOX', value: t.impacto_sox },
        { label: 'Asignado por', value: t.asignado_por },
        { label: 'Fecha Asignación', value: fmtDate(t.fecha_asignacion) },
        { label: 'Fecha Entrega Requerida', value: fmtDate(t.fecha_entrega_requerida) },
        { label: 'Duración (meses)', value: t.duracion_meses },
        { label: 'Costo USD', value: t.costo_usd ? `$ ${t.costo_usd.toLocaleString()}` : null },
        { label: 'Costo Soles', value: fmtMoney(t.costo_soles) },
        { label: 'Inicio Planificado', value: fmtDate(t.fecha_inicio_planificada) },
        { label: 'Fin Planificado', value: fmtDate(t.fecha_fin_planificada) },
      ];

  return (
    <tr className="bg-slate-50 border-b border-gray-100">
      <td colSpan={12} className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-2 text-xs">
          {fields.map(f => (
            <div key={f.label}>
              <span className="font-semibold text-gray-500">{f.label}: </span>
              <span className="text-slate-700">{f.value ?? '—'}</span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function DataTable({ iniciativas, expandedId: propExpandedId, onExpandedIdChange, mode = 'demanda' }: DataTableProps) {
  const isPlanificadas = mode === 'planificadas';

  const COLUMNS: ColumnDef[] = useMemo(() => {
    if (isPlanificadas) {
      return [
        { id: 'id', label: 'ID Demanda', sortKey: 'id', render: t => String(t.id).padStart(4, '0'), className: 'font-mono text-slate-500 text-xs whitespace-nowrap' },
        { id: 'frente', label: 'Frente', sortKey: 'frente' as any, render: t => t.frente || '—', className: 'whitespace-nowrap font-medium text-slate-700' },
        { id: 'titulo', label: 'Título de la Iniciativa', sortKey: 'titulo', render: t => t.titulo, className: 'font-medium text-slate-800 leading-snug min-w-[280px]' },
        { id: 'etapa_actual', label: 'Estado', sortKey: 'etapa_actual', render: t => <EtapaBadge etapa={t.etapa_actual} mode={mode} /> },
        { id: 'sub_estado', label: 'Sub Estado', sortKey: 'sub_estado' as any, render: t => t.sub_estado || '—', className: 'whitespace-nowrap text-slate-600' },
        { id: 'lider_dominio', label: 'Líder de Dominio', sortKey: 'lider_dominio', render: t => t.lider_dominio || '—', className: 'whitespace-nowrap text-slate-700 min-w-[150px]' },
        { id: 'it_bp', label: 'IT BP', sortKey: 'it_bp', render: t => t.it_bp || '—', className: 'whitespace-nowrap text-slate-600' },
        { id: 'costo_soles', label: 'Costo Soles', sortKey: 'costo_soles', render: t => fmtMoney(t.costo_soles), className: 'text-right font-mono text-slate-600 whitespace-nowrap' },
        { id: 'fecha_inicio_planificada', label: 'F. Inicio Planificada', sortKey: 'fecha_inicio_planificada', render: t => fmtDate(t.fecha_inicio_planificada), className: 'whitespace-nowrap text-xs text-slate-600' },
        { id: 'fecha_fin_planificada', label: 'F. Fin Planificada', sortKey: 'fecha_fin_planificada', render: t => fmtDate(t.fecha_fin_planificada), className: 'whitespace-nowrap text-xs text-slate-600' },
        { id: 'fecha_inicio_real', label: 'F. Inicio Real', sortKey: 'fecha_inicio_real' as any, render: t => fmtDate(t.fecha_inicio_real ?? null), className: 'whitespace-nowrap text-xs text-slate-600' },
        { id: 'fecha_fin_real', label: 'F. Fin Real', sortKey: 'fecha_fin_real' as any, render: t => fmtDate(t.fecha_fin_real ?? null), className: 'whitespace-nowrap text-xs text-slate-600' },
        { id: 'id_jira', label: 'ID Jira', sortKey: 'id_jira' as any, render: t => t.id_jira || '—', className: 'whitespace-nowrap text-xs text-slate-600' },
      ];
    }

    return [
      { id: 'id', label: 'ID', sortKey: 'id', render: t => String(t.id).padStart(4, '0'), className: 'font-mono text-slate-500 text-xs whitespace-nowrap' },
      { id: 'institucion', label: 'Institución', sortKey: 'institucion', render: t => t.institucion || '—', className: 'whitespace-nowrap font-medium text-slate-700' },
      { id: 'titulo', label: 'Título de la Iniciativa', sortKey: 'titulo', render: t => t.titulo, className: 'font-medium text-slate-800 leading-snug min-w-[280px]' },
      { id: 'etapa_actual', label: 'Etapa', sortKey: 'etapa_actual', render: t => <EtapaBadge etapa={t.etapa_actual} mode={mode} /> },
      { id: 'lider_dominio', label: 'Líder de Dominio', sortKey: 'lider_dominio', render: t => t.lider_dominio || '—', className: 'whitespace-nowrap text-slate-700 min-w-[150px]' },
      { id: 'it_bp', label: 'IT BP', sortKey: 'it_bp', render: t => t.it_bp || '—', className: 'whitespace-nowrap text-slate-600' },
      { id: 'duracion_meses', label: 'Tiempo estimado (meses)', sortKey: 'duracion_meses', render: t => t.duracion_meses ?? '—', className: 'text-center font-mono text-slate-600' },
      { id: 'costo_usd', label: 'Costo en dólares', sortKey: 'costo_usd', render: t => t.costo_usd ? `$ ${t.costo_usd.toLocaleString('en-US')}` : '—', className: 'text-right font-mono text-slate-600 whitespace-nowrap' },
      { id: 'costo_soles', label: 'Costo Soles', sortKey: 'costo_soles', render: t => fmtMoney(t.costo_soles), className: 'text-right font-mono text-slate-600 whitespace-nowrap' },
      { id: 'fecha_inicio_planificada', label: 'Fecha Inicio (planificada)', sortKey: 'fecha_inicio_planificada', render: t => fmtDate(t.fecha_inicio_planificada), className: 'whitespace-nowrap text-xs text-slate-600' },
      { id: 'fecha_fin_planificada', label: 'Fecha fin (planificada)', sortKey: 'fecha_fin_planificada', render: t => fmtDate(t.fecha_fin_planificada), className: 'whitespace-nowrap text-xs text-slate-600' },
    ];
  }, [isPlanificadas, mode]);

  const [page, setPage] = useState(1);
  const [localExpandedId, setLocalExpandedId] = useState<number | null>(null);
  
  const expandedId = propExpandedId !== undefined ? propExpandedId : localExpandedId;
  const setExpandedId = (id: number | null) => {
    if (onExpandedIdChange) {
      onExpandedIdChange(id);
    } else {
      setLocalExpandedId(id);
    }
  };

  const [sortConfig, setSortConfig] = useState<{ key: keyof Iniciativa; direction: 'asc' | 'desc' } | null>(null);
  
  const [columnOrder, setColumnOrder] = useState<string[]>(COLUMNS.map(c => c.id));
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  const orderedColumns = columnOrder.map(id => COLUMNS.find(c => c.id === id)!).filter(Boolean) as ColumnDef[];

  // Resetear a página 1 cuando cambia el conjunto de datos (al filtrar)
  useEffect(() => {
    setPage(1);
    if (expandedId !== null && !iniciativas.some(t => t.id === expandedId)) {
      setExpandedId(null);
    }
  }, [iniciativas]);

  const handleSort = (key: keyof Iniciativa) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleDragStart = (e: React.DragEvent, colId: string) => {
    setDraggedCol(colId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColId) return;
    const newOrder = [...columnOrder];
    const fromIndex = newOrder.indexOf(draggedCol);
    const toIndex = newOrder.indexOf(targetColId);
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedCol);
    setColumnOrder(newOrder);
    setDraggedCol(null);
  };

  const sortedIniciativas = useMemo(() => {
    let sortableItems = [...iniciativas];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        // Handle nulls
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [iniciativas, sortConfig]);

  const totalPages = Math.ceil(sortedIniciativas.length / ITEMS_PER_PAGE);

  const paginated = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedIniciativas.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedIniciativas, page]);

  const renderSortIcon = (key: keyof Iniciativa) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown size={13} className="inline-block ml-1 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={13} className="inline-block ml-1 text-blue-600" />
      : <ArrowDown size={13} className="inline-block ml-1 text-blue-600" />;
  };

  // Exportación CSV
  const downloadCSV = () => {
    const headers = orderedColumns.map(c => c.label);

    const rows = sortedIniciativas.map(t => orderedColumns.map(col => {
      // Extraemos el valor base para exportarlo sin formateo HTML
      const val = t[col.sortKey as keyof Iniciativa];
      if (val === null || val === undefined) return '';
      if (col.sortKey === 'fecha_inicio_planificada' || col.sortKey === 'fecha_fin_planificada' || col.sortKey === 'fecha_registro' || col.sortKey === 'fecha_entrega_requerida') {
        return escapeCsvField(fmtDate(val as string));
      }
      return escapeCsvField(String(val));
    }));

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iniciativas_ti_${format(new Date(), 'yyyyMMdd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Cabecera */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div>
          <h3 className="font-semibold text-gray-800">
            Detalle de Iniciativas
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {iniciativas.length} resultado{iniciativas.length !== 1 ? 's' : ''}
            {totalPages > 1 && ` · Página ${page} de ${totalPages}`}
          </p>
        </div>
        <button
          onClick={downloadCSV}
          className="text-sm px-3 py-1.5 bg-white border border-gray-200 shadow-sm rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700 font-medium transition-colors"
        >
          <FileDown size={15} />
          Exportar CSV
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-left text-gray-600">
          <thead className="text-[11px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-3 w-8" />
              {orderedColumns.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, col.id)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, col.id)}
                  className={`px-3 py-3 whitespace-nowrap cursor-move select-none hover:bg-gray-200 transition-colors group ${
                    draggedCol === col.id ? 'opacity-50 bg-gray-200' : ''
                  }`}
                  onClick={() => col.sortKey && handleSort(col.sortKey)}
                  title="Arrastra para mover la columna"
                >
                  <div className="flex items-center gap-1 cursor-pointer">
                    <span>{col.label}</span>
                    {col.sortKey && renderSortIcon(col.sortKey)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => (
              <React.Fragment key={t.id}>
                <tr className="bg-white border-b border-gray-50 hover:bg-slate-50/70 transition-colors">
                  {/* Expand button */}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      className="text-gray-400 hover:text-blue-500 transition-colors"
                      aria-label={expandedId === t.id ? 'Contraer' : 'Expandir'}
                    >
                      {expandedId === t.id
                        ? <ChevronDown size={15} />
                        : <ChevronRight size={15} />
                      }
                    </button>
                  </td>
                  {/* Celdas dinámicas */}
                  {orderedColumns.map(col => (
                    <td key={col.id} className={`px-3 py-2 ${col.className || ''}`}>
                      {col.render(t)}
                    </td>
                  ))}
                </tr>

                {/* Fila de detalle expandible */}
                {expandedId === t.id && <ExpandedRow t={t} mode={mode} />}
              </React.Fragment>
            ))}

            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-12 text-center text-gray-400 text-sm"
                >
                  No hay iniciativas que coincidan con los filtros activos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="p-4 flex justify-between items-center text-sm text-gray-500 border-t border-gray-100">
          <span className="text-xs">
            Mostrando {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, iniciativas.length)} de {iniciativas.length}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(1)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 text-xs"
              aria-label="Primera página"
            >
              «
            </button>
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 shadow-sm"
            >
              Anterior
            </button>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 font-semibold text-xs">
              {page}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 shadow-sm"
            >
              Siguiente
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(totalPages)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 text-xs"
              aria-label="Última página"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
