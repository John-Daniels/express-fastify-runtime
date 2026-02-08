import { Router } from "express";
import userRouter from "./users.route";
const router = Router();

router.use("/users", userRouter);

export default router;
