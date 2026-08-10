/**
 * DevBanner — visible only when Vite is running in development mode.
 * Completely absent from production builds (tree-shaken away by Vite).
 */
export function DevBanner() {
  if (!import.meta.env.DEV) return null;

  return (
    <div
      role="status"
      aria-label="Development mode active"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(90deg, #ea580c, #dc2626)",
        color: "#fff",
        textAlign: "center",
        fontSize: "11px",
        fontWeight: 800,
        letterSpacing: "0.12em",
        padding: "5px 0",
        textTransform: "uppercase",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      ⚠ DEV MODE — Not production · API: {window.location.origin}
    </div>
  );
}
