export function canAccessOwnerDiagnostics(input: {
  authenticatedUserId: string | null | undefined;
  tenantOwnerUserId: string | null | undefined;
  isPlatformAdmin: boolean;
}): boolean {
  if (!input.authenticatedUserId) return false;
  return input.isPlatformAdmin || input.authenticatedUserId === input.tenantOwnerUserId;
}