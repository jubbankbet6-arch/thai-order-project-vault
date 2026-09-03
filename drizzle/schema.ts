import {
  boolean,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** A logical workspace such as the Thai Order Product Parser project. */
export const vaultProjects = mysqlTable(
  "vault_projects",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 80 }).default("project").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerIdx: index("vault_projects_owner_idx").on(table.ownerId),
    slugOwnerUnique: uniqueIndex("vault_projects_owner_slug_unique").on(table.ownerId, table.slug),
  }),
);

/** Source files, SQL scripts, workflow JSON, and project documentation. */
export const vaultFiles = mysqlTable(
  "vault_files",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    ownerId: int("ownerId").notNull(),
    path: varchar("path", { length: 255 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    language: varchar("language", { length: 40 }).default("text").notNull(),
    kind: mysqlEnum("kind", ["code", "sql", "workflow", "document", "config", "other"])
      .default("other")
      .notNull(),
    content: longtext("content").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    sizeBytes: int("sizeBytes").default(0).notNull(),
    isFavorite: boolean("isFavorite").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    projectIdx: index("vault_files_project_idx").on(table.projectId, table.updatedAt),
    ownerIdx: index("vault_files_owner_idx").on(table.ownerId),
    projectPathUnique: uniqueIndex("vault_files_project_path_unique").on(table.projectId, table.path),
  }),
);

/** Immutable snapshots created when a file is edited. */
export const vaultRevisions = mysqlTable(
  "vault_revisions",
  {
    id: int("id").autoincrement().primaryKey(),
    fileId: int("fileId").notNull(),
    projectId: int("projectId").notNull(),
    ownerId: int("ownerId").notNull(),
    content: longtext("content").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    sizeBytes: int("sizeBytes").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    fileIdx: index("vault_revisions_file_idx").on(table.fileId, table.createdAt),
    ownerIdx: index("vault_revisions_owner_idx").on(table.ownerId),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VaultProject = typeof vaultProjects.$inferSelect;
export type VaultFile = typeof vaultFiles.$inferSelect;
export type VaultRevision = typeof vaultRevisions.$inferSelect;
