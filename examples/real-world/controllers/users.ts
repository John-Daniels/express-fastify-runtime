import type { Request, Response } from "express";

interface User {
  id: number;
  name: string;
  role: string;
}

const db: User[] = [
  { id: 1, name: "Alice", role: "admin" },
  { id: 2, name: "Bob", role: "user" },
  { id: 3, name: "Charlie", role: "user" },
];

export const listUsers = (req: Request, res: Response) => {
  res.json(db);
};

export const getUser = (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = db.find((u) => u.id === id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
};

export const createUser = (req: Request, res: Response) => {
  const { name, role } = req.body;
  const newUser = { id: db.length + 1, name, role };
  db.push(newUser);
  res.status(201).json(newUser);
};
