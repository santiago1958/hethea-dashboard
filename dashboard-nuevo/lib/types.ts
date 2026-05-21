export type Tienda = "Online" | "Física" | "Consultoras";
export type TipoMov = "Ingreso" | "Egreso" | "GastoFijo";

export interface Movimiento {
  id: number | string;
  anio: number;
  mes: number;
  ts: number;
  tipo: TipoMov;
  cat: string;
  monto: number;
  nota: string | null;
  tienda: Tienda | string | null;
  usuario: string | null;
  pedido_ref: string | null;
  created_at?: string;
}

export const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"] as const;
export const MESES_F = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"] as const;
export const TIENDAS: Tienda[] = ["Online", "Física", "Consultoras"];

export const CATS_INGRESO = ["Ventas", "Ventas especiales", "Aportes"] as const;
export const CATS_EGRESO = ["Mantenimiento", "Packaging", "Operaciones logísticas", "Alimentos y cafetería", "Transportes", "Avances"] as const;
export const CATS_GASTO = ["Servicios Web", "Anuncios y promociones", "Marketing", "Servicios públicos", "Pago proveedores", "Aseo", "Arriendo", "Nómina"] as const;
