"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./global-chat-dock.module.css";

type Profile = {friendCode:string|null};
type Friend={userId:string;friendCode:string|null};
type FriendRequest={id:string;friendCode:string|null};
type Requests={incoming:FriendRequest[];outgoing:FriendRequest[]};
type Group={id:string;title:string;ownerUserId:string};
type GroupInvite={id:string;groupId:string;title:string};
type Message={id:string;senderUserId:string;senderUsername?:string|null;body:string;createdAt:string};
type Chat={kind:"direct"|"group";id:string;title:string};
type PanelTab="friends"|"chats"|"groups";

async function api<T>(path:string,method="GET",data?:unknown):Promise<T>{
  const res=await fetch(`/api/social/${path}`,{method,credentials:"same-origin",cache:"no-store",
    headers:data===undefined?undefined:{"Content-Type":"application/json"},
    body:data===undefined?undefined:JSON.stringify(data)});
  const body: {data?:T;error?:{message?:string}}=await res.json();
  if(!res.ok)throw new Error(body.error?.message??`Request failed (${res.status})`);
  return body.data as T;
}
function renderMessage(body:string){
  const parts=body.split(/(https?:\/\/[^\s<>"']+)/gi);
  return parts.map((part,i)=>{
    if(!/^https?:\/\//i.test(part))return <span key={i}>{part}</span>;
    try {
      const url=new URL(part);
      if(url.protocol!=="http:"&&url.protocol!=="https:")return <span key={i}>{part}</span>;
      return <a key={i} href={url.href} target="_blank" rel="noopener noreferrer nofollow ugc">{part}</a>;
    }catch{return <span key={i}>{part}</span>;}
  });
}
const emptyRequests:Requests={incoming:[],outgoing:[]};
export function GlobalChatDock(){
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState<PanelTab>("friends");
  const [session,setSession]=useState<"loading"|"guest"|"ready"|"needsUsername"|"error">("loading");
  const [me,setMe]=useState("");
  const [code,setCode]=useState("");
  const [friendCode,setFriendCode]=useState("");
  const [friends,setFriends]=useState<Friend[]>([]);
  const [requests,setRequests]=useState<Requests>(emptyRequests);
  const [groups,setGroups]=useState<Group[]>([]);
  const [groupInvites,setGroupInvites]=useState<GroupInvite[]>([]);
  const [groupTitle,setGroupTitle]=useState("");
  const [inviteCode,setInviteCode]=useState("");
  const [chat,setChat]=useState<Chat|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const bottom=useRef<HTMLDivElement>(null);
  const accountSeq=useRef(0);
  const chatSeq=useRef(0);

  const refreshAccount=useCallback(async()=>{
    const seq=++accountSeq.current;
    try{
      const res=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
      if(seq!==accountSeq.current)return;
      if(res.status===401){setSession("guest");setMe("");setChat(null);setMessages([]);setFriends([]);setGroups([]);setCode("");return;}
      if(!res.ok)throw new Error("Session check failed");
      const json:{user?:{id:string;username?:string|null}}=await res.json();
      if(seq!==accountSeq.current)return;
      if(!json.user?.id)throw new Error("Invalid session response");
      if(me!==json.user.id){setFriends([]);setMessages([]);setChat(null);setRequests(emptyRequests);setGroups([]);setCode("");}
      setMe(json.user.id);setSession(json.user.username?"ready":"needsUsername");
    }catch{if(seq===accountSeq.current)setSession("error");}
  },[me]);
  useEffect(()=>{void refreshAccount();},[pathname,refreshAccount]);
  useEffect(()=>{
    const openFromPage=()=>setOpen(true);
    window.addEventListener("dnd-open-social",openFromPage);
    return()=>window.removeEventListener("dnd-open-social",openFromPage);
  },[]);
  useEffect(()=>{
    const onAuth=()=>{void refreshAccount();};
    const onFocus=()=>{if(document.visibilityState==="visible")void refreshAccount();};
    window.addEventListener("dnd-auth-change",onAuth);window.addEventListener("focus",onFocus);
    let bc:BroadcastChannel|undefined;
    if(typeof BroadcastChannel!=="undefined"){
      bc=new BroadcastChannel("dnd-nerds-auth-state");
      bc.onmessage=()=>{void refreshAccount();};
    }
    return()=>{window.removeEventListener("dnd-auth-change",onAuth);window.removeEventListener("focus",onFocus);bc?.close();};
  },[refreshAccount]);

  const refreshLists=useCallback(async()=>{
    if(session!=="ready"||!open)return;
    try{
      const [profile,friendRows,requestRows,groupRows,invites]=await Promise.all([
        api<Profile>("me"),api<Friend[]>("friends"),api<Requests>("requests"),
        api<Group[]>("groups"),api<GroupInvite[]>("groups/invites")]);
      setCode(profile.friendCode??"");setFriends(friendRows);setRequests(requestRows);
      setGroups(groupRows);setGroupInvites(invites);
    }catch(e){setNotice(e instanceof Error?e.message:"درخواست ناموفق بود");}
  },[session,open]);
  useEffect(()=>{void refreshLists();},[refreshLists]);
  const refreshMessages=useCallback(async()=>{
    if(!chat||!open||session!=="ready")return;
    const seq=++chatSeq.current;
    const route=chat.kind==="direct"?`friends/${encodeURIComponent(chat.id)}/messages`:`groups/${encodeURIComponent(chat.id)}/messages`;
    try{
      const rows=await api<Message[]>(route);
      if(seq!==chatSeq.current)return;
      setMessages(rows);
    }catch(e){if(seq===chatSeq.current)setNotice(e instanceof Error?e.message:"دریافت پیام‌ها ناموفق بود");}
  },[chat,open,session]);
  useEffect(()=>{setMessages([]);setDraft("");void refreshMessages();},[refreshMessages]);
  useEffect(()=>{
    if(!open||session!=="ready")return;
    const id=window.setInterval(()=>{
      if(document.visibilityState!=="visible")return;
      void refreshLists();void refreshMessages();
    },12000);
    return()=>window.clearInterval(id);
  },[open,session,refreshLists,refreshMessages]);
  useEffect(()=>{if(chat&&open)bottom.current?.scrollIntoView({block:"end",behavior:"smooth"});},[messages,chat,open]);
  const action=async(fn:()=>Promise<unknown>)=>{
    if(busy)return;
    setBusy(true);setNotice("");
    try{await fn();await refreshLists();}
    catch(e){setNotice(e instanceof Error?e.message:"عملیات ناموفق بود");}
    finally{setBusy(false);}
  };
  const send=async(e:FormEvent)=>{
    e.preventDefault();if(!chat||!draft.trim()||busy)return;
    const body=draft.trim();const current=chat;
    await action(async()=>{
      const route=current.kind==="direct"?`friends/${encodeURIComponent(current.id)}/messages`:`groups/${encodeURIComponent(current.id)}/messages`;
      await api(route,"POST",{body});setDraft("");await refreshMessages();
    });
  };
  const startChat=(kind:Chat["kind"],id:string,title:string)=>{
    setChat({kind,id,title});setTab("chats");
  };
  return (
    <div className={`${styles.dock} ${pathname==="/"?styles.homeDock:""}`} dir="rtl" data-social-dock data-home-open={pathname==="/"&&open?"true":"false"}>
      <section id="dnd-social-panel" className={`${styles.panel} ${session==="guest"?styles.guestPanel:""} ${open?styles.shown:""}`} aria-hidden={!open} aria-label="Friends and Chat" inert={!open}>
        <div className={styles.top}>
          <div><strong>Friends & Chat</strong><small>دوستان و گفتگو</small></div>
          <button type="button" className={styles.iconButton} aria-label="بستن پنل" onClick={()=>setOpen(false)}>×</button>
        </div>
        {session==="loading"&&<p className={styles.notice}>در حال بررسی حساب…</p>}
        {session==="error"&&<button className={styles.secondary} onClick={()=>void refreshAccount()}>بررسی دوباره ورود</button>}
        {session==="needsUsername"&&<div className={styles.guest}><p>برای گفتگو ابتدا نام کاربری انتخاب کن</p><Link href="/account" onClick={()=>setOpen(false)}>انتخاب نام کاربری</Link></div>}
        {session==="guest"&&<div className={styles.guest}><p>گفتگو برای اعضا رایگان است.</p><Link href="/login">ورود</Link><Link href="/register">ثبت‌نام رایگان</Link></div>}
        {session==="ready"&&<>
          {chat?<>
            <div className={styles.chatHeading}><button type="button" onClick={()=>setChat(null)}>→</button><strong>{chat.title}</strong><span>{chat.kind==="group"?"گروهی":"خصوصی"}</span></div>
            <div className={styles.messages} aria-live="polite">{messages.length===0&&<p className={styles.empty}>هنوز پیامی در این گفتگو نیست.</p>}
              {messages.map(msg=><div key={msg.id} className={`${styles.bubble} ${msg.senderUserId===me?styles.mine:""}`}>
                {chat.kind==="group"&&<small>{msg.senderUserId===me?"شما":msg.senderUsername??"کاربر"}</small>}
                <p dir="auto">{renderMessage(msg.body)}</p><time>{new Date(msg.createdAt).toLocaleTimeString("fa-IR",{hour:"2-digit",minute:"2-digit"})}</time>
              </div>)}<div ref={bottom}/>
            </div>
            <form className={styles.compose} onSubmit={e=>void send(e)}><input type="text" value={draft} maxLength={2000} onChange={e=>setDraft(e.target.value)} placeholder="پیام یا لینک بنویس…" aria-label="متن پیام"/><button type="submit" disabled={busy||!draft.trim()}>ارسال</button></form>
            {chat.kind==="group"&&<div className={styles.groupTools}><input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="نام کاربری برای دعوت به گروه" aria-label="نام کاربری دعوت"/><button disabled={busy||!inviteCode.trim()} onClick={()=>void action(async()=>{await api(`groups/${encodeURIComponent(chat.id)}/invites`,"POST",{friendCode:inviteCode});setInviteCode("");})}>دعوت</button><button disabled={busy} onClick={()=>void action(async()=>{
              const group=groups.find(g=>g.id===chat.id);const mine=group?.ownerUserId===me;
              if(!window.confirm(mine?"گروه و تمام پیام‌هایش حذف شوند؟":"از گروه خارج شوی؟"))return;
              await api(`groups/${encodeURIComponent(chat.id)}/${mine?"delete":"leave"}`,"POST",{});setChat(null);
            })}>{groups.find(g=>g.id===chat.id)?.ownerUserId===me?"حذف گروه":"ترک گروه"}</button></div>}
          </>:<>
            <div className={styles.tabs} role="tablist">
              {(["friends","chats","groups"] as const).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} className={tab===t?styles.active:""} onClick={()=>setTab(t)}>{t==="friends"?"دوستان":t==="chats"?"گفتگوها":"گروه‌ها"}</button>)}
            </div>
            <div className={styles.scroll}>
              {tab==="friends"&&<>
                <div className={styles.code}><small>نام کاربری من</small>{code?<div><code dir="ltr">{code}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(code)}>کپی</button></div>:<Link href="/account">انتخاب نام کاربری</Link>}</div>
                <form className={styles.add} onSubmit={e=>{e.preventDefault();void action(async()=>{await api("requests","POST",{friendCode});setFriendCode("");});}}><input value={friendCode} onChange={e=>setFriendCode(e.target.value)} placeholder="نام کاربری دوست"/><button disabled={busy||!friendCode.trim()}>دعوت</button></form>
                {requests.incoming.length>0&&<><h3>درخواست‌های دریافتی</h3>{requests.incoming.map(r=><div className={styles.entry} key={r.id}><span dir="ltr">{r.friendCode??"درخواست دوستی"}</span><button disabled={busy} onClick={()=>void action(()=>api(`requests/${r.id}/accept`,"POST",{}))}>قبول</button><button disabled={busy} onClick={()=>void action(()=>api(`requests/${r.id}/decline`,"POST",{}))}>رد</button></div>)}</>}
                {requests.outgoing.length>0&&<><h3>در انتظار پذیرش</h3>{requests.outgoing.map(r=><p className={styles.pending} key={r.id} dir="ltr">{r.friendCode??"Pending"}</p>)}</>}
                <h3>دوستان من</h3>{friends.length===0&&<p className={styles.empty}>هنوز دوستی اضافه نکردی.</p>}
                {friends.map(f=><div className={styles.entry} key={f.userId}><a dir="ltr" href={`/player/${f.userId}`}>{f.friendCode??"Friend"}</a><button onClick={()=>startChat("direct",f.userId,f.friendCode??"دوست")}>چت</button><button disabled={busy} title="حذف دوست" onClick={()=>void action(async()=>{if(window.confirm("این دوست حذف شود؟"))await api(`friends/${f.userId}/remove`,"POST",{});})}>×</button></div>)}
              </>}
              {tab==="chats"&&<><h3>گفتگوهای خصوصی</h3><p className={styles.empty}>برای شروع گفتگو، یکی از دوستان را انتخاب کن.</p>{friends.map(f=><button key={f.userId} className={styles.chatRow} onClick={()=>startChat("direct",f.userId,f.friendCode??"دوست")}>◉ {f.friendCode??"Friend"}</button>)}<h3>گفتگوهای گروهی</h3>{groups.map(g=><button key={g.id} className={styles.chatRow} onClick={()=>startChat("group",g.id,g.title)}>◈ {g.title}</button>)}</>}
              {tab==="groups"&&<><h3>ساخت گروه خصوصی</h3><form className={styles.add} onSubmit={e=>{e.preventDefault();void action(async()=>{await api("groups","POST",{title:groupTitle});setGroupTitle("");});}}><input maxLength={80} value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} placeholder="نام گروه"/><button disabled={busy||groupTitle.trim().length<2}>ساخت</button></form>
                {groupInvites.length>0&&<><h3>دعوت‌نامه‌های گروه</h3>{groupInvites.map(inv=><div key={inv.id} className={styles.entry}><span>{inv.title}</span><button disabled={busy} onClick={()=>void action(()=>api(`groups/invites/${inv.id}/accept`,"POST",{}))}>پذیرش</button><button disabled={busy} onClick={()=>void action(()=>api(`groups/invites/${inv.id}/decline`,"POST",{}))}>رد</button></div>)}</>}
                <h3>گروه‌های من</h3>{groups.length===0&&<p className={styles.empty}>هنوز عضو گروهی نیستی.</p>}{groups.map(g=><button key={g.id} className={styles.chatRow} onClick={()=>startChat("group",g.id,g.title)}>◈ {g.title}</button>)}
              </>}
            </div>
          </>}
          {notice&&<p className={styles.error} role="alert">{notice}<button onClick={()=>setNotice("")} aria-label="بستن خطا">×</button></p>}
        </>}
      </section>
      <button className={styles.launcher} type="button" aria-expanded={open} aria-controls="dnd-social-panel" onClick={()=>{setOpen(v=>!v);setNotice("");}}>
        <span className={styles.spark}>✧</span><span>Friends & Chat</span><span className={styles.chevron}>{open?"⌄":"⌃"}</span>
      </button>
    </div>
  );
}
