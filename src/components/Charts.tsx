import { useMemo } from 'react';
import { Iniciativa } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = ['#1a73e8', '#f59e0b', '#34a853', '#ea4335', '#9c27b0', '#00bcd4', '#ff9800', '#673ab7'];

export function Charts({ iniciativas }: { iniciativas: Iniciativa[] }) {
  
  const countBy = (key: keyof Iniciativa) => {
    const counts = iniciativas.reduce((acc, i) => {
      const val = i[key] as string;
      if (!val) return acc;
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  };

  const institucionData = countBy('institucion');
  const pilarData = countBy('pilar_estrategico');
  const complejidadData = countBy('complejidad');
  const liderData = countBy('lider_dominio').slice(0, 10); // Top 10
  const recursoData = countBy('tipo_recurso');
  const soxData = countBy('impacto_sox');
  const brmData = countBy('prioridad_brm');

  const tendenciaData = useMemo(() => {
    const byMonth = iniciativas.reduce((acc, i) => {
      if (!i.fecha_registro) return acc;
      const month = format(startOfMonth(parseISO(i.fecha_registro)), 'MMM yy', { locale: es });
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(byMonth)
      .map(([name, Nuevas]) => ({ name, Nuevas }))
      .sort((a, b) => a.name.localeCompare(b.name)); // simple string sort is fine for this demo
  }, [iniciativas]);

  const costoInstitucionData = useMemo(() => {
    const costs = iniciativas.reduce((acc, i) => {
      if (!i.institucion) return acc;
      if (!acc[i.institucion]) acc[i.institucion] = { name: i.institucion, usd: 0, soles: 0 };
      acc[i.institucion].usd += i.costo_usd || 0;
      acc[i.institucion].soles += i.costo_soles || 0;
      return acc;
    }, {} as Record<string, any>);
    return Object.values(costs);
  }, [iniciativas]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
      <ChartGroup title="1. Iniciativas por Institución">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={institucionData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} />
            <Tooltip />
            <Bar dataKey="value" name="Iniciativas" fill="#1a73e8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="2. Pilar Estratégico">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={pilarData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
              {pilarData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="3. Tendencia de Ingreso (Mensual)">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={tendenciaData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} />
            <Tooltip />
            <Line type="monotone" dataKey="Nuevas" stroke="#34a853" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="4. Complejidad">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={complejidadData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} />
            <Tooltip />
            <Bar dataKey="value" name="Iniciativas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="5. Top 10 Líderes de Dominio">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={liderData} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" style={{ fontSize: '11px' }} />
            <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '11px' }} />
            <Tooltip />
            <Bar dataKey="value" name="Iniciativas" fill="#9c27b0" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="6. Costo por Institución (Stack)">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={costoInstitucionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} />
            <Tooltip formatter={(value) => `S/ ${Number(value).toLocaleString()}`} />
            <Legend />
            <Bar dataKey="usd" stackId="a" fill="#00bcd4" name="Costo USD (Conv.)" />
            <Bar dataKey="soles" stackId="a" fill="#1a73e8" name="Costo Soles" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="7. Tipo de Recurso">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={recursoData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
              {recursoData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartGroup>

      <ChartGroup title="8. Impacto SOX vs No SOX">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={soxData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
              {soxData.map((d, i) => <Cell key={i} fill={d.name === 'SI' ? '#ea4335' : '#34a853'} />)}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartGroup>

    </div>
  );
}

export function ChartGroup({ title, children }: { title: string; children: import('react').ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 w-full text-left">{title}</h3>
      {children}
    </div>
  );
}
