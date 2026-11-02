const icons: Record<string, string> = {
  home: "icon-home.png", die: "icon-die.png", friends: "icon-friends.png",
  store: "icon-store.png", combat: "icon-combat.png", map: "icon-map.png",
  menu: "icon-menu.png", chat: "icon-chat.png", alert: "icon-alert.png",
  person: "icon-person.png", play: "icon-play.png", arrow: "icon-arrow.png", scroll: "icon-scroll.png",
};
export function SiteIcon({ name, className = "" }: { name: string; className?: string }) {
  return <img className={`site-icon ${className}`} src={`/site-ui/${icons[name] ?? icons.die}`} alt="" width="32" height="32" aria-hidden="true" />;
}
