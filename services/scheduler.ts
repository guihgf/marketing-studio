import type { Collection, ScheduleConfig, ScheduledItem, GenerationResult, Art } from '../src/types';

const HIGH_PRIORITY_CTAS = [
  'GARANTA O SEU', 'NÃO PERCA', 'ESTOQUE LIMITADO',
  'QUERO AGORA!', 'CORRE PRA VER', 'EDIÇÃO LIMITADA', 'COMPRE JÁ',
];

const STANDARD_CTAS = [
  'VER DETALHES', 'LINK NA BIO', 'CONFIRA NO SITE',
  'VEJA A COLEÇÃO', 'VEM CONFERIR', 'ACESSE A LOJA', 'SAIBA MAIS',
];

export const COMMERCIAL_CTAS = [
  'GARANTA O SEU AGORA MESMO',
  'CLIQUE NO LINK DA BIO',
  'ESTOQUE LIMITADÍSSIMO',
  'COMPRE ANTES QUE ACABE',
  'ENTREGA PARA TODO BRASIL',
  'PARCELAMENTO SEM JUROS',
  'ACESSE NOSSO SITE AGORA',
  'CONFIRA OS DETALHES AQUI',
  'NOVIDADE NA LOJA ONLINE',
  'DISPONÍVEL AGORA NO SITE',
  'PEÇA JÁ O SEU EXCLUSIVO',
  'USE O CUPOM DE DESCONTO',
  'COLEÇÃO NOVA NO SITE',
  'VEJA MAIS FOTOS NO SITE',
];

const generateSingleDay = (
  collections: Collection[],
  config: ScheduleConfig,
  targetDate: Date,
  simulatedUsageMap: Record<string, number>,
): ScheduledItem[] => {
  const COOLDOWN = 72 * 60 * 60 * 1000;
  const targetTime = targetDate.getTime();

  let availableArts: (Art & { collectionPriority: string; collectionName: string; collectionLink: string })[] = [];

  collections.forEach(col => {
    if (!col.enabled) return;
    col.arts.forEach(art => {
      const lastUsed = simulatedUsageMap[art.id] !== undefined ? simulatedUsageMap[art.id] : art.lastUsed;
      if (!lastUsed || targetTime - lastUsed > COOLDOWN) {
        availableArts.push({ ...art, collectionPriority: col.priority, collectionName: col.name, collectionLink: col.link });
      }
    });
  });

  const usedCollectionIds = new Set<string>();
  const generatedItems: ScheduledItem[] = [];

  const slotsToProcess = [...config.slots].sort((a, b) => {
    if (a.isPrime && !b.isPrime) return -1;
    if (!a.isPrime && b.isPrime) return 1;
    return a.time.localeCompare(b.time);
  });

  for (const slot of slotsToProcess) {
    const candidates = availableArts.filter(art => !usedCollectionIds.has(art.collectionId));
    if (!candidates.length) continue;

    const scored = candidates.map(art => {
      let score = art.collectionPriority === 'HIGH' ? 10 : art.collectionPriority === 'MEDIUM' ? 5 : 1;
      if (slot.isPrime) {
        if (art.collectionPriority === 'HIGH') score += 500;
        else if (art.collectionPriority === 'MEDIUM') score += 50;
      }
      return { art, score, random: Math.random() };
    }).sort((a, b) => b.score !== a.score ? b.score - a.score : b.random - a.random);

    const selected = scored[0].art;
    const ctaSource = (slot.isPrime || selected.collectionPriority === 'HIGH') ? HIGH_PRIORITY_CTAS : STANDARD_CTAS;
    const cta = ctaSource[Math.floor(Math.random() * ctaSource.length)].toUpperCase().substring(0, 25);
    const ctaCommercial = COMMERCIAL_CTAS[Math.floor(Math.random() * COMMERCIAL_CTAS.length)];

    generatedItems.push({
      slotId: slot.id,
      slotTime: slot.time,
      isPrime: slot.isPrime,
      art: selected,
      collectionName: selected.collectionName,
      collectionLink: selected.collectionLink,
      cta,
      ctaCommercial,
    });

    usedCollectionIds.add(selected.collectionId);
    availableArts = availableArts.filter(a => a.id !== selected.id);
  }

  return generatedItems.sort((a, b) => a.slotTime.localeCompare(b.slotTime));
};

export const generateSchedule = (
  collections: Collection[],
  config: ScheduleConfig,
  startDateStr: string,
  endDateStr: string,
): GenerationResult[] => {
  const startDate = new Date(startDateStr + 'T00:00:00');
  const endDate = new Date(endDateStr + 'T00:00:00');
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) return [];

  const simulatedUsageMap: Record<string, number> = {};
  collections.forEach(col => col.arts.forEach(art => { if (art.lastUsed) simulatedUsageMap[art.id] = art.lastUsed; }));

  const results: GenerationResult[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayDate = new Date(currentDate);
    const items = generateSingleDay(collections, config, dayDate, simulatedUsageMap);

    const warnings: string[] = [];
    if (items.length < config.slots.length) {
      warnings.push(`Não foi possível preencher todos os horários para ${dayDate.toLocaleDateString('pt-BR')}. Adicione mais artes.`);
    }

    items.forEach(item => { simulatedUsageMap[item.art.id] = new Date(dayDate).setHours(12, 0, 0, 0); });

    results.push({
      date: dayDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }),
      items,
      warnings,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return results;
};
