import { readFileSync } from "node:fs";
import { join } from "node:path";
export type SupportDetails = { name: string; account: string; iban: string };
// A separate public config file avoids changing the application's secret environment.
export function getSupportDetails(): SupportDetails {
 let config: Record<string,unknown> = {};
 try { const parsed:unknown=JSON.parse(readFileSync(join(process.cwd(),"support-public.json"),"utf8")); if(parsed && typeof parsed==="object" && !Array.isArray(parsed)) config=parsed as Record<string,unknown>; } catch { /* Local previews can supply these public values through the environment. */ }
 const value=(key:string) => typeof config[key]==="string" ? (config[key] as string).trim() : process.env[key]?.trim() ?? "";
 return { name:value("SUPPORT_RECIPIENT_NAME"),account:value("SUPPORT_ACCOUNT_NUMBER"),iban:value("SUPPORT_IBAN") };
}
