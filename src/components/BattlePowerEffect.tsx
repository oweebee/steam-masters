"use client";

import { useEffect, useRef, useState } from "react";
import type { EscaladeDamage } from "@/lib/escalade";
import { BATTLE_ANIMATION_SPEED, battleAnimationTiming } from "@/lib/battleAnimationTiming";

/** One shot, aligned with the replay; targets are measured from the actual board. */
export function BattlePowerEffect({ ability, attack, fromSelf, power, broken, damage, side, cardCount = 1 }: {
  ability: string; attack: boolean; fromSelf: boolean; power?: number; broken?: boolean; damage?: EscaladeDamage[]; side: 0 | 1; cardCount?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState({ top: 0, bottom: 0 });
  const hasDamage = Boolean(damage?.length);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const timing = battleAnimationTiming(cardCount);
    let frame = 0, elapsed = 0, previous = 0, lastPaint = 0;
    let w = 1, h = 1, sx = 0, sy = 0, tx = 0, ty = 0;
    const measure = () => {
      const bounds = canvas.getBoundingClientRect(); w = bounds.width; h = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
      const root = canvas.closest(".escalade-arena-root");
      const scene = canvas.parentElement?.querySelector(".escalade-anim-scene")?.getBoundingClientRect();
      const targetSelf = attack ? !fromSelf : fromSelf;
      const target = root?.querySelector(targetSelf ? ".escalade-player-line" : ".escalade-opponent-line")?.getBoundingClientRect();
      sx = scene ? scene.left + scene.width/2 - bounds.left : w/2;
      sy = scene ? scene.top + scene.height/2 - bounds.top : h/2;
      tx = target ? target.left + target.width/2 - bounds.left : w/2;
      ty = target ? target.top + target.height/2 - bounds.top : h*(targetSelf?.7:.3);
      const rowY = (selector: string, fallback: number) => { const row = root?.querySelector(selector)?.getBoundingClientRect(); return row ? row.top + row.height / 2 - bounds.top : h * fallback; };
      setPositions({ top: rowY(".escalade-opponent-line", .3), bottom: rowY(".escalade-player-line", .7) });
    };
    const resize = new ResizeObserver(measure);resize.observe(canvas);measure();
    const rand = (n:number) => { const x=Math.sin(n*127.1+91.7)*43758.5453;return x-Math.floor(x); };
    const electric = ability === "COURT_CIRCUIT" || ability === "ACCUMULATEUR";
    const fire = ability === "INCENDIE" || ability === "SURCHARGE";
    const steam = ability === "TURBINE" || ability === "SOUPAPE";
    const ice = ability === "MIROIR" || ability === "BLINDAGE";
    const color = electric ? (ability === "ACCUMULATEUR" ? "255,206,87" : "96,201,255") : fire ? "255,107,25" : steam ? "190,236,218" : ice ? "160,224,255" : "255,198,111";
    const glow = (x:number,y:number,r:number,a:number) => {
      const g=ctx.createRadialGradient(x,y,0,x,y,Math.max(1,r));g.addColorStop(0,`rgba(${color},${Math.max(0,a)})`);g.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    };
    const paint = (now:number) => {
      frame=requestAnimationFrame(paint);
      const delta=previous?Math.min(now-previous,50):0;previous=now;
      if(document.hidden)return;
      elapsed+=delta;if(now-lastPaint<33)return;lastPaint=now;
      if (!reduced.matches && elapsed < timing.flightDelay) return;
      const time=reduced.matches?1450:(elapsed - timing.flightDelay) * BATTLE_ANIMATION_SPEED;
      const travel=Math.min(1,time/1000), impact=Math.max(0,Math.min(1,(time-1000)/1450));
      const fade=1-impact, x=sx+(tx-sx)*travel, y=sy+(ty-sy)*travel;
      ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation="screen";
      if (!reduced.matches && travel<1) {
        if(electric) {
          const tick=Math.floor(time/95);ctx.beginPath();ctx.moveTo(sx,sy);
          for(let i=1;i<=28;i++){const p=i/28,bend=Math.sin(p*Math.PI)*(rand(i+tick*39)-.5)*65;ctx.lineTo(sx+(x-sx)*p+bend,sy+(y-sy)*p);}
          ctx.strokeStyle=`rgba(${color},.35)`;ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle=`rgb(${color})`;ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle="#f6ffff";ctx.lineWidth=1;ctx.stroke();
          for(let i=0;i<6;i++){const p=(i+1)/7,bx=sx+(x-sx)*p,by=sy+(y-sy)*p;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+(rand(tick+i)*2-1)*42,by-12);ctx.lineTo(bx+(rand(tick+i+9)*2-1)*66,by+13);ctx.stroke();}
        } else {
          for(let i=0;i<48;i++){const age=i/48,p=Math.max(0,travel-age*.27);const spread=(1-age)*14;const px=sx+(tx-sx)*p+Math.sin(i*3+time*.012)*spread;const py=sy+(ty-sy)*p+Math.cos(i+time*.007)*spread;glow(px,py,(steam?20:fire?13:5)*(1-age)+3,(1-age)*(steam?.17:.6));}
        }
        glow(x,y,fire?38:25,.85);
      }
      if(time>=1000) {
        glow(tx,ty,30+impact*100,fade*.45);
        // Expanding fragments/sparks, with separate steam and crystal rendering.
        for(let i=0;i<64;i++) {
          const angle=rand(i)*Math.PI*2, distance=impact*(35+rand(i+80)*105);
          const px=tx+Math.cos(angle)*distance,py=ty+Math.sin(angle)*distance*.65+(fire?impact*impact*18:0);
          ctx.globalAlpha=fade;
          if(steam){glow(px,py,8+impact*29,fade*.18);}
          else if(ice){ctx.fillStyle=i%3?`rgba(${color},.8)`:"#f5ffff";ctx.beginPath();ctx.moveTo(px,py-9);ctx.lineTo(px+4,py);ctx.lineTo(px-2,py+6);ctx.closePath();ctx.fill();}
          else {ctx.strokeStyle=i%3?`rgb(${color})`:"#fff7d5";ctx.lineWidth=1+rand(i+5)*1.5;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-Math.cos(angle)*(3+fade*9),py-Math.sin(angle)*7);ctx.stroke();if(fire)glow(px,py,7+fade*8,fade*.4);}
        }
        ctx.globalAlpha=fade;ctx.strokeStyle=`rgba(${color},.65)`;ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(tx,ty,12+impact*115,8+impact*48,0,0,Math.PI*2);ctx.stroke();
        if(attack && power!==undefined && !hasDamage){ctx.globalCompositeOperation="source-over";ctx.textAlign="center";ctx.font="bold 24px Georgia";ctx.lineWidth=5;ctx.strokeStyle="#120c08";ctx.strokeText(`${power} ATK`,tx,ty-25-impact*38);ctx.fillStyle=`rgb(${color})`;ctx.fillText(`${power} ATK`,tx,ty-25-impact*38);ctx.font="bold 12px sans-serif";ctx.fillText(broken?"DÉFENSE BRISÉE":"IMPACT",tx,ty+6-impact*38);}
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
      if(reduced.matches || time>2450)cancelAnimationFrame(frame);
    };
    frame=requestAnimationFrame(paint);
    return () => {cancelAnimationFrame(frame);resize.disconnect();};
  },[ability,attack,fromSelf,power,broken,hasDamage,cardCount]);
  return <><canvas ref={ref} className="escalade-battle-particles" aria-hidden="true" />
    <div className="escalade-damage-layer" aria-live="polite">
      {damage?.map((hit, index) => <span key={`${hit.side}-${hit.kind}-${index}`} className={`escalade-replay-damage is-${hit.kind}`} style={{ top: (hit.side === side ? positions.bottom : positions.top) + (hit.kind === "hp" ? -34 : 12), animationDelay: `${battleAnimationTiming(cardCount).impactDelay}ms`, animationDuration: `${battleAnimationTiming(cardCount).damageDuration}ms` }}>
        −{hit.amount} {hit.kind === "hp" ? "PV" : "DEF"}
      </span>)}
    </div>
  </>;
}
