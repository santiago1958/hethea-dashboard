export function fmt(n: number | null | undefined): string {
  return "$" + (n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0 });
}

export function fmtFecha(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "string" ? Number(ts) : ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseExcelDate(v: unknown): number {
  if (!v) return Date.now();
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).getTime();
  const p = String(v).trim().split(/[\s/:]+/);
  if (p.length >= 5) {
    let yy = parseInt(p[2]);
    if (yy < 100) yy += 2000;
    return new Date(yy, parseInt(p[1]) - 1, parseInt(p[0]), parseInt(p[3]), parseInt(p[4])).getTime();
  }
  return Date.now();
}
