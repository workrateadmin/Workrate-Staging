import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { mkdirSync } from "fs";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { logger } from "./lib/logger";
import router from "./routes";

// Ensure uploads dir exists
const uploadsDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

const app = express();

// Never trust arbitrary forwarded headers. Deployments that need the originating
// client IP (notably HMRC fraud-prevention headers) must declare the CIDRs for
// their controlled proxy chain. Loopback remains enough for local proxying.
const trustedProxyCidrs = (process.env.HMRC_TRUSTED_PROXY_CIDRS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
app.set("trust proxy", trustedProxyCidrs.length ? trustedProxyCidrs : "loopback");

const allowedCorsOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    // Same-origin calls do not need CORS. Cross-origin credentialed requests
    // must be explicitly allow-listed by deployment configuration.
    callback(null, Boolean(origin && allowedCorsOrigins.has(origin)));
  },
}));
// Capture the raw request body before JSON parsing so webhook routes can
// verify HMAC-SHA256 signatures (e.g. Meta WhatsApp, Stripe, etc.).
app.use(express.json({
  limit: "10mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Serve uploaded photos
app.use("/uploads", express.static(uploadsDir));

app.use("/api", router);

export default app;
