/** Public client configuration only. Never put credentials or AI API keys here. */
export const environment = {
  appName: 'myAvailable',
  storageVersion: 1,
  maxStatementBytes: 25 * 1024 * 1024, // a year of bank statements can be large
  maxStatements: 24,
  analysisEnabled: true,
  analysisMode: 'local',
  maxPdfPages: 400, // roughly 12 months of a busy account
} as const;
