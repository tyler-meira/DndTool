"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Activity, Backpack, BookOpenText, Check, ChevronRight, CircleHelp, Coins, Dices,
  Heart, ImagePlus, Minus, Plus, ScrollText, Shield, Sparkles, Swords, Trash2, WandSparkles,
} from "lucide-react";
import {
  ABILITIES, SKILLS, abilityModifier, checkBonus, proficiencyBonus, signed,
  type AbilityId, type Attack, type CharacterSheet, type SkillName, type SkillRank,
} from "@/lib/character";

export type SheetTab = "sheet" | "skills" | "combat" | "journal";
type Update = (updater: (previous: CharacterSheet) => CharacterSheet) => void;

export const TABS: { id: SheetTab; label: string; icon: typeof Shield }[] = [
  { id: "sheet", label: "Sheet", icon: BookOpenText },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "combat", label: "Combat", icon: Swords },
  { id: "journal", label: "Journal", icon: ScrollText },
];

type Props = {
  sheet: CharacterSheet;
  tab: SheetTab;
  onChange: Update;
  onRoll: (label: string, mod: number | null) => void;
};

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  className?: string;
  maxLength?: number;
};

function TextField({ label, value, onChange, placeholder, numeric = false, className = "", maxLength = 160 }: TextFieldProps) {
  return (
    <label className={`text-field ${className}`}>
      <span className="field-label">{label}</span>
      <input
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        maxLength={numeric ? undefined : maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder || "—"}
        autoComplete="off"
      />
    </label>
  );
}

function SectionTitle({ label, description, action, icon }: { label: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="section-title"><div className="section-heading"><span className="section-heading-icon">{icon || <Sparkles size={18} />}</span><div><h2>{label}</h2>{description && <p>{description}</p>}</div></div>{action}</div>;
}

function RollButton({ label, mod, onRoll, large = false }: { label: string; mod: number | null; onRoll: Props["onRoll"]; large?: boolean }) {
  return <button type="button" className={`roll-button ${large ? "roll-large" : ""}`} onClick={() => onRoll(label, mod)} title={`Roll ${label} (d20)`} aria-label={`Roll ${label} (d20)`}>
    <span>{signed(mod)}</span><Dices size={large ? 16 : 14} strokeWidth={1.8} />
  </button>;
}

function LifeFields({ sheet, onChange, quick = false }: { sheet: CharacterSheet; onChange: Update; quick?: boolean }) {
  const set = (field: "hpCurrent" | "hpMax" | "tempHp", value: string) => onChange((s) => ({ ...s, [field]: value }));
  function step(delta: number) {
    onChange((s) => {
      const current = Number(s.hpCurrent) || 0;
      const ceiling = s.hpMax !== "" && Number.isFinite(Number(s.hpMax)) ? Math.max(0, Number(s.hpMax)) : 99999;
      return { ...s, hpCurrent: String(Math.min(ceiling, Math.max(0, current + delta))) };
    });
  }
  return (
    <div className={`health-fields ${quick ? "health-fields-large" : ""}`}>
      <label><span>Current</span><input aria-label="Current hit points" type="number" inputMode="numeric" min="0" placeholder="—" value={sheet.hpCurrent} onChange={(e) => set("hpCurrent", e.target.value)} /></label>
      <span className="health-slash">/</span>
      <label><span>Maximum</span><input aria-label="Maximum hit points" type="number" inputMode="numeric" min="0" placeholder="—" value={sheet.hpMax} onChange={(e) => set("hpMax", e.target.value)} /></label>
      {quick && <div className="health-stepper"><button type="button" onClick={() => step(-1)} aria-label="Remove one hit point"><Minus size={18}/></button><button type="button" onClick={() => step(1)} aria-label="Add one hit point"><Plus size={18}/></button></div>}
    </div>
  );
}

// Portraits are resized locally and stored in the existing JSONB sheet. No public
// Supabase Storage bucket or additional SQL policies are required.
async function makePortrait(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const side = Math.min(bitmap.width, bitmap.height);
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image editing is not supported by this browser.');
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 480, 480);
    const output = canvas.toDataURL('image/jpeg', 0.78);
    if (output.length > 900000) throw new Error('This image is too large after processing.');
    return output;
  } finally { bitmap.close(); }
}

function Portrait({ portrait, onChange }: { portrait: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try { onChange(await makePortrait(file)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load that picture.'); }
    finally { setBusy(false); }
  }
  return <div className="portrait-wrapper">
    <input ref={inputRef} className="portrait-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} aria-label="Choose character portrait" />
    <button type="button" className={`banner-emblem portrait-button ${portrait ? 'portrait-filled' : ''}`} onClick={()=>inputRef.current?.click()} disabled={busy} aria-label={portrait?'Change character portrait':'Upload character portrait'} title="Choose a character picture">
      {portrait ? <img src={portrait} alt="Your character portrait" /> : <><ImagePlus size={35} strokeWidth={1.3}/><span className="portrait-hint">Add photo</span></>}
    </button>
    {portrait && <button type="button" className="portrait-remove" onClick={()=>{setError('');onChange('');}}>Remove picture</button>}
    {busy && <span className="portrait-message">Processing…</span>}
    {error && <span className="portrait-message portrait-error" role="alert">{error}</span>}
  </div>;
}

function Identity({ sheet, onChange }: { sheet: CharacterSheet; onChange: Update }) {
  const set = (field: keyof CharacterSheet, value: string) => onChange((s) => ({ ...s, [field]: value }));
  return (
    <>
      <div className="character-banner">
        <div className="banner-details">
          <div className="eyebrow banner-eyebrow"><span className="eyebrow-dot" /> YOUR CHARACTER · D&D 5E</div>
          <input className="name-input" value={sheet.name} maxLength={160} onChange={(e) => set("name", e.target.value)} placeholder="Character name" aria-label="Character name" />
          <p>Every hero has a story worth telling.</p>
        </div>
        <Portrait portrait={sheet.portrait} onChange={(value)=>set("portrait",value)}/>
      </div>
      <div className="identity-grid">
        <TextField label="Class" value={sheet.className} onChange={(v) => set("className", v)} placeholder="e.g. Ranger" />
        <TextField label="Species" value={sheet.species} onChange={(v) => set("species", v)} placeholder="e.g. Elf" />
        <TextField label="Level" numeric value={sheet.level} onChange={(v) => set("level", v)} placeholder="—" />
        <TextField label="Background" value={sheet.background} onChange={(v) => set("background", v)} placeholder="e.g. Sage" />
        <TextField label="Alignment" value={sheet.alignment} onChange={(v) => set("alignment", v)} placeholder="e.g. Neutral good" />
      </div>
    </>
  );
}

function Vitals({ sheet, onChange }: { sheet: CharacterSheet; onChange: Update }) {
  const prof = proficiencyBonus(sheet.level);
  const dex = abilityModifier(sheet.abilities.dex);
  return <div className="vitals-grid">
    <div className="vital-card vital-health"><div className="vital-top"><Heart size={17} /><span>HIT POINTS</span></div><LifeFields sheet={sheet} onChange={onChange} /></div>
    <div className="vital-card"><div className="vital-top"><Shield size={17} /><span>ARMOUR CLASS</span></div><input aria-label="Armour class" className="vital-value-input" type="number" inputMode="numeric" placeholder="—" value={sheet.armorClass} onChange={(e)=>onChange(s=>({...s,armorClass:e.target.value}))}/></div>
    <div className="vital-card"><div className="vital-top"><Activity size={17} /><span>SPEED (FT)</span></div><input aria-label="Walking speed in feet" className="vital-value-input" type="number" inputMode="numeric" placeholder="—" value={sheet.speed} onChange={(e)=>onChange(s=>({...s,speed:e.target.value}))}/></div>
    <div className="vital-card"><div className="vital-top"><Sparkles size={17} /><span>PROFICIENCY</span></div><div className="vital-value">{signed(prof)}</div></div>
    <div className="vital-card vital-extra"><div className="vital-top"><Dices size={17} /><span>INITIATIVE</span></div><div className="vital-value">{signed(dex)}</div></div>
  </div>;
}

function AbilityCards({ sheet, onChange, onRoll }: { sheet: CharacterSheet; onChange: Update; onRoll: Props["onRoll"] }) {
  return <div className="ability-grid">{ABILITIES.map((ability) => {
    const score=sheet.abilities[ability.id];
    const mod=abilityModifier(score);
    return <div className="ability-card" key={ability.id}>
      <span className="ability-title">{ability.label}</span>
      <span className="ability-short">{ability.short}</span>
      <RollButton label={`${ability.label} check`} mod={mod} onRoll={onRoll} large />
      <label className="ability-score-label"><span>Score</span><input aria-label={`${ability.label} score`} type="number" inputMode="numeric" min="1" max="30" placeholder="—" value={score} onChange={(event)=>onChange(s=>({...s,abilities:{...s.abilities,[ability.id]:event.target.value}}))} /></label>
    </div>;
  })}</div>;
}

function SavingThrows({sheet,onChange,onRoll}: {sheet:CharacterSheet;onChange:Update;onRoll:Props["onRoll"]}) {
  return <div className="list-card">{ABILITIES.map(ability=>{
    const proficient=sheet.savingThrows.includes(ability.id);
    const total=checkBonus(sheet.abilities[ability.id],proficient?1:0,sheet.level);
    return <div className="skill-row" key={ability.id}>
      <button type="button" className={`rank-dot ${proficient?"rank-trained":""}`} aria-label={`${ability.label} saving throw ${proficient?"proficient":"not proficient"}; toggle`} aria-pressed={proficient} onClick={()=>onChange(s=>({...s,savingThrows:s.savingThrows.includes(ability.id)?s.savingThrows.filter(id=>id!==ability.id):[...s.savingThrows,ability.id]}))}>{proficient&&<Check size={11}/>}</button>
      <span className="skill-row-name">{ability.label}</span>
      <span className="skill-ability">{ability.short}</span>
      <RollButton label={`${ability.label} saving throw`} mod={total} onRoll={onRoll}/>
    </div>;
  })}</div>;
}

function SheetOverview({ sheet, onChange, onRoll }: Props) {
  const perception=checkBonus(sheet.abilities.wis,sheet.skills.Perception,sheet.level);
  const passive=perception===null?"—":String(10+perception);
  return <div className="sheet-layout">
    <Identity sheet={sheet} onChange={onChange}/>
    <Vitals sheet={sheet} onChange={onChange}/>
    <div className="overview-columns">
      <section className="overview-abilities"><SectionTitle label="Ability scores" description="Fill in a score, then tap its modifier to roll." icon={<Dices size={18}/>}/><AbilityCards sheet={sheet} onChange={onChange} onRoll={onRoll}/></section>
      <section className="overview-saves"><SectionTitle label="Saving throws" description="Mark the ones you're proficient in." icon={<Shield size={18}/>}/><SavingThrows sheet={sheet} onChange={onChange} onRoll={onRoll}/><div className="passive-card"><span>PASSIVE PERCEPTION</span><strong>{passive}</strong></div><button type="button" onClick={()=>onChange(s=>({...s,inspiration:!s.inspiration}))} className={`inspiration-card ${sheet.inspiration?"inspiration-on":""}`}><span className="inspiration-icon"><Sparkles size={19}/></span><span><strong>Inspiration</strong><small>{sheet.inspiration ? "Ready to use" : "Tap to mark inspiration"}</small></span><span className="inspiration-check">{sheet.inspiration&&<Check size={16}/>}</span></button></section>
    </div>
  </div>;
}

function SkillsPage({sheet,onChange,onRoll}: Props) {
  return <div className="page-section"><div className="page-intro"><div className="eyebrow">WHAT YOUR HERO CAN DO</div><h1>Skills & talents</h1><p>Tap the circle once for proficiency, twice for expertise, and again to clear it.</p></div>
    <div className="skill-legend"><span><i className="legend-empty" /> No proficiency</span><span><i className="legend-trained" /> Proficient</span><span><i className="legend-expert" /> Expertise</span></div>
    <div className="skills-grid">{SKILLS.map(({name,ability})=>{
      const rank=sheet.skills[name] ?? 0;
      const total=checkBonus(sheet.abilities[ability],rank,sheet.level);
      const label=ABILITIES.find(a=>a.id===ability)?.short;
      return <div className="skill-row skill-wide" key={name}>
        <button type="button" className={`rank-dot ${rank===1?"rank-trained":rank===2?"rank-expert":""}`} aria-label={`${name}: ${rank===0?"not proficient":rank===1?"proficient":"expertise"}. Tap to change`} onClick={()=>onChange(s=>({...s,skills:{...s.skills,[name]:((rank+1)%3) as SkillRank}}))}>{rank>0?(rank===2?<span className="expert-symbol">✦</span>:<Check size={11}/>):null}</button>
        <span className="skill-row-name">{name}</span>
        <span className="skill-ability">{label}</span>
        <RollButton label={`${name} check`} mod={total} onRoll={onRoll}/>
      </div>;
    })}</div>
    <p className="hint-line"><CircleHelp size={15}/> Bonuses are calculated from your ability scores, level, and proficiency selections.</p>
  </div>;
}

function DeathSaves({sheet,onChange}: {sheet:CharacterSheet;onChange:Update}) {
  return <div className="death-save-card"><div className="death-row"><span>Successes</span><div className="death-dots">{[1,2,3].map(n=><button type="button" key={n} aria-label={`Set death saving throw successes to ${n}`} aria-pressed={sheet.deathSuccess>=n} onClick={()=>onChange(s=>({...s,deathSuccess:s.deathSuccess===n?n-1:n}))} className={sheet.deathSuccess>=n?"active-success":""}/>)}</div></div><div className="death-row"><span>Failures</span><div className="death-dots">{[1,2,3].map(n=><button type="button" key={n} aria-label={`Set death saving throw failures to ${n}`} aria-pressed={sheet.deathFailure>=n} onClick={()=>onChange(s=>({...s,deathFailure:s.deathFailure===n?n-1:n}))} className={sheet.deathFailure>=n?"active-failure":""}/>)}</div></div><button className="text-button small-button" type="button" onClick={()=>onChange(s=>({...s,deathSuccess:0,deathFailure:0}))}>Clear death saves</button></div>;
}

function CombatPage({sheet,onChange,onRoll}: Props) {
  function attackChange(id: string, field: keyof Attack, value: string) {
    onChange(s=>({...s,attacks:s.attacks.map(a=>a.id===id?{...a,[field]:value}:a)}));
  }
  return <div className="page-section"><div className="page-intro"><div className="eyebrow">WHEN INITIATIVE IS ROLLED</div><h1>Combat & spells</h1><p>Your health, attacks, and magic — all in one place.</p></div>
    <div className="combat-top-grid">
      <section className="panel combat-health"><SectionTitle label="Hit points" icon={<Heart size={18}/>}/><LifeFields sheet={sheet} onChange={onChange} quick/><div className="combat-minor"><TextField label="Temporary HP" numeric value={sheet.tempHp} onChange={(v)=>onChange(s=>({...s,tempHp:v}))}/><TextField label="Hit dice" value={sheet.hitDice} placeholder="e.g. 2d8" onChange={(v)=>onChange(s=>({...s,hitDice:v}))}/></div></section>
      <section className="panel"><SectionTitle label="Death saves" description="Tap each circle to mark progress." icon={<Activity size={18}/>}/><DeathSaves sheet={sheet} onChange={onChange}/></section>
    </div>
    <section className="panel combat-attacks"><SectionTitle label="Attacks & weapons" description="Keep your main attacks at hand." icon={<Swords size={18}/>} action={<button type="button" className="button outline-button small-button" onClick={()=>onChange(s=>({...s,attacks:[...s.attacks,{id:crypto.randomUUID(),name:"",toHit:"",damage:""}]}))}><Plus size={16}/> Add attack</button>}/>
      {sheet.attacks.length===0 ? <div className="inline-empty"><Swords size={27}/><strong>No attacks added yet</strong><span>Add a weapon or spell attack when you're ready.</span></div> : <div className="attacks-list">{sheet.attacks.map((attack,index)=><div className="attack-row" key={attack.id}>
        <div className="attack-index">{String(index+1).padStart(2,"0")}</div>
        <TextField label="Attack name" value={attack.name} onChange={(v)=>attackChange(attack.id,"name",v)} placeholder="e.g. Longsword" />
        <TextField label="To hit" value={attack.toHit} onChange={(v)=>attackChange(attack.id,"toHit",v)} placeholder="e.g. +5" />
        <TextField label="Damage / type" value={attack.damage} onChange={(v)=>attackChange(attack.id,"damage",v)} placeholder="e.g. 1d8 + 3 slashing" />
        <div className="attack-actions"><button type="button" className="icon-action" aria-label={`Roll attack ${attack.name||index+1}`} onClick={()=>{
          const bonus=attack.toHit.trim()!==""&&Number.isFinite(Number(attack.toHit))?Number(attack.toHit):null;
          onRoll(`${attack.name||"Attack"} to hit`,bonus);
        }}><Dices size={18}/></button><button type="button" className="icon-action danger-action" aria-label={`Remove attack ${attack.name||index+1}`} onClick={()=>onChange(s=>({...s,attacks:s.attacks.filter(a=>a.id!==attack.id)}))}><Trash2 size={17}/></button></div>
      </div>)}</div>}
    </section>
    <section className="panel"><SectionTitle label="Spells & magic" description="Spell slots, prepared spells, and spellcasting notes." icon={<WandSparkles size={18}/>}/><textarea className="notes-textarea" value={sheet.spells} onChange={(e)=>onChange(s=>({...s,spells:e.target.value}))} placeholder="Write down your spells, spell slots, casting ability, and anything else you want to remember..." rows={7}/></section>
  </div>;
}

function JournalArea({title,description,icon,value,onChange,placeholder,rows=7}: {title:string;description:string;icon:ReactNode;value:string;onChange:(value:string)=>void;placeholder:string;rows?:number}) {
  return <section className="panel journal-panel"><SectionTitle label={title} description={description} icon={icon}/><textarea className="notes-textarea" value={value} onChange={(e)=>onChange(e.target.value)} rows={rows} placeholder={placeholder} /></section>;
}

function JournalPage({sheet,onChange}: Props) {
  return <div className="page-section"><div className="page-intro"><div className="eyebrow">THE STORY BEHIND THE STATS</div><h1>Adventure journal</h1><p>Everything you want to remember, without a hundred different tabs.</p></div>
    <div className="journal-grid">
      <JournalArea title="Features & traits" description="Class features, feats, and special abilities." icon={<Sparkles size={18}/>} value={sheet.features} onChange={(v)=>onChange(s=>({...s,features:v}))} placeholder="Write your character's features and abilities here..."/>
      <JournalArea title="Equipment & inventory" description="What your adventurer carries." icon={<Backpack size={18}/>} value={sheet.equipment} onChange={(v)=>onChange(s=>({...s,equipment:v}))} placeholder="Weapons, armour, tools, potions, and treasures..." />
      <JournalArea title="Campaign notes" description="People, places, and quests worth remembering." icon={<ScrollText size={18}/>} value={sheet.notes} onChange={(v)=>onChange(s=>({...s,notes:v}))} placeholder="What happened last session? Who do you need to find?" rows={10}/>
      <section className="panel journal-money"><SectionTitle label="Treasure" description="Keep track of your gold pieces." icon={<Coins size={18}/>}/><TextField label="Gold pieces (GP)" numeric value={sheet.gold} onChange={(v)=>onChange(s=>({...s,gold:v}))} placeholder="—"/><div className="journal-decoration" aria-hidden="true"><Coins size={75} strokeWidth={1}/><ChevronRight size={17}/></div></section>
    </div>
  </div>;
}

export function CharacterEditor(props: Props) {
  if (props.tab === "skills") return <SkillsPage {...props}/>;
  if (props.tab === "combat") return <CombatPage {...props}/>;
  if (props.tab === "journal") return <JournalPage {...props}/>;
  return <SheetOverview {...props}/>;
}
