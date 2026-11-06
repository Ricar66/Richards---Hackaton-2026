export const DEMO_ORG_ID = "richards-demo-org";
export const DEMO_SITE_ID = "richards-demo-site";
export const DEMO_DEVICE_ID = "richards-flow-01";
export const DEMO_RECIPIENT_ID = "richards-demo-receptor";
/** Instituições fictícias que o seed de demonstração cria (só com SEED_DEMO_DATA="true"); a limpeza remove estas. */
export const DEMO_RECIPIENT_IDS = [DEMO_RECIPIENT_ID, "richards-demo-receptor-2"] as const;
export const isDemo = process.env.DEMO_MODE === "true";
