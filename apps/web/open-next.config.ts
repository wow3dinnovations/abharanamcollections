import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Runs the website on Cloudflare Workers (free plan). Pages are rendered per request
// because they read the logged-in customer and live stock, so no extra cache is needed.
export default defineCloudflareConfig();
