import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyBattle } from "@/lib/battleNotify";
import { deckFromJson, publicBattleDeck } from "@/lib/battle";
import { assertStakeCardAvailable, parseStakeCardId, parseStakeCoins } from "@/lib/battleStake";
import { draftHand, publicEscalade, type AbilityLayout, type EscaladeState } from "@/lib/escalade";
import { currentDraftOffer, verifyDraftOffer } from "@/lib/escaladeDraft";
import { publicDiceKiller, type DiceKillerState } from "@/lib/diceKiller";

async function playerId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id;
}

export async function GET() {
  const userId = await playerId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const [battles, user] = await Promise.all([prisma.battle.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: {
      challenger: { select: { username: true } },
      opponent: { select: { username: true } },
      rewards: { select: { userId: true } },
    },
  }), prisma.user.findUnique({ where: { id: userId }, select: { coins: true } })]);
  const stakeIds = [...new Set(battles.flatMap((battle) => [battle.challengerStakeCardId, battle.opponentStakeCardId]).filter((id): id is string => !!id))];
  const stakeCards = await prisma.card.findMany({ where: { id: { in: stakeIds } }, select: { id: true, game: { select: { name: true } }, studio: { select: { name: true } } } });
  const stakeNames = new Map(stakeCards.map((card) => [card.id, card.game?.name ?? card.studio?.name ?? "Carte"]));
  return NextResponse.json({ selfId: userId, coins: user?.coins ?? 0, draftOffer: currentDraftOffer(), battles: battles.map(({ answerIndex, question, escalationState, ...battle }) => {
    void answerIndex;
    const pendingRules = escalationState as { abilitySeed?: number; abilityLayout?: AbilityLayout; draftBudget?: number } | null;
    return {
      ...battle,
      challengerDeck: battle.rulesVersion === 3 ? [] : battle.status === "PENDING" && battle.challengerId !== userId ? [] : publicBattleDeck(deckFromJson(battle.challengerDeck)),
      opponentDeck: battle.rulesVersion === 3 ? [] : battle.opponentDeck ? (battle.status === "PENDING" && battle.opponentId !== userId ? [] : publicBattleDeck(deckFromJson(battle.opponentDeck))) : null,
      escalation: battle.rulesVersion === 3 && battle.status !== "PENDING" && escalationState ? publicEscalade(escalationState as unknown as EscaladeState, battle.challengerId === userId ? 0 : 1) : null,
      diceKiller: battle.rulesVersion === 4 && battle.status !== "PENDING" && escalationState ? publicDiceKiller(escalationState as unknown as DiceKillerState, battle.challengerId === userId ? 0 : 1) : null,
      draft: battle.rulesVersion === 3 && battle.status === "PENDING" && battle.challengerId === userId ? battle.challengerDeck : null,
      abilityLayout: battle.rulesVersion === 3 && battle.status === "PENDING" ? pendingRules?.abilityLayout ?? null : null,
      draftBudget: battle.rulesVersion === 3 && battle.status === "PENDING" ? pendingRules?.draftBudget ?? null : null,
      challengerStakeCardName: battle.challengerStakeCardId ? stakeNames.get(battle.challengerStakeCardId) ?? "Carte indisponible" : null,
      opponentStakeCardName: battle.opponentStakeCardId ? stakeNames.get(battle.opponentStakeCardId) ?? "Carte indisponible" : null,
      question: battle.currentTurnId === userId ? question : null,
      rewards: battle.rewards.map((reward) => reward.userId),
    };
  }) });
}

export async function POST(req: Request) {
  const userId = await playerId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  let body: { mode?: unknown; opponentId?: unknown; cardIds?: unknown; stakeCoins?: unknown; stakeCardId?: unknown; dealId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  if (typeof body.opponentId !== "string" || body.opponentId === userId) {
    return NextResponse.json({ error: "Adversaire invalide" }, { status: 400 });
  }
  try {
    const battle = await prisma.$transaction(async (tx) => {
      const stakeCoins = parseStakeCoins(body.stakeCoins);
      const stakeCardId = parseStakeCardId(body.stakeCardId);
      const opponent = await tx.user.findFirst({ where: { id: body.opponentId as string, status: "ACTIVE" }, select: { id: true } });
      const challenger = await tx.user.findUnique({ where: { id: userId }, select: { username: true } });
      if (!opponent) throw new Error("Joueur introuvable ou inactif");
      const pending = await tx.battle.count({ where: { challengerId: userId, status: "PENDING" } });
      if (pending >= 3) throw new Error("Tu as déjà 3 défis en attente");
      await assertStakeCardAvailable(tx, userId, stakeCardId);
      if (stakeCoins > 0) {
        const debited = await tx.user.updateMany({ where: { id: userId, coins: { gte: stakeCoins } }, data: { coins: { decrement: stakeCoins } } });
        if (debited.count !== 1) throw new Error("Gigapuissances insuffisantes pour cette mise");
      }
      const diceMode = body.mode === "DICE_KILLER";
      const offer = diceMode ? null : verifyDraftOffer(body.dealId);
      const deck = diceMode ? [] : draftHand(body.cardIds, offer!.layout, offer!.budget);
      const newBattle = await tx.battle.create({ data: {
        rulesVersion: diceMode ? 4 : 3, challengerId: userId, opponentId: opponent.id,
        challengerDeck: deck, challengerStakeCoins: stakeCoins, challengerStakeCardId: stakeCardId,
        escalationState: diceMode ? undefined : { abilitySeed: offer!.seed, abilityLayout: offer!.layout, draftBudget: offer!.budget },
      } });
      return { ...newBattle, challengerName: challenger?.username ?? "Un joueur" };
    }, { isolationLevel: "Serializable" });
    const diceMode = battle.rulesVersion === 4;
    await notifyBattle([{ userId: battle.opponentId, title: diceMode ? "Nouveau défi de dés" : "Nouveau défi", body: `${battle.challengerName} te défie ${diceMode ? "aux Dés tueurs" : "en bataille"}${battle.challengerStakeCoins > 0 ? ` (mise : ${battle.challengerStakeCoins} gigapuissances)` : ""}.`, href: diceMode ? "/bataille/des-tueurs" : "/bataille/escalade" }]);
    return NextResponse.json({ id: battle.id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return NextResponse.json({ error: "Action simultanée détectée : réessaie." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de créer le défi" }, { status: 400 });
  }
}
