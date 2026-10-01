"use client";
import { useEffect, useRef, useState } from "react";
import { ABILITY_INFO, DRAFT_BUDGET, EVENT_INFO, MAX_ATTACK_POWER, createEscalade, playEscalade, type EscaladeState, type Tactic } from "@/lib/escalade";
import { CardOrnaments } from "@/components/CardOrnaments";

type SkinData = { image: string; rarity: string; name: string; atk: number; def: number };
function Card({ card, highlight, skin, animate }: { card: Tactic; highlight?: boolean; skin?: SkinData; animate?: boolean }) {
  if (skin) {
    const atkVal = card.kind === "ATTACK" ? card.value : skin.atk;
    const defVal = card.kind === "DEFENSE" ? card.value : skin.def;
    return (
      <div className={`escalade-coll-wrap-static ${highlight ? "chosen" : ""} ${animate ? "escalade-card-enter" : ""}`}>
        <div className="escalade-coll-scale-outer">
          <div className="escalade-coll-scale-inner">
            <div className="steam-card-shell escalade-coll-square-shell rounded-2xl border-2 bg-gray-900 overflow-hidden flex flex-col" data-rarity={skin.rarity} style={{width:"100%",height:"100%"}}>
              <CardOrnaments />
              <div className="steam-card-visual"><img src={skin.image} alt={skin.name} className="w-full h-full object-cover" /></div>
              <div className="steam-card-content p-2 flex flex-col gap-1 flex-1 overflow-hidden">
                <div className="steam-card-nameplate"><h3 className="steam-card-title text-white font-bold text-sm leading-tight line-clamp-2">{skin.name}</h3></div>
                <div className="steam-statbar flex justify-between items-center pt-1 mt-auto">
                  <div className={`steam-stat steam-stat-atk flex items-center gap-1 font-bold${card.kind !== "ATTACK" ? " stat-dimmed" : ""}`}><span className="text-xs">ATK</span><span>{atkVal}</span></div>
                  <div className={`steam-stat steam-stat-def flex items-center gap-1 font-bold${card.kind !== "DEFENSE" ? " stat-dimmed" : ""}`}><span className="text-xs">DEF</span><span>{defVal}</span></div>
                </div>
                {card.kind === "ATTACK" && card.value <= 3 && <p className="text-center text-yellow-400 text-[9px]">⚡ Percée (-4 DEF)</p>}
                <span className="escalade-ability-rune">♨ {ABILITY_INFO[card.ability].name}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`escalade-tactic ${card.kind === "ATTACK" ? "attack" : "defense"} ${highlight ? "chosen" : ""} ${animate ? "escalade-card-enter" : ""}`}>
      <small>{card.kind === "ATTACK" ? "⚔ Attaque" : "🛡 Défense"}</small>
      <b>{card.value}</b>
    </div>
  );
}

function MiniCalc({ cards, defense, pierce }: { cards: number[]; defense: number; pierce?: boolean }) {
  const values = cards;
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  const hasPair = new Set(values).size < values.length;
  const hasRun = uniq.some((n, i) => uniq[i + 1] === n + 1 && uniq[i + 2] === n + 2);
  const bonus = hasRun ? 5 : hasPair ? 3 : 0;
  // Rendement dégressif : seule la carte la plus forte compte à 100%, les suivantes à 50%.
  const desc = [...values].sort((a, b) => b - a);
  const raw = desc.reduce((sum, v, i) => sum + (i === 0 ? v : Math.floor(v / 2)), 0);
  const eff = pierce ? Math.max(0, defense - 4) : defense;
  const total = Math.min(MAX_ATTACK_POWER, raw + bonus);
  const broken = total >= eff;
  const riposte = defense >= 22 ? 3 : defense >= 15 ? 2 : defense >= 8 ? 1 : 0;
  return (
    <div className="escalade-mini-calc">
      <div className="escalade-mini-cards">
        {values.map((v, i) => <span key={i} className={`escalade-mini-card attack ${(v === 2 || v === 3) && pierce ? "pierce-glow" : ""}`}>⚔{v}</span>)}
        <span className="escalade-mini-vs">vs</span>
        <span className={`escalade-mini-card defense ${pierce ? "pierce-hit" : ""}`}>🛡{pierce ? <><s>{defense}</s> {eff}</> : defense}</span>
      </div>
      <div className="escalade-mini-math">
        {values.length > 1 ? <span className="bonus-tag">{desc.map((v, i) => i === 0 ? `${v}` : ` + ${v}/2`).join("")} = {raw}</span> : raw}
        {bonus > 0 && <span className="bonus-tag"> + {bonus} {hasRun ? "suite" : "paire"} = {raw + bonus}</span>}
        {raw + bonus > MAX_ATTACK_POWER && <span className="pierce-tag"> · régulateur → {MAX_ATTACK_POWER}</span>}
        {pierce && <span className="pierce-tag"> · percée −4</span>}
        <span className={broken ? "calc-win" : "calc-miss"}> → {broken ? "✅ Brisé !" : `🛡 Reste ${defense - total}${riposte > 0 ? ` · riposte −${riposte} PV` : ""}`}</span>
      </div>
    </div>
  );
}

function HPBar({ hp, flash }: { hp: number; flash?: boolean }) {
  return <div className={`escalade-hp-bar ${flash ? "hp-flash" : ""}`}><div style={{ width: `${hp * 5}%` }} /><span>{hp} PV</span></div>;
}

const STEPS = [
  {
    title: "🎮 Bienvenue dans L'Escalade !",
    text: "Tu vas faire un duel de cartes ! Tu as 20 points de vie ❤️. Gagne 2 manches et tu gagnes ! À chaque manche, tu choisis 5 cartes dans le même paquet que l'autre joueur. C'est pareil pour tout le monde, c'est super fair play ! Attention : empiler toutes ses attaques d'un coup rapporte de moins en moins, et rater une attaque contre un gros bouclier fait mal (riposte) !",
    extra: <div className="escalade-mini-deck">
      <div><strong>⚔ Tes épées (pour attaquer)</strong><div className="escalade-mini-row">{[2,2,3,4,5,6,7,8,9,10].map((v,i)=><span key={i} className="escalade-mini-card attack">⚔{v}</span>)}</div></div>
      <div style={{marginTop:10}}><strong>🛡 Tes boucliers (pour défendre)</strong><div className="escalade-mini-row">{[8,12,15,18,22].map((v,i)=><span key={i} className="escalade-mini-card defense">🛡{v}</span>)}</div></div>
    </div>,
    action: null,
  },
  {
    title: "🤫 Ta main secrète",
    text: `Tu choisis 5 cartes et tu les gardes cachées ! Chaque carte reçoit un pouvoir aléatoire commun aux deux joueurs. Ta main doit contenir au moins 1 attaque et 1 bouclier sans dépasser ${DRAFT_BUDGET} points. Le tutoriel utilise une main spéciale pour montrer les mécaniques.`,
    extra: null,
    action: null,
  },
  {
    title: "🛡 Pose ton bouclier !",
    text: "Le premier joueur doit poser un bouclier sur la table. C'est comme construire un mur ! L'autre joueur doit casser ce mur avec ses épées. Ici tu poses ton bouclier de 15.",
    extra: null,
    action: (s: EscaladeState) => playEscalade(s, 0, { type: "defend", cardId: "d2" }),
  },
  {
    title: "⚔ L'autre attaque !",
    text: "L'adversaire envoie son épée 5 contre ton mur de 15. Est-ce que 5 ≥ 15 ? Non ! Ton mur tient bon, il tombe à 10. Mais rater son coup lui coûte cher : il encaisse 2 dégâts de riposte, parce que les gros boucliers ripostent fort quand on ne les casse pas !",
    extra: <MiniCalc cards={[5]} defense={15} />,
    action: (s: EscaladeState) => playEscalade(s, 1, { type: "attack", cardIds: ["a4"] }),
  },
  {
    title: "♨ La pression monte !",
    text: "Cette attaque ratée remplit la jauge de vapeur adverse. Une attaque qui use un bouclier donne 1 vapeur ; une brèche en donne 2. La jauge va de 0 à 6. Cette énergie sert à déclencher une capacité inscrite sur une carte jouée — une seule capacité par tour.",
    extra: <div className="escalade-tuto-steam"><b>♨ 1 / 6</b><span>Plus la machine chauffe, plus les choix tactiques s’ouvrent.</span></div>,
    action: null,
  },
  {
    title: "✨ Le truc de la Paire : +3 points gratuits !",
    text: "Si tu joues deux épées avec le même chiffre (ex : deux épées de 2), tu reçois +3 points bonus ! Mais attention à l'usure : seule la première carte compte à 100%, la deuxième ne compte qu'à moitié. 2 pleine + 2÷2=1 → 2+1=3, plus le bonus de paire : 3 + 3 = 6 !",
    extra: <><MiniCalc cards={[2,2]} defense={6} /><p className="escalade-mini-tip">⚠️ Un seul bonus par attaque : la paire OU la suite, jamais les deux à la fois !</p></>,
    action: null,
  },
  {
    title: "✨ Le truc de la Suite : +5 points gratuits !",
    text: "Si tu joues 3 épées qui se suivent (ex : 4, 5, 6), tu reçois +5 points bonus ! C'est le meilleur bonus. Avec l'usure : 6 pleine + 5÷2=2 + 4÷2=2 → 6+2+2=10, plus le bonus : 10 + 5 = 15 !",
    extra: <><MiniCalc cards={[4,5,6]} defense={15} /><p className="escalade-mini-tip">La suite donne +5, et même avec l'usure elle reste très forte !</p></>,
    action: null,
  },
  {
    title: "✨ Le truc de la Percée : le bouclier semble plus petit !",
    text: "Si tu mets une épée de 2 ou de 3 dans ton attaque, le bouclier adverse semble avoir 4 de moins pour voir si tu le casses ! Mais si tu ne le casses pas, il reprend sa vraie taille.",
    extra: <><MiniCalc cards={[2,3]} defense={8} pierce /><p className="escalade-mini-tip">3 pleine + 2÷2=1 → 3+1=4. Le mur semble faire 8−4=4. Et 4 ≥ 4 → ✅ Cassé, tout juste !</p></>,
    action: null,
  },
  {
    title: "✨ Paire + Percée ensemble !",
    text: "Tu peux combiner la percée avec la paire ! Deux épées de 2 : c'est une paire ET une percée. Double super pouvoir !",
    extra: <><MiniCalc cards={[2,2]} defense={8} pierce /><p className="escalade-mini-tip">2 + 2÷2=1 → 3, +3 paire = 6. Le mur semble faire 8−4=4. Et 6 ≥ 4 → ✅ Cassé !</p></>,
    action: null,
  },
  {
    title: "💥 Brèche, vapeur et Soupape !",
    text: "Ton mur est déjà tombé à 10. La paire de 2 avec percée le casse pile et rapporte 2 vapeur : l'adversaire atteint 3/6. Il pose alors son bouclier de 15 et dépense ses 3 vapeur pour activer Soupape : il récupère 2 PV. C'est la 'rechute' — maintenant c'est toi qui dois attaquer !",
    extra: null,
    action: (s: EscaladeState) => { const a = playEscalade(s, 1, { type: "attack", cardIds: ["a0", "a1"] }); return playEscalade(a, 1, { type: "defend", cardId: "d2", useAbility: true }); },
  },
  {
    title: "⚡ Tu joues la suite 8-9-10 !",
    text: "Tu joues tes épées 8, 9 et 10 d'un coup ! Le calcul brut atteint 23, mais le régulateur limite chaque attaque à 16. Le bouclier de 15 tombe : une grosse suite reste forte sans pouvoir écraser n'importe quelle défense.",
    extra: <MiniCalc cards={[8,9,10]} defense={15} />,
    action: (s: EscaladeState) => playEscalade(s, 0, { type: "attack", cardIds: ["a7", "a8", "a9"] }),
  },
  {
    title: "🛡 Ton dernier bouclier de 12",
    text: "Tu poses ton dernier bouclier. L'adversaire n'a plus qu'une seule épée de 3.",
    extra: null,
    action: (s: EscaladeState) => playEscalade(s, 0, { type: "defend", cardId: "d1" }),
  },
  {
    title: "🏳️ L'adversaire cède intelligemment",
    text: "Avec une seule épée de 3 face à ton mur de 12, même avec percée ça ne casse pas (12−4=8, et 3 < 8). Pire : attaquer pour rien lui coûterait une riposte en plus ! Le bon calcul, c'est de céder tout de suite : son épée sert à réduire les dégâts, sans bonus.",
    extra: <div className="escalade-mini-cede"><span>🛡 Mon mur résiste encore : 12 points</span><span>⚔ Son épée restante : 3 (elle absorbe les dégâts, sans bonus)</span><span className="calc-win">💥 Il prend : 12 − 3 = <b>9 PV de dégâts !</b></span></div>,
    action: (s: EscaladeState) => playEscalade(s, 1, { type: "cede" }),
  },
  {
    title: "🏆 Tu gagnes la manche 1 !",
    text: "Tu as 20 PV, lui 11 PV après l’effet de sa Soupape. Tu gagnes la manche ! Mais pour gagner le match, il faut gagner 2 manches. Nouvelle manche : tout le monde repart à 20 PV, la vapeur retombe à 0 et un nouvel événement arrive.",
    extra: null,
    action: null,
  },
];

const initial = () => createEscalade(["d2", "d1", "a7", "a8", "a9"], ["d2", "a4", "a0", "a1", "a2"], 0);

export function EscaladeTutorial({ close, skinMap = {} }: { close: () => void; skinMap?: Record<string, SkinData> }) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<EscaladeState>(initial);
  const [flashSide, setFlashSide] = useState<0|1|null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);

  function next() {
    const s = STEPS[step];
    if (s.action) {
      const next = s.action(state);
      if (next.hp[0] < state.hp[0]) { setFlashSide(0); setTimeout(() => setFlashSide(null), 600); }
      if (next.hp[1] < state.hp[1]) { setFlashSide(1); setTimeout(() => setFlashSide(null), 600); }
      setState(next);
    }
    if (step === STEPS.length - 1) close(); else setStep(step + 1);
  }

  const s = STEPS[step];
  const myHand = state.hands[0];
  const enemyHandCount = state.hands[1].length;

  return (
    <dialog ref={dialog} className="escalade-tutorial" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }} aria-labelledby="escalade-tuto-title">
      <div className="escalade-tutorial-body">
        <button className="escalade-close" onClick={close} aria-label="Fermer">×</button>
        <span className="battle-eyebrow">⚙ Tutoriel · {step + 1} / {STEPS.length}</span>
        <progress value={step + 1} max={STEPS.length} />
        <h2 id="escalade-tuto-title">{s.title}</h2>
        <p>{s.text}</p>

        {s.extra && <div className="escalade-tuto-extra">{s.extra}</div>}

        <div className="escalade-score">
          <span>Toi<HPBar hp={state.hp[0]} flash={flashSide === 0} /><small>♨ {state.pressure[0]}/6</small></span>
          <strong>{state.wins[0]} – {state.wins[1]}<small>Manches</small></strong>
          <span>Adversaire<HPBar hp={state.hp[1]} flash={flashSide === 1} /><small>♨ {state.pressure[1]}/6</small></span>
        </div>
        <div className="escalade-event-plaque"><span>Événement</span><strong>{EVENT_INFO[state.event].name}</strong><small>{EVENT_INFO[state.event].short}</small></div>

        {state.line && (
          <div className="escalade-line">
            <small>Bouclier de {state.line.owner === 0 ? "toi" : "l'adversaire"}</small>
            <strong>🛡 {state.line.remaining}</strong>
            {state.line.remaining !== state.line.card.value && <span>Initial : {state.line.card.value}</span>}
          </div>
        )}

        {myHand.length > 0 && state.phase !== "DRAFT" && (
          <div>
            <p className="battle-muted">Ta main ({myHand.length} carte{myHand.length > 1 ? "s" : ""}) · Adversaire : {enemyHandCount} carte{enemyHandCount > 1 ? "s" : ""} cachée{enemyHandCount > 1 ? "s" : ""}</p>
            <div className="escalade-hand">
              {myHand.map((c, i) => <Card key={c.id} card={c} skin={skinMap[c.id]} animate={i < 2} />)}
            </div>
          </div>
        )}

        <div className="battle-actions">
          <button className="battle-secondary" onClick={() => { setStep(0); setState(initial()); }}>↺ Recommencer</button>
          <button className="battle-primary" onClick={next}>{step === STEPS.length - 1 ? "Terminer" : s.action ? "▶ Voir l'action" : "Suivant →"}</button>
        </div>
      </div>
    </dialog>
  );
}

export function EscaladeRules() {
  return (
    <details className="battle-panel escalade-rules">
      <summary>📖 Les règles · Version simple</summary>

      <h3>🎯 Pour gagner</h3>
      <p>Gagne <b>2 manches</b> avant l'autre. Chaque manche, tu as <b>20 points de vie</b>. Celui qui en a le plus à la fin de la manche gagne. Égalité de PV ? La plus grosse carte d'attaque restante décide. Encore égalité ? C'est la somme de toutes les attaques restantes qui décide. Encore égalité → personne ne marque, nouvelle manche !</p>

      <h3>🃏 Ta main secrète</h3>
      <p>Chaque manche tu prends <b>5 cartes parmi 15</b> (identiques pour tout le monde), avec au moins <b>1 attaque et 1 bouclier</b>, sans dépasser <b>{DRAFT_BUDGET} points de budget</b>. Les pouvoirs sont redistribués avant le choix, mais la distribution est strictement identique pour les deux joueurs.</p>
      <div className="escalade-mini-deck">
        <div><b>⚔ Attaques</b><div className="escalade-mini-row">{[2,2,3,4,5,6,7,8,9,10].map((v,i)=><span key={i} className="escalade-mini-card attack">⚔{v}</span>)}</div></div>
        <div style={{marginTop:8}}><b>🛡 Défenses</b><div className="escalade-mini-row">{[8,12,15,18,22].map((v,i)=><span key={i} className="escalade-mini-card defense">🛡{v}</span>)}</div></div>
      </div>

      <h3>⚔ Comment ça se joue</h3>
      <p>Le premier joueur pose un bouclier. L'autre attaque. Si la somme (bonus compris) atteint la résistance du bouclier → il se brise ! Sinon le bouclier perd juste l'attaque jouée, ET l'attaquant encaisse une <b>riposte</b> : plus le bouclier raté est gros, plus le contre-dégât fait mal.</p>
      <p><b>Rendement dégressif :</b> seule ta carte la plus forte compte à 100 % ; chaque carte suivante compte à moitié (arrondi au-dessous). Le régulateur bloque ensuite une action à <b>{MAX_ATTACK_POWER} ATK maximum</b>. Cela conserve les combos sans permettre une victoire éclair.</p>

      <h3>♨ Vapeur et capacités</h3>
      <p>Ta jauge contient de <b>0 à 6 vapeur</b>. Une attaque qui use une défense rapporte 1 vapeur ; une brèche en rapporte 2. Poser une petite défense rapporte aussi 1. Tu peux activer au maximum <b>un pouvoir par action</b>. Les 9 pouvoirs couvrent attaque, percée, vapeur, dégâts directs, incendie, blindage, soin, riposte et récupération.</p>
      <div className="escalade-ability-legend">{Object.entries(ABILITY_INFO).map(([id, info]) => <span key={id}><b>{info.name}</b> · {info.cost} ♨ · {info.short}</span>)}</div>

      <h3>🎲 Événement de manche</h3>
      <p>Chaque manche possède une règle commune, visible avant de jouer : machines stables, haute pression (+1 aux gains), métal fragile (−2 à toutes les défenses) ou atelier efficace (capacités moins chères). L'événement est identique pour les deux joueurs et change à la manche suivante.</p>

      <h3>✨ Les 3 techniques</h3>
      <MiniCalc cards={[3,3]} defense={15} pierce />
      <p className="escalade-mini-tip"><b>Paire (+3) :</b> deux cartes identiques → +3 d'attaque en bonus.</p>
      <MiniCalc cards={[4,5,6]} defense={14} />
      <p className="escalade-mini-tip"><b>Suite (+5) :</b> 3 valeurs distinctes qui se suivent → +5. Le meilleur bonus, un seul par attaque.</p>
      <MiniCalc cards={[2,9]} defense={15} pierce />
      <p className="escalade-mini-tip"><b>Percée (−4 DEF) :</b> si tu as une carte 2 ou 3 dans ta sélection, le bouclier semble valoir 4 de moins pour voir si tu le brises. Le bouclier ne perd pas vraiment ces 4 points si tu ne brises pas.</p>

      <h3>🔄 Riposte</h3>
      <p>Une attaque qui ne casse pas le bouclier fait quand même mal à l'attaquant : <b>8-14 → 1 PV</b>, <b>15-21 → 2 PV</b>, <b>22 → 3 PV</b> de contre-dégâts immédiats. Attaquer un gros bouclier avec une carte trop faible coûte cher : mieux vaut parfois céder tout de suite.</p>

      <h3>🏳️ Céder</h3>
      <p>Tu peux abandonner <b>la ligne active</b> face à un bouclier. Tes attaques restantes absorbent les dégâts (sans bonus), puis sont défaussées. Tu perds <b>max(0, résistance − somme de tes attaques)</b> PV et le combat continue si une défense reste disponible. Une manche se termine au K.O. ou quand personne ne peut plus poser de défense.</p>

      <h3>💰 Les mises</h3>
      <p>Avant de jouer tu peux miser des gigapuissances et/ou une carte de ta collection. La carte misée ne combat pas. Le gagnant du match remporte tout. Récompense : <b>3 gigapuissances + 25 XP</b> pour le vainqueur, 5 XP pour le perdant.</p>
    </details>
  );
}
