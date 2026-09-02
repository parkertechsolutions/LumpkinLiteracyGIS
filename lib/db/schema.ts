import {
  pgTable,
  text,
  integer,
  boolean,
  date,
  doublePrecision,
  numeric,
  timestamp,
  jsonb,
  bigserial,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Program and location data. Safe for Staff. No DROP/HOLD field from
// DATA_DICTIONARY.md may be added here without updating that document first.
export const registrants = pgTable("registrants", {
  childId: text("child_id").primaryKey(),
  programPartner: text("program_partner"),
  lppGroup: text("lpp_group"),
  registrationType: text("registration_type"),
  registrationDate: date("registration_date"),
  welcomeBook: boolean("welcome_book"),
  graduated: boolean("graduated"),
  // Stored as text: the source AGE GROUP column is an integer code (0-6)
  // whose meaning the client hasn't confirmed yet. Storing raw rather than
  // guessing a mapping. See DATA_DICTIONARY.md follow-up.
  ageGroup: text("age_group"),
  monthsRegistered: integer("months_registered"),
  projectedGraduation: date("projected_graduation"),
  monthsToGraduation: integer("months_to_graduation"),
  bookLanguage: text("book_language"),
  city: text("city"),
  county: text("county"),
  state: text("state"),
  zipcode: text("zipcode"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  geocodeAccuracy: numeric("geocode_accuracy", { mode: "number" }),
  geocodeAccuracyType: text("geocode_accuracy_type"),
  addressChangedAt: date("address_changed_at"),
  geocodeStale: boolean("geocode_stale"),
  blockGroupGeoid: text("block_group_geoid"),
});

// Separate table so no ordinary query can accidentally select identity
// fields. Admin reveal only.
export const registrantIdentity = pgTable("registrant_identity", {
  childId: text("child_id")
    .primaryKey()
    .references(() => registrants.childId),
  firstName: text("first_name"),
  lastName: text("last_name"),
  middleInitial: text("middle_initial"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  zipcodePlus4: text("zipcode_plus4"),
});

// ---------------------------------------------------------------------------
// Auth.js (next-auth v5) + @auth/drizzle-adapter's required schema, for the
// email-magic-link sign-in flow. `role` is our own addition: assigned
// manually per user (direct DB update, no self-service UI) per PRD §5 — a
// null role resolves to no access, never a default, per FR-3.
// ---------------------------------------------------------------------------
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role"), // 'viewer' | 'staff' | 'admin' | null — validated in code, not the DB
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// Append-only. No update/delete grants for the application role.
export const accessLog = pgTable("access_log", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  action: text("action").notNull(), // 'sign_in' | 'reveal_identity' | 'filter_query'
  childId: text("child_id"),
  detail: jsonb("detail"),
});
