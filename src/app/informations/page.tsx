import { AppShell } from "@/components/AppShell";
import { CHANGELOG_POSTS } from "@/lib/changelog";
import styles from "./Informations.module.css";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

export default function InformationsPage() {
  return <AppShell><div className={styles.page}>
    <header className={styles.hero}>
      <div><span>Archives de Steam Masters</span><h1>Informations</h1><p>Les changements importants du jeu, regroupés ici sans notification.</p></div>
    </header>
    <div className={styles.feed} aria-label="Historique des changements majeurs">
      {CHANGELOG_POSTS.map((post, index) => <article className={styles.post} key={post.slug}>
        <div className={styles.rail} aria-hidden="true"><i />{index < CHANGELOG_POSTS.length - 1 && <span />}</div>
        <div className={styles.card}>
          <div className={styles.meta}><time dateTime={post.date}>{dateFormatter.format(new Date(`${post.date}T12:00:00+02:00`))}</time><b>{post.category}</b></div>
          <h2>{post.title}</h2>
          <p>{post.summary}</p>
          <ul>{post.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
        </div>
      </article>)}
    </div>
  </div></AppShell>;
}
