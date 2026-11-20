/**
 * Shared helpers for the integration tests.
 */
import request from "supertest";
import { createApp } from "../src/app.js";

/** One app instance shared by all tests in a file. */
export const app = createApp();
/** Start a request against the app, e.g. `api().get("/health")`. No real port is opened. */
export const api = () => request(app);
