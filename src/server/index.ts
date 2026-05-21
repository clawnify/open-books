import { Hono } from "hono";
import { initDB } from "./db";
import { initUploads } from "./uploads";
import api from "./routes";

type Env = { Bindings: { DB: D1Database; UPLOADS: R2Bucket } };

const app = new Hono<Env>();

app.use("*", async (c, next) => {
  initDB(c.env);
  initUploads(c.env.UPLOADS);
  await next();
});

app.route("/", api);

export default app;
