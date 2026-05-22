import React, { useMemo } from 'react';
import { Iniciativa } from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { countBy } from '../lib/utils';

const PALETTE = [
  '#1a73e8', '#f59e0b', '#34a853', '#ea4335',
  '#9c27b0', '#00bcd4', '#ff9800', '#673ab7',
  '#e91e63', '#4caf50',
];

interface ChartsProps {
  iniciativas: Iniciativa[];
}

// ---------------------------------------------------------------------------
// Wrapper de sección de gráfico
// ---------------------------------------------------------------------------
function ChartCard({
  title,
  children,
  fullRow = false,
}: {
  title: string;
  children: React.ReactNode;
  fullRow?: boolean;
}) {
  return (
    <div
      className={`bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col ${
        fullRow ? 'col-span-1 lg:col-span-2' : ''
      }`}
    >
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip personalizado
// ---------------------------------------------------------------------------
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 shadow-md rounded-lg px-3 py-2 text-xs">
      {label && <div className="font-semibold text-gray-700 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-gray-600">
          {p.name}: <span className="font-bold text-slate-800">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function Charts({ iniciativas }: ChartsProps) {
  // --- 1. Institución ---
  const institucionData = useMemo(
    () => countBy(iniciativas, 'institucion'),
    [iniciativas]
  );

  // --- 2. Pilar Estratégico (horizontal para nombres largos) ---
  const pilarData = useMemo(
    () => countBy(iniciativas, 'pilar_estrategico'),
    [iniciativas]
  );

  // --- 3. Tendencia mensual (ordenada por fecha real) ---
  const tendenciaData = useMemo(() => {
    const byMonth: Record<string, { isoKey: string; Nuevas: number }> = {};
    iniciativas.forEach(i => {
      if (!i.fecha_registro) return;
      const monthStart = startOfMonth(parseISO(i.fecha_registro));
      const isoKey = monthStart.toISOString();
      const label = format(monthStart, 'MMM yy', { locale: es });
      if (!byMonth[label]) byMonth[label] = { isoKey, Nuevas: 0 };
      byMonth[label].Nuevas++;
    });
    return Object.entries(byMonth)
      .map(([name, { isoKey, Nuevas }]) => ({ name, Nuevas, isoKey }))
      .sort((a, b) => a.isoKey.localeCompare(b.isoKey))
      .map(({ name, Nuevas }) => ({ name, Nuevas }));
  }, [iniciativas]);

  // --- 4. Complejidad (badges en vez de gráfico) ---
  const complejidadStats = useMemo(() => {
    const total = iniciativas.length || 1;
    return [
      { label: 'Alta',  color: '#ef4444', bg: '#fef2f2' },
      { label: 'Media', color: '#f59e0b', bg: '#fffbeb' },
      { label: 'Baja',  color: '#22c55e', bg: '#f0fdf4' },
    ].map(c => ({
      ...c,
      count: iniciativas.filter(i => i.complejidad === c.label).length,
      pct: Math.round((iniciativas.filter(i => i.complejidad === c.label).length / total) * 100),
    }));
  }, [iniciativas]);

  // --- 5. Top Líderes de Dominio ---
  const liderData = useMemo(
    () => countBy(iniciativas, 'lider_dominio').slice(0, 12),
    [iniciativas]
  );
  const liderChartHeight = Math.max(200, liderData.length * 36 + 40);

  // --- 6. Costo por Institución ---
  const costoData = useMemo(() => {
    const costs: Record<string, { name: string; soles: number; usd: number }> = {};
    iniciativas
      .filter(i => i.etapa_actual !== 'eliminadas')
      .forEach(i => {
        if (!i.institucion) return;
        if (!costs[i.institucion])
          costs[i.institucion] = { name: i.institucion, soles: 0, usd: 0 };
        costs[i.institucion].soles += i.costo_soles ?? 0;
        costs[i.institucion].usd += i.costo_usd ?? 0;
      });
    return Object.values(costs)
      .filter(d => d.soles > 0 || d.usd > 0)
      .sort((a, b) => b.soles - a.soles);
  }, [iniciativas]);

  // --- 7. Tipo de Recurso ---
  const recursoData = useMemo(
    () => countBy(iniciativas, 'tipo_recurso' as keyof Iniciativa),
    [iniciativas]
  );

  // --- 8. SOX — 2 mini-KPI cards ---
  const soxStats = useMemo(() => {
    const si = iniciativas.filter(i => i.impacto_sox === 'SI').length;
    const no = iniciativas.filter(i => i.impacto_sox === 'NO').length;
    const total = si + no || 1;
    return { si, no, pctSi: Math.round((si / total) * 100), pctNo: Math.round((no / total) * 100) };
  }, [iniciativas]);

  // --- 9. Prioridad BRM ---
  const brmData = useMemo(
    () => countBy(iniciativas, 'prioridad_brm' as keyof Iniciativa),
    [iniciativas]
  );

  if (iniciativas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
        Sin datos para mostrar gráficos con los filtros actuales.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">

      {/* 1. Institución */}
      <ChartCard title="1. Iniciativas por Institución">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={institucionData} margin={{ top: 5, right: 40, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Iniciativas" fill="#1a73e8" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="value" position="top" style={{ fontSize: '11px', fontWeight: 600, fill: '#475569' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 2. Pilar Estratégico — horizontal para nombres completos */}
      <ChartCard title="2. Pilar Estratégico">
        <ResponsiveContainer width="100%" height={Math.max(180, pilarData.length * 38 + 20)}>
          <BarChart
            data={pilarData}
            layout="vertical"
            margin={{ top: 5, right: 50, left: 8, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" style={{ fontSize: '11px' }} allowDecimals={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={170}
              style={{ fontSize: '11px' }}
              tick={{ fill: '#475569' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Iniciativas" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="value" position="right" style={{ fontSize: '11px', fontWeight: 600, fill: '#475569' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3. Tendencia de Ingreso */}
      <ChartCard title="3. Tendencia de Ingreso Mensual">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={tendenciaData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorNuevas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34a853" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#34a853" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="Nuevas"
              stroke="#34a853"
              strokeWidth={2}
              fill="url(#colorNuevas)"
              dot={{ r: 3, fill: '#34a853' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 4. Complejidad — badges en vez de gráfico */}
      <ChartCard title="4. Complejidad">
        <div className="flex items-center justify-around flex-1 py-6 gap-4">
          {complejidadStats.map(c => (
            <div key={c.label} className="flex flex-col items-center gap-2">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-sm"
                style={{ backgroundColor: c.bg, border: `3px solid ${c.color}` }}
              >
                <span className="text-2xl font-bold" style={{ color: c.color }}>
                  {c.count}
                </span>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-slate-700">{c.label}</div>
                <div className="text-xs text-gray-400">{c.pct}% del total</div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* 5. Top Líderes de Dominio — altura dinámica */}
      <ChartCard title="5. Iniciativas por Líder de Dominio" fullRow>
        <ResponsiveContainer width="100%" height={liderChartHeight}>
          <BarChart
            data={liderData}
            layout="vertical"
            margin={{ top: 5, right: 50, left: 8, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" style={{ fontSize: '11px' }} allowDecimals={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={160}
              style={{ fontSize: '11px' }}
              tick={{ fill: '#475569' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Iniciativas" fill="#9c27b0" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="value" position="right" style={{ fontSize: '11px', fontWeight: 600, fill: '#475569' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 6. Costo por Institución */}
      <ChartCard title="6. Costo en Soles por Institución">
        {costoData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-400 py-10">
            Sin datos de costo disponibles
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, costoData.length * 42 + 20)}>
            <BarChart
              data={costoData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 8, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis
                type="number"
                style={{ fontSize: '10px' }}
                tickFormatter={v => `S/${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={110}
                style={{ fontSize: '11px' }}
                tick={{ fill: '#475569' }}
              />
              <Tooltip
                formatter={(v: number) =>
                  `S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
                }
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white border border-gray-200 shadow-md rounded-lg px-3 py-2 text-xs">
                      <div className="font-semibold text-gray-700 mb-1">{label}</div>
                      <div className="text-gray-600">
                        Soles:{' '}
                        <span className="font-bold text-slate-800">
                          S/{' '}
                          {(payload[0]?.value as number)?.toLocaleString('es-PE', {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="soles" name="Soles" fill="#06b6d4" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="soles"
                  position="right"
                  formatter={(v: number) => `S/${(v / 1000).toFixed(0)}k`}
                  style={{ fontSize: '10px', fill: '#475569' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 7. Tipo de Recurso */}
      <ChartCard title="7. Tipo de Recurso">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={recursoData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: '#d1d5db' }}
            >
              {recursoData.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 8. Impacto SOX */}
      <ChartCard title="8. Impacto SOX">
        <div className="flex items-center justify-around flex-1 py-6 gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-sm bg-red-50 border-4 border-red-400">
              <span className="text-3xl font-bold text-red-600">{soxStats.si}</span>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-red-600">Con SOX</div>
              <div className="text-xs text-gray-400">{soxStats.pctSi}% del total</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-sm bg-emerald-50 border-4 border-emerald-400">
              <span className="text-3xl font-bold text-emerald-600">{soxStats.no}</span>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-emerald-600">Sin SOX</div>
              <div className="text-xs text-gray-400">{soxStats.pctNo}% del total</div>
            </div>
          </div>
        </div>
      </ChartCard>

      {/* 9. Prioridad BRM */}
      <ChartCard title="9. Prioridad BRM">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={brmData} margin={{ top: 5, right: 40, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="name" style={{ fontSize: '12px', fontWeight: 600 }} />
            <YAxis style={{ fontSize: '11px' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Iniciativas" radius={[4, 4, 0, 0]}>
              {brmData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.name === 'A' ? '#ef4444' :
                    entry.name === 'B' ? '#f59e0b' : '#22c55e'
                  }
                />
              ))}
              <LabelList dataKey="value" position="top" style={{ fontSize: '11px', fontWeight: 700, fill: '#475569' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  );
}

// Re-export para uso externo si se necesita
export { ChartCard as ChartGroup };
