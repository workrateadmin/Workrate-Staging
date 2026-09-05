/**
 * Materials Library
 * Private company materials: search, create, edit, price history.
 * Imports all primitives/helpers from @workspace/memphis-bold per consuming-web.md.
 */
import { useState, useDeferredValue } from "react";
import {
  useListMaterials,
  useCreateMaterial,
  useUpdateMaterial,
  useListMaterialCostHistory,
  getListMaterialsQueryKey,
  getListMaterialCostHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Input } from "@workspace/memphis-bold/components/ui/input";
import { Label } from "@workspace/memphis-bold/components/ui/label";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/memphis-bold/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@workspace/memphis-bold/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  Plus,
  Search,
  Check,
  Pencil,
  History,
  Package,
  ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MaterialRow {
  id: number;
  name: string;
  category?: string | null;
  supplierName?: string | null;
  supplierSku?: string | null;
  unit?: string | null;
  latestConfirmedPrice?: number | null;
  latestConfirmedPriceDate?: string | null;
  [key: string]: unknown;
}

interface MaterialPage {
  items: MaterialRow[];
  limit: number;
  offset: number;
}

interface PriceHistoryItem {
  id?: number;
  price?: number | null;
  recordedAt?: string | null;
  note?: string | null;
  [key: string]: unknown;
}

interface MaterialHistoryPage {
  items: PriceHistoryItem[];
}

// ── Price History Dialog ──────────────────────────────────────────────────────
function PriceHistoryDialog({
  material,
  open,
  onOpenChange,
}: {
  material: MaterialRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useListMaterialCostHistory(material?.id ?? 0, {
    query: {
      enabled: !!material?.id && open,
      queryKey: getListMaterialCostHistoryQueryKey(material?.id ?? 0),
    },
  });

  const items: PriceHistoryItem[] = (data as MaterialHistoryPage | undefined)?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl overflow-y-auto max-h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle className="font-black text-lg">
            Price History — {material?.name}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Append-only. Older prices are preserved for audit and variance analysis.
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground font-medium italic py-2">No price history recorded yet.</p>
        ) : (
          <div className="divide-y divide-border/40 rounded-xl border border-border/50 overflow-hidden">
            {items.map((entry, i) => (
              <div key={entry.id ?? i} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-bold">
                    {entry.price != null ? formatCurrency(Number(entry.price)) : "—"}
                  </span>
                  {material?.unit && (
                    <span className="text-xs text-muted-foreground font-medium ml-1">/ {material.unit}</span>
                  )}
                  {entry.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{String(entry.note)}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-medium shrink-0 ml-3">
                  {entry.recordedAt ? String(entry.recordedAt).slice(0, 10) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)} className="font-bold rounded-xl">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ── Material Edit / Create Dialog ─────────────────────────────────────────────
function MaterialDialog({
  open,
  onOpenChange,
  material,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: MaterialRow | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();

  const fromMaterial = (m: MaterialRow | null) => ({
    name: m?.name ?? "",
    category: m?.category ?? "",
    supplierName: m?.supplierName ?? "",
    supplierSku: m?.supplierSku ?? "",
    unit: m?.unit ?? "",
  });

  const [form, setForm] = useState(() => fromMaterial(material));

  const isNew = !material;
  const isPending = createMaterial.isPending || updateMaterial.isPending;

  const handleOpenChange = (v: boolean) => {
    if (!v) setForm(fromMaterial(material));
    onOpenChange(v);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      category: form.category || undefined,
      supplierName: form.supplierName || undefined,
      supplierSku: form.supplierSku || undefined,
      unit: form.unit || undefined,
    };

    if (isNew) {
      createMaterial.mutate(
        { data: payload },
        {
          onSuccess: () => { toast({ title: "Material created" }); onSaved(); onOpenChange(false); },
          onError: () => toast({ title: "Failed to create material", variant: "destructive" }),
        }
      );
    } else {
      updateMaterial.mutate(
        { materialId: material!.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Material updated" }); onSaved(); onOpenChange(false); },
          onError: () => toast({ title: "Failed to update material", variant: "destructive" }),
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl overflow-y-auto max-h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle className="font-black text-lg">
            {isNew ? "New Material" : `Edit — ${material?.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="field-label">Name</Label>
            <Input
              placeholder="e.g. Accoya 25mm board"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="field-label">Category</Label>
              <Input
                placeholder="e.g. Timber, Hardware"
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">Unit</Label>
              <Input
                placeholder="m, sheet, each…"
                value={form.unit}
                onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                className="field-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="field-label">Supplier</Label>
              <Input
                placeholder="Supplier name"
                value={form.supplierName}
                onChange={(e) => setForm(f => ({ ...f, supplierName: e.target.value }))}
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">Supplier SKU</Label>
              <Input
                placeholder="SKU / part number"
                value={form.supplierSku}
                onChange={(e) => setForm(f => ({ ...f, supplierSku: e.target.value }))}
                className="field-input"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1 border-t border-border/40">
            <Button onClick={handleSave} disabled={isPending} className="font-bold rounded-xl h-10 px-5">
              <Check className="w-4 h-4 mr-1.5" />
              {isPending ? "Saving…" : isNew ? "Create" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="font-bold rounded-xl h-10">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Material List Item ────────────────────────────────────────────────────────
function MaterialItem({
  item,
  onEdit,
  onHistory,
}: {
  item: MaterialRow;
  onEdit: (item: MaterialRow) => void;
  onHistory: (item: MaterialRow) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-secondary/20 hover:bg-secondary/40 transition-colors">
      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm font-semibold truncate">{item.name}</p>
        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs font-medium text-muted-foreground mt-0.5">
          {item.category && <span>{item.category}</span>}
          {item.supplierName && <span>{item.supplierName}</span>}
          {item.supplierSku && <span>SKU: {item.supplierSku}</span>}
          {item.latestConfirmedPrice != null && (
            <span className="font-bold text-foreground">
              {formatCurrency(Number(item.latestConfirmedPrice))}
              {item.unit ? ` / ${item.unit}` : ""}
              {item.latestConfirmedPriceDate && (
                <span className="font-normal text-muted-foreground ml-1">
                  · {String(item.latestConfirmedPriceDate).slice(0, 10)}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
          title="Price history"
          onClick={() => onHistory(item)}
        >
          <History className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
          title="Edit"
          onClick={() => onEdit(item)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function MaterialsLibrary() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState<MaterialRow | null>(null);
  const [historyMaterial, setHistoryMaterial] = useState<MaterialRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const searchParams = deferredSearch ? { search: deferredSearch } : undefined;

  const { data, isLoading } = useListMaterials(searchParams, {
    query: { queryKey: getListMaterialsQueryKey(searchParams) },
  });

  const items: MaterialRow[] = (data as MaterialPage | undefined)?.items ?? [];
  const displayed = expanded ? items : items.slice(0, 5);

  const handleOpenCreate = () => { setEditMaterial(null); setDialogOpen(true); };
  const handleOpenEdit = (item: MaterialRow) => { setEditMaterial(item); setDialogOpen(true); };
  const handleOpenHistory = (item: MaterialRow) => { setHistoryMaterial(item); setHistoryOpen(true); };
  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
    if (searchParams) qc.invalidateQueries({ queryKey: getListMaterialsQueryKey(searchParams) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Catalogue
        </span>
        <Button
          variant="ghost" size="sm"
          className="h-7 px-3 rounded-lg text-xs font-semibold"
          onClick={handleOpenCreate}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> New material
        </Button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search materials…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field-input pl-9 h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground font-medium italic">
          {deferredSearch ? "No materials match your search." : "No materials in your library yet."}{" "}
          {!deferredSearch && (
            <button
              type="button"
              className="text-primary font-semibold hover:underline"
              onClick={handleOpenCreate}
            >
              Create one
            </button>
          )}
        </p>
      ) : (
        <div className="space-y-1.5">
          {displayed.map((item) => (
            <MaterialItem
              key={item.id}
              item={item}
              onEdit={handleOpenEdit}
              onHistory={handleOpenHistory}
            />
          ))}
          {items.length > 5 && (
            <button
              type="button"
              className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1.5 transition-colors"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : `Show ${items.length - 5} more`}
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
            </button>
          )}
        </div>
      )}

      <MaterialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        material={editMaterial}
        onSaved={handleSaved}
      />

      <PriceHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        material={historyMaterial}
      />
    </div>
  );
}
