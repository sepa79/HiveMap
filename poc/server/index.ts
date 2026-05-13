import express, { ErrorRequestHandler } from "express";
import { appendFeedback, readFeedback, readGraph, readView, saveEdge, saveNode, saveViewNode } from "./graph-store";

const app = express();
const port = 8787;

app.use(express.json({ limit: "256kb" }));

app.get("/api/graph", async (_request, response, next) => {
  try {
    response.json({ graph: await readGraph(), view: await readView() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/nodes", async (request, response, next) => {
  try {
    response.json({ graph: await saveNode(request.body) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/edges", async (request, response, next) => {
  try {
    response.json({ graph: await saveEdge(request.body) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/view/nodes", async (request, response, next) => {
  try {
    response.json({ view: await saveViewNode(request.body) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/feedback", async (request, response, next) => {
  try {
    response.status(201).json({ event: await appendFeedback(request.body) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/feedback", async (request, response, next) => {
  try {
    const rawLimit = request.query.limit;
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Feedback limit must be an integer from 1 to 500.");
    }
    response.json({ events: await readFeedback(limit) });
  } catch (error) {
    next(error);
  }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  response.status(400).json({ error: (error as Error).message });
};

app.use(errorHandler);

app.listen(port, () => {
  console.log(`HiveMap POC API listening on http://localhost:${port}`);
});
