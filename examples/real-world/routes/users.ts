import { Router } from "express";
import { listUsers, getUser, createUser } from "../controllers/users.js";

const router = Router();

// Routes defined here will run in the "Express Lane"
// They are fully compatible but not optimized by Fastify
router.get("/", listUsers);
router.get("/:id", getUser);
router.post("/", createUser);

export default router;
