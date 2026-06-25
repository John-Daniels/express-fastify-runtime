import morgan from "morgan";
import { createApp } from "../../../src/index";
import router from "./router";

const app = createApp();

// router.use(morgan("combined"));
app.use("/api", router);

app.listen(9000, () => {
  console.log("Server is running on port 9000");
});
