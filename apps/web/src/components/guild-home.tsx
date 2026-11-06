"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteIcon } from "./site-icon";
import { knowledgeArticles, articlePath } from "@/lib/knowledge";
import { XpBar } from "./xp-experience";

type Table = { id: string; title: string; description: string; system: string; levelRange: string; schedule: string; capacity: number; sessionStatus?: { activeSession: unknown; onlineCount: number } | null };
type Feed<T> = { kind: "loading" } | { kind: "error" } | { kind: "ready"; rows: T[] };

function useFeed<T>(path: string, version: number): Feed<T> {
  const [feed, setFeed] = useState<Feed<T>>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setFeed({ kind: "loading" });
    const timer = window.setTimeout(() => controller.abort(), 12000);
    void fetch(`/api/game-hub/${path}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Feed unavailable");
        const result = await response.json();
        if (!Array.isArray(result.data)) throw new Error("Invalid feed");
        if (current) setFeed({ kind: "ready", rows: result.data });
      }).catch(() => { if (current) setFeed({ kind: "error" }); })
      .finally(() => window.clearTimeout(timer));
    return () => { current = false; controller.abort(); window.clearTimeout(timer); };
  }, [path, version]);
  return feed;
}

function FeedState({ kind, empty, retry }: { kind: "loading" | "error" | "empty"; empty: string; retry: () => void }) {
  return <div className={`guild-feed-state ${kind}`} role="status">
    <SiteIcon name={kind === "error" ? "alert" : "scroll"} />
    <p>{kind === "loading" ? "در حال دریافت تازه‌ها…" : kind === "error" ? "دریافت اطلاعات فعلاً ممکن نیست." : empty}</p>
    {kind === "error" && <button type="button" onClick={retry}>تلاش دوباره</button>}
  </div>;
}

export function GuildHome() {
  const [tableVersion, retryTables] = useState(0);
  const tables = useFeed<Table>("tables", tableVersion);
  return <main className="guild-home">
    <div className="guild-xp"><XpBar /></div>
    <div className="guild-art" aria-hidden="true">
      <img className="guild-halo" src="/site-ui/halo.png" width="1254" height="1254" alt="" fetchPriority="high" />
      <img className="guild-die" src="/site-ui/die.png" width="1278" height="1230" alt="" fetchPriority="high" />
      <img className="guild-orb" src="/site-ui/orb.png" width="126" height="133" alt="" />
      <img className="guild-pedestal" src="/site-ui/pedestal.png" width="2172" height="724" alt="" />
    </div>
    <section className="guild-intro" aria-labelledby="home-heading">
      <div className="guild-title"><h1 id="home-heading">خانه</h1><img src="/site-ui/spark.png" alt="" width="40" height="35" /></div>
      <p className="guild-slogan">تاس سرنوشتت را تعیین می‌کند<span lang="en" dir="ltr">Dice Will Decide Your Fate</span></p>
      <div className="guild-intro-actions">
        <Link className="site-primary" href="/games"><SiteIcon name="person" />میز بازی</Link>
        <Link className="site-secondary" href="/learn"><SiteIcon name="play" />آشنایی با امکانات</Link>
      </div>
    </section>
    <section className="site-panel guild-community" aria-labelledby="community-heading">
      <header className="guild-panel-heading"><SiteIcon name="scroll"/><h2 id="community-heading">از دانشنامه بخوان</h2><img src="/site-ui/spark.png" alt="" width="30" height="28"/></header>
      <div className="guild-feed">{knowledgeArticles.slice(0,2).map(a=><Link className="guild-table" href={articlePath(a)} key={a.slug}><div className="guild-table-symbol"><SiteIcon name="scroll"/></div><div><small className="guild-table-meta">داستان و ماژول</small><h3>{a.title}</h3><p>{a.summary}</p></div><SiteIcon name="arrow"/></Link>)}</div>
      <Link className="guild-panel-action" href="/knowledge"><SiteIcon name="scroll"/>ورود به دانشنامه<SiteIcon name="arrow"/></Link>
    </section>
    <section className="site-panel guild-tables" aria-labelledby="tables-heading">
      <header className="guild-panel-heading"><SiteIcon name="die" /><h2 id="tables-heading">میزهای ماجراجویی</h2><img src="/site-ui/spark.png" alt="" width="30" height="28" /></header>
      <div className="guild-feed">
        {tables.kind !== "ready" ? <FeedState kind={tables.kind} empty="" retry={() => retryTables(v => v + 1)} /> : tables.rows.length === 0 ? <FeedState kind="empty" empty="هنوز میزی برای نمایش نیست. میز تازه‌ای بساز یا با کد دعوت به دوستانت بپیوند." retry={() => retryTables(v => v + 1)} /> : tables.rows.slice(0, 2).map(table => <Link className="guild-table" href={`/find-game/${encodeURIComponent(table.id)}`} key={table.id}>
          <div className="guild-table-symbol"><SiteIcon name="die" /></div><div><small className={table.sessionStatus?.activeSession ? "guild-live" : "guild-table-meta"}>{table.sessionStatus?.activeSession ? "در حال برگزاری" : table.system}</small><h3>{table.title}</h3><p>{[table.schedule, table.levelRange].filter(Boolean).join(" · ") || table.description}</p><small className="guild-table-meta">ظرفیت {table.capacity.toLocaleString("fa-IR")} نفر</small></div><SiteIcon name="arrow" />
        </Link>)}
      </div>
      <div className="guild-table-actions"><Link href="/find-game">همهٔ میزها</Link><Link href="/create-game">ساخت میز</Link><Link href="/find-game#join">کد دعوت</Link></div>
    </section>
  </main>;
}
