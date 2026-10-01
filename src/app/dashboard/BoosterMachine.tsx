export function BoosterMachine({ phase, ready }: { phase: "idle" | "pressure" | "vent" | "revealed"; ready: boolean }) {
  return <div className={`booster-machine is-${phase} ${ready ? "is-ready" : ""}`} aria-hidden="true">
    <div className="booster-machine-halo" />
    <div className="booster-chest-stage">
      <img className="booster-chest-part booster-chest-body" src="/assets/booster/rusted-steampunk-chest.png" alt="" />
      <div className="booster-inner-light" />
      <img className="booster-chest-part booster-chest-lid" src="/assets/booster/rusted-steampunk-chest.png" alt="" />
      <span className="booster-gauge-live"><i /></span>
      <span className="booster-wheel-live"><i /><i /><i /></span>
      <span className="booster-ready-live" />
    </div>
    <div className="booster-steam">{Array.from({length:20},(_,i)=><i key={i} style={{"--puff":i, "--steam-left":i%2 ? "88%" : "10%", "--steam-x":i%2 ? "25px" : "-125px"} as React.CSSProperties}/>)}</div>
    <div className="booster-sparks">{Array.from({length:12},(_,i)=><i key={i} style={{"--spark":i, "--spark-x":`${(i-6)*17}px`, "--spark-y":`${-28-i*4}px`} as React.CSSProperties}/>)}</div>
  </div>;
}
