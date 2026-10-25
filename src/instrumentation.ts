/**
 * Next.js server startup hook: begins schema discovery and the background workers as
 * soon as the Node.js server boots, instead of waiting for the first API request.
 */
export async function register(): Promise<void> {
  // This exact condition lets Next.js drop the Node-only import from the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAppInitialized } = await import("./server/bootstrap");
    ensureAppInitialized().catch((err: unknown) => {
      console.error("LeadGen AI Platform failed to initialize; retrying on the next request.", err);
    });
  }
}
