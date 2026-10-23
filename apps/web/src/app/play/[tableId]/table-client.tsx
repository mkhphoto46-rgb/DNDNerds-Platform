"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "../../account/account.module.css";
import play from "../play.module.css";
import { gameApi } from "../play-client";

type Member = { userId: string; role: string; displayName: string };
type Instance = { id: string; name: string; baseUrl: string };
type Table = {
  id: string; name: string; edition: string; role: string; joinCode: string | null; maxPlayers: number; allowObserver: boolean;
  firstLaunchedAt: string | null; vttInstance: Instance | null; members: Member[];
};

const ROLE_LABEL: Record<string, string> = { dm: "DM", player: "Player", observer: "Observer" };

/** Roadmap phase 10: one table, its seats and, for the DM, invitations and the VTT to launch into. */
export function TableClient({ tableId }: { tableId: string }) {
  const [table, setTable] = useState<Table | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [message, setMessage] = useState("")
  const [friendCode, setFriendCode] = useState("")
  const [inviteRole, setInviteRole] = useState("player")
  const [instanceName, setInstanceName] = useState("")
  const [instanceUrl, setInstanceUrl] = useState("")
  const [launching, setLaunching] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const details = await gameApi<Table>(`tables/${tableId}`)
      setTable(details)
      if (details.role === "dm") {
        setInstances(await gameApi<Instance[]>("vtt-instances"))
        const keys = await gameApi<{ keys: Array<{ publicKeyPem: string }> }>("platform/launch-keys").catch(() => null)
        setPublicKey(keys?.keys[0]?.publicKeyPem ?? null)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "میز پیدا نشد.")
    }
  }, [tableId])
  useEffect(() => { void refresh() }, [refresh])

  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work()
      setMessage(done)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "درخواست ناموفق بود.")
    }
  }

  // B3: the Platform signs a short-lived ticket and the browser carries it to the VTT after "#".
  const enter = async () => {
    setLaunching(true)
    try {
      const launch = await gameApi<{ url: string }>(`tables/${tableId}/launch`, { method: "POST", body: "{}" })
      window.location.assign(launch.url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ورود به میز ناموفق بود.")
      setLaunching(false)
    }
  }

  if (!table) {
    return (
      <main className={styles.page}><div className={styles.shell}>
        <section className={styles.notice} role="status"><p>{message || "در حال بارگذاری…"}</p><Link className={styles.textLink} href="/play">بازگشت به میزها</Link></section>
      </div></main>
    )
  }
  const isDm = table.role === "dm"
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.eyebrow}>D&D NERDS · TABLE · D&D {table.edition === "mixed" ? "2014/2024" : table.edition}</div>
          <h1>{table.name}</h1>
          <p><Link className={styles.textLink} href="/play">میزهای من</Link></p>
        </header>
        <div className={styles.content}>
          {message ? <p className={play.status} role="status">{message}</p> : null}
          <section className={styles.panel} aria-labelledby="enter-heading">
            <h2 id="enter-heading">ورود به Web VTT</h2>
            {table.vttInstance
              ? <p className={styles.hint}>این میز روی «{table.vttInstance.name}» بازی می‌شود.</p>
              : <p className={styles.hint}>{isDm ? "اول یک نشانی Web VTT برای این میز انتخاب کنید." : "DM هنوز Web VTT این میز را انتخاب نکرده است."}</p>}
            <button type="button" className={styles.buttonPrimary} disabled={!table.vttInstance || launching} onClick={() => void enter()}>
              {launching ? "در حال ورود…" : "ورود به میز"}
            </button>
          </section>

          <section className={styles.panel} aria-labelledby="members-heading">
            <h2 id="members-heading">اعضا</h2>
            <p className={styles.hint}>Player: حداکثر {table.maxPlayers}{table.allowObserver ? " · Observer: ۱" : ""}</p>
            <ul className={play.list}>
              {table.members.map((member) => (
                <li key={member.userId}>
                  <strong>{member.displayName}</strong>
                  <span>{ROLE_LABEL[member.role] ?? member.role}</span>
                  {isDm && member.role !== "dm" ? (
                    <div className={play.buttons}>
                      <button type="button" className={styles.inlineButton} onClick={() => void act(() => gameApi(`tables/${table.id}/members/${member.userId}`, { method: "PATCH", body: JSON.stringify({ role: member.role === "player" ? "observer" : "player" }) }), "نقش تغییر کرد.")}>
                        {member.role === "player" ? "Observer کن" : "Player کن"}
                      </button>
                      <button type="button" className={styles.inlineButton} onClick={() => void act(() => gameApi(`tables/${table.id}/members/${member.userId}`, { method: "DELETE" }), "عضو حذف شد.")}>حذف از میز</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {!isDm ? <button type="button" className={styles.inlineButton} onClick={() => void act(() => gameApi(`tables/${table.id}/leave`, { method: "POST", body: "{}" }), "از میز خارج شدید.")}>خروج از میز</button> : null}
          </section>

          {isDm ? (
            <>
              <section className={styles.panel} aria-labelledby="invite-heading">
                <h2 id="invite-heading">دعوت</h2>
                <p className={styles.hint}>کد میز را با دوستانتان به اشتراک بگذارید:</p>
                <p className={play.code}>{table.joinCode}</p>
                <form className={play.form} onSubmit={(event) => { event.preventDefault(); void act(() => gameApi(`tables/${table.id}/invites`, { method: "POST", body: JSON.stringify({ friendCode, role: inviteRole }) }), "دعوت فرستاده شد.") }}>
                  <label><span>Friend ID دوست</span><input value={friendCode} dir="ltr" onChange={(event) => setFriendCode(event.target.value.toUpperCase())} /></label>
                  <label><span>نقش</span>
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                      <option value="player">Player</option>
                      <option value="observer">Observer</option>
                    </select>
                  </label>
                  <button className={styles.buttonPrimary} type="submit">دعوت</button>
                </form>
              </section>

              <section className={styles.panel} aria-labelledby="vtt-heading">
                <h2 id="vtt-heading">Web VTT میز</h2>
                <label className={play.form}><span>نشانی انتخاب‌شده</span>
                  <select value={table.vttInstance?.id ?? ""} onChange={(event) => void act(() => gameApi(`tables/${table.id}`, { method: "PATCH", body: JSON.stringify({ vttInstanceId: event.target.value || null }) }), "Web VTT میز ذخیره شد.")}>
                    <option value="">—</option>
                    {instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.name} ({instance.baseUrl})</option>)}
                  </select>
                </label>
                {table.vttInstance ? (
                  <div className={play.form}>
                    <p className={styles.hint}>برای اتصال، این دو مقدار را در تنظیماتِ D&D Nerds Platform در صفحهٔ شروعِ Web VTT (روی رایانهٔ میزبان) بگذارید:</p>
                    <label><span>Instance id</span><input readOnly dir="ltr" value={table.vttInstance.id} /></label>
                    {publicKey ? <label><span>Public key</span><textarea readOnly dir="ltr" rows={4} value={publicKey} /></label> : <p className={styles.hint}>ورود به VTT روی این Platform هنوز فعال نشده است.</p>}
                  </div>
                ) : null}
                <form className={play.form} onSubmit={(event) => { event.preventDefault(); void act(() => gameApi("vtt-instances", { method: "POST", body: JSON.stringify({ name: instanceName, baseUrl: instanceUrl }) }), "نشانی Web VTT ثبت شد.") }}>
                  <label><span>نام</span><input value={instanceName} onChange={(event) => setInstanceName(event.target.value)} /></label>
                  <label><span>نشانی (https)</span><input value={instanceUrl} dir="ltr" onChange={(event) => setInstanceUrl(event.target.value)} /></label>
                  <button className={styles.buttonPrimary} type="submit">ثبت نشانی</button>
                </form>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}
