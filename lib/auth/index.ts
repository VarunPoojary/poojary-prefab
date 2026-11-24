import { MockAuthService } from "./mock-service";
import type { AuthService } from "./service";

/*
 * The one place that decides how users sign in.
 * To switch to the cloud database:
 *   import { ApiAuthService } from "./api-service";
 *   export const authService: AuthService = new ApiAuthService("/api");
 */
export const authService: AuthService = new MockAuthService();

export * from "./types";
export type { AuthService } from "./service";
