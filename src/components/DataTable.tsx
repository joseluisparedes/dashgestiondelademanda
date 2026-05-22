import React, { useMemo, useState, useEffect } from 'react';
import { Iniciativa } from '../types';
import { ETAPAS_MAP } from '../constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, FileDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { escapeCsvField } from '../lib/utils';

interface DataTableProps {
  iniciativas: Iniciativa[];
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
function EtapaBadge({ etapa }: { etapa: string }) {
  const config = ETAPAS_MAP.get(etapa as Parameters<typeof ETAPAS_MAP.get>[0]);
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
function ExpandedRow({ t }: { t: Iniciativa }) {
  const fields: Array<{ label: string; value: string | null | number }> = [
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
      <td colSpan={9} className="px-6 py-4">
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
export function DataTable({ iniciativas }: DataTableProps) {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Iniciativa; direction: 'asc' | 'desc' } | null>(null);

  // Resetear a página 1 cuando cambia el conjunto de datos (al filtrar)
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [iniciativas]);

  const handleSort = (key: keyof Iniciativa) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
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

  // Exportación CSV — RFC 4180 con escape correcto
  const downloadCSV = () => {
    const headers = [
      'ID', 'Institución', 'Título', 'Etapa', 'IT BP', 'Líder de Dominio',
      'Complejidad', 'Prioridad BRM', 'Impacto SOX', 'Proyecto SPO',
      'Costo Soles', 'Costo USD', 'Duración (meses)', 'Fecha Registro', 'Fecha Entrega',
    ];

    const rows = iniciativas.map(t => [
      t.id,
      escapeCsvField(t.institucion),
      escapeCsvField(t.titulo),
      escapeCsvField(t.etapa_actual),
      escapeCsvField(t.it_bp),
      escapeCsvField(t.lider_dominio),
      escapeCsvField(t.complejidad),
      escapeCsvField(t.prioridad_brm ?? ''),
      escapeCsvField(t.impacto_sox ?? ''),
      escapeCsvField(t.proyecto_spo),
      t.costo_soles ?? '',
      t.costo_usd ?? '',
      t.duracion_meses ?? '',
      escapeCsvField(fmtDate(t.fecha_registro)),
      escapeCsvField(fmtDate(t.fecha_entrega_requerida)),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const bom = '\uFEFF'; // BOM para compatibilidad con Excel en Windows
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
              <th className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('id')}>
                ID {renderSortIcon('id')}
              </th>
              <th className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('institucion')}>
                Institución {renderSortIcon('institucion')}
              </th>
              <th className="px-3 py-3 min-w-[280px] cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('titulo')}>
                Título de la Iniciativa {renderSortIcon('titulo')}
              </th>
              <th className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('etapa_actual')}>
                Etapa {renderSortIcon('etapa_actual')}
              </th>
              <th className="px-3 py-3 min-w-[150px] whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('lider_dominio')}>
                Líder de Dominio {renderSortIcon('lider_dominio')}
              </th>
              <th className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('it_bp')}>
                IT BP {renderSortIcon('it_bp')}
              </th>
              <th className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('complejidad')}>
                Complejidad {renderSortIcon('complejidad')}
              </th>
              <th className="px-3 py-3 whitespace-nowrap text-right cursor-pointer hover:bg-gray-100 transition-colors group select-none" onClick={() => handleSort('costo_soles')}>
                {renderSortIcon('costo_soles')} Costo (S/)
              </th>
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
                  <td className="px-3 py-2 font-mono text-slate-500 text-xs whitespace-nowrap">
                    {String(t.id).padStart(4, '0')}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">
                    {t.institucion || '—'}
                  </td>
                  {/* Título: wrap normal, no truncado */}
                  <td className="px-3 py-2 font-medium text-slate-800 leading-snug min-w-[280px]">
                    {t.titulo}
                  </td>
                  <td className="px-3 py-2">
                    <EtapaBadge etapa={t.etapa_actual} />
                  </td>
                  {/* Líder: whitespace-nowrap, nunca truncado */}
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700 min-w-[150px]">
                    {t.lider_dominio || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {t.it_bp || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <ComplejidadBadge value={t.complejidad} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 whitespace-nowrap">
                    {fmtMoney(t.costo_soles)}
                  </td>
                </tr>

                {/* Fila de detalle expandible */}
                {expandedId === t.id && <ExpandedRow t={t} />}
              </React.Fragment>
            ))}

            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={9}
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
