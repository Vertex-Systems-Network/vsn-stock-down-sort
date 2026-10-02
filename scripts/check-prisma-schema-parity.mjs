import fs from "node:fs";

const localPath = "prisma/schema.prisma";
const cloudPath = "prisma/cloud/schema.prisma";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function modelMap(source) {
  const models = new Map();
  const pattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const normalized = match[2]
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .join("\n");
    models.set(name, normalized);
  }

  return models;
}

const local = modelMap(read(localPath));
const cloud = modelMap(read(cloudPath));
const localNames = [...local.keys()].sort();
const cloudNames = [...cloud.keys()].sort();

if (JSON.stringify(localNames) !== JSON.stringify(cloudNames)) {
  throw new Error(
    `Prisma model set drift: local=${localNames.join(",")} cloud=${cloudNames.join(",")}`,
  );
}

for (const name of localNames) {
  if (local.get(name) !== cloud.get(name)) {
    throw new Error(
      `Prisma model drift for ${name}. Shared model fields, relations and indexes must match between Local SQLite and cloud PostgreSQL.`,
    );
  }
}

console.log(
  `[prisma-parity] passed models=${localNames.join(",")} local=sqlite cloud=postgresql`,
);
