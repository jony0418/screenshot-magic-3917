import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/table-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configuración — Coimbec" },
      { name: "description", content: "Usuarios, roles, almacenes, categorías, unidades y datos de la empresa." },
      { property: "og:title", content: "Configuración — Coimbec" },
      { property: "og:description", content: "Usuarios, roles, almacenes, categorías, unidades y datos de la empresa." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!isAdmin)
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState title="Acceso restringido" description="Solo el administrador puede ver la configuración." />
      </div>
    );
  return (
    <div>
      <PageHeader title="Configuración" description="Administración del sistema" />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="warehouses">Almacenes</TabsTrigger>
          <TabsTrigger value="categories">Categorías</TabsTrigger>
          <TabsTrigger value="units">Unidades</TabsTrigger>
          <TabsTrigger value="company">Empresa</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="warehouses">
          <SimpleCatalog table="warehouses" withCode />
        </TabsContent>
        <TabsContent value="categories">
          <SimpleCatalog table="categories" />
        </TabsContent>
        <TabsContent value="units">
          <SimpleCatalog table="units" withCode />
        </TabsContent>
        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ROLES: AppRole[] = ["admin", "compras", "ventas", "almacen"];

function UsersTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      return profiles.map((p) => ({
        ...p,
        roles: roles.filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, role, on }: { userId: string; role: AppRole; on: boolean }) => {
      const { error } = on
        ? await supabase.from("user_roles").insert({ user_id: userId, role })
        : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rol actualizado");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 rounded-lg border border-border bg-card">
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        Los usuarios nuevos se registran desde la pantalla de acceso con rol Ventas; aquí asignas sus roles.
      </p>
      {users.isLoading ? (
        <LoadingState />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : (
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              {ROLES.map((r) => (
                <th key={r} className="text-center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
              <th className="text-center">Activo</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.full_name ?? "—"}</td>
                <td>{u.email}</td>
                {ROLES.map((r) => {
                  const on = u.roles.includes(r);
                  const self = u.id === user?.id && r === "admin";
                  return (
                    <td key={r} className="text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={self || toggle.isPending}
                        title={self ? "No puedes quitarte el rol de administrador" : undefined}
                        onChange={() => toggle.mutate({ userId: u.id, role: r, on: !on })}
                      />
                    </td>
                  );
                })}
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={u.is_active}
                    disabled={u.id === user?.id}
                    onChange={() => setActive.mutate({ id: u.id, active: !u.is_active })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type CatalogTable = "warehouses" | "categories" | "units";
type CatalogRow = { id: string; name: string; code?: string; is_default?: boolean };

function SimpleCatalog({ table, withCode = false }: { table: CatalogTable; withCode?: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const list = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").order("name");
      if (error) throw error;
      return data as CatalogRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!name.trim() || (withCode && !code.trim())) throw new Error("Completa los campos");
      const row = withCode ? { code: code.trim().toUpperCase(), name: name.trim() } : { name: name.trim() };
      const { error } = await supabase.from(table).insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro agregado");
      setCode("");
      setName("");
      void qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from(table).update({ name: value } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Guardado");
      void qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 max-w-2xl rounded-lg border border-border bg-card">
      <form
        className="flex flex-wrap gap-2 border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        {withCode ? <Input className="w-32" placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} /> : null}
        <Input className="flex-1" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" disabled={add.isPending}>
          Agregar
        </Button>
      </form>
      {list.isLoading ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState error={list.error} />
      ) : (
        <table className="data-table w-full">
          <thead>
            <tr>
              {withCode ? <th>Código</th> : null}
              <th>Nombre (edita y presiona Enter)</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id}>
                {withCode ? (
                  <td className="num">
                    {r.code}
                    {r.is_default ? <span className="ml-2 text-xs text-muted-foreground">(predeterminado)</span> : null}
                  </td>
                ) : null}
                <td>
                  <input
                    className="w-full bg-transparent outline-none focus:underline"
                    defaultValue={r.name}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = e.currentTarget.value.trim();
                        if (v && v !== r.name) rename.mutate({ id: r.id, value: v });
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CompanyTab() {
  const qc = useQueryClient();
  const company = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ business_name: "", rfc: "", address: "", phone: "", email: "" });
  useEffect(() => {
    if (company.data)
      setForm({
        business_name: company.data.business_name ?? "",
        rfc: company.data.rfc ?? "",
        address: company.data.address ?? "",
        phone: company.data.phone ?? "",
        email: company.data.email ?? "",
      });
  }, [company.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("La razón social es obligatoria");
      const payload = {
        business_name: form.business_name.trim(),
        rfc: form.rfc || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
      };
      const { error } = company.data
        ? await supabase.from("company_settings").update(payload).eq("id", company.data.id)
        : await supabase.from("company_settings").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos de la empresa guardados");
      void qc.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (company.isLoading) return <LoadingState />;

  const field = (key: keyof typeof form, label: string) => (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <form
      className="mt-3 grid max-w-2xl gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="sm:col-span-2">{field("business_name", "Razón social")}</div>
      {field("rfc", "RFC")}
      {field("phone", "Teléfono")}
      <div className="sm:col-span-2">{field("address", "Dirección")}</div>
      {field("email", "Correo")}
      <div className="flex items-end justify-end">
        <Button type="submit" disabled={save.isPending}>
          Guardar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Estos datos aparecen en las órdenes impresas. Moneda MXN, IVA 16%.
      </p>
    </form>
  );
}
