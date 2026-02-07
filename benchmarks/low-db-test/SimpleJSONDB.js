import { readFileSync, writeFileSync } from "node:fs";

export class SimpleJSONDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = [];
    // Init file if not exists
    try {
      this.read();
    } catch {
      this.write();
    }
  }

  read() {
    this.data = JSON.parse(readFileSync(this.filePath, "utf-8"));
    return this.data;
  }

  write() {
    writeFileSync(this.filePath, JSON.stringify(this.data));
  }

  push(item) {
    this.read();
    this.data.push(item);
    this.write();
  }
}
