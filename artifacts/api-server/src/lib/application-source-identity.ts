declare const __WORKRATE_APPLICATION_SOURCE_ID__: string;

export function getEmbeddedApplicationSourceId(): string | null {
  if (typeof __WORKRATE_APPLICATION_SOURCE_ID__ === "undefined") return null;
  return __WORKRATE_APPLICATION_SOURCE_ID__;
}