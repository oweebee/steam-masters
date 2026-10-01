import Image from "next/image";

/** Generic fictional illustration, never an official studio photo or logo. */
export function SteampunkStudioPlaceholder({ className = "w-full h-full" }: { className?: string }) {
  return <Image
    src="/images/studio/developer-workshop.webp"
    alt="Illustration générique : atelier de développement geek steampunk — studio sans photo"
    width={960}
    height={540}
    sizes="(max-width: 640px) 50vw, 320px"
    className={className}
    style={{ objectFit: "cover", objectPosition: "center" }}
  />;
}
