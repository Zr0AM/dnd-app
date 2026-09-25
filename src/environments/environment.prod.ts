export const environment = {
  production: true,
  // Production always talks to the real /api/items Worker.
  useMockApi: false,
  envConfig: {} as Record<string, unknown>,
};
