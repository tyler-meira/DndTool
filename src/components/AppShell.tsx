"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight, BookOpen, BookOpenText, Check, ChevronDown, Cloud, CloudAlert,
  CloudUpload, Copy, Download, Dices, FileUp, LoaderCircle, LogOut, House, Map as MapIcon,
  Plus, ScrollText, ShieldCheck, Sparkles, Swords, Trash2,
} from "lucide-react";
import { AuthPanel } from "./AuthPanel";
import { CharacterEditor, TABS, type SheetTab } from "./CharacterEditor";
import {
  characterTitle, emptySheet, normalizeDbCharacter, normalizeSheet,
  type CharacterSheet, type DbCharacter,
} from "@/lib/character";
import { supabase } from "@/lib/supabase";

type SaveStatus = "saved" | "pending" | "saving" | "error";
type Notice = { text: string; kind?: "success" | "error" };

function Brand() {
  return <div className="brand"><span className="brand-mark"><BookOpen size={22} strokeWidth={1.9}/></span><span className="brand-word">fablekeep<span className="brand-period">.</span></span></div>;
}

function SaveNotice({status, onRetry}: { status: SaveStatus;onRetry:()=>void }) {
  const error = status === "error";
  return <button type="button" className={`save-notice ${error ? "save-error" : ""}`} onClick={error ? onRetry : undefined} disabled={!error} title={error?"Tap to retry saving":"Changes save to Supabase automatically"}>
    {status === "saved" ? <Check size={14}/> : status === "saving" ? <LoaderCircle size={14} className="spin"/> : status === "pending" ? <CloudUpload size={14}/> : <CloudAlert size={14}/>}
    <span>{status === "saved" ? "Saved to cloud" : status === "pending" ? "Unsaved changes" : status === "saving" ? "Saving..." : "Save failed · Retry"}</span>
  </button>;
}

export function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [characters, setCharacters] = useState<DbCharacter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<SheetTab>("sheet");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const importInputRef = useRef<HTMLInputElement>(null);
  const charactersRef = useRef<DbCharacter[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const latestSheets = useRef(new Map<string, CharacterSheet>());
  const revisionRef = useRef(new Map<string, number>());
  const statusRef = useRef(new Map<string, SaveStatus>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queuesRef = useRef(new Map<string, Promise<void>>());

  const setRows = useCallback((rows: DbCharacter[]) => {
    charactersRef.current = rows;
    setCharacters(rows);
  }, []);

  const setStatusFor = useCallback((id: string, status: SaveStatus) => {
    statusRef.current.set(id, status);
    if (activeIdRef.current === id) setSaveStatus(status);
  }, []);

  const chooseCharacter = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
    setTab("sheet");
    setSaveStatus(id ? (statusRef.current.get(id) || "saved") : "saved");
  }, []);

  // Every save is queued per character, preventing an earlier, slower request
  // from overwriting a newer edit. Failed saves can be retried without losing
  // the unsaved local draft while the page remains open.
  const persist = useCallback(async (id: string, ownerId: string) => {
    if (!supabase || userIdRef.current !== ownerId) return;
    const snapshot = latestSheets.current.get(id);
    if (!snapshot) return;
    const revision = revisionRef.current.get(id) || 0;
    setStatusFor(id, "saving");
    const previous = queuesRef.current.get(id) || Promise.resolve();
    const operation = previous.then(async () => {
      if (userIdRef.current !== ownerId) return;
      const { error } = await supabase.from("characters")
        .update({ name: snapshot.name.trim(), sheet: snapshot })
        .eq("id", id)
        .eq("user_id", ownerId);
      if (error) throw error;
    });
    queuesRef.current.set(id, operation.catch(() => undefined));
    try {
      await operation;
      if (revisionRef.current.get(id) === revision) setStatusFor(id, "saved");
    } catch (error) {
      if (revisionRef.current.get(id) === revision) setStatusFor(id, "error");
      console.error("Character save failed:", error);
    }
  }, [setStatusFor]);

  const scheduleSave = useCallback((id: string, next: CharacterSheet, ownerId: string) => {
    latestSheets.current.set(id, next);
    revisionRef.current.set(id, (revisionRef.current.get(id) || 0) + 1);
    setStatusFor(id, "pending");
    const currentTimer = timersRef.current.get(id);
    if (currentTimer) clearTimeout(currentTimer);
    timersRef.current.set(id, setTimeout(() => {
      timersRef.current.delete(id);
      void persist(id, ownerId);
    }, 650));
  }, [persist, setStatusFor]);

  const flushSave = useCallback(async (id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    const ownerId = userIdRef.current;
    if (ownerId && (statusRef.current.get(id) !== "saved" || timer)) await persist(id, ownerId);
    await (queuesRef.current.get(id) || Promise.resolve());
  }, [persist]);

  const updateSheet = useCallback((update: (sheet: CharacterSheet) => CharacterSheet) => {
    const id = activeIdRef.current;
    const ownerId = userIdRef.current;
    if (!id || !ownerId) return;
    const old = charactersRef.current.find(row => row.id === id);
    if (!old) return;
    const nextSheet = update(old.sheet);
    const updated = charactersRef.current.map(row => row.id === id ? { ...row, name: nextSheet.name.trim(), sheet: nextSheet } : row);
    setRows(updated);
    scheduleSave(id, nextSheet, ownerId);
  }, [scheduleSave, setRows]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => {active = false;subscription.unsubscribe();};
  }, []);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    latestSheets.current.clear();
    revisionRef.current.clear();
    queuesRef.current.clear();
    statusRef.current.clear();
    setRows([]);
    chooseCharacter(null);
    setLoadError("");
    if (!user || !supabase) {setDataLoading(false);return;}
    let alive = true;
    setDataLoading(true);
    void (async () => {
      const {data,error} = await supabase.from("characters")
        .select("id,user_id,name,sheet,created_at,updated_at")
        .eq("user_id",user.id)
        .order("updated_at",{ascending:false});
      if (!alive) return;
      if (error) {
        setLoadError(error.message);
      } else {
        const rows = (data || []).map(normalizeDbCharacter);
        setRows(rows);
        for (const row of rows) latestSheets.current.set(row.id,row.sheet);
        // Select a real saved character if one exists. Never make a fake demo character.
        if (rows.length) chooseCharacter(rows[0].id);
      }
      setDataLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, reloadCount, chooseCharacter, setRows]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  // On phone, switching apps or putting the browser in the background immediately
  // starts a save instead of waiting for the debounce timer to expire.
  useEffect(() => {
    const saveOnHide = () => {
      if (document.visibilityState !== "hidden") return;
      for (const [id, timer] of timersRef.current) {
        clearTimeout(timer);
        timersRef.current.delete(id);
        if (userIdRef.current) void persist(id, userIdRef.current);
      }
    };
    document.addEventListener("visibilitychange", saveOnHide);
    return () => document.removeEventListener("visibilitychange", saveOnHide);
  }, [persist]);

  async function createCharacter() {
    if (!supabase || !user || working) return;
    setWorking(true);
    const blank = emptySheet();
    const { data, error } = await supabase.from("characters")
      .insert({user_id:user.id,name:"",sheet:blank})
      .select("id,user_id,name,sheet,created_at,updated_at").single();
    if (error || !data) setNotice({kind:"error",text:error?.message || "Could not create a character."});
    else {
      const row=normalizeDbCharacter(data);
      latestSheets.current.set(row.id,row.sheet);
      setRows([row,...charactersRef.current]);
      chooseCharacter(row.id);
      setNotice({text:"A blank character sheet is ready."});
    }
    setWorking(false);
  }

  async function duplicateCharacter() {
    if (!supabase || !user || !active || working) return;
    setWorking(true);
    await flushSave(active.id);
    const copySheet = normalizeSheet({...active.sheet,name:active.sheet.name?`${active.sheet.name} (copy)`:""});
    const {data,error} = await supabase.from("characters").insert({user_id:user.id,name:copySheet.name,sheet:copySheet})
      .select("id,user_id,name,sheet,created_at,updated_at").single();
    if (error || !data) setNotice({kind:"error",text:error?.message||"Could not duplicate character."});
    else {
      const row=normalizeDbCharacter(data);
      latestSheets.current.set(row.id,row.sheet);
      setRows([row,...charactersRef.current]);
      chooseCharacter(row.id);
      setNotice({text:"Character duplicated."});
    }
    setWorking(false);
  }

  async function deleteCharacter() {
    if (!supabase || !user || !active || working) return;
    if (!window.confirm(`Delete ${characterTitle(active)} permanently? This cannot be undone.`)) return;
    setWorking(true);
    const id=active.id;
    const timer=timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    await (queuesRef.current.get(id)||Promise.resolve());
    const {error} = await supabase.from("characters").delete().eq("id",id).eq("user_id",user.id);
    if (error) setNotice({kind:"error",text:error.message});
    else {
      latestSheets.current.delete(id);
      revisionRef.current.delete(id);
      statusRef.current.delete(id);
      const remaining=charactersRef.current.filter(item=>item.id!==id);
      setRows(remaining);
      chooseCharacter(remaining[0]?.id||null);
      setNotice({text:"Character deleted."});
    }
    setWorking(false);
  }

  function exportCharacters() {
    const rows=charactersRef.current;
    if (!rows.length) {setNotice({text:"Create a character first."});return;}
    const exportData={format:"fablekeep-backup",version:1,exportedAt:new Date().toISOString(),characters:rows.map(row=>({name:row.sheet.name,sheet:row.sheet}))};
    const blob=new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download="fablekeep-characters-backup.json";
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice({text:"Your character backup has been downloaded."});
  }

  async function importCharacters(event: ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    event.target.value="";
    if (!file || !supabase || !user || working) return;
    if (file.size>5_000_000) {setNotice({kind:"error",text:"Choose a JSON backup smaller than 5 MB."});return;}
    setWorking(true);
    try {
      const json: unknown = JSON.parse(await file.text());
      if (!json || typeof json!=="object") throw new Error("This is not a valid backup file.");
      const backup=json as {format?:string;characters?:unknown[]};
      if (!Array.isArray(backup.characters) || !["fablekeep-backup","venture-sheet-backup"].includes(backup.format||"")) {
        throw new Error("Choose a Fablekeep or VentureSheet backup JSON file.");
      }
      if (!backup.characters.length || backup.characters.length>100) throw new Error("Backup must contain between 1 and 100 characters.");
      const sheets=backup.characters.map(raw=>{
        const row=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
        const sheet=normalizeSheet(backup.format==="fablekeep-backup"?row.sheet:row);
        return sheet;
      });
      const {data,error}=await supabase.from("characters")
        .insert(sheets.map(sheet=>({user_id:user.id,name:sheet.name.trim(),sheet})))
        .select("id,user_id,name,sheet,created_at,updated_at");
      if (error || !data) throw new Error(error?.message||"Import failed.");
      const imported=data.map(normalizeDbCharacter);
      for (const row of imported) latestSheets.current.set(row.id,row.sheet);
      setRows([...imported,...charactersRef.current]);
      chooseCharacter(imported[0]?.id||null);
      setNotice({text:`Imported ${imported.length} character${imported.length===1?"":"s"}.`});
    } catch (error) {
      setNotice({kind:"error",text:error instanceof Error?error.message:"Could not read backup file."});
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setWorking(true);
    await Promise.all([...new Set([...timersRef.current.keys(),...latestSheets.current.keys()])].map(id=>flushSave(id)));
    const failed=[...statusRef.current.values()].some(state=>state==="error");
    if (failed && !window.confirm("Some changes could not be saved. Sign out anyway?")) {setWorking(false);return;}
    const {error}=await supabase.auth.signOut();
    if (error) setNotice({kind:"error",text:error.message});
    setWorking(false);
  }

  function roll(label: string, mod: number | null) {
    if (mod === null) {setNotice({kind:"error",text:"Enter an ability score (and a level for proficient checks) first."});return;}
    const roll=Math.floor(Math.random()*20)+1;
    setNotice({text:`${label}: rolled ${roll} ${mod>=0?"+":"−"} ${Math.abs(mod)} = ${roll+mod}`});
  }

  if (!supabase) return <div className="system-page"><div className="system-card"><Brand/><h1>Supabase isn’t configured yet.</h1><p>Add the two <code>NEXT_PUBLIC_SUPABASE_*</code> values to <code>.env.local</code> and restart your dev server.</p></div></div>;
  if (authLoading) return <div className="system-page"><Brand/><LoaderCircle className="spin loading-icon" size={28}/><p>Opening your story...</p></div>;
  if (!user) return <AuthPanel/>;

  const active=characters.find(item=>item.id===activeId)||null;
  const toolbarButtonClass="button tool-button";

  return <div className="app-layout">
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand/><p>YOUR CHARACTER JOURNAL</p></div>
      <div className="sidebar-divider"/><a className="sidebar-library" href="/"><House size={19}/> Dashboard</a><a className="sidebar-library" href="/tabletop"><MapIcon size={19}/> Virtual tabletop</a>
      <div className="sidebar-label">YOUR WORKSPACE</div>
      <button type="button" className="sidebar-library" onClick={()=>{if(active)chooseCharacter(null);}}><BookOpen size={19}/> My characters <span>{characters.length}</span></button>
      <div className="sidebar-label sidebar-section-label">CHARACTER SHEET</div>
      <nav className="desktop-navigation" aria-label="Character sections">{TABS.map(({id,label,icon:Icon})=><button type="button" key={id} disabled={!active} onClick={()=>setTab(id)} className={`sidebar-link ${tab===id&&active?"sidebar-link-active":""}`}><Icon size={20}/>{label}{tab===id&&active&&<span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-advice"><span className="sidebar-advice-icon"><Sparkles size={20}/></span><strong>Every legend is personal.</strong><p>No templates, no distractions. Just your character and the adventure ahead.</p></div>
      <div className="sidebar-account"><span className="account-avatar">{user.email?.slice(0,1).toUpperCase()||"?"}</span><span className="account-text"><strong>Your account</strong><small title={user.email}>{user.email}</small></span><button type="button" aria-label="Sign out" onClick={signOut} disabled={working}><LogOut size={19}/></button></div>
    </aside>

    <div className="mobile-brand"><a href="/" className="fable-home-link" aria-label="Dashboard"><House size={19}/></a><Brand/><button type="button" aria-label="Sign out" title="Sign out" onClick={signOut} disabled={working} className="mobile-signout"><LogOut size={19}/></button></div>

    <div className="app-main">
      <header className="topbar"><div className="topbar-path"><span>YOUR COLLECTION</span><span className="slash">/</span><span className="topbar-current">{active?characterTitle(active):"My characters"}</span></div>
        <div className="topbar-controls"><div className="character-selector"><BookOpenText size={18}/><select aria-label="Select character" value={activeId||""} onChange={(e)=>chooseCharacter(e.target.value||null)}><option value="">My characters</option>{characters.map(row=><option value={row.id} key={row.id}>{characterTitle(row)}</option>)}</select><ChevronDown size={15}/></div><button type="button" className="button primary-button create-button" onClick={createCharacter} disabled={working||dataLoading}><Plus size={17}/><span>New character</span></button></div>
      </header>

      <div className="content-width">
        {loadError ? <div className="error-panel"><CloudAlert size={30}/><h2>We couldn’t load your characters.</h2><p>{loadError}</p><p className="error-tip">If this is your first time setting up Fablekeep, run <code>supabase/schema.sql</code> in your Supabase SQL Editor.</p><button type="button" className="button outline-button" onClick={()=>setReloadCount(i=>i+1)}>Try again <ArrowRight size={16}/></button></div>
          : dataLoading ? <div className="loading-content"><LoaderCircle size={28} className="spin"/><span>Loading your characters...</span></div>
          : !active ? <div className="empty-page"><div className="empty-illustration" aria-hidden="true"><span className="empty-glow"/><BookOpenText size={68} strokeWidth={1.2}/><i className="empty-star-a">✦</i><i className="empty-star-b">✧</i></div><div className="eyebrow">A BLANK PAGE. ENDLESS POSSIBILITIES.</div><h1>Your next adventure<br/><em>starts here.</em></h1><p>You don’t have any characters selected. Create a blank sheet and fill it in as you play.</p><button type="button" className="button primary-button empty-cta" onClick={createCharacter} disabled={working}><Plus size={18}/>Create a character<ArrowRight size={18}/></button>{characters.length>0&&<p className="empty-helper">Or choose one of your {characters.length} saved characters above.</p>}<button className="text-button empty-import" type="button" onClick={()=>importInputRef.current?.click()}><FileUp size={16}/> Have a VentureSheet backup? Import it</button></div>
          : <>
            <div className="workspace-topline"><div><p className="eyebrow workspace-eyebrow">YOUR ADVENTURER</p><h1>{tab==="sheet"?"Character sheet":tab==="skills"?"Skills":tab==="combat"?"Combat": "Journal"}<span className="subtle-title-dot">.</span></h1></div><SaveNotice status={saveStatus} onRetry={()=>void flushSave(active.id)}/></div>
            <div className="character-toolbar"><div className="toolbar-label"><ShieldCheck size={16}/><span>Private to your account</span></div><div className="toolbar-actions"><button className={toolbarButtonClass} type="button" onClick={exportCharacters} title="Download JSON backup"><Download size={17}/> Export</button><button className={toolbarButtonClass} type="button" onClick={()=>importInputRef.current?.click()} title="Import a JSON backup"><FileUp size={17}/> Import</button><button className={toolbarButtonClass} type="button" onClick={duplicateCharacter} disabled={working}><Copy size={17}/> Duplicate</button><button className={`${toolbarButtonClass} toolbar-delete`} type="button" onClick={deleteCharacter} disabled={working}><Trash2 size={17}/> Delete</button></div></div>
            <CharacterEditor sheet={active.sheet} tab={tab} onChange={updateSheet} onRoll={roll}/>
            <div className="endnote"><Sparkles size={15}/> Your character, your story. Saved to your account as you type.</div>
          </>}
      </div>
    </div>
    {active&&<nav className="mobile-bottom-nav" aria-label="Character sections">{TABS.map(({id,label,icon:Icon})=><button type="button" key={id} aria-current={tab===id?"page":undefined} className={tab===id?"bottom-active":""} onClick={()=>{setTab(id);window.scrollTo({top:0,behavior:"instant"});}}><Icon size={21} strokeWidth={tab===id?2.2:1.8}/><span>{label}</span></button>)}</nav>}
    <input ref={importInputRef} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Import characters JSON backup" onChange={importCharacters}/>
    {notice&&<div role="status" className={`toast ${notice.kind==="error"?"toast-error":""}`}><Dices size={18}/><span>{notice.text}</span><button aria-label="Dismiss notice" onClick={()=>setNotice(null)}>×</button></div>}
  </div>;
}
