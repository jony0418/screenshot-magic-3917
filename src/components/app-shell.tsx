import logoAsset from "@/assets/coimbec-logo.jpeg.asset.json";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[];
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Tablero", icon: LayoutDashboard },
  { to: "/products", label: "Productos", icon: Package },
  { to: "/suppliers", label: "Proveedores", icon: Truck, roles: ["admin", "compras", "almacen"] },
  { to: "/customers", label: "Clientes", icon: Users, roles: ["admin", "ventas", "almacen"] },
  {
    to: "/purchase-orders",
    label: "Órdenes de compra",
    icon: ClipboardList,
    roles: ["admin", "compras", "almacen"],
  },
  {
    to: "/sales-orders",
    label: "Órdenes de venta",
    icon: ShoppingCart,
    roles: ["admin", "ventas", "almacen"],
  },
  { to: "/inventory", label: "Inventario", icon: Boxes },
  { to: "/price-lists", label: "Listas de precios", icon: Tags, roles: ["admin", "ventas"] },
  { to: "/settings", label: "Configuración", icon: Settings, roles: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, hasAnyRole, signOut } = useAuth();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items = NAV.filter((item) => !item.roles || hasAnyRole(item.roles));

  async function handleSignOut() {
    await signOut();
    router.navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
          <img src={logoAsset.url} alt="Coimbec" className="h-9 w-9 rounded-full" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Coimbec</p>
            <p className="text-[11px] text-sidebar-foreground/60">Compras y ventas</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: cn("bg-sidebar-accent text-sidebar-accent-foreground font-medium"),
              }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/60">
          {roles.length ? roles.map((r) => ROLE_LABEL[r]).join(" · ") : "Sin rol asignado"}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/40 md:max-w-md"
          >
            <Search className="h-4 w-4" />
            Buscar producto, cliente o proveedor…
            <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] md:inline">
              Ctrl K
            </kbd>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-[12rem] truncate">
                {user?.email ?? "Usuario"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {roles.length ? roles.map((r) => ROLE_LABEL[r]).join(", ") : "Sin rol asignado"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="md:hidden">
          <nav className="no-print flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-muted-foreground"
                activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
