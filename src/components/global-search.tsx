import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [term, setTerm] = useState("");
  const router = useRouter();
  const { hasAnyRole } = useAuth();
  const canSeeSuppliers = hasAnyRole(["admin", "compras", "almacen"]);

  const { data } = useQuery({
    queryKey: ["global-search", term, canSeeSuppliers],
    enabled: open && term.trim().length >= 2,
    queryFn: async () => {
      const like = `%${term.trim()}%`;
      const [products, customers, suppliers] = await Promise.all([
        supabase
          .from("products")
          .select("id, sku, name")
          .or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`)
          .limit(6),
        supabase
          .from("customers")
          .select("id, code, business_name")
          .or(`business_name.ilike.${like},code.ilike.${like}`)
          .limit(5),
        canSeeSuppliers
          ? supabase
              .from("suppliers")
              .select("id, code, business_name")
              .or(`business_name.ilike.${like},code.ilike.${like}`)
              .limit(5)
          : Promise.resolve({ data: [] as { id: string; code: string; business_name: string }[] }),
      ]);
      return {
        products: products.data ?? [],
        customers: customers.data ?? [],
        suppliers: suppliers.data ?? [],
      };
    },
  });

  function goProduct(productId: string) {
    onOpenChange(false);
    setTerm("");
    void router.navigate({ to: "/products/$productId", params: { productId } });
  }

  function goList(to: "/customers" | "/suppliers") {
    onOpenChange(false);
    setTerm("");
    void router.navigate({ to });
  }


  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder="Buscar por nombre, SKU o código…"
      />
      <CommandList>
        <CommandEmpty>Escribe al menos 2 caracteres para buscar.</CommandEmpty>
        {data?.products.length ? (
          <CommandGroup heading="Productos">
            {data.products.map((p) => (
              <CommandItem
                key={p.id}
                value={`prod-${p.id}-${p.name}`}
                onSelect={() => goProduct(p.id)}
              >
                <span className="num mr-2 text-xs text-muted-foreground">{p.sku}</span>
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {data?.customers.length ? (
          <CommandGroup heading="Clientes">
            {data.customers.map((c) => (
              <CommandItem
                key={c.id}
                value={`cust-${c.id}-${c.business_name}`}
                onSelect={() => goList("/customers")}
              >
                <span className="num mr-2 text-xs text-muted-foreground">{c.code}</span>
                {c.business_name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {data?.suppliers.length ? (
          <CommandGroup heading="Proveedores">
            {data.suppliers.map((s) => (
              <CommandItem
                key={s.id}
                value={`supp-${s.id}-${s.business_name}`}
                onSelect={() => goList("/suppliers")}
              >
                <span className="num mr-2 text-xs text-muted-foreground">{s.code}</span>
                {s.business_name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
