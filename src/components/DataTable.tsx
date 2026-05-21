import React, { useMemo, useState } from 'react';
import { Iniciativa } from '../types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, FileDown } from 'lucide-react';

export function DataTable({ iniciativas }: { iniciativas: Iniciativa[] }) {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const itemsPerPage = 25;

  const paginated = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return iniciativas.slice(start, start + itemsPerPage);
  }, [iniciativas, page]);

  const totalPages = Math.ceil(iniciativas.length / itemsPerPage);

  const downloadCSV = () => {
    const headers = ['ID', 'Institución', 'Título', 'Etapa', 'IT BP', 'Líder Dominio', 'Complejidad', 'Costo Soles', 'Fecha Registro', 'Fecha Entrega'];
    const rows = iniciativas.map(t => [
      t.id, t.institucion, `"${t.titulo}"`, t.etapa_actual, t.it_bp, t.lider_dominio, t.complejidad, t.costo_soles || 0, t.fecha_registro, t.fecha_entrega_requerida || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'iniciativas_ti.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dt = (d: string | null) => d ? format(parseISO(d), 'dd MMM yyyy', { locale: es }) : '-';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-semibold text-gray-800">Detalle de Iniciativas ({iniciativas.length})</h3>
        <button onClick={downloadCSV} className="text-sm px-3 py-1.5 bg-white border border-gray-200 shadow-sm rounded-md hover:bg-gray-50 flex items-center gap-2 text-gray-700 font-medium">
          <FileDown size={16} /> Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-left text-gray-600">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3 border-r border-gray-100">ID</th>
              <th className="px-3 py-3 border-r border-gray-100">Institución</th>
              <th className="px-3 py-3 border-r border-gray-100">Título</th>
              <th className="px-3 py-3 border-r border-gray-100">Etapa</th>
              <th className="px-3 py-3 border-r border-gray-100">IT BP</th>
              <th className="px-3 py-3 border-r border-gray-100">Líder</th>
              <th className="px-3 py-3 border-r border-gray-100">Complejidad</th>
              <th className="px-3 py-3 border-r border-gray-100">Costo (S/)</th>
              <th className="px-3 py-3">Registro</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => (
              <React.Fragment key={t.id}>
                <tr className="bg-white border-b border-gray-50 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                    {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-800">{String(t.id).padStart(4, '0')}</td>
                  <td className="px-3 py-3">{t.institucion}</td>
                  <td className="px-3 py-3 font-medium max-w-[200px] truncate" title={t.titulo}>{t.titulo}</td>
                  <td className="px-3 py-3 text-[11px] uppercase whitespace-nowrap">{t.etapa_actual.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{t.it_bp}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{t.lider_dominio}</td>
                  <td className="px-3 py-3">{t.complejidad}</td>
                  <td className="px-3 py-3 text-right font-mono">{t.costo_soles ? t.costo_soles.toLocaleString() : '-'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{dt(t.fecha_registro)}</td>
                </tr>
                {expandedId === t.id && (
                  <tr className="bg-slate-50 border-b border-gray-100">
                    <td colSpan={10} className="px-6 py-4">
                      <div className="grid grid-cols-3 gap-6 text-xs">
                        <div>
                          <p><span className="font-semibold">Objetivo:</span> {t.objetivo}</p>
                          <p className="mt-2"><span className="font-semibold">Usuario Negocio:</span> {t.usuario_negocio}</p>
                          <p className="mt-2"><span className="font-semibold">VP Solicitante:</span> {t.vp_solicitante}</p>
                        </div>
                        <div>
                          <p><span className="font-semibold">Beneficio:</span> {t.beneficio_cuantitativo}</p>
                          <p className="mt-2"><span className="font-semibold">Pilar:</span> {t.pilar_estrategico}</p>
                          <p className="mt-2"><span className="font-semibold">Tipo Recurso:</span> {t.tipo_recurso}</p>
                        </div>
                        <div>
                          <p><span className="font-semibold">Entrega Requerida:</span> {dt(t.fecha_entrega_requerida)}</p>
                          <p className="mt-2"><span className="font-semibold">Duración (meses):</span> {t.duracion_meses || '-'}</p>
                          <p className="mt-2"><span className="font-semibold">Impacto SOX:</span> {t.impacto_sox}</p>
                          <p className="mt-2 text-slate-500 italic">Datos extendidos sólo de referencia para la versión detallada.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  No hay iniciativas que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="p-4 flex justify-between items-center text-sm text-gray-500">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded bg-white border border-gray-200 disabled:opacity-50 hover:bg-gray-50 shadow-sm"
            >
              Anterior
            </button>
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded bg-white border border-gray-200 disabled:opacity-50 hover:bg-gray-50 shadow-sm"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
