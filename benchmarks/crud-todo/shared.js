export const todos = []; // In-memory store

export const validateTodo = (req, res, next) => {
  const { title } = req.body;
  if (!title || typeof title !== "string" || title.length < 3) {
    return res.status(400).json({ error: "Invalid title" });
  }
  next();
};

export const errorHandler = (err, req, res, next) => {
  res.status(500).json({ error: err.message });
};
