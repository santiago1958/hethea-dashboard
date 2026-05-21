"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/login/actions";
import { deleteMovimiento } from "@/app/actions/movimientos";
import {
  type Movimiento,
  type Tienda,
  type TipoMov,
  MESES,
  MESES_F,
  TIENDAS,
  CATS_INGRESO,
  CATS_EGRESO,
  CATS_GASTO,
} from "@/lib/types";
import { fmt, fmtFecha, parseExcelDate } from "@/lib/format";

ChartJS.register(BarElement, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

const THEME_COLORS = [
  "#276749", "#9b2c2c", "#975a16", "#2b6cb0",
  "#553c9a", "#b7791f", "#1a6b5e", "#c53030",
  "#2c5282", "#744210", "#276749", "#702459",
];

type SyncState = "loading" | "live" | "err";
type TabName = "resumen" | "ingresar" | "anual";

export default function Dashboard({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [anio, setAnio] = useState(() => Math.max(new Date().getFullYear(), 2026));
  const [mesRes, setMesRes] = useState(() => new Date().getMonth());
  const [mesInp, setMesInp] = useState(() => new Date().getMonth());
  const [verTodo, setVerTodo] = useState(false);
  const [tab, setTab] = useState<TabName>("resumen");
  const [filtroTiendas, setFiltroTiendas] = useState<Tienda[]>([...TIENDAS]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [sync, setSync] = useState<SyncState>("loading");
  const [syncLabel, setSyncLabel] = useState("Sincronizando");
  const [toastMsg, setToastMsg] = useState<{ text: string; er?: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Form state
  const [inpTienda, setInpTienda] = useState<Tienda>("Online");
  const [catI, setCatI] = useState<string>(CATS_INGRESO[0]);
  const [mtoI, setMtoI] = useState("");
  const [ntaI, setNtaI] = useState("");
  const [catE, setCatE] = useState<string>(CATS_EGRESO[0]);
  const [mtoE, setMtoE] = useState("");
  const [ntaE, setNtaE] = useState("");
  const [catG, setCatG] = useState<string>(CATS_GASTO[0]);
  const [mtoG, setMtoG] = useState("");
  const [ntaG, setNtaG] = useState("");
  const [excelProgress, setExcelProgress] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [, startTransition] = useTransition();

  // Delete modal state
  const [pendingDeleteId, setPendingDeleteId] = useState<number | string | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // ── Toast ──
  const toast = useCallback((text: string, er = false) => {
    setToastMsg({ text, er });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  // ── Data load ──
  const cargarDatos = useCallback(async () => {
    setSync("loading");
    setSyncLabel("Sincronizando...");
    const { data, error } = await supabase
      .from("movimientos")
      .select("*")
      .eq("anio", anio)
      .order("ts", { ascending: false });
    if (error) {
      setSync("err");
      setSyncLabel("Error");
      console.error(error);
      return;
    }
    setMovs((data || []) as Movimiento[]);
    setSync("live");
    setSyncLabel("En línea");
  }, [anio, supabase]);

  useEffect(() => {
    cargarDatos();
    const channel = supabase
      .channel("movimientos-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, () => {
        cargarDatos();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cargarDatos, supabase]);

  // ── Auto-jump to "Año Completo" if current month is empty ──
  useEffect(() => {
    if (verTodo || movs.length === 0) return;
    const hayEnMes = movs.some(
      (m) => m.anio === anio && m.mes === mesRes && filtroTiendas.includes((m.tienda || "Online") as Tienda)
    );
    if (!hayEnMes) setVerTodo(true);
  }, [movs, anio, mesRes, filtroTiendas, verTodo]);

  // ── Totals ──
  const totMes = useCallback(
    (mes: number) => {
      const arr = movs.filter(
        (m) => m.mes === mes && m.anio === anio && filtroTiendas.includes((m.tienda || "Online") as Tienda)
      );
      const ing = arr.filter((m) => m.tipo === "Ingreso").reduce((a, m) => a + Number(m.monto), 0);
      const eg = arr.filter((m) => m.tipo === "Egreso").reduce((a, m) => a + Number(m.monto), 0);
      const gf = arr.filter((m) => m.tipo === "GastoFijo").reduce((a, m) => a + Number(m.monto), 0);
      return { ing, eg, gf, bal: ing - eg - gf };
    },
    [movs, anio, filtroTiendas]
  );
  const totAnio = useCallback(() => {
    const arr = movs.filter((m) => m.anio === anio && filtroTiendas.includes((m.tienda || "Online") as Tienda));
    const ing = arr.filter((m) => m.tipo === "Ingreso").reduce((a, m) => a + Number(m.monto), 0);
    const eg = arr.filter((m) => m.tipo === "Egreso").reduce((a, m) => a + Number(m.monto), 0);
    const gf = arr.filter((m) => m.tipo === "GastoFijo").reduce((a, m) => a + Number(m.monto), 0);
    return { ing, eg, gf, bal: ing - eg - gf };
  }, [movs, anio, filtroTiendas]);

  // ── Resumen data ──
  const lbl = verTodo ? `Todo ${anio}` : MESES_F[mesRes];
  const tiendasLbl = filtroTiendas.length === 3 ? "Todo HETHEA" : filtroTiendas.join(" + ");
  const totals = verTodo ? totAnio() : totMes(mesRes);
  const d12 = useMemo(() => MESES.map((_, i) => totMes(i)), [totMes]);

  const barData = useMemo(
    () => ({
      labels: [...MESES],
      datasets: [
        { label: "Ingresos", data: d12.map((d) => d.ing), backgroundColor: "#276749" },
        { label: "Egresos", data: d12.map((d) => d.eg), backgroundColor: "#9b2c2c" },
        { label: "G. Fijos", data: d12.map((d) => d.gf), backgroundColor: "#975a16" },
      ],
    }),
    [d12]
  );

  const donutData = useMemo(() => {
    const cats: Record<string, number> = {};
    const filtro = verTodo
      ? movs.filter((m) => m.anio === anio && m.tipo !== "Ingreso" && filtroTiendas.includes((m.tienda || "Online") as Tienda))
      : movs.filter((m) => m.mes === mesRes && m.anio === anio && m.tipo !== "Ingreso" && filtroTiendas.includes((m.tienda || "Online") as Tienda));
    filtro.forEach((m) => {
      cats[m.cat] = (cats[m.cat] || 0) + Number(m.monto);
    });
    const lbls = Object.keys(cats);
    const vals = Object.values(cats);
    return {
      labels: lbls.length ? lbls : ["Sin datos"],
      datasets: [
        {
          data: vals.length ? vals : [1],
          backgroundColor: vals.length ? THEME_COLORS.slice(0, vals.length) : ["#f2efe9"],
          borderWidth: 0,
        },
      ],
    };
  }, [movs, anio, mesRes, verTodo, filtroTiendas]);

  const movResumen = useMemo(() => {
    return verTodo
      ? movs.filter((m) => m.anio === anio && filtroTiendas.includes((m.tienda || "Online") as Tienda))
      : movs.filter((m) => m.mes === mesRes && m.anio === anio && filtroTiendas.includes((m.tienda || "Online") as Tienda));
  }, [movs, anio, mesRes, verTodo, filtroTiendas]);

  const movMesIngreso = useMemo(() => {
    return movs.filter((m) => m.mes === mesInp && m.anio === anio);
  }, [movs, anio, mesInp]);

  // ── Anual ──
  const tots = useMemo(() => MESES.map((_, i) => totMes(i)), [totMes]);
  const sI = tots.reduce((a, d) => a + d.ing, 0);
  const sE = tots.reduce((a, d) => a + d.eg, 0);
  const sG = tots.reduce((a, d) => a + d.gf, 0);
  const sB = tots.reduce((a, d) => a + d.bal, 0);
  const lineData = useMemo(
    () => ({
      labels: [...MESES],
      datasets: [
        { label: "Ingresos", data: tots.map((d) => d.ing), borderColor: "#276749", backgroundColor: "transparent", tension: 0 },
        { label: "Gastos Tot.", data: tots.map((d) => d.eg + d.gf), borderColor: "#9b2c2c", backgroundColor: "transparent", tension: 0 },
        { label: "Balance", data: tots.map((d) => d.bal), borderColor: "#1a1a1a", borderDash: [5, 5], tension: 0 },
      ],
    }),
    [tots]
  );

  // ── Selección de tiendas ──
  function selTienda(t: Tienda | "Todo") {
    setFiltroTiendas((cur) => {
      if (t === "Todo") return [...TIENDAS];
      if (cur.length === 3) return [t];
      let next: Tienda[];
      if (cur.includes(t)) next = cur.filter((x) => x !== t);
      else next = [...cur, t];
      if (next.length === 0) next = [t];
      if (next.length === 3) next = [...TIENDAS];
      return next;
    });
  }

  // ── Año ──
  const yearOptions: number[] = [];
  for (let y = 2026; y <= anio; y++) yearOptions.push(y);

  // ── Agregar movimiento ──
  async function agregar(tipo: TipoMov) {
    let cat = "", mto = 0, nta = "";
    if (tipo === "Ingreso") { cat = catI; mto = parseFloat(mtoI); nta = ntaI; }
    if (tipo === "Egreso") { cat = catE; mto = parseFloat(mtoE); nta = ntaE; }
    if (tipo === "GastoFijo") { cat = catG; mto = parseFloat(mtoG); nta = ntaG; }
    if (!mto || mto <= 0) { toast("Monto inválido", true); return; }
    const { error } = await supabase.from("movimientos").insert({
      anio, mes: mesInp, tipo, cat, monto: mto, nota: nta || "",
      ts: Date.now(), usuario: userEmail, tienda: inpTienda,
    });
    if (error) { toast("Error: " + error.message, true); return; }
    toast("Registro exitoso");
    if (tipo === "Ingreso") { setMtoI(""); setNtaI(""); }
    if (tipo === "Egreso") { setMtoE(""); setNtaE(""); }
    if (tipo === "GastoFijo") { setMtoG(""); setNtaG(""); }
  }

  // ── Anular (abre modal de contraseña) ──
  function eliminar(id: number | string) {
    setPendingDeleteId(id);
    setPwInput("");
    setPwError(null);
  }

  function cerrarPwModal() {
    setPendingDeleteId(null);
    setPwInput("");
    setPwError(null);
    setPwBusy(false);
  }

  async function confirmarEliminar() {
    if (pendingDeleteId == null || pwBusy) return;
    setPwBusy(true);
    setPwError(null);
    const res = await deleteMovimiento(pendingDeleteId, pwInput);
    if (!res.ok) {
      setPwError(res.error);
      setPwBusy(false);
      return;
    }
    cerrarPwModal();
    toast("Registro anulado");
  }

  // ── Importar Excel ──
  async function procesarExcelVentas(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelProgress("Leyendo archivo Excel...");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      if (rows.length === 0) throw new Error("El archivo está vacío");
      const map = new Map<string, { id: string; ts: number; m: number; prods: string }>();
      rows.forEach((row) => {
        const id = row["Pedido #"] || row["Pedido"] || row["Order"] || row["#"] || row["order_id"];
        const fecha = row["Fecha"] || row["Date"] || row["Created at"] || row["created_at"];
        const monto = row["Ventas netas"] || row["Total"] || row["Subtotal"] || row["total_price"];
        const prods = row["Producto(s)"] || row["Productos"] || row["Lineitem name"] || row["Items"];
        if (id != null && monto !== undefined) {
          const m = parseFloat(String(monto).replace(/[^0-9.-]+/g, ""));
          const ts = parseExcelDate(fecha);
          const key = String(id);
          if (!map.has(key) || ts > map.get(key)!.ts) {
            map.set(key, { id: key, ts, m, prods: prods ? String(prods) : "" });
          }
        }
      });
      if (map.size === 0) throw new Error("Columnas no encontradas. Necesita: Pedido #, Fecha, Ventas netas");
      setExcelProgress("Sincronizando con base de datos...");
      const { data: ex } = await supabase.from("movimientos").select("id, pedido_ref").not("pedido_ref", "is", null);
      const exMap = new Map<string, number>();
      (ex || []).forEach((x: { id: number; pedido_ref: string }) => exMap.set(x.pedido_ref, x.id));
      let ins = 0, upd = 0;
      for (const val of map.values()) {
        const d = new Date(val.ts);
        const pl = {
          anio: d.getFullYear(), mes: d.getMonth(), ts: val.ts,
          tipo: "Ingreso", cat: "Ventas", monto: val.m,
          nota: val.prods ? `Pedido #${val.id} - ${val.prods}` : `Pedido #${val.id}`,
          usuario: userEmail, tienda: inpTienda, pedido_ref: val.id,
        };
        if (exMap.has(val.id)) {
          await supabase.from("movimientos").upsert({ ...pl, id: exMap.get(val.id) });
          upd++;
        } else {
          await supabase.from("movimientos").insert(pl);
          ins++;
        }
      }
      toast(`¡Completado! ${ins} nuevos, ${upd} actualizados.`);
      setExcelProgress("");
      if (fileRef.current) fileRef.current.value = "";
      cargarDatos();
    } catch (err) {
      toast((err as Error).message, true);
      setExcelProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Exportar Excel ──
  async function exportarExcel() {
    if (!movs.length) { toast("No hay datos.", true); return; }
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [
      ["Año", "Mes", "Fecha y Hora Exacta", "Tienda", "Tipo", "Categoría", "Monto", "Registrado Por", "Nota"],
    ];
    [...movs]
      .sort((a, b) => a.mes - b.mes)
      .forEach((m) => {
        rows.push([
          m.anio, MESES_F[m.mes], fmtFecha(m.ts), m.tienda || "Online",
          m.tipo === "GastoFijo" ? "Gasto Fijo" : m.tipo, m.cat,
          Number(m.monto), m.usuario || "—", m.nota || "",
        ]);
      });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `Reporte_HETHEA_${anio}.xlsx`);
    toast("Reporte generado");
  }

  function handleSignOut() {
    startTransition(() => {
      signOut();
    });
  }

  return (
    <>
      <div className={`status-bar ${sync}`} />
      <header className="hethea-header">
        <div>
          <div className="brand-logo">HETHEA</div>
          <div className="sub-logo">Finanzas & Operaciones</div>
        </div>
        <div className="header-right">
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className={`sync-dot ${sync === "live" ? "live" : sync === "err" ? "err" : ""}`} />
            <span className="sync-label">{syncLabel}</span>
          </div>
          <select className="year-sel" value={anio} onChange={(e) => setAnio(parseInt(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="user-pill">
            <span className="active-user-label">{userEmail}</span>
            <button type="button" className="btn btn-ghost btn-s" onClick={handleSignOut}>Salir</button>
          </div>
        </div>
      </header>

      <main className="hethea-main">
        <div className="tabs">
          <button type="button" className={`tab ${tab === "resumen" ? "active" : ""}`} onClick={() => setTab("resumen")}>Resumen General</button>
          <button type="button" className={`tab ${tab === "ingresar" ? "active" : ""}`} onClick={() => setTab("ingresar")}>Registro de Datos</button>
          <button type="button" className={`tab ${tab === "anual" ? "active" : ""}`} onClick={() => setTab("anual")}>Vista Anual</button>
        </div>

        {tab === "resumen" && (
          <section>
            <div className="filter-group">
              <div className="mes-wrap" style={{ marginBottom: 0 }}>
                <span className="filter-label" style={{ width: 60 }}>Tienda:</span>
                <button type="button" className={`t-btn todo ${filtroTiendas.length === 3 ? "active" : ""}`} onClick={() => selTienda("Todo")}>Todo HETHEA</button>
                {TIENDAS.map((t) => (
                  <button
                    key={t} type="button"
                    className={`t-btn ${filtroTiendas.includes(t) ? "active" : ""}`}
                    onClick={() => selTienda(t)}
                  >{t}</button>
                ))}
              </div>
              <div className="mes-wrap" style={{ marginBottom: 0 }}>
                <span className="filter-label" style={{ width: 60 }}>Mes:</span>
                <button type="button" className={`mb todo ${verTodo ? "active" : ""}`} onClick={() => setVerTodo(true)}>Año Completo</button>
                <div className="mes-sel">
                  {MESES.map((m, i) => (
                    <button
                      key={m} type="button"
                      className={`mb ${!verTodo && mesRes === i ? "active" : ""}`}
                      onClick={() => { setMesRes(i); setVerTodo(false); }}
                    >{m}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi ing"><div className="kpi-label">Ingresos Brutos</div><div className="kpi-value">{fmt(totals.ing)}</div><div className="kpi-sub">{lbl}</div></div>
              <div className="kpi eg"><div className="kpi-label">Egresos Operativos</div><div className="kpi-value">{fmt(totals.eg)}</div><div className="kpi-sub">{lbl}</div></div>
              <div className="kpi gf"><div className="kpi-label">Gastos Estructurales</div><div className="kpi-value">{fmt(totals.gf)}</div><div className="kpi-sub">{lbl}</div></div>
              <div className="kpi" style={{ borderBottom: `3px solid ${totals.bal >= 0 ? "var(--green)" : "var(--danger)"}` }}>
                <div className="kpi-label">Balance Neto</div>
                <div className={`kpi-value ${totals.bal < 0 ? "neg" : ""}`}>{fmt(totals.bal)}</div>
                <div className="kpi-sub">Rentabilidad del periodo</div>
              </div>
            </div>

            <div className="grid3">
              <div className="card">
                <div className="card-title">Flujo de Caja <span className="card-title-aux">{lbl} | {tiendasLbl}</span></div>
                <div style={{ maxHeight: 250 }}><Bar data={barData} options={{ responsive: true, plugins: { legend: { labels: { font: { family: "Jost" } } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: "#f2efe9" } } } }} /></div>
              </div>
              <div className="card">
                <div className="card-title">Distribución</div>
                <div style={{ maxHeight: 200 }}><Doughnut data={donutData} options={{ responsive: true, cutout: "75%", plugins: { legend: { position: "right", labels: { font: { family: "Jost" }, boxWidth: 12 } } } }} /></div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Historial de Movimientos</span>
                <span className="card-title-aux">{movResumen.length} registros</span>
              </div>
              <table>
                <thead><tr><th>Fecha / Hora</th><th>Tienda</th><th>Categoría</th><th>Tipo</th><th>Monto</th><th>Registrado Por</th><th></th></tr></thead>
                <tbody>
                  {movResumen.length === 0 ? (
                    <tr><td colSpan={7}><div className="empty">Sin actividad registrada en esta selección.</div></td></tr>
                  ) : movResumen.map((m) => (
                    <tr key={m.id}>
                      <td><div style={{ fontWeight: 500 }}>{fmtFecha(m.ts)}</div></td>
                      <td><span className="tag tag-neutral">{m.tienda || "Online"}</span></td>
                      <td>{m.cat}</td>
                      <td><span className={`tag ${m.tipo === "Ingreso" ? "tag-i" : m.tipo === "Egreso" ? "tag-e" : "tag-g"}`}>{m.tipo === "GastoFijo" ? "G.Fijo" : m.tipo}</span></td>
                      <td className={m.tipo === "Ingreso" ? "pos" : "neg"}>{m.tipo === "Ingreso" ? "+" : "-"}{fmt(Number(m.monto))}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{m.usuario || "—"}</td>
                      <td><button type="button" className="btn btn-ghost btn-s" onClick={() => eliminar(m.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "ingresar" && (
          <section>
            <div className="filter-group" style={{ flexDirection: "row", gap: 40, alignItems: "center" }}>
              <div className="mes-wrap" style={{ marginBottom: 0 }}>
                <span className="filter-label">Mes a registrar:</span>
                <div className="mes-sel">
                  {MESES.map((m, i) => (
                    <button key={m} type="button" className={`mb ${mesInp === i ? "active" : ""}`} onClick={() => { setMesInp(i); setMesRes(i); setVerTodo(false); }}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="mes-wrap" style={{ marginBottom: 0 }}>
                <span className="filter-label">Asignar a Tienda:</span>
                <select value={inpTienda} onChange={(e) => setInpTienda(e.target.value as Tienda)} className="year-sel" style={{ borderRadius: 20, padding: "6px 16px" }}>
                  {TIENDAS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="input-grid">
              <div className="igroup">
                <h3>Ingreso</h3>
                <div className="field"><label>Categoría</label>
                  <select value={catI} onChange={(e) => setCatI(e.target.value)}>{CATS_INGRESO.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div className="field"><label>Monto ($)</label><input type="number" placeholder="0.00" min="0" step="0.01" value={mtoI} onChange={(e) => setMtoI(e.target.value)} /></div>
                <div className="field"><label>Nota (opcional)</label><input type="text" placeholder="Referencia del ingreso..." value={ntaI} onChange={(e) => setNtaI(e.target.value)} /></div>
                <button type="button" className="btn btn-p btn-full" onClick={() => agregar("Ingreso")}>Registrar Ingreso manual</button>
                <hr className="hr-soft" />
                <h4 style={{ fontSize: "0.8rem", color: "var(--accent)", marginBottom: 10 }}>Importación Masiva (Excel / CSV)</h4>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={procesarExcelVentas} />
                <button type="button" className="btn btn-w btn-dashed" onClick={() => fileRef.current?.click()}>Subir Excel de Ventas</button>
                {excelProgress && <div className="progress">{excelProgress}</div>}
              </div>

              <div className="igroup">
                <h3 className="danger" style={{ color: "var(--danger)" }}>Egreso Operativo</h3>
                <div className="field"><label>Categoría</label>
                  <select value={catE} onChange={(e) => setCatE(e.target.value)}>{CATS_EGRESO.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div className="field"><label>Monto ($)</label><input type="number" placeholder="0.00" min="0" step="0.01" value={mtoE} onChange={(e) => setMtoE(e.target.value)} /></div>
                <div className="field"><label>Nota (opcional)</label><input type="text" placeholder="Detalles del egreso..." value={ntaE} onChange={(e) => setNtaE(e.target.value)} /></div>
                <button type="button" className="btn btn-d btn-full" onClick={() => agregar("Egreso")}>Registrar Egreso</button>
              </div>

              <div className="igroup">
                <h3 style={{ color: "var(--warn)" }}>Gasto Fijo / Estructural</h3>
                <div className="field"><label>Categoría</label>
                  <select value={catG} onChange={(e) => setCatG(e.target.value)}>{CATS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div className="field"><label>Monto ($)</label><input type="number" placeholder="0.00" min="0" step="0.01" value={mtoG} onChange={(e) => setMtoG(e.target.value)} /></div>
                <div className="field"><label>Nota (opcional)</label><input type="text" placeholder="Detalles del gasto fijo..." value={ntaG} onChange={(e) => setNtaG(e.target.value)} /></div>
                <button type="button" className="btn btn-w btn-full" onClick={() => agregar("GastoFijo")}>Registrar Gasto Fijo</button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 30 }}>
              <div className="card-title">Movimientos de este mes</div>
              <table>
                <thead><tr><th>Fecha / Hora</th><th>Tienda</th><th>Categoría</th><th>Tipo</th><th>Monto</th><th>Nota</th><th>Acción</th></tr></thead>
                <tbody>
                  {movMesIngreso.length === 0 ? (
                    <tr><td colSpan={7}><div className="empty">No hay movimientos registrados en este mes.</div></td></tr>
                  ) : movMesIngreso.map((m) => (
                    <tr key={m.id}>
                      <td><div style={{ fontWeight: 500 }}>{fmtFecha(m.ts)}</div></td>
                      <td><span className="tag tag-neutral">{m.tienda || "Online"}</span></td>
                      <td>{m.cat}</td>
                      <td><span className={`tag ${m.tipo === "Ingreso" ? "tag-i" : m.tipo === "Egreso" ? "tag-e" : "tag-g"}`}>{m.tipo === "GastoFijo" ? "G.Fijo" : m.tipo}</span></td>
                      <td className={m.tipo === "Ingreso" ? "pos" : "neg"}>{fmt(Number(m.monto))}</td>
                      <td style={{ color: "var(--muted)" }}>{m.nota || "—"}</td>
                      <td><button type="button" className="btn btn-ghost btn-s" onClick={() => eliminar(m.id)}>Anular</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "anual" && (
          <section>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title">Balance Anual Consolidado</div>
              <div style={{ overflowX: "auto" }}>
                <table className="anual-table">
                  <thead><tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>G.Fijos</th><th>Balance</th></tr></thead>
                  <tbody>
                    {tots.map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{MESES_F[i]}</td>
                        <td className="pos">{fmt(d.ing)}</td>
                        <td className="neg">{fmt(d.eg)}</td>
                        <td style={{ color: "var(--warn)" }}>{fmt(d.gf)}</td>
                        <td className={d.bal >= 0 ? "pos" : "neg"}>{fmt(d.bal)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td>AÑO {anio}</td>
                      <td className="pos">{fmt(sI)}</td>
                      <td className="neg">{fmt(sE)}</td>
                      <td style={{ color: "var(--warn)" }}>{fmt(sG)}</td>
                      <td className={sB >= 0 ? "pos" : "neg"}>{fmt(sB)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Evolución de Capital</div>
              <div style={{ maxHeight: 300 }}><Line data={lineData} options={{ responsive: true, plugins: { legend: { labels: { font: { family: "Jost" } } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: "#f2efe9" } } } }} /></div>
            </div>
          </section>
        )}
      </main>

      <div className="toolbar">
        <button type="button" className="toolbar-btn" onClick={exportarExcel}>Descargar Reporte (.xlsx)</button>
      </div>

      {toastMsg && <div className={`toast show ${toastMsg.er ? "er" : ""}`}>{toastMsg.text}</div>}

      {pendingDeleteId != null && (
        <div className="modal-overlay show" role="dialog" aria-modal="true">
          <div className="modal-box">
            <h2>Autorización requerida</h2>
            <p>Ingrese la contraseña de seguridad para anular este registro financiero.</p>
            <input
              type="password"
              className="pw-input"
              placeholder="CONTRASEÑA"
              autoFocus
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarEliminar(); }}
              disabled={pwBusy}
            />
            {pwError && <div className="pw-error">{pwError}</div>}
            <div style={{ display: "flex", gap: 15, marginTop: 15 }}>
              <button type="button" className="btn btn-p" style={{ flex: 1 }} onClick={confirmarEliminar} disabled={pwBusy}>
                {pwBusy ? "Verificando..." : "Confirmar"}
              </button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={cerrarPwModal} disabled={pwBusy}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
