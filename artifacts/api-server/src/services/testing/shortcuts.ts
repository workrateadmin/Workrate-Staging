type TestShortcutEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "NODE_ENV" | "WORKRATE_ENV" | "WORKRATE_ENABLE_TEST_SHORTCUTS">
>;

export function areTestShortcutsEnabled(env: TestShortcutEnvironment = process.env): boolean {
  const workrateEnvironment = env.WORKRATE_ENV?.trim().toLowerCase();

  if (workrateEnvironment === "production") return false;
  if (workrateEnvironment === "staging") {
    return env.WORKRATE_ENABLE_TEST_SHORTCUTS === "true";
  }
  if (workrateEnvironment === "development") {
    return env.WORKRATE_ENABLE_TEST_SHORTCUTS !== "false";
  }

  if (env.NODE_ENV === "production") return false;
  if (env.NODE_ENV === "development") {
    return env.WORKRATE_ENABLE_TEST_SHORTCUTS !== "false";
  }

  return false;
}