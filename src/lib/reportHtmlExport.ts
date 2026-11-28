import { format } from 'date-fns';
import { Iniciativa } from '../types';
import {
  ETAPAS_CONFIG,
  ETAPAS_PLANIFICADAS_CONFIG,
  EMPTY_SENTINEL,
  EMPTY_LABEL,
} from '../constants';

export interface OutOfDateExportItem {
  iniciativa: Iniciativa;
  category: 'estimacion' | 'reestimacion' | 'planificacion';
  reason: string;
  delayDays: number;
}

export interface PendingBPExportInput {
  iniciativas: Iniciativa[];
  isAffirmative: (v: string | null | undefined) => boolean;
  getMoverEtapaAction: (i: Iniciativa) => string | null;
  filterSummary: string;
}

export interface FueraFechaExportInput {
  iniciativas: Iniciativa[];
  checkEstimacion: (i: Iniciativa, refDate: Date) => { isOutOfDate: boolean; reason: string; delayDays: number };
  checkReestimacion: (i: Iniciativa, refDate: Date) => { isOutOfDate: boolean; reason: string; delayDays: number };
  checkPlanificacion: (i: Iniciativa, refDate: Date) => { isOutOfDate: boolean; reason: string; delayDays: number };
  filterSummary: string;
}

export interface SimpleReportExportInput {
  iniciativas: Iniciativa[];
  filterSummary: string;
}

const ALL_ETAPAS = [...ETAPAS_CONFIG, ...ETAPAS_PLANIFICADAS_CONFIG];
const ETAPAS_BY_ID = new Map(ALL_ETAPAS.map(e => [e.id, e]));

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normVal(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s === '' ? EMPTY_SENTINEL : s;
}

function displayLabel(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s === '' || s === EMPTY_SENTINEL ? EMPTY_LABEL : s;
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy');
}

function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildHtmlShell(opts: {
  title: string;
  subtitle: string;
  badge: string;
  filterSummary: string;
  bodyHtml: string;
  scriptHtml?: string;
}): string {
  const now = new Date();
  const fechaGeneracion = format(now, 'dd/MM/yyyy HH:mm:ss');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <title>${escapeHtml(opts.title)}</title>
  <style>
    :root {
      --orange: #EB5F46;
      --navy: #0D436C;
      --blue-mid: #007FB1;
      --teal: #00B8B2;
      --bg: #f7f8fc;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .sticky-header {
      position: sticky; top: 0; z-index: 100;
      background: linear-gradient(135deg, var(--orange) 0%, var(--navy) 100%);
      box-shadow: 0 4px 20px rgba(13,67,108,.25);
    }
    .header-inner {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 28px; gap: 16px; flex-wrap: wrap;
    }
    .h-divider { height: 4px; background: linear-gradient(90deg, var(--orange) 0%, var(--blue-mid) 50%, var(--teal) 100%); }
    .main-content { padding: 20px 24px 36px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
    .card {
      background: #ffffff;
      border: 1px solid #D7D9E8;
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: 0 2px 10px rgba(13,67,108,.05);
    }
    .section-title { font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .kpi-card {
      border-radius: 12px; padding: 14px 16px; border: 1.5px solid #e2e8f0; background: #fff;
      display: flex; flex-direction: column; gap: 4px;
    }
    .kpi-label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .04em; }
    .kpi-value { font-size: 26px; font-weight: 900; line-height: 1.1; }
    .kpi-sub { font-size: 11px; color: #64748b; font-weight: 500; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .pills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .pill {
      font-family: inherit; font-size: 11px; font-weight: 700;
      padding: 5px 12px; border-radius: 20px; border: 1px solid #cbd5e1;
      background: #f8fafc; color: #475569; cursor: pointer; transition: all .15s;
    }
    .pill:hover { border-color: #94a3b8; }
    .pill.active { background: #0f172a; color: #fff; border-color: #0f172a; }
    .search-input {
      font-family: inherit; font-size: 12px; padding: 6px 12px; border-radius: 8px;
      border: 1px solid #cbd5e1; min-width: 240px; outline: none;
    }
    .search-input:focus { border-color: #0284c7; box-shadow: 0 0 0 2px rgba(2,132,199,.15); }
    .table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th {
      background: #f8fafc; padding: 9px 12px; text-align: left;
      font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;
      letter-spacing: .04em; border-bottom: 2px solid #e2e8f0; white-space: nowrap;
    }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody tr:hover { background: #f0f9ff; }
    tfoot td { background: #f1f5f9; font-weight: 800; border-top: 2px solid #cbd5e1; }
    .badge {
      display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700;
      padding: 2px 9px; border-radius: 20px; white-space: nowrap;
    }
    .bar-track { width: 100%; height: 10px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 99px; }
    .page-footer {
      padding: 16px 22px; background: #fff; border: 1px solid #D7D9E8; border-radius: 12px;
      display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
    }
    .footer-text { font-size: 11px; color: var(--text-muted); }
    .footer-mail { font-size: 11px; font-weight: 700; color: var(--navy); }
    @media print {
      .sticky-header { position: static; }
      .toolbar .pills, .search-input { display: none; }
    }
  </style>
</head>
<body>
  <header class="sticky-header">
    <div class="header-inner">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.12em;color:rgba(255,255,255,.8);text-transform:uppercase;">
          LAUREATE PERÚ · IT NEEDS MANAGER
        </div>
        <h1 style="font-size:18px;font-weight:800;color:#fff;margin-top:2px;">${escapeHtml(opts.title)}</h1>
        <p style="font-size:11px;color:rgba(255,255,255,.88);margin-top:2px;">${escapeHtml(opts.subtitle)}</p>
      </div>
      <div style="text-align:right;color:#fff;">
        <span style="display:inline-block;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);">
          ${escapeHtml(opts.badge)}
        </span>
        <div style="font-size:10px;opacity:.85;margin-top:6px;">Generado: ${escapeHtml(fechaGeneracion)}</div>
      </div>
    </div>
    <div class="h-divider"></div>
  </header>

  <main class="main-content">
    <div class="card" style="padding:10px 16px;font-size:11px;color:#475569;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span><strong>Filtros aplicados:</strong> ${escapeHtml(opts.filterSummary || 'Ninguno (todos los registros)')}</span>
    </div>
    ${opts.bodyHtml}
    <footer class="page-footer">
      <div class="footer-text">Reporte independiente generado desde <strong>Gestión de la Demanda TI</strong>.</div>
      <div class="footer-mail">Laureate Perú · TI</div>
    </footer>
  </main>
  ${opts.scriptHtml ?? ''}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 1. Auditoría de Fechas (fuera_fecha)
// ---------------------------------------------------------------------------
interface BadgePill {
  label: string;
  bg: string;
  border: string;
  color: string;
  dotColor: string;
}

function buildEstimacionBadges(items: OutOfDateExportItem[]): BadgePill[] {
  let vencidas = 0, enSLA = 0, fueraSLA = 0, sinAsig = 0, sinFin = 0;
  items.forEach(it => {
    const r = (it.reason || '').toLowerCase();
    if (r.includes('en plazo sla')) enSLA++;
    else if (r.includes('fuera de sla')) fueraSLA++;
    else if (r.includes('vencida')) vencidas++;
    else if (r.includes('sin fecha de asignación') && r.includes('ni fecha fin')) { sinAsig++; sinFin++; }
    else if (r.includes('sin fecha de asignación') || r.includes('sin asignación')) sinAsig++;
    else if (r.includes('sin fecha fin')) sinFin++;
    else vencidas++;
  });

  const pills: BadgePill[] = [];
  if (vencidas > 0) pills.push({ label: `${vencidas} vencida${vencidas > 1 ? 's' : ''}`, bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', dotColor: '#ef4444' });
  if (enSLA > 0) pills.push({ label: `${enSLA} en SLA`, bg: '#dcfce7', border: '#86efac', color: '#166534', dotColor: '#10b981' });
  if (fueraSLA > 0) pills.push({ label: `${fueraSLA} fuera SLA`, bg: '#ffedd5', border: '#fed7aa', color: '#9a3412', dotColor: '#f97316' });
  if (sinAsig > 0 && sinFin > 0 && vencidas === 0 && enSLA === 0 && fueraSLA === 0) {
    pills.push({ label: `${items.length} sin fechas`, bg: '#fef9c3', border: '#fde047', color: '#854d0e', dotColor: '#eab308' });
  } else {
    if (sinAsig > 0) pills.push({ label: `${sinAsig} sin asig.`, bg: '#fef9c3', border: '#fde047', color: '#854d0e', dotColor: '#eab308' });
    if (sinFin > 0) pills.push({ label: `${sinFin} sin fin`, bg: '#fef9c3', border: '#fde047', color: '#854d0e', dotColor: '#eab308' });
  }
  return pills;
}

function buildReestimacionBadges(items: OutOfDateExportItem[]): BadgePill[] {
  let vencidas = 0, sinFin = 0;
  items.forEach(it => {
    const r = (it.reason || '').toLowerCase();
    if (r.includes('vencida')) vencidas++;
    else sinFin++;
  });
  const pills: BadgePill[] = [];
  if (vencidas > 0) pills.push({ label: `${vencidas} vencida${vencidas > 1 ? 's' : ''}`, bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', dotColor: '#ef4444' });
  if (sinFin > 0) pills.push({ label: `${sinFin} sin fin`, bg: '#ffedd5', border: '#fdba74', color: '#9a3412', dotColor: '#f97316' });
  return pills;
}

function renderPillListHtml(pills: BadgePill[]): string {
  if (pills.length === 0) return '';
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:5px;">${pills.map(p =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:12px;background:${p.bg};color:${p.color};border:1px solid ${p.border};white-space:nowrap;"><span style="width:5px;height:5px;border-radius:50%;background:${p.dotColor};display:inline-block;"></span>${escapeHtml(p.label)}</span>`
  ).join('')}</div>`;
}

export function exportFueraFechaToHTML(input: FueraFechaExportInput) {
  const refDate = new Date();
  const est: OutOfDateExportItem[] = [];
  const reest: OutOfDateExportItem[] = [];
  const plan: OutOfDateExportItem[] = [];

  input.iniciativas.forEach(i => {
    const rEst = input.checkEstimacion(i, refDate);
    if (rEst.isOutOfDate) est.push({ iniciativa: i, category: 'estimacion', reason: rEst.reason, delayDays: rEst.delayDays });
    const rReest = input.checkReestimacion(i, refDate);
    if (rReest.isOutOfDate) reest.push({ iniciativa: i, category: 'reestimacion', reason: rReest.reason, delayDays: rReest.delayDays });
    const rPlan = input.checkPlanificacion(i, refDate);
    if (rPlan.isOutOfDate) plan.push({ iniciativa: i, category: 'planificacion', reason: rPlan.reason, delayDays: rPlan.delayDays });
  });

  const all = [...est, ...reest, ...plan];

  const byLider: Record<string, {
    lider: string;
    itemsEst: OutOfDateExportItem[];
    itemsReest: OutOfDateExportItem[];
    itemsPlan: OutOfDateExportItem[];
    itemsAll: OutOfDateExportItem[];
  }> = {};

  all.forEach(item => {
    const lid = normVal(item.iniciativa.lider_dominio);
    if (!byLider[lid]) byLider[lid] = { lider: lid, itemsEst: [], itemsReest: [], itemsPlan: [], itemsAll: [] };
    if (item.category === 'estimacion') byLider[lid].itemsEst.push(item);
    else if (item.category === 'reestimacion') byLider[lid].itemsReest.push(item);
    else byLider[lid].itemsPlan.push(item);
    byLider[lid].itemsAll.push(item);
  });

  const liderRows = Object.values(byLider).sort((a, b) => b.itemsAll.length - a.itemsAll.length);

  const tableRowsHtml = liderRows.map(r => {
    const lidEsc = escapeHtml(r.lider);
    const lidLabel = escapeHtml(displayLabel(r.lider));
    const estCell = r.itemsEst.length > 0
      ? `<div class="cell-click" data-lider="${lidEsc}" data-cat="estimacion" title="Ver detalle de Estimaciones">
           <span class="count-circle" style="background:#fef9c3;color:#a16207;border-color:#fde047;">${r.itemsEst.length}</span>
           ${renderPillListHtml(buildEstimacionBadges(r.itemsEst))}
         </div>`
      : '<span style="color:#cbd5e1;font-weight:600;">—</span>';

    const reestCell = r.itemsReest.length > 0
      ? `<div class="cell-click" data-lider="${lidEsc}" data-cat="reestimacion" title="Ver detalle de Re-estimaciones">
           <span class="count-circle" style="background:#f3e8ff;color:#6d28d9;border-color:#d8b4fe;">${r.itemsReest.length}</span>
           ${renderPillListHtml(buildReestimacionBadges(r.itemsReest))}
         </div>`
      : '<span style="color:#cbd5e1;font-weight:600;">—</span>';

    const planCell = r.itemsPlan.length > 0
      ? `<div class="cell-click" data-lider="${lidEsc}" data-cat="planificacion" title="Ver detalle de Planificación">
           <span class="count-circle" style="background:#ffe4e6;color:#be123c;border-color:#fda4af;">${r.itemsPlan.length}</span>
           ${renderPillListHtml([{ label: `${r.itemsPlan.length} sin fechas`, bg: '#ffe4e6', border: '#fda4af', color: '#9f1239', dotColor: '#f43f5e' }])}
         </div>`
      : '<span style="color:#cbd5e1;font-weight:600;">—</span>';

    return `
      <tr>
        <td>
          <button type="button" class="lider-link" data-lider="${lidEsc}" data-cat="all">${lidLabel}</button>
        </td>
        <td style="text-align:center;">${estCell}</td>
        <td style="text-align:center;">${reestCell}</td>
        <td style="text-align:center;">${planCell}</td>
        <td style="text-align:center;">
          <div class="cell-click" data-lider="${lidEsc}" data-cat="all" title="Ver todas las iniciativas de ${lidLabel}">
            <div style="font-size:14px;font-weight:900;color:#0f172a;">${r.itemsAll.length}</div>
            <span style="display:inline-block;margin-top:2px;font-size:10px;font-weight:600;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;padding:1px 8px;border-radius:12px;">
              ${r.itemsAll.length} ${r.itemsAll.length === 1 ? 'iniciativa' : 'iniciativas'}
            </span>
          </div>
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn-detail" data-lider="${lidEsc}" data-cat="all">Ver Detalle</button>
        </td>
      </tr>
    `;
  }).join('');

  const serializedItems = all.map(item => {
    const i = item.iniciativa;
    const etapa = ETAPAS_BY_ID.get(i.etapa_actual);
    const tiempo = i.tiempo_estimado ?? i.duracion_meses;
    return {
      id: i.id,
      idPad: String(i.id).padStart(4, '0'),
      titulo: i.titulo,
      it_bp: displayLabel(i.it_bp),
      vp: displayLabel(i.vp_solicitante),
      solicitante: displayLabel(i.usuario_negocio),
      liderKey: normVal(i.lider_dominio),
      lider: displayLabel(i.lider_dominio),
      etapaLabel: etapa?.label ?? i.etapa_actual,
      etapaColor: etapa?.color ?? '#64748b',
      etapaBg: etapa?.bgColor ?? '#f1f5f9',
      fAsig: fmtDateShort(i.fecha_asignacion),
      complejidad: i.complejidad || '—',
      fIniEst: fmtDateShort(i.fecha_inicio_estimacion),
      fFinEst: fmtDateShort(i.fecha_fin_estimacion),
      tiempoEst: tiempo != null && tiempo !== '' ? `${tiempo} ${Number(tiempo) === 1 ? 'mes' : 'meses'}` : '—',
      category: item.category,
      reason: item.reason,
      delayDays: item.delayDays,
    };
  });

  const bodyHtml = `
    <style>
      .kpi-click { cursor:pointer; transition: transform .12s, box-shadow .12s; }
      .kpi-click:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(15,23,42,.08); }
      .count-circle {
        display: inline-flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; border-radius: 50%; font-size: 12px; font-weight: 800;
        border: 1.5px solid transparent;
      }
      .cell-click { cursor: pointer; display: inline-flex; flex-direction: column; align-items: center; padding: 4px 6px; border-radius: 8px; transition: background .12s; }
      .cell-click:hover { background: #f1f5f9; }
      .lider-link {
        background: none; border: none; padding: 0; font-family: inherit;
        font-size: 12px; font-weight: 700; color: #2563eb; cursor: pointer; text-align: left;
      }
      .lider-link:hover { text-decoration: underline; }
      .btn-detail {
        font-family: inherit; font-size: 11px; font-weight: 700; color: #2563eb;
        background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 7px;
        padding: 5px 12px; cursor: pointer; transition: all .15s; white-space: nowrap;
      }
      .btn-detail:hover { background: #dbeafe; border-color: #93c5fd; }
      .modal-backdrop {
        position: fixed; inset: 0; background: rgba(15,23,42,.5); z-index: 1000;
        display: none; align-items: center; justify-content: center; padding: 18px;
        backdrop-filter: blur(2px);
      }
      .modal-backdrop.open { display: flex; }
      .modal-box {
        background: #fff; border-radius: 14px; width: 100%; max-width: 1280px;
        max-height: 90vh; display: flex; flex-direction: column;
        box-shadow: 0 24px 48px rgba(15,23,42,.25); overflow: hidden;
      }
      .modal-header {
        padding: 16px 22px; border-bottom: 1px solid #e2e8f0;
        display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
        background: #fff;
      }
      .modal-body { padding: 18px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; background: #fff; }
      .modal-footer { padding: 12px 22px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; background: #f8fafc; }
      .sec-header {
        padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 700;
        display: flex; align-items: center; gap: 8px;
      }
    </style>

    <div class="kpi-grid">
      <div class="kpi-card kpi-click" data-lider="__ALL__" data-cat="all" style="border-color:#cbd5e1;background:#f8fafc;">
        <span class="kpi-label">Total Desfases Detectados</span>
        <span class="kpi-value" style="color:#0f172a;">${all.length}</span>
        <span class="kpi-sub">de ${input.iniciativas.length} iniciativas · Ver todas</span>
      </div>
      <div class="kpi-card kpi-click" data-lider="__ALL__" data-cat="estimacion" style="border-color:#fde68a;background:#fffbeb;">
        <span class="kpi-label" style="color:#b45309;">Estimación (SLA y Desfases)</span>
        <span class="kpi-value" style="color:#d97706;">${est.length}</span>
        <span class="kpi-sub">en Por Estimar · Ver detalle</span>
      </div>
      <div class="kpi-card kpi-click" data-lider="__ALL__" data-cat="reestimacion" style="border-color:#ddd6fe;background:#f5f3ff;">
        <span class="kpi-label" style="color:#6d28d9;">Fecha Fin Re-estimación</span>
        <span class="kpi-value" style="color:#7c3aed;">${reest.length}</span>
        <span class="kpi-sub">en Por Reestimar · Ver detalle</span>
      </div>
      <div class="kpi-card kpi-click" data-lider="__ALL__" data-cat="planificacion" style="border-color:#fecdd3;background:#fff1f2;">
        <span class="kpi-label" style="color:#be123c;">Planificación (Sin Fechas)</span>
        <span class="kpi-value" style="color:#e11d48;">${plan.length}</span>
        <span class="kpi-sub">en Por Planificar · Ver detalle</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <span>Tabla Detallada por Líder de Dominio</span>
        <span style="font-size:11px;color:#64748b;font-weight:600;">Haz clic en un líder, conteo o botón para ver el detalle</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Líder de Dominio</th>
              <th style="text-align:center;color:#d97706;">Estimaciones</th>
              <th style="text-align:center;color:#7c3aed;">Re-estimaciones</th>
              <th style="text-align:center;color:#e11d48;">Planificación</th>
              <th style="text-align:center;">Total</th>
              <th style="text-align:center;">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:28px;">Sin desfases detectados.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL (${liderRows.length} líderes)</td>
              <td style="text-align:center;color:#d97706;">${est.length}</td>
              <td style="text-align:center;color:#7c3aed;">${reest.length}</td>
              <td style="text-align:center;color:#e11d48;">${plan.length}</td>
              <td style="text-align:center;">${all.length}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div id="detailModal" class="modal-backdrop">
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <h2 id="modalTitle" style="font-size:15px;font-weight:800;color:#0f172a;"></h2>
            <p id="modalSubtitle" style="font-size:11px;color:#64748b;margin-top:2px;"></p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input id="modalSearch" class="search-input" type="text" placeholder="Buscar en resultado..." style="min-width:220px;" />
            <button type="button" id="modalCloseX" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;width:30px;height:30px;cursor:pointer;font-weight:700;color:#475569;">✕</button>
          </div>
        </div>
        <div id="modalBody" class="modal-body"></div>
        <div class="modal-footer">
          <button type="button" id="modalCloseBtn" style="font-family:inherit;font-size:12px;font-weight:700;color:#fff;background:#2563eb;border:none;border-radius:8px;padding:7px 18px;cursor:pointer;">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  const scriptHtml = `<script>
    const ITEMS = ${safeJson(serializedItems)};
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let currentLider = '__ALL__';
    let currentCat = 'all';
    let modalQuery = '';

    function getReasonMeta(it) {
      const r = it.reason || '';
      if (it.category === 'estimacion') {
        if (r.includes('vencida')) return { key: 'est-vencida', cat: 'estimacion', title: 'Por Estimar — Fecha Fin de Estimación vencida respecto a hoy', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' };
        if (r.includes('Fuera de SLA')) return { key: 'est-fuera-sla', cat: 'estimacion', title: 'Por Estimar — Fuera de SLA (> 5 días de asignado al LD, sin fecha fin)', color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' };
        if (r.includes('En plazo SLA')) return { key: 'est-en-sla', cat: 'estimacion', title: 'Por Estimar — En plazo SLA (≤ 5 días desde asignación al LD)', color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' };
        return { key: 'est-' + r, cat: 'estimacion', title: r || 'Por Estimar — Pendiente', color: '#92400e', bg: '#fffbeb', border: '#fde68a' };
      }
      if (it.category === 'reestimacion') {
        if (r.includes('vencida')) return { key: 'reest-vencida', cat: 'reestimacion', title: 'Por Reestimar — Fecha Fin de Re-estimación vencida respecto a hoy', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' };
        return { key: 'reest-' + r, cat: 'reestimacion', title: r || 'Por Reestimar — Sin fecha fin programada', color: '#9a3412', bg: '#ffedd5', border: '#fdba74' };
      }
      if (it.category === 'planificacion') {
        return { key: 'plan-' + r, cat: 'planificacion', title: r || 'Por Planificar — Sin fechas de planificación', color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' };
      }
      return { key: 'otro', cat: 'otro', title: r || 'Otros Pendientes', color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' };
    }

    function renderModal() {
      const q = modalQuery.trim().toLowerCase();
      const base = ITEMS.filter(it => {
        if (currentLider !== '__ALL__' && it.liderKey !== currentLider) return false;
        if (currentCat !== 'all' && it.category !== currentCat) return false;
        return true;
      });
      const filtered = base.filter(it => {
        if (!q) return true;
        return it.idPad.includes(q) || String(it.id).includes(q) || it.titulo.toLowerCase().includes(q) ||
          it.it_bp.toLowerCase().includes(q) || it.vp.toLowerCase().includes(q) ||
          it.solicitante.toLowerCase().includes(q) || it.lider.toLowerCase().includes(q) ||
          it.reason.toLowerCase().includes(q);
      });

      const liderLabel = currentLider === '__ALL__' ? 'Todos los Líderes' : (base[0]?.lider || currentLider);
      const titleMap = {
        estimacion: currentLider === '__ALL__' ? 'Iniciativas en Estimación (Pendientes, SLA y Vencidas)' : 'Auditoría de Estimación: ' + liderLabel,
        reestimacion: currentLider === '__ALL__' ? 'Iniciativas en Re-estimación' : 'Auditoría de Re-estimación: ' + liderLabel,
        planificacion: currentLider === '__ALL__' ? 'Iniciativas en Planificación (Sin Fechas)' : 'Auditoría de Planificación: ' + liderLabel,
        all: currentLider === '__ALL__' ? 'Consolidado de Iniciativas Fuera de Fecha' : 'Auditoría Consolidada: ' + liderLabel,
      };
      document.getElementById('modalTitle').textContent = '⚠️ ' + titleMap[currentCat];
      document.getElementById('modalSubtitle').textContent = filtered.length === base.length
        ? base.length + ' iniciativas detectadas'
        : 'Mostrando ' + filtered.length + ' de ' + base.length + ' iniciativas';

      const body = document.getElementById('modalBody');
      if (filtered.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:36px;">No hay iniciativas que coincidan con la búsqueda.</div>';
        return;
      }

      const groupMap = new Map();
      filtered.forEach(it => {
        const meta = getReasonMeta(it);
        if (!groupMap.has(meta.key)) groupMap.set(meta.key, { ...meta, items: [] });
        groupMap.get(meta.key).items.push(it);
      });

      body.innerHTML = Array.from(groupMap.values()).map(grp => {
        const isPlan = grp.cat === 'planificacion';
        const rowsHtml = grp.items.map(it => \`
          <tr>
            <td style="font-weight:700;color:#2563eb;white-space:nowrap;">\${esc(it.idPad)}</td>
            <td style="font-weight:600;color:#0f172a;min-width:210px;max-width:280px;">\${esc(it.titulo)}</td>
            <td>\${esc(it.it_bp)}</td>
            <td style="max-width:150px;">\${esc(it.vp)}</td>
            <td>\${esc(it.solicitante)}</td>
            <td style="font-weight:600;">\${esc(it.lider)}</td>
            <td><span class="badge" style="background:\${it.etapaBg};color:\${it.etapaColor};border:1px solid \${it.etapaColor}44;">\${esc(it.etapaLabel)}</span></td>
            <td style="white-space:nowrap;">\${esc(it.fAsig)}</td>
            \${isPlan ? '' : '<td style="text-align:center;">' + esc(it.complejidad) + '</td>'}
            <td style="white-space:nowrap;">\${esc(it.fIniEst)}</td>
            <td style="white-space:nowrap;">\${esc(it.fFinEst)}</td>
            \${isPlan ? '' : '<td style="white-space:nowrap;">' + esc(it.tiempoEst) + '</td>'}
            <td><span class="badge" style="background:\${grp.bg};color:\${grp.color};border:1px solid \${grp.border};white-space:normal;line-height:1.3;">• \${esc(it.reason)}</span></td>
            <td style="text-align:right;white-space:nowrap;">
              \${it.delayDays > 0
                ? '<span class="badge" style="background:' + grp.bg + ';color:' + grp.color + ';border:1px solid ' + grp.border + ';font-weight:800;">+' + it.delayDays + ' días</span>'
                : '<span style="color:#94a3b8;">—</span>'}
            </td>
          </tr>
        \`).join('');

        return \`
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="sec-header" style="background:\${grp.bg};color:\${grp.color};border:1px solid \${grp.border};">
              <span>⚠️ \${esc(grp.title)} (\${grp.items.length} \${grp.items.length === 1 ? 'iniciativa' : 'iniciativas'})</span>
            </div>
            <div class="table-wrap">
              <table style="font-size:11px;">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título de la Iniciativa</th>
                    <th>IT BP</th>
                    <th>VP Solicitante</th>
                    <th>Solicitante</th>
                    <th>Líder Dominio</th>
                    <th>Etapa</th>
                    <th>F. Asig. LD</th>
                    \${isPlan ? '' : '<th>Complejidad</th>'}
                    <th>F. Ini. Est.</th>
                    <th>F. Fin Est.</th>
                    \${isPlan ? '' : '<th>Tiempo Est.</th>'}
                    <th>Diagnóstico / Motivo</th>
                    <th style="text-align:right;">Desfase</th>
                  </tr>
                </thead>
                <tbody>\${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        \`;
      }).join('');
    }

    function openModal(lider, cat) {
      currentLider = lider || '__ALL__';
      currentCat = cat || 'all';
      modalQuery = '';
      document.getElementById('modalSearch').value = '';
      renderModal();
      document.getElementById('detailModal').classList.add('open');
    }

    function closeModal() {
      document.getElementById('detailModal').classList.remove('open');
    }

    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-lider][data-cat]');
      if (trigger) {
        openModal(trigger.dataset.lider, trigger.dataset.cat);
      }
    });
    document.getElementById('modalSearch').addEventListener('input', e => {
      modalQuery = e.target.value;
      renderModal();
    });
    document.getElementById('modalCloseX').addEventListener('click', closeModal);
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('detailModal').addEventListener('click', e => {
      if (e.target.id === 'detailModal') closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  </script>`;

  const html = buildHtmlShell({
    title: 'Auditoría de Fechas — Líderes de Dominio',
    subtitle: 'Control de desfases en Estimación, Re-estimación y Planificación comparadas contra hoy',
    badge: 'Auditoría de Fechas',
    filterSummary: input.filterSummary,
    bodyHtml,
    scriptHtml,
  });

  downloadHtml(html, `Reporte_Auditoria_Fechas_${format(new Date(), 'yyyyMMdd_HHmm')}.html`);
}

// ---------------------------------------------------------------------------
// 2. Pendientes BP TI (pendientes_bp)
// ---------------------------------------------------------------------------
export function exportPendientesBPToHTML(input: PendingBPExportInput) {
  const est: Iniciativa[] = [];
  const presup: Iniciativa[] = [];
  const plan: Iniciativa[] = [];
  const mover: Iniciativa[] = [];

  input.iniciativas.forEach(i => {
    if (i.etapa_actual === 'por_aprobar_estimacion' && !input.isAffirmative(i.aprobar_estimacion)) est.push(i);
    if (i.etapa_actual === 'por_habilitar_presupuesto' && !input.isAffirmative(i.presupuesto_habilitado)) presup.push(i);
    if (i.etapa_actual === 'aprobar_planificacion' && !input.isAffirmative(i.planificacion_aprobada)) plan.push(i);
    if (input.getMoverEtapaAction(i)) mover.push(i);
  });

  const allIds = new Set([...est, ...presup, ...plan, ...mover].map(i => i.id));
  const byBP: Record<string, { bp: string; est: number; presup: number; plan: number; mover: number; total: number }> = {};

  const touchBP = (bpKey: string) => {
    if (!byBP[bpKey]) byBP[bpKey] = { bp: bpKey, est: 0, presup: 0, plan: 0, mover: 0, total: 0 };
    return byBP[bpKey];
  };

  est.forEach(i => { touchBP(normVal(i.it_bp)).est++; });
  presup.forEach(i => { touchBP(normVal(i.it_bp)).presup++; });
  plan.forEach(i => { touchBP(normVal(i.it_bp)).plan++; });
  mover.forEach(i => { touchBP(normVal(i.it_bp)).mover++; });

  const allPending = Array.from(allIds).map(id => input.iniciativas.find(i => i.id === id)!).filter(Boolean);
  allPending.forEach(i => { touchBP(normVal(i.it_bp)).total++; });

  const bpRows = Object.values(byBP).sort((a, b) => b.total - a.total);

  const detailItems = [
    ...est.map(i => ({ i, cat: 'por_aprobar_estimacion', action: 'Aprobar Estimación' })),
    ...presup.map(i => ({ i, cat: 'por_habilitar_presupuesto', action: 'Habilitar Presupuesto' })),
    ...plan.map(i => ({ i, cat: 'aprobar_planificacion', action: 'Aprobar Planificación' })),
    ...mover.map(i => ({ i, cat: 'mover_etapa', action: input.getMoverEtapaAction(i) || 'Mover de Etapa' })),
  ].map(({ i, cat, action }) => {
    const etapa = ETAPAS_BY_ID.get(i.etapa_actual);
    return {
      id: i.id,
      titulo: i.titulo,
      it_bp: displayLabel(i.it_bp),
      vp: displayLabel(i.vp_solicitante),
      lider: displayLabel(i.lider_dominio),
      etapaLabel: etapa?.label ?? i.etapa_actual,
      etapaColor: etapa?.color ?? '#64748b',
      etapaBg: etapa?.bgColor ?? '#f1f5f9',
      cat,
      action,
    };
  });

  const summaryRowsHtml = bpRows.map(r => `
    <tr>
      <td style="font-weight:700;color:#0f172a;">${escapeHtml(displayLabel(r.bp))}</td>
      <td style="text-align:right;font-weight:700;color:#7c3aed;">${r.est}</td>
      <td style="text-align:right;font-weight:700;color:#0891b2;">${r.presup}</td>
      <td style="text-align:right;font-weight:700;color:#059669;">${r.plan}</td>
      <td style="text-align:right;font-weight:700;color:#d97706;">${r.mover}</td>
      <td style="text-align:right;font-weight:800;color:#0f172a;">${r.total}</td>
    </tr>
  `).join('');

  const bodyHtml = `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-color:#cbd5e1;background:#f8fafc;">
        <span class="kpi-label">Total Pendientes BP</span>
        <span class="kpi-value" style="color:#0f172a;">${allPending.length}</span>
        <span class="kpi-sub">iniciativas con acción pendiente</span>
      </div>
      <div class="kpi-card" style="border-color:#ddd6fe;background:#f5f3ff;">
        <span class="kpi-label" style="color:#6d28d9;">Por Aprobar Estimación</span>
        <span class="kpi-value" style="color:#7c3aed;">${est.length}</span>
      </div>
      <div class="kpi-card" style="border-color:#a5f3fc;background:#ecfeff;">
        <span class="kpi-label" style="color:#0e7490;">Por Habilitar Presupuesto</span>
        <span class="kpi-value" style="color:#0891b2;">${presup.length}</span>
      </div>
      <div class="kpi-card" style="border-color:#a7f3d0;background:#ecfdf5;">
        <span class="kpi-label" style="color:#047857;">Aprobar Planificación</span>
        <span class="kpi-value" style="color:#059669;">${plan.length}</span>
      </div>
      <div class="kpi-card" style="border-color:#fde68a;background:#fffbeb;">
        <span class="kpi-label" style="color:#b45309;">Por Mover de Etapa</span>
        <span class="kpi-value" style="color:#d97706;">${mover.length}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Resumen de Pendientes por IT BP</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>IT BP</th>
              <th style="text-align:right;">Aprobar Est.</th>
              <th style="text-align:right;">Hab. Presup.</th>
              <th style="text-align:right;">Aprobar Plan.</th>
              <th style="text-align:right;">Mover Etapa</th>
              <th style="text-align:right;">Total Pendientes</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRowsHtml || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Sin pendientes detectados.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td style="text-align:right;color:#7c3aed;">${est.length}</td>
              <td style="text-align:right;color:#0891b2;">${presup.length}</td>
              <td style="text-align:right;color:#059669;">${plan.length}</td>
              <td style="text-align:right;color:#d97706;">${mover.length}</td>
              <td style="text-align:right;">${allPending.length}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <span>Detalle de Acciones Pendientes</span>
        <span id="detailCount" style="font-size:11px;color:#64748b;font-weight:600;">${detailItems.length} registros</span>
      </div>
      <div class="toolbar">
        <div class="pills" id="catPills">
          <button class="pill active" data-cat="all">Todos (${detailItems.length})</button>
          <button class="pill" data-cat="por_aprobar_estimacion">Aprobar Est. (${est.length})</button>
          <button class="pill" data-cat="por_habilitar_presupuesto">Hab. Presup. (${presup.length})</button>
          <button class="pill" data-cat="aprobar_planificacion">Aprobar Plan. (${plan.length})</button>
          <button class="pill" data-cat="mover_etapa">Mover Etapa (${mover.length})</button>
        </div>
        <input id="searchBox" class="search-input" type="text" placeholder="Buscar por ID, título, IT BP o acción..." />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Título de la Iniciativa</th>
              <th>IT BP</th>
              <th>VP Solicitante</th>
              <th>Líder Dominio</th>
              <th>Etapa Pipeline</th>
              <th>Acción Pendiente BP</th>
            </tr>
          </thead>
          <tbody id="detailBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const scriptHtml = `<script>
    const ITEMS = ${safeJson(detailItems)};
    let activeCat = 'all';
    let query = '';
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    function render() {
      const q = query.trim().toLowerCase();
      const rows = ITEMS.filter(r => {
        if (activeCat !== 'all' && r.cat !== activeCat) return false;
        if (!q) return true;
        return String(r.id).includes(q) || r.titulo.toLowerCase().includes(q) || r.it_bp.toLowerCase().includes(q) || r.vp.toLowerCase().includes(q) || r.action.toLowerCase().includes(q);
      });
      document.getElementById('detailCount').textContent = rows.length + ' registros';
      const tbody = document.getElementById('detailBody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;">Sin registros para mostrar.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => \`
        <tr>
          <td style="font-weight:700;color:#0284c7;">#\${r.id}</td>
          <td style="font-weight:600;color:#0f172a;max-width:320px;">\${esc(r.titulo)}</td>
          <td style="font-weight:600;">\${esc(r.it_bp)}</td>
          <td>\${esc(r.vp)}</td>
          <td>\${esc(r.lider)}</td>
          <td><span class="badge" style="background:\${r.etapaBg};color:\${r.etapaColor};border:1px solid \${r.etapaColor}44;">\${esc(r.etapaLabel)}</span></td>
          <td style="font-weight:700;color:#6d28d9;">\${esc(r.action)}</td>
        </tr>
      \`).join('');
    }

    document.getElementById('catPills').addEventListener('click', e => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      document.querySelectorAll('#catPills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCat = btn.dataset.cat;
      render();
    });
    document.getElementById('searchBox').addEventListener('input', e => {
      query = e.target.value;
      render();
    });
    render();
  </script>`;

  const html = buildHtmlShell({
    title: 'Control de Pendientes por IT BP',
    subtitle: 'Aprobaciones pendientes, habilitación de presupuesto y movimientos de etapa',
    badge: 'Pendientes BP TI',
    filterSummary: input.filterSummary,
    bodyHtml,
    scriptHtml,
  });

  downloadHtml(html, `Reporte_Pendientes_BP_TI_${format(new Date(), 'yyyyMMdd_HHmm')}.html`);
}

// ---------------------------------------------------------------------------
// 3. Pipeline TI (estados)
// ---------------------------------------------------------------------------
export function exportEstadosToHTML(input: SimpleReportExportInput) {
  const counts: Record<string, number> = {};
  input.iniciativas.forEach(i => {
    counts[i.etapa_actual] = (counts[i.etapa_actual] || 0) + 1;
  });
  const total = input.iniciativas.length || 1;
  const stageData = ALL_ETAPAS.filter(e => counts[e.id]).map(e => ({
    ...e,
    total: counts[e.id] || 0,
    pct: Math.round(((counts[e.id] || 0) / total) * 100),
  }));

  const cardsHtml = stageData.map(e => `
    <div class="kpi-card" style="border-color:${e.color}55;background:${e.bgColor};">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span class="kpi-label" style="color:${e.textColor};">${escapeHtml(e.label)}</span>
        <span class="kpi-value" style="color:${e.color};font-size:22px;">${e.total}</span>
      </div>
      <div class="bar-track" style="margin-top:6px;background:${e.color}22;">
        <div class="bar-fill" style="width:${e.pct}%;background:${e.color};"></div>
      </div>
      <span class="kpi-sub" style="color:${e.textColor};">${e.pct}% del total</span>
    </div>
  `).join('');

  const summaryRowsHtml = stageData.map(r => `
    <tr>
      <td>
        <span class="badge" style="background:${r.bgColor};color:${r.textColor};border:1px solid ${r.color}55;">
          <span style="width:7px;height:7px;border-radius:50%;background:${r.color};display:inline-block;"></span>
          ${escapeHtml(r.label)}
        </span>
      </td>
      <td style="text-align:right;font-weight:800;color:#0f172a;">${r.total}</td>
      <td style="text-align:right;"><span class="badge" style="background:#eff6ff;color:#3b82f6;">${r.pct}%</span></td>
      <td>${r.isTerminal ? '<span class="badge" style="background:#fef2f2;color:#ef4444;border:1px solid #fecaca;">Terminal</span>' : '<span class="badge" style="background:#f0f9ff;color:#0284c7;border:1px solid #bae6fd;">Operativa</span>'}</td>
    </tr>
  `).join('');

  const detailItems = input.iniciativas.map(i => {
    const etapa = ETAPAS_BY_ID.get(i.etapa_actual);
    return {
      id: i.id,
      titulo: i.titulo,
      etapaId: i.etapa_actual,
      etapaLabel: etapa?.label ?? i.etapa_actual,
      etapaColor: etapa?.color ?? '#64748b',
      etapaBg: etapa?.bgColor ?? '#f1f5f9',
      institucion: displayLabel(i.institucion),
      vp: displayLabel(i.vp_solicitante),
      it_bp: displayLabel(i.it_bp),
      lider: displayLabel(i.lider_dominio),
      fecha: fmtDateShort(i.fecha_registro),
    };
  });

  const stagePillsHtml = stageData.map(e =>
    `<button class="pill" data-stage="${escapeHtml(e.id)}">${escapeHtml(e.label)} (${e.total})</button>`
  ).join('');

  const bodyHtml = `
    <div class="kpi-grid">${cardsHtml}</div>

    <div class="card">
      <div class="section-title">Distribución por Estado (Etapa del Pipeline)</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Estado / Etapa</th>
              <th style="text-align:right;">Iniciativas</th>
              <th style="text-align:right;">% del Total</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>${summaryRowsHtml}</tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td style="text-align:right;">${input.iniciativas.length}</td>
              <td style="text-align:right;color:#3b82f6;">100%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <span>Listado de Iniciativas</span>
        <span id="detailCount" style="font-size:11px;color:#64748b;font-weight:600;">${detailItems.length} registros</span>
      </div>
      <div class="toolbar">
        <div class="pills" id="stagePills">
          <button class="pill active" data-stage="all">Todas (${detailItems.length})</button>
          ${stagePillsHtml}
        </div>
        <input id="searchBox" class="search-input" type="text" placeholder="Buscar por ID, título, VP, IT BP o líder..." />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Título de la Iniciativa</th>
              <th>Etapa</th>
              <th>Institución</th>
              <th>VP Solicitante</th>
              <th>IT BP</th>
              <th>Líder Dominio</th>
              <th>Registro</th>
            </tr>
          </thead>
          <tbody id="detailBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const scriptHtml = `<script>
    const ITEMS = ${safeJson(detailItems)};
    let activeStage = 'all';
    let query = '';
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    function render() {
      const q = query.trim().toLowerCase();
      const rows = ITEMS.filter(r => {
        if (activeStage !== 'all' && r.etapaId !== activeStage) return false;
        if (!q) return true;
        return String(r.id).includes(q) || r.titulo.toLowerCase().includes(q) || r.vp.toLowerCase().includes(q) || r.it_bp.toLowerCase().includes(q) || r.lider.toLowerCase().includes(q);
      });
      document.getElementById('detailCount').textContent = rows.length + ' registros';
      const tbody = document.getElementById('detailBody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">Sin registros para mostrar.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => \`
        <tr>
          <td style="font-weight:700;color:#0284c7;">#\${r.id}</td>
          <td style="font-weight:600;color:#0f172a;max-width:320px;">\${esc(r.titulo)}</td>
          <td><span class="badge" style="background:\${r.etapaBg};color:\${r.etapaColor};border:1px solid \${r.etapaColor}44;">\${esc(r.etapaLabel)}</span></td>
          <td>\${esc(r.institucion)}</td>
          <td>\${esc(r.vp)}</td>
          <td>\${esc(r.it_bp)}</td>
          <td>\${esc(r.lider)}</td>
          <td style="white-space:nowrap;color:#64748b;">\${esc(r.fecha)}</td>
        </tr>
      \`).join('');
    }

    document.getElementById('stagePills').addEventListener('click', e => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      document.querySelectorAll('#stagePills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStage = btn.dataset.stage;
      render();
    });
    document.getElementById('searchBox').addEventListener('input', e => {
      query = e.target.value;
      render();
    });
    render();
  </script>`;

  const html = buildHtmlShell({
    title: 'Reporte por Estado (Etapa del Pipeline)',
    subtitle: 'Distribución operativa y detalle de iniciativas por etapa del pipeline TI',
    badge: 'Pipeline TI',
    filterSummary: input.filterSummary,
    bodyHtml,
    scriptHtml,
  });

  downloadHtml(html, `Reporte_Pipeline_TI_${format(new Date(), 'yyyyMMdd_HHmm')}.html`);
}

// ---------------------------------------------------------------------------
// 4. Business Partners (it_bp)
// ---------------------------------------------------------------------------
export function exportITBPToHTML(input: SimpleReportExportInput) {
  const byBP: Record<string, { bp: string; total: number; byEtapa: Record<string, number> }> = {};
  input.iniciativas.forEach(i => {
    const bp = normVal(i.it_bp);
    if (!byBP[bp]) byBP[bp] = { bp, total: 0, byEtapa: {} };
    byBP[bp].total++;
    byBP[bp].byEtapa[i.etapa_actual] = (byBP[bp].byEtapa[i.etapa_actual] || 0) + 1;
  });

  const total = input.iniciativas.length || 1;
  const bpRows = Object.values(byBP).sort((a, b) => b.total - a.total);

  const summaryRowsHtml = bpRows.map(r => {
    const pct = Math.round((r.total / total) * 100);
    const badges = ALL_ETAPAS.filter(e => (r.byEtapa[e.id] || 0) > 0).map(e =>
      `<span class="badge" style="background:${e.bgColor};color:${e.textColor};border:1px solid ${e.color}44;">${escapeHtml(e.label)}: ${r.byEtapa[e.id]}</span>`
    ).join(' ');
    return `
      <tr>
        <td style="font-weight:700;color:#0f172a;">${escapeHtml(displayLabel(r.bp))}</td>
        <td style="text-align:right;font-weight:800;color:#0f172a;">${r.total}</td>
        <td style="text-align:right;"><span class="badge" style="background:#eff6ff;color:#3b82f6;">${pct}%</span></td>
        <td><div style="display:flex;flex-wrap:wrap;gap:4px;">${badges}</div></td>
      </tr>
    `;
  }).join('');

  const detailItems = input.iniciativas.map(i => {
    const etapa = ETAPAS_BY_ID.get(i.etapa_actual);
    return {
      id: i.id,
      titulo: i.titulo,
      bpKey: normVal(i.it_bp),
      it_bp: displayLabel(i.it_bp),
      etapaLabel: etapa?.label ?? i.etapa_actual,
      etapaColor: etapa?.color ?? '#64748b',
      etapaBg: etapa?.bgColor ?? '#f1f5f9',
      institucion: displayLabel(i.institucion),
      vp: displayLabel(i.vp_solicitante),
      lider: displayLabel(i.lider_dominio),
      costoUsd: i.costo_usd != null ? `$${i.costo_usd.toLocaleString('en-US')}` : '—',
    };
  });

  const bpPillsHtml = bpRows.map(r =>
    `<button class="pill" data-bp="${escapeHtml(r.bp)}">${escapeHtml(displayLabel(r.bp))} (${r.total})</button>`
  ).join('');

  const bodyHtml = `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-color:#cbd5e1;background:#f8fafc;">
        <span class="kpi-label">Total Iniciativas</span>
        <span class="kpi-value" style="color:#0f172a;">${input.iniciativas.length}</span>
      </div>
      <div class="kpi-card" style="border-color:#a7f3d0;background:#ecfdf5;">
        <span class="kpi-label" style="color:#047857;">IT Business Partners</span>
        <span class="kpi-value" style="color:#059669;">${bpRows.length}</span>
      </div>
      <div class="kpi-card" style="border-color:#bae6fd;background:#f0f9ff;">
        <span class="kpi-label" style="color:#0369a1;">Promedio por IT BP</span>
        <span class="kpi-value" style="color:#0284c7;">${bpRows.length > 0 ? (input.iniciativas.length / bpRows.length).toFixed(1) : '0'}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Resumen por IT Business Partner</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>IT BP</th>
              <th style="text-align:right;">Total</th>
              <th style="text-align:right;">% del Total</th>
              <th>Distribución por Etapa</th>
            </tr>
          </thead>
          <tbody>${summaryRowsHtml}</tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td style="text-align:right;">${input.iniciativas.length}</td>
              <td style="text-align:right;color:#3b82f6;">100%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <span>Detalle de Iniciativas por IT BP</span>
        <span id="detailCount" style="font-size:11px;color:#64748b;font-weight:600;">${detailItems.length} registros</span>
      </div>
      <div class="toolbar">
        <div class="pills" id="bpPills">
          <button class="pill active" data-bp="all">Todos (${detailItems.length})</button>
          ${bpPillsHtml}
        </div>
        <input id="searchBox" class="search-input" type="text" placeholder="Buscar por ID, título, IT BP, VP o líder..." />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Título de la Iniciativa</th>
              <th>IT BP</th>
              <th>Etapa</th>
              <th>Institución</th>
              <th>VP Solicitante</th>
              <th>Líder Dominio</th>
              <th style="text-align:right;">Costo USD</th>
            </tr>
          </thead>
          <tbody id="detailBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const scriptHtml = `<script>
    const ITEMS = ${safeJson(detailItems)};
    let activeBP = 'all';
    let query = '';
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    function render() {
      const q = query.trim().toLowerCase();
      const rows = ITEMS.filter(r => {
        if (activeBP !== 'all' && r.bpKey !== activeBP) return false;
        if (!q) return true;
        return String(r.id).includes(q) || r.titulo.toLowerCase().includes(q) || r.it_bp.toLowerCase().includes(q) || r.vp.toLowerCase().includes(q) || r.lider.toLowerCase().includes(q);
      });
      document.getElementById('detailCount').textContent = rows.length + ' registros';
      const tbody = document.getElementById('detailBody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">Sin registros para mostrar.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => \`
        <tr>
          <td style="font-weight:700;color:#0284c7;">#\${r.id}</td>
          <td style="font-weight:600;color:#0f172a;max-width:300px;">\${esc(r.titulo)}</td>
          <td style="font-weight:600;">\${esc(r.it_bp)}</td>
          <td><span class="badge" style="background:\${r.etapaBg};color:\${r.etapaColor};border:1px solid \${r.etapaColor}44;">\${esc(r.etapaLabel)}</span></td>
          <td>\${esc(r.institucion)}</td>
          <td>\${esc(r.vp)}</td>
          <td>\${esc(r.lider)}</td>
          <td style="text-align:right;font-weight:700;">\${esc(r.costoUsd)}</td>
        </tr>
      \`).join('');
    }

    document.getElementById('bpPills').addEventListener('click', e => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      document.querySelectorAll('#bpPills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBP = btn.dataset.bp;
      render();
    });
    document.getElementById('searchBox').addEventListener('input', e => {
      query = e.target.value;
      render();
    });
    render();
  </script>`;

  const html = buildHtmlShell({
    title: 'Reporte por IT Business Partner',
    subtitle: 'Distribución de iniciativas y etapas del pipeline por IT BP',
    badge: 'Business Partners',
    filterSummary: input.filterSummary,
    bodyHtml,
    scriptHtml,
  });

  downloadHtml(html, `Reporte_Business_Partners_${format(new Date(), 'yyyyMMdd_HHmm')}.html`);
}
