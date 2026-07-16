import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ThaiThesaurus } from "./thesaurus.js";
import { loadThesaurusData } from "./loader.js";

const dataPath = path.resolve(process.env.THESAURUS_DATA ?? "data/thesaurus.json");
const thesaurus = new ThaiThesaurus(await loadThesaurusData(dataPath));
const app = Fastify({ logger: true });

const configuredOrigins = (
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const allowAllOrigins = configuredOrigins.length === 0 || configuredOrigins.includes("*");
const allowedOrigins = new Set(configuredOrigins);

await app.register(cors, {
  origin: allowAllOrigins
    ? "*"
    : (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
      }
});
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute"
});

app.get("/health", async () => ({ ok: true }));
app.get<{ Querystring: { word?: string; pos?: string } }>(
  "/api/v1/suggestions",
  async (request, reply) => {
    const word = request.query.word?.trim();
    if (!word) return reply.code(400).send({ error: "word is required" });
    if (word.length > 100) {
      return reply.code(400).send({ error: "word must be 100 characters or fewer" });
    }
    const pos = request.query.pos?.trim();
    if (pos && pos.length > 20) {
      return reply.code(400).send({ error: "pos must be 20 characters or fewer" });
    }
    return { word, suggestions: thesaurus.suggest(word, pos) };
  }
);

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
