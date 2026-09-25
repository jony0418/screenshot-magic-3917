# Coimbec — Inventarios, Compras y Ventas

Sistema web para pyme mexicana (MXN, IVA 16%). Roles: admin, compras, ventas, almacén.
Funciona 100% en la red local con Docker y Supabase local (Postgres + Auth + RLS + RPC).

## Requisitos (en la PC servidor)

1. **Docker Desktop** (Windows/Mac) o Docker Engine + Compose (Linux): https://docs.docker.com/get-docker/
2. **Node.js 20+**: https://nodejs.org
3. **Supabase CLI**: `npm install -g supabase` (o ver https://supabase.com/docs/guides/cli)

## Instalación

```bash
# 1. Entra a la carpeta del proyecto
cd coimbec

# 2. Levanta Supabase local (la primera vez descarga imágenes, tarda unos minutos)
supabase start

# 3. Crea el esquema, funciones, RLS y datos de ejemplo
supabase db reset

# 4. Consulta la URL y la anon key
supabase status
```

5. Copia `.env.example` a `.env` y llena:
   - `VITE_SUPABASE_URL` = `http://<IP-de-esta-PC>:54321` (**no** uses `localhost`)
   - `VITE_SUPABASE_ANON_KEY` = la "anon key" / "Publishable key" de `supabase status`

   Para ver tu IP: Windows `ipconfig`, Mac/Linux `ip a` o `ifconfig`.

6. Compila y arranca el sistema:

```bash
docker compose up -d --build
```

7. Abre `http://<IP-de-esta-PC>` en el navegador. Registra la **primera cuenta**: queda como administrador.

## Acceso desde otras PCs de la red

- Desde cualquier PC de la misma red abre `http://<IP-del-servidor>` (ej. `http://192.168.1.50`).
- Si no carga, permite en el firewall los puertos **80** (sistema) y **54321** (base de datos/Auth).
- Conviene asignar IP fija al servidor en el router. Si la IP cambia, actualiza `.env` y repite `docker compose up -d --build`.

## Operación diaria

| Acción | Comando |
|---|---|
| Detener | `docker compose down` y `supabase stop` |
| Iniciar | `supabase start` y `docker compose up -d` |
| Respaldo | `supabase db dump --data-only -f respaldo.sql` |
| Actualizar código | `docker compose up -d --build` |

> `supabase db reset` **borra todos los datos**; úsalo solo en la instalación inicial.

## Estructura

- `supabase/migrations/` — esquema, índices, triggers, funciones RPC, RLS y datos de ejemplo.
- `supabase/seed.sql` — notas del usuario inicial.
- `Dockerfile` — compilación en Node + servidor Node + Nginx de entrada.
- `docker-compose.yml`, `nginx.conf`, `.env.example`.

## Stack

React + TypeScript + Vite, TanStack Router/Query, Tailwind, shadcn/ui, react-hook-form + zod, Supabase JS.
