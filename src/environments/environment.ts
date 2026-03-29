export const environment = {
  production: false,
  envConfig: {} as any
};

// Attempt to load it asynchronously
try {
  // @ts-ignore
  import('./env-config.local').then(localEnv => {
    environment.envConfig = localEnv.envConfig;
  }).catch(() => { /* File not found, ignore */
  });
} catch (e) {
}
