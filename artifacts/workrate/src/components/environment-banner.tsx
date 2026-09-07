import { useEffect, useState } from "react";
import { Alert, AlertTitle } from "@workspace/memphis-bold/components/ui/alert";
import {
  fetchRuntimeConfig,
  type RuntimeConfig,
} from "@/lib/runtime-config";

const environmentMessage = {
  development: "DEVELOPMENT — TEST DATA ONLY",
  staging: "STAGING — NOT CUSTOMER DATA",
} as const;

/**
 * An intentionally non-dismissible warning on authenticated screens.
 * The environment comes only from the same-origin runtime configuration API.
 */
export function EnvironmentBanner() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);

  useEffect(() => {
    let active = true;

    void fetchRuntimeConfig()
      .then((nextConfig) => {
        if (active) setConfig(nextConfig);
      })
      .catch(() => {
        // Never guess an environment when the authoritative endpoint is unavailable.
        if (active) setConfig(null);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!config || config.environment === "production") return null;

  return (
    <Alert
      role="status"
      className="fixed inset-x-0 top-0 z-[9999] border-2 border-border bg-accent px-4 py-2 text-center text-accent-foreground shadow-md"
    >
      <AlertTitle className="m-0 font-mono text-xs font-bold tracking-widest">
        {environmentMessage[config.environment]}
      </AlertTitle>
    </Alert>
  );
}