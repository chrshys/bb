export function createElectronBuilderEnv(
  signingPlan: {
    mode: "environment" | "keychain" | "disabled";
    identityName: string | undefined;
    notarizationEnabled: boolean;
  },
  env?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
