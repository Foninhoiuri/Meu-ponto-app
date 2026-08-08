import { prisma } from './prisma';
import { BalanceService } from './services/balanceService';

const balanceService = new BalanceService();

async function recalculateAll() {
  console.log('🔄 Iniciando recálculo de todos os registros de ponto...');
  
  const records = await prisma.timeRecord.findMany();
  console.log(`Encontrados ${records.length} registros para recalcular.`);

  let updated = 0;
  
  for (const record of records) {
    const newBalanceDiff = await balanceService.calculateDailyBalance(record);
    
    if (record.balanceDiff !== newBalanceDiff) {
      await prisma.timeRecord.update({
        where: { id: record.id },
        data: { balanceDiff: newBalanceDiff }
      });
      updated++;
    }
  }

  console.log(`✅ Recálculo concluído. ${updated} registros foram atualizados com a nova regra de tolerância.`);
}

recalculateAll()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
