"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { profileRequest } from "@/lib/profile-pages";
import styles from "@/components/profile-pages.module.css";

type PlayerPage = { player: { id: string; name: string }; characters: { id: string; name: string; className: string; subclass: string; race: string; background: string; level: number; currentHp: number; maxHp: number; description: string; story: string; portraitData: string | null }[] };

export default function PlayerPublicPage({ userId }: { userId: string }) {
  const [page, setPage] = useState<PlayerPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void profileRequest<PlayerPage>(`players/${encodeURIComponent(userId)}/page`).then(setPage).catch(reason => setError(reason.message)); }, [userId]);
  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.actions}><Link href="/find-game">پیدا کردن بازی ←</Link><Link href="/account/characters">کاراکترهای من ←</Link></div>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {!page && !error && <p role="status">در حال بارگذاری صفحهٔ پلیر…</p>}
    {page && <><header className={styles.hero}><p>صفحهٔ بازیکن</p><h1>{page.player.name}</h1><p>نمای کلی کاراکترها و داستان‌های این بازیکن</p></header>
      <div className={styles.grid}>{page.characters.map(character => <article className={styles.card} key={character.id}>
        {character.portraitData && <img className={styles.portrait} src={character.portraitData} alt={`پرترهٔ ${character.name}`} />}
        <h2>{character.name}</h2><div className={styles.tags}><span>سطح {character.level}</span><span>HP {character.currentHp}/{character.maxHp}</span><span>{character.className || "کلاس نامشخص"}</span>{character.subclass && <span>{character.subclass}</span>}{character.race && <span>{character.race}</span>}{character.background && <span>{character.background}</span>}</div>
        {character.description && <p>{character.description}</p>}{character.story && <><h3>داستان کاراکتر</h3><p>{character.story}</p></>}
      </article>)}</div>{!page.characters.length && <section className={styles.card}><p>هنوز کاراکتر عمومی در این صفحه ثبت نشده است.</p></section>}
    </>}
  </div></main>;
}
