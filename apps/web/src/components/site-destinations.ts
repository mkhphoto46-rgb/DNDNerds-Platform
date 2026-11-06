export const siteDestinations = [
  { href: "/", label: "خانه", icon: "home", paths: ["/"], status: "" },
  { href: "/knowledge", label: "دانشنامه", icon: "scroll", paths: ["/knowledge", "/news"], status: "" },
  { href: "/games", label: "میز بازی", icon: "die", paths: ["/games", "/find-dm", "/dm", "/player", "/play", "/find-game", "/create-game", "/account/games", "/account/find-game", "/account/create-game"], status: "" },
  { href: "/store", label: "بازارچه", icon: "store", paths: ["/store", "/cart", "/checkout", "/orders", "/seller", "/payment"], status: "" },
  { href: "/arena", label: "آرنا", icon: "combat", paths: ["/arena"], status: "در آینده" },
  { href: "/cartography", label: "نقشه‌ساز", icon: "map", paths: ["/cartography"], status: "در آینده" },
] as const;

export function activeSiteDestination(pathname: string) {
  return siteDestinations.find(item => item.paths.some(path => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`))))?.href;
}
