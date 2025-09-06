export function mountPingRoutes(router, { path = "/api/ping" } = {}) {
  router.post(path, async () => {
    const now = new Date();
    return {
      status: 200,
      json: { message: "pong!", serverTime: now.toISOString() }
    };
  });
}