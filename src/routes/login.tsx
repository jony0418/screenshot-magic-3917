import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Boxes, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Coimbec" },
      {
        name: "description",
        content: "Accede al sistema de inventarios, compras y ventas de tu empresa.",
      },
      { property: "og:title", content: "Iniciar sesión — Coimbec" },
      {
        property: "og:description",
        content: "Accede al sistema de inventarios, compras y ventas de tu empresa.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || password.length < 6) {
      toast.error("Captura un correo válido y una contraseña de al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Bienvenido");
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() || email.trim() } },
        });
        if (error) throw error;
        toast.success("Cuenta creada correctamente");
      }
      await router.navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar sesión";
      toast.error(
        message === "Invalid login credentials" ? "Correo o contraseña incorrectos" : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="mb-6 flex items-center gap-2">
          <Boxes className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Coimbec</h1>
            <p className="text-xs text-muted-foreground">Compras, ventas y almacén</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                value={fullName}
                maxLength={120}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              maxLength={255}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.mx"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "signin" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {mode === "signin"
            ? "¿Primera vez? Crear la cuenta de administrador"
            : "Ya tengo cuenta, iniciar sesión"}
        </button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          El primer usuario registrado queda como administrador.
        </p>
      </div>
    </div>
  );
}
