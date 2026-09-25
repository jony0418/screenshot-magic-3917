import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  sku: z.string().trim().min(1, "Requerido").max(40),
  name: z.string().trim().min(1, "Requerido").max(160),
  barcode: z.string().trim().max(60).optional().or(z.literal("")),
  brand: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  category_id: z.string().uuid().optional().or(z.literal("")),
  unit_id: z.string().uuid().optional().or(z.literal("")),
  min_stock: z.coerce.number().min(0),
  max_stock: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(1),
  is_active: z.boolean(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ProductFormValues = z.infer<typeof schema>;

export function ProductFormDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  defaultValues,
  title = "Nuevo producto",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductFormValues) => void;
  submitting?: boolean;
  defaultValues?: Partial<ProductFormValues>;
  title?: string;
}) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: "",
      name: "",
      barcode: "",
      brand: "",
      description: "",
      category_id: "",
      unit_id: "",
      min_stock: 0,
      max_stock: 0,
      tax_rate: 0.16,
      is_active: true,
      notes: "",
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (open) form.reset({ ...form.getValues(), ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const units = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id, code, name").order("code");
      if (error) throw error;
      return data;
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              ...values,
              barcode: values.barcode || null,
              brand: values.brand || null,
              description: values.description || null,
              notes: values.notes || null,
              category_id: values.category_id || null,
              unit_id: values.unit_id || null,
            } as unknown as ProductFormValues),
          )}

        >
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU *</Label>
            <Input id="sku" {...form.register("sku")} />
            {errors.sku ? <p className="text-xs text-destructive">{errors.sku.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="barcode">Código de barras</Label>
            <Input id="barcode" {...form.register("barcode")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" {...form.register("name")} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select
              value={form.watch("category_id") || ""}
              onValueChange={(value) => form.setValue("category_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Unidad</Label>
            <Select
              value={form.watch("unit_id") || ""}
              onValueChange={(value) => form.setValue("unit_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {(units.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand">Marca</Label>
            <Input id="brand" {...form.register("brand")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax_rate">IVA (0.16 = 16%)</Label>
            <Input id="tax_rate" type="number" step="0.01" {...form.register("tax_rate")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="min_stock">Mínimo</Label>
            <Input id="min_stock" type="number" step="0.01" {...form.register("min_stock")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max_stock">Máximo</Label>
            <Input id="max_stock" type="number" step="0.01" {...form.register("max_stock")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" rows={2} {...form.register("description")} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="is_active"
              type="checkbox"
              className="h-4 w-4"
              {...form.register("is_active")}
            />
            <Label htmlFor="is_active">Producto activo</Label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
