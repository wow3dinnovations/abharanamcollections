export type { Database, Json } from "./database.types";
import type { Database } from "./database.types";

type PublicSchema = Database["public"];
type Rows = { [K in keyof PublicSchema["Tables"]]: PublicSchema["Tables"][K]["Row"] } & {
  [K in keyof PublicSchema["Views"]]: PublicSchema["Views"][K]["Row"];
};
/** A row of a table or view, e.g. Tables<"products"> or Tables<"catalog">. */
export type Tables<T extends keyof Rows> = Rows[T];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
