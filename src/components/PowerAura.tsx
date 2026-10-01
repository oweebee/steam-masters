"use client";

import { useEffect, useRef } from "react";
import { BATTLE_ANIMATION_SPEED } from "@/lib/battleAnimationTiming";

/** Transparent particle layer: no hit targets, no state updates per frame. */
export function PowerAura({ ability }: { ability: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true, frame = 0, last = 0, width = 240, height = 240;
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    resize.observe(canvas);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);
    const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const glow = (x: number, y: number, radius: number, color: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(.35, `rgba(${color},${alpha * .45})`); g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g; ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
    };
    const paint = (time: number) => {
      frame = requestAnimationFrame(paint);
      if (!visible || document.hidden || time-last < 33) return;
      if (reduced.matches && last) return;
      last = time;
      const t = reduced.matches ? 1.3 : time / 1000 * BATTLE_ANIMATION_SPEED;
      const l = 15, r = width-15, top = 15, bottom = height-15;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "screen";
      const electric = ability === "COURT_CIRCUIT" || ability === "ACCUMULATEUR";
      const fire = ability === "INCENDIE" || ability === "SURCHARGE";
      const steam = ability === "SOUPAPE" || ability === "TURBINE";
      if (electric) {
        const color = ability === "COURT_CIRCUIT" ? "74,186,255" : "255,190,65";
        // Regenerate branching discharge paths, rather than rotating a border.
        for (let side=0; side<3; side++) {
          const tick = Math.floor(t*8), seed = tick + side*91;
          ctx.beginPath();
          const points: [number,number][] = [];
          for (let j=0;j<15;j++) {
            const p=j/14, jitter=(noise(seed+j)*2-1)*9;
            const x = side===2 ? l+(r-l)*p : (side===0?l:r)+jitter;
            const y = side===2 ? bottom+jitter : top+(bottom-top)*p;
            points.push([x,y]); if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }
          ctx.strokeStyle=`rgba(${color},.45)`;ctx.lineWidth=6;ctx.stroke();
          ctx.strokeStyle=`rgba(${color},.95)`;ctx.lineWidth=2.3;ctx.stroke();
          ctx.strokeStyle="#effbff";ctx.lineWidth=.75;ctx.stroke();
          for(let j=3;j<13;j+=4){const [x,y]=points[j];ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(side===0?9:-9),y-9);ctx.lineTo(x+(side===0?4:-4),y-17);ctx.lineTo(x+(side===0?17:-17),y-25);ctx.stroke();glow(x,y,13,color,.7);}
        }
      } else if (fire) {
        for(let i=0;i<30;i++) {
          const phase=(t*(.45+noise(i)*.4)+noise(i+40))%1;
          const side=i%3, base=side===0?l:side===1?r:l+noise(i+90)*(r-l);
          const x=base+Math.sin(phase*9+i)*5;
          const y=bottom-phase*(side===2?42:height*.85);
          const size=(1-phase)*(7+noise(i+8)*9)+2;
          glow(x,y,size*1.8,"255,66,9",(1-phase)*.65);
          ctx.beginPath();ctx.moveTo(x-size*.45,y+size*.6);
          ctx.bezierCurveTo(x-size,y-size*.4,x+Math.sin(t*4+i)*size,y-size*2.7,x+size*.4,y-size*.4);
          ctx.quadraticCurveTo(x+size,y+size,x-size*.45,y+size*.6);
          const g=ctx.createLinearGradient(x,y+size,x,y-size*2);g.addColorStop(0,"#fff6af");g.addColorStop(.35,"#ffb51b");g.addColorStop(1,"#ef310000");ctx.fillStyle=g;ctx.globalAlpha=(1-phase)*.8;ctx.fill();ctx.globalAlpha=1;
        }
        for(let i=0;i<18;i++){const p=(t*.28+noise(i+150))%1;const x=(i%2?l:r)+Math.sin(i+p*8)*10;const y=bottom-p*height;ctx.fillStyle=`rgba(255,205,90,${1-p})`;ctx.fillRect(x,y,1.4,3);}
      } else if (steam) {
        for(let i=0;i<26;i++) {
          const p=(t*.24+noise(i))%1;
          const x=(i%2?l:r)+Math.sin(p*8+i)*11;
          const y=bottom-p*(height-12);
          const size=5+p*16;
          glow(x,y,size,"184,220,224",Math.sin(p*Math.PI)*.21);
          glow(x+Math.sin(p*12+i)*7,y-5,size*.7,"240,255,255",Math.sin(p*Math.PI)*.2);
        }
        ctx.strokeStyle="rgba(214,247,249,.4)";ctx.lineWidth=.7;
        for(let i=0;i<4;i++){ctx.beginPath();const x=i%2?l:r;const y=bottom-((t*32+i*49)%(height-20));ctx.moveTo(x,y);ctx.bezierCurveTo(x-17,y-13,x+18,y-24,x,y-41);ctx.stroke();}
      } else if (ability === "MIROIR" || ability === "BLINDAGE") {
        for(let i=0;i<20;i++) {
          const p=(t*.13+noise(i))%1, x=i%2?l:r, y=top+noise(i+37)*(bottom-top);
          const size=4+noise(i+64)*10;
          ctx.globalAlpha=.25+Math.sin(p*Math.PI)*.6;
          ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size*.55,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size*.4,y+size*.2);ctx.closePath();
          ctx.fillStyle=i%2?"#97dcf3":"#d6f7ff";ctx.fill();ctx.strokeStyle="#f1fdff";ctx.lineWidth=.7;ctx.stroke();
          ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x-1,y+size);ctx.stroke();
          glow(x,y,10,"104,205,255",.25);ctx.globalAlpha=1;
        }
        const y=top+(t*.17%1)*(bottom-top);glow(l,y,15,"200,240,255",.8);glow(r,bottom-y+top,15,"200,240,255",.8);
      } else {
        // Percussion: hot metal sparks with ballistic, falling trajectories.
        for(let i=0;i<32;i++) {
          const p=(t*.5+noise(i))%1, sign=i%2?1:-1;
          const x=(i%2?r:l)+sign*p*(8+noise(i+4)*12);
          const y=bottom-12-p*(30+noise(i+8)*70)+p*p*75;
          ctx.strokeStyle=`rgba(255,${160+Math.floor(noise(i)*80)},75,${1-p})`;ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-sign*3,y-4);ctx.stroke();glow(x,y,4,"255,177,71",1-p);
        }
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
    };
    frame=requestAnimationFrame(paint);
    const resume = () => { last=0; };
    reduced.addEventListener("change",resume);
    return () => { cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();reduced.removeEventListener("change",resume); };
  }, [ability]);
  return <canvas ref={ref} className="escalade-power-particles" aria-hidden="true" />;
}
