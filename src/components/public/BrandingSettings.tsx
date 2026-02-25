import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Palette, Upload, X, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BrandingSettingsProps {
  userId: string;
}

export function BrandingSettings({ userId }: BrandingSettingsProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load current branding when opening
  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    const load = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("brand_name, brand_logo_url")
          .eq("user_id", userId)
          .single();
        if (data) {
          setBrandName((data as any).brand_name || "");
          setLogoUrl((data as any).brand_logo_url || null);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, userId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Erro", description: "Selecione uma imagem (PNG, JPG, etc.)", variant: "destructive" });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Erro", description: "Imagem deve ter no máximo 2MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${userId}/logo.${ext}`;

      // Remove old logo if exists
      await supabase.storage.from("brand-logos").remove([filePath]);

      const { error: uploadError } = await supabase.storage
        .from("brand-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("brand-logos").getPublicUrl(filePath);
      // Add cache buster
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      setLogoUrl(url);
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () => {
    setLogoUrl(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          brand_name: brandName.trim() || null,
          brand_logo_url: logoUrl || null,
        })
        .eq("user_id", userId);

      if (error) throw error;

      toast({ title: "Marca salva!", description: "Sua logo e nome aparecerão nos links dos seus clientes." });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasBranding = brandName.trim() || logoUrl;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Palette className="h-4 w-4" />
          {hasBranding ? "Editar marca" : "Personalizar marca"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar Marca</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo da marca</Label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative">
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-16 w-16 rounded-lg object-contain border border-border bg-secondary/50"
                    />
                    <button
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">PNG ou JPG, até 2MB</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
            </div>

            {/* Brand name */}
            <div className="space-y-2">
              <Label htmlFor="brand-name">Nome da marca</Label>
              <Input
                id="brand-name"
                placeholder="Ex: MegaStore Créditos"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">Aparece no topo da página dos seus clientes</p>
            </div>

            {/* Preview */}
            {(brandName.trim() || logoUrl) && (
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">Prévia do cabeçalho do cliente:</p>
                <div className="flex items-center justify-center gap-3">
                  {logoUrl && (
                    <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded object-contain" />
                  )}
                  {brandName.trim() && (
                    <span className="text-lg font-semibold text-foreground">{brandName}</span>
                  )}
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar marca"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
