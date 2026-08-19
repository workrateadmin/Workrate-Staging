/**
 * Invoice Template Editor
 *
 * Allows the user to review and adjust AI-detected blocks from an imported
 * invoice before saving the layout as their "imported" document template.
 *
 * Blocks arrive via sessionStorage ("importedBlocks") from the settings import
 * flow, or are loaded from company.importedInvoiceTemplate for editing an
 * existing template.
 *
 * Layout: A4 canvas (drag+resize via react-rnd) + block controls side panel.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Rnd } from "react-rnd";
import { useGetCompany, useUpdateCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Save, Trash2, MousePointer2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TemplateBlock, FieldMapping,
  FIELD_MAPPING_LABELS, FIELD_MAPPING_COLOURS,
  parseImportedInvoiceTemplate,
} from "@/types/template-blocks";

// ── A4 canvas dimensions in the editor (px) ─────────────────────────────────
const CANVAS_W = 620;
const CANVAS_H = Math.round(CANVAS_W * (1123 / 794)); // ≈ 877

// ── Block controls side panel ────────────────────────────────────────────────

function BlockControls({
  block,
  onUpdate,
  onDelete,
}: {
  block: TemplateBlock;
  onUpdate: (patch: Partial<TemplateBlock>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Block
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete block"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Type badge */}
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white"
        style={{ background: FIELD_MAPPING_COLOURS[block.fieldMapping] }}
      >
        {block.type}
      </div>

      {/* Field mapping */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-muted-foreground">WorkRate Field</label>
        <Select
          value={block.fieldMapping}
          onValueChange={(v) => onUpdate({ fieldMapping: v as FieldMapping })}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(FIELD_MAPPING_LABELS) as [FieldMapping, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value} className="text-xs">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ background: FIELD_MAPPING_COLOURS[value] }}
                  />
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Static content editor */}
      {block.fieldMapping === "static" && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground">Static Text</label>
          <Textarea
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            className="text-xs resize-none"
            rows={3}
            placeholder="Text that never changes…"
          />
        </div>
      )}

      {/* Font size */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-muted-foreground">Font Size (pt)</label>
        <Input
          type="number"
          min={6}
          max={72}
          step={1}
          value={block.fontSize ?? 10}
          onChange={(e) =>
            onUpdate({ fontSize: Math.max(6, Math.min(72, Number(e.target.value))) })
          }
          className="h-8 text-xs"
        />
      </div>

      {/* Font weight */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-muted-foreground">Weight</label>
        <div className="flex gap-2">
          {(["normal", "bold"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onUpdate({ fontWeight: w })}
              className={cn(
                "flex-1 h-8 rounded-lg text-xs font-medium border transition-colors capitalize",
                block.fontWeight === w
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 hover:border-primary/50 text-foreground"
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Text alignment */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-muted-foreground">Alignment</label>
        <div className="flex gap-2">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onUpdate({ textAlign: a })}
              className={cn(
                "flex-1 h-8 rounded-lg text-sm border transition-colors",
                block.textAlign === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 hover:border-primary/50 text-foreground"
              )}
            >
              {a === "left" ? "←" : a === "center" ? "↔" : "→"}
            </button>
          ))}
        </div>
      </div>

      {/* Position/size readout */}
      <div className="pt-4 border-t space-y-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Position &amp; Size
        </p>
        <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
          x: {block.x.toFixed(1)}%&nbsp;&nbsp;y: {block.y.toFixed(1)}%<br />
          w: {block.w.toFixed(1)}%&nbsp;&nbsp;h: {block.h.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export default function InvoiceTemplateEditor() {
  const [, navigate] = useLocation();
  const { data: company } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(["/api/company"], data);
      },
    },
  });

  // ── Block state ─────────────────────────────────────────────────────────────
  // Prefer fresh blocks from sessionStorage (new import), then fall back to
  // company.importedInvoiceTemplate (editing existing template).
  const [pendingTemplate] = useState(() => {
    const stored = sessionStorage.getItem("importedBlocks");
    if (stored) {
      try {
        const parsed = parseImportedInvoiceTemplate(stored);
        sessionStorage.removeItem("importedBlocks");
        return parsed;
      } catch {
        sessionStorage.removeItem("importedBlocks");
      }
    }
    return { blocks: [] };
  });
  const [blocks, setBlocks] = useState<TemplateBlock[]>(() => pendingTemplate.blocks);
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(
    () => pendingTemplate.backgroundUrl,
  );

  // Once company loads, populate blocks if sessionStorage was empty
  useEffect(() => {
    if (blocks.length === 0 && company) {
      const raw = (company as any).importedInvoiceTemplate;
      const savedTemplate = parseImportedInvoiceTemplate(raw);
      setBlocks(savedTemplate.blocks);
      setBackgroundUrl(savedTemplate.backgroundUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  const updateBlock = useCallback((id: string, patch: Partial<TemplateBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  }, []);

  const deleteBlock = useCallback(
    (id: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  function addBlock() {
    const nb: TemplateBlock = {
      id: `block_${Date.now()}`,
      type: "text",
      x: 5,
      y: 5,
      w: 30,
      h: 5,
      content: "New text block",
      fieldMapping: "static",
      fontSize: 10,
      fontWeight: "normal",
      textAlign: "left",
    };
    setBlocks((prev) => [...prev, nb]);
    setSelectedId(nb.id);
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    try {
      await updateCompany.mutateAsync({
        data: {
          documentMode: "imported",
          importedInvoiceTemplate: JSON.stringify({ blocks, backgroundUrl }),
        } as any,
      });
      toast({ title: "Invoice template saved" });
      navigate("/settings");
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-0px)]" style={{ minHeight: 0 }}>
      {/* ── Header bar ───────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-4 py-3 flex flex-wrap items-center gap-3 shrink-0">
        <Link
          to="/settings"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="order-3 basis-full sm:order-none sm:basis-auto sm:flex-1 text-center">
          <span className="font-black text-base">Invoice Template Editor</span>
          <span className="text-xs text-muted-foreground ml-3 font-medium">
            Drag to reposition · Resize from corners · Click to edit mapping
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBlock}
            className="font-bold text-xs rounded-xl"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Block
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={updateCompany.isPending || blocks.length === 0}
            className="font-bold rounded-xl"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {updateCompany.isPending ? "Saving…" : "Save Template"}
          </Button>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-auto lg:overflow-hidden">
        {/* Canvas area */}
        <div
            className="flex-1 min-h-[56vh] lg:min-h-0 overflow-auto bg-slate-100 p-4 sm:p-8 flex justify-center items-start"
          onClick={() => setSelectedId(null)}
        >
          <div
            style={{
              position: "relative",
              width: CANVAS_W,
              height: CANVAS_H,
              background: "white",
              boxShadow:
                "0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.10)",
              flexShrink: 0,
            }}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          >
            {backgroundUrl && (
              <img
                src={backgroundUrl}
                alt="Imported invoice artwork"
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            )}
            {/* Empty state */}
            {blocks.length === 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#94a3b8",
                  gap: 12,
                }}
              >
                <MousePointer2 className="w-8 h-8" style={{ color: "#cbd5e1" }} />
                <p style={{ fontSize: 13 }}>No blocks yet</p>
                <p style={{ fontSize: 11 }}>
                  Go back and import an invoice, or add a block manually.
                </p>
              </div>
            )}

            {/* Blocks */}
            {blocks.map((block) => {
              const isSelected = selectedId === block.id;
              const colour = FIELD_MAPPING_COLOURS[block.fieldMapping];

              return (
                <Rnd
                  key={block.id}
                  bounds="parent"
                  position={{
                    x: (block.x / 100) * CANVAS_W,
                    y: (block.y / 100) * CANVAS_H,
                  }}
                  size={{
                    width: (block.w / 100) * CANVAS_W,
                    height: (block.h / 100) * CANVAS_H,
                  }}
                  minWidth={24}
                  minHeight={14}
                  style={{
                    border: isSelected
                      ? "2px solid #3b82f6"
                      : `1.5px dashed ${colour}70`,
                    background: isSelected
                      ? "rgba(59,130,246,0.06)"
                      : `${colour}12`,
                    borderRadius: 2,
                    zIndex: isSelected ? 20 : 1,
                    boxSizing: "border-box",
                  }}
                  onDragStop={(_, d) => {
                    updateBlock(block.id, {
                      x: Math.max(
                        0,
                        Math.min(100 - block.w, (d.x / CANVAS_W) * 100)
                      ),
                      y: Math.max(
                        0,
                        Math.min(100 - block.h, (d.y / CANVAS_H) * 100)
                      ),
                    });
                  }}
                  onResizeStop={(_, __, ref, ___, pos) => {
                    updateBlock(block.id, {
                      x: Math.max(0, (pos.x / CANVAS_W) * 100),
                      y: Math.max(0, (pos.y / CANVAS_H) * 100),
                      w: Math.min(
                        100,
                        (parseFloat(ref.style.width) / CANVAS_W) * 100
                      ),
                      h: Math.min(
                        100,
                        (parseFloat(ref.style.height) / CANVAS_H) * 100
                      ),
                    });
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setSelectedId(block.id);
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      overflow: "hidden",
                      padding: "2px 4px",
                      userSelect: "none",
                      cursor: "move",
                    }}
                  >
                    {/* Field type label */}
                    <div
                      style={{
                        fontSize: 7,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: colour,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {FIELD_MAPPING_LABELS[block.fieldMapping]}
                    </div>
                    {/* Content preview */}
                    {block.type !== "image" && (
                      <div
                        style={{
                          fontSize: 8,
                          color: "#334155",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                          marginTop: 1,
                        }}
                      >
                        {block.content.slice(0, 80)}
                      </div>
                    )}
                  </div>
                </Rnd>
              );
            })}
          </div>
        </div>

        {/* ── Controls panel ────────────────────────────────────────────────── */}
        <div className="w-full lg:w-72 max-h-[60vh] lg:max-h-none border-t lg:border-t-0 lg:border-l bg-white overflow-y-auto shrink-0">
          {selectedBlock ? (
            <BlockControls
              block={selectedBlock}
              onUpdate={(patch) => updateBlock(selectedBlock.id, patch)}
              onDelete={() => deleteBlock(selectedBlock.id)}
            />
          ) : (
            <div className="p-6 text-center mt-16">
              <MousePointer2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">
                Click a block to edit its WorkRate field mapping
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {blocks.length} block{blocks.length !== 1 ? "s" : ""} on canvas
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
