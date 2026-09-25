# Sistema de Inventarios, Compras y Ventas (pyme MX)

Interfaz en español, código en inglés, MXN, IVA 16%. Roles: admin, compras, ventas, almacén.

## Dos ajustes necesarios (importantes)

1. **Framework**: este proyecto corre sobre React + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + react-hook-form/zod, exactamente como pediste, pero con el enrutador de TanStack (no react-router). No cambia nada funcional.
2. **Base de datos durante el desarrollo**: para poder crear y probar el esquema aquí, activo la base de datos integrada (Postgres + Auth + RLS, el mismo Supabase por debajo). Todo queda escrito en `supabase/migrations/*.sql` y `supabase/seed.sql`, sin Edge Functions ni servicios externos, así que puedes correrlo 100% local con `supabase start` / `supabase db reset` sin tocar el código. La conexión se lee solo de `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Migraciones (orden)

1. `001_core`: enums (`app_role`, `po_status`, `so_status`, `movement_type`), `profiles`, `user_roles` (tabla aparte, con `has_role()` security definer), `warehouses`, `categories`, `units`, `company_settings`.
2. `002_catalog`: `products`, `price_lists`, `product_prices`, `price_history` (+ trigger), `suppliers`, `customers`. Índices por sku, barcode, nombre.
3. `003_operations`: `purchase_orders`/`_lines`, `goods_receipts`/`_lines`, `sales_orders`/`_lines`, `shipments`/`_lines`, secuencias de folio (OC-000001, OV-000001) con trigger.
4. `004_inventory`: `stock_levels` (único producto+almacén), `inventory_movements` (solo INSERT, revocado UPDATE/DELETE).
5. `005_functions`: RPCs transaccionales.
6. `006_rls`: GRANTs + políticas por rol. `ventas` sin acceso a costos ni proveedores (vista `products_sales_view` sin `avg_cost`/`last_cost`).
7. `007_triggers`: `updated_at`, `created_by`, recálculo de totales de líneas.
8. `seed.sql`: admin inicial, almacén PRINCIPAL, 5 categorías, unidades, 2 listas, 20 productos, 5 proveedores, 5 clientes, 3 OC y 3 OV en distintos estados.

## Funciones RPC (toda la lógica en SQL)

- `receive_purchase_order(payload jsonb)` — valida ≤ pendiente, suma existencia, recalcula `avg_cost` ponderado, `last_cost`, kárdex, `qty_received` y status.
- `confirm_sales_order(order_id)` — valida disponible (on_hand − reserved) y reserva.
- `ship_sales_order(payload jsonb)` — valida contra reservado, descuenta stock y reserva, kárdex al costo promedio, status.
- `cancel_purchase_order(id)` / `cancel_sales_order(id)` — libera reservas, `CANCEL_REVERSAL` si ya hubo movimientos.
- `adjust_inventory(...)` — motivo obligatorio, solo admin/almacén.
- `bulk_update_prices(...)` — por % y/o categoría.
- `dashboard_summary()` — métricas del tablero.
- Nunca existencia negativa; orden confirmada o recibida no se edita, solo se cancela.

## Rutas / pantallas

`/login`, `/dashboard`, `/products` (+ ficha con pestañas General, Precios, Existencias, Kárdex), `/suppliers`, `/customers`, `/purchase-orders` (+ nueva/detalle/recibir), `/sales-orders` (+ nueva/detalle/confirmar/surtir), `/inventory` (existencias, kárdex, ajustes), `/price-lists`, `/settings` (usuarios, roles, almacenes, categorías, unidades, empresa). Rutas protegidas por rol; exportar CSV en cada lista; vista imprimible de OC y OV.

## Diseño

Sidebar fija, header con búsqueda global y menú de usuario, tablas densas con orden y paginación, alto contraste, captura por teclado (Enter agrega línea, Tab entre campos), estados de carga/vacío/error y toasts en español.

## Entrega por etapas

- **Etapa A (después de que apruebes)**: migraciones completas + seed + autenticación con roles + layout con sidebar.
- **Etapa B**: catálogos (productos, proveedores, clientes, listas de precios).
- **Etapa C**: compras → ventas → inventario → dashboard.
- **Etapa D**: Dockerfile multi-stage (Node build + Nginx), `docker-compose.yml`, `.env.example` y README con los pasos de instalación y acceso por IP en red local.
