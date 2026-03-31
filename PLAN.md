# Plan de trabajo — Mumú Babywear

## Stack
- Frontend: HTML/CSS/JS vanilla (PWA)
- Backend: Supabase (schema `mumu` dentro de BD DnD Halo)
- Deploy: Vercel (mumu-three.vercel.app)
- Repo: vicentedomus/mumu

## Fase 1 — Estructura base [COMPLETADA]
- [x] Setup proyecto (PWA manifest, service worker, estructura de archivos)
- [x] Schema `mumu` en Supabase (8 tablas, funciones RPC, RLS)
- [x] Auth simple (1 usuario)
- [x] Diseño mobile-first con paleta de marca
- [x] Deploy a Vercel conectado a GitHub
- [x] Logo y assets de marca (perrito Mumú)

## Fase 2 — Inventario [COMPLETADA]
- [x] CRUD de productos
- [x] Selector de tallas (chips) y colores (input) con producto cartesiano automático
- [x] Vista de inventario con stock por ubicación (Casa/Marcé/Luan)
- [x] Detalle de producto con stock desglosado por variante
- [x] Agregar stock (ingreso) a cualquier ubicación
- [x] Trasladar stock entre ubicaciones (RPC transfer_stock)
- [x] Venta rápida desde inventario con preview de comisión
- [x] Historial de movimientos por producto
- [x] UI/UX: Tactile Organicism design system (Nature Distilled + Claymorphism)

## Fase 3 — Ventas + Compras [COMPLETADA]
- [x] Pantalla de ventas: listado completo con filtros por fecha/ubicación
- [x] Resumen bruto/comisiones/neto
- [x] Registro de venta desde la pestaña Ventas (no solo desde inventario)
- [x] Pedidos a proveedores: crear pedido con ítems, envío, impuestos
- [x] Flujo de estados: Pedido → En tránsito → Recibido (+ Cancelado)
- [x] Al recibir pedido → ingreso automático al stock de Casa

## Fase 4 — Reportes [COMPLETADA]
- [x] Rentabilidad general: ventas, costos, ganancia neta, ROI
- [x] Comparación vs período anterior (semana/mes/trimestre) con % de cambio
- [x] Gráfica de barras: ventas por semana
- [x] Top productos más vendidos con margen real ($) y %
- [x] Ventas por ubicación con neto por punto de venta
- [x] Reporte consignación: unidades en tienda, vendidas, comisión, monto que deben
- [x] Inversión en compras: pedidos, envíos, impuestos, total, ROI
- [x] Selector de período: semana / mes / trimestre

## Fase 5 — Venta online (futura)
- [ ] Investigar Tiendanube (gratis, ideal Latam) o Shopify Starter ($5/mes)
- [ ] Integración: webhook venta online → descuenta stock en Supabase
- [ ] Sync bidireccional de inventario

## Decisiones tomadas
- Supabase es fuente de verdad del inventario
- Schema `mumu` separado del schema `public` (DnD Halo) en la misma BD
- SKU autogenerado: MU-001-RS-03 (producto-color-talla)
- Comisión variable por punto de venta (Casa 0%, Marcé 30%, Luan 30%)
- No se usan los códigos del Excel original, se generan nuevos
- Tallas y colores se seleccionan separado → se genera producto cartesiano
- Solo 1 usuaria por ahora (la dueña), cuenta del novio mientras tanto
