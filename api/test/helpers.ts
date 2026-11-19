import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();
export const api = () => request(app);
