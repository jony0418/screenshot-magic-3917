import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  code: z.string().trim().min(1, "Requerido").max(30),
  business_name: z.string().trim().min(1, "Requerido").max(160),
  rfc: z.string().trim().max(20).optional().or(z.literal("")),
  contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  terms_days: z.coerce.number().int().min(0).max(365),
  is_active: z.boolean(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type PartnerFormValues = z.infer<typeof schema>;

export function PartnerFormDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  title,
  termsLabel,
  defaultValues,
  extraFields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PartnerFormValues) => void;
  submitting?: boolean;
  title: string;
  termsLabel: string;
  defaultValues?: Partial<PartnerFormValues>;
  extraFields?: ReactNode;
}) {
  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: "",
      business_name: "",
      rfc: "",
      contact_name: "",
      email: "",
      phone: "",
      address: "",
      terms_days: 0,
      is_active: true,
      notes: "",
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (open) form.reset({ ...form.getValues(), ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={form.handleSubmit((values) => onSubmit(values))}
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Código *</Label>
            <Input id="code" {...form.register("code")} />
            {errors.code ? <p className="text-xs text-destructive">{errors.code.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfc">RFC</Label>
            <Input id="rfc" {...form.register("rfc")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="business_name">Razón social *</Label>
            <Input id="business_name" {...form.register("business_name")} />
            {errors.business_name ? (
              <p className="text-xs text-destructive">{errors.business_name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_name">Contacto</Label>
            <Input id="contact_name" {...form.register("contact_name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" {...form.register("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="terms_days">{termsLabel}</Label>
            <Input id="terms_days" type="number" {...form.register("terms_days")} />
          </div>
          {extraFields}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Dirección</Label>
            <Textarea id="address" rows={2} {...form.register("address")} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="partner_active"
              type="checkbox"
              className="h-4 w-4"
              {...form.register("is_active")}
            />
            <Label htmlFor="partner_active">Activo</Label>
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
