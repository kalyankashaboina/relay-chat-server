import { createExpressApp } from "./modules/http/express";
import authRoutes from "./modules/auth/auth.routes";
import conversationRoutes from "./modules/conversations/conversation.routes";
import userRoutes from "./modules/users/user.routes";
import messageRoutes from "./modules/messages/message.routes";
import { notFound } from "./shared/middleware/notFound";
import { errorHandler } from "./shared/middleware/errorHandler";


const app = createExpressApp();

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);

app.use("/api/users", userRoutes);
app.use("/api", messageRoutes);

app.use(notFound);

// global error handler (LAST)
app.use(errorHandler)

export { app };
