"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {BookOpenText,Map as MapIcon,ArrowUpRight,LogOut,Shield,BookOpen,Dices} from "lucide-react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {AuthPanel} from "./AuthPanel";
export function Dashboard(){
 const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
 useEffect(()=>{ if(!supabase){setLoading(false);return;} let active=true; const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(!active)return;setUser(session?.user??null);setLoading(false)});void supabase.auth.getSession().then(({data})=>{if(active){setUser(data.session?.user??null);setLoading(false)}}).catch(()=>{if(active)setLoading(false)});return()=>{active=false;subscription.unsubscribe()}},[]);
 if(!supabase)return <main className="hub-auth-message">Configure Supabase in .env.local first.</main>;
 if(loading)return <main className="hub-auth-message">Opening Fablekeep…</main>;
 if(!user)return <AuthPanel/>;
 return <main className="hub"><header className="hub-header"><Link href="/" className="hub-logo"><span className="hub-mark"><BookOpen size={21}/></span>fablekeep<span className="brand-period">.</span></Link><div className="hub-header-right"><span>{user.email}</span><button className="hub-icon" aria-label="Sign out" title="Sign out" onClick={()=>void supabase?.auth.signOut()}><LogOut size={19}/></button></div></header><div className="hub-inner"><div className="hub-kicker"><Shield size={16}/> YOUR CAMPAIGN COMPANION</div><h1>Where shall we<br/><em>adventure today?</em></h1><p className="hub-intro">Two tools, one home. Manage your adventurers or set the scene for your next encounter.</p><div className="hub-cards"><Link href="/characters" className="hub-card hub-card-character"><div className="hub-card-art"><BookOpenText size={88} strokeWidth={1}/><span>CHARACTERS</span></div><div className="hub-card-body"><div><p>01 / CHARACTER MANAGER</p><h2>Character sheets</h2><span>Create characters, manage stats, track combat, and keep your adventure notes together.</span></div><span className="hub-arrow"><ArrowUpRight size={23}/></span></div></Link><Link href="/tabletop" className="hub-card hub-card-vtt"><div className="hub-card-art"><MapIcon size={90} strokeWidth={1}/><div className="hub-dice"><Dices size={27}/></div><span>TABLETOP</span></div><div className="hub-card-body"><div><p>02 / VIRTUAL TABLETOP</p><h2>Battle map & dice</h2><span>Import a map, overlay a grid, place and move tokens, and roll the dice.</span></div><span className="hub-arrow"><ArrowUpRight size={23}/></span></div></Link></div><p className="hub-foot">Your existing character sheets are unchanged. Shared campaign rooms save to Supabase and sync across participants.</p></div></main>
}
