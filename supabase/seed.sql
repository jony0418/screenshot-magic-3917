-- Los datos de ejemplo (almacén PRINCIPAL, categorías, unidades, listas de precios,
-- 20 productos, 5 proveedores, 5 clientes, 3 OC y 3 OV) se cargan en la migración
-- 20260925000004_seed_demo_data.sql, así que `supabase db reset` ya los incluye.
--
-- Usuario administrador inicial: el PRIMER usuario que se registre desde la
-- pantalla de acceso ("¿Primera vez? Crear la cuenta de administrador")
-- queda como admin automáticamente. Los siguientes quedan con rol Ventas y el
-- admin les asigna roles en Configuración > Usuarios.
select 1;
